/**
 * Client-side IndexedDB data store for the demo site (backed by Dexie.js).
 * Mirrors the server-side SQLite + Drizzle data layer (src/lib/data.ts + API routes).
 *
 * 🔄 DEMO SYNC: Each function here has a counterpart in src/lib/data.ts.
 *    When you add a function here (e.g. for a new API route), add the
 *    matching operation in src/lib/data.ts and a route handler in src/demo/fetch.ts.
 */

import type { CategoryEntry, ImageKind, Song, SongImage, Tag, VideoLink } from "@/lib/types";
import { demoDb } from "@/demo/db";

// ─── Helpers ───────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function groupTags(tags: Tag[]): Record<string, Tag[]> {
  const cats = new Set(tags.map((t) => t.category));
  return Object.fromEntries(
    [...cats].map((cat) => [cat, tags.filter((t) => t.category === cat)]),
  ) as Record<string, Tag[]>;
}

/**
 * Ensure the database has seed data on first use.
 * Called at the top of every exported function so seed is guaranteed
 * before any query runs. Dexie's open() is idempotent — no penalty on
 * subsequent calls.
 */
let seeded = false;
let seeding: Promise<void> | null = null;
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  if (seeding) return seeding;
  seeding = (async () => {
    await demoDb.open();
    await demoDb.initializeSeed();
    seeded = true;
  })();
  return seeding;
}

// ─── Pieces ────────────────────────────────────────────────────────────────

/** GET /api/pieces — returns all songs with tags grouped by category. */
export async function getPieces(): Promise<Song[]> {
  await ensureSeeded();
  const [pieces, allTags, joins] = await Promise.all([
    demoDb.pieces.toArray(),
    demoDb.tags.toArray(),
    demoDb.songTags.toArray(),
  ]);

  const tagsById = new Map(allTags.map((t) => [t.id, t]));
  const joinsBySongId = new Map<number, Tag[]>();
  for (const j of joins) {
    const tag = tagsById.get(j.tagId);
    if (!tag) continue;
    const list = joinsBySongId.get(j.songId) ?? [];
    list.push(tag);
    joinsBySongId.set(j.songId, list);
  }

  return pieces.map((p) => ({
    ...p,
    tags: groupTags(joinsBySongId.get(p.id) ?? []),
  }));
}

/** GET /api/pieces/[id] — returns full song with tags, images, links. */
export async function getPiece(id: number): Promise<Song | null> {
  await ensureSeeded();
  const [piece, joins, images, links] = await Promise.all([
    demoDb.pieces.get(id),
    demoDb.songTags.where({ songId: id }).toArray(),
    demoDb.images
      .where({ songId: id })
      .toArray()
      .then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)),
    demoDb.links
      .where({ songId: id })
      .toArray()
      .then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)),
  ]);

  if (!piece) return null;

  const tagIds = joins.map((j) => j.tagId);
  const selectedTags = tagIds.length > 0
    ? await demoDb.tags.where("id").anyOf(tagIds).toArray()
    : ([] as Tag[]);

  return {
    ...piece,
    tags: groupTags(selectedTags),
    images: {
      staff: images.filter((img) => img.kind === "staff"),
      numbered: images.filter((img) => img.kind === "numbered"),
    },
    links,
  };
}

/** POST /api/pieces — creates a new piece. */
export async function createPiece(body: { title?: string; titleAlt?: string }): Promise<Song> {
  await ensureSeeded();
  const time = nowIso();
  const id = await demoDb.pieces.add({
    title: body.title ?? "",
    titleAlt: body.titleAlt ?? "",
    difficulty: 1,
    notes: "",
    createdAt: time,
    updatedAt: time,
  });
  return { id, title: body.title ?? "", titleAlt: body.titleAlt ?? "", difficulty: 1, notes: "", createdAt: time, updatedAt: time, tags: {} };
}

/** PATCH /api/pieces/[id] — updates piece fields and optionally replaces tags. */
export async function updatePiece(
  id: number,
  body: {
    title?: string;
    titleAlt?: string;
    difficulty?: number;
    notes?: string;
    tagIds?: number[];
  },
): Promise<Song | null> {
  await ensureSeeded();
  const piece = await demoDb.pieces.get(id);
  if (!piece) return null;

  const updates: Partial<{
    title: string;
    titleAlt: string;
    difficulty: number;
    notes: string;
    updatedAt: string;
  }> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.titleAlt !== undefined) updates.titleAlt = body.titleAlt;
  if (body.difficulty !== undefined) updates.difficulty = body.difficulty;
  if (body.notes !== undefined) updates.notes = body.notes;
  updates.updatedAt = nowIso();
  await demoDb.pieces.update(id, updates);

  if (body.tagIds !== undefined) {
    // Replace all tag associations
    await demoDb.songTags.where({ songId: id }).delete();

    // Verify tag IDs exist
    const validIds = body.tagIds.length > 0
      ? (await demoDb.tags.where("id").anyOf(body.tagIds).toArray()).map((t) => t.id)
      : [];

    if (validIds.length > 0) {
      await demoDb.songTags.bulkAdd(
        validIds.map((tagId) => ({ songId: id, tagId })),
      );
    }
  }

  return getPiece(id);
}

/** DELETE /api/pieces/[id] — deletes a piece and its associations. */
export async function deletePiece(id: number): Promise<void> {
  await ensureSeeded();
  await Promise.all([
    demoDb.pieces.delete(id),
    demoDb.songTags.where({ songId: id }).delete(),
    demoDb.images.where({ songId: id }).delete(),
    demoDb.links.where({ songId: id }).delete(),
    demoDb.deviceZooms.where({ songId: id }).delete(),
  ]);
}

// ─── Tags ──────────────────────────────────────────────────────────────────

/** GET /api/tags — returns all tags with songCount. */
export async function getTags(): Promise<(Tag & { songCount: number })[]> {
  await ensureSeeded();
  const [allTags, joins] = await Promise.all([
    demoDb.tags.toArray(),
    demoDb.songTags.toArray(),
  ]);

  const countByTagId = new Map<number, number>();
  for (const j of joins) {
    countByTagId.set(j.tagId, (countByTagId.get(j.tagId) ?? 0) + 1);
  }

  return allTags.map((t) => ({
    ...t,
    songCount: countByTagId.get(t.id) ?? 0,
  }));
}

/** POST /api/tags — creates a tag. Checks for duplicates. */
export async function createTag(
  body: { name: string; nameAlt?: string; color: string; category: string },
): Promise<Tag | { error: string; status: number }> {
  await ensureSeeded();

  // Check for duplicate using compound index
  const existing = await demoDb.tags
    .where("[category+name]")
    .equals([body.category, body.name])
    .first();
  if (existing) {
    // Also check nameAlt match
    if (body.nameAlt) {
      const altExisting = await demoDb.tags
        .where("[category+name]")
        .equals([body.category, body.nameAlt])
        .first();
      if (altExisting) {
        return { error: "A tag with this name already exists in this category", status: 409 };
      }
    }
    return { error: "A tag with this name already exists in this category", status: 409 };
  }

  const id = await demoDb.tags.add({
    name: body.name,
    nameAlt: body.nameAlt ?? "",
    color: body.color,
    category: body.category,
  });
  return { id, name: body.name, nameAlt: body.nameAlt ?? "", color: body.color, category: body.category };
}

/** PATCH /api/tags/[id] — updates a single tag. */
export async function updateTag(
  id: number,
  body: { name?: string; nameAlt?: string; color?: string; category?: string },
): Promise<Tag | { error: string; status: number } | null> {
  await ensureSeeded();
  const tag = await demoDb.tags.get(id);
  if (!tag) return null;

  const newName = body.name ?? tag.name;
  const newNameAlt = body.nameAlt !== undefined ? body.nameAlt : tag.nameAlt;
  const newCategory = body.category ?? tag.category;

  // Check duplicate if relevant fields changed
  if (body.name !== undefined || body.nameAlt !== undefined || body.category !== undefined) {
    // Check for another tag with same name+category (excluding self)
    const duplicate = await demoDb.tags
      .where("[category+name]")
      .equals([newCategory, newName])
      .and((t) => t.id !== id)
      .first();
    if (duplicate) {
      return { error: "A tag with this name already exists in this category", status: 409 };
    }
    // Also check nameAlt
    if (newNameAlt && newNameAlt !== newName) {
      const altDuplicate = await demoDb.tags
        .where("[category+name]")
        .equals([newCategory, newNameAlt])
        .and((t) => t.id !== id)
        .first();
      if (altDuplicate) {
        return { error: "A tag with this name already exists in this category", status: 409 };
      }
    }
  }

  const updates: Partial<Tag> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.nameAlt !== undefined) updates.nameAlt = body.nameAlt;
  if (body.color !== undefined) updates.color = body.color;
  if (body.category !== undefined) updates.category = body.category;

  await demoDb.tags.update(id, updates);
  return { ...tag, ...updates };
}

/** DELETE /api/tags/[id] — deletes a single tag. */
export async function deleteTag(id: number): Promise<void> {
  await ensureSeeded();
  await Promise.all([
    demoDb.tags.delete(id),
    demoDb.songTags.where({ tagId: id }).delete(),
  ]);
}

/** PATCH /api/tags (bulk rename) — renames a tag category. */
export async function renameTagCategory(oldCategory: string, newCategory: string): Promise<Tag[]> {
  await ensureSeeded();
  const tagsToUpdate = await demoDb.tags.where("category").equals(oldCategory).toArray();
  for (const tag of tagsToUpdate) {
    await demoDb.tags.update(tag.id, { category: newCategory });
  }
  return demoDb.tags.where("category").equals(newCategory).toArray();
}

/** DELETE /api/tags?category= — deletes all tags in a category. */
export async function deleteTagsInCategory(category: string): Promise<number> {
  await ensureSeeded();
  const tagsToDelete = await demoDb.tags.where("category").equals(category).toArray();
  const ids = tagsToDelete.map((t) => t.id);

  await Promise.all([
    demoDb.tags.where("id").anyOf(ids).delete(),
    demoDb.songTags.where("tagId").anyOf(ids).delete(),
  ]);
  return ids.length;
}

// ─── Categories (tag_categories table) ─────────────────────────────────────

/** GET /api/categories — returns all category entries. */
export async function getCategories(): Promise<CategoryEntry[]> {
  await ensureSeeded();
  return demoDb.categories
    .toArray()
    .then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)));
}

/** POST /api/categories — creates a new category. */
export async function createCategory(
  body: { key: string; name?: string; nameAlt?: string },
): Promise<CategoryEntry | { error: string; status: number }> {
  await ensureSeeded();
  const existing = await demoDb.categories.get(body.key);
  if (existing) {
    return { error: `Category "${body.key}" already exists`, status: 409 };
  }

  const allCats = await demoDb.categories.toArray();
  const maxSort = allCats.length > 0 ? Math.max(...allCats.map((c) => c.sortOrder)) : 2;

  const entry: CategoryEntry = {
    key: body.key,
    name: body.name ?? "",
    nameAlt: body.nameAlt ?? "",
    sortOrder: maxSort + 1,
  };
  await demoDb.categories.add(entry);
  return entry;
}

/** PATCH /api/categories — creates or updates a category, supports key rename. */
export async function updateCategory(
  body: { key: string; oldKey?: string; name?: string; nameAlt?: string },
): Promise<CategoryEntry> {
  await ensureSeeded();
  const targetKey = body.oldKey ?? body.key;
  const existing = await demoDb.categories.get(targetKey);

  if (!existing) {
    // Create
    const allCats = await demoDb.categories.toArray();
    const maxSort = allCats.length > 0 ? Math.max(...allCats.map((c) => c.sortOrder)) : 2;
    const entry: CategoryEntry = {
      key: body.key,
      name: body.name ?? "",
      nameAlt: body.nameAlt ?? "",
      sortOrder: maxSort + 1,
    };
    await demoDb.categories.add(entry);
    return entry;
  }

  if (body.key !== targetKey) {
    // Key rename — delete old, add new
    await demoDb.categories.delete(targetKey);
    const updated: CategoryEntry = {
      key: body.key,
      name: body.name ?? existing.name,
      nameAlt: body.nameAlt ?? existing.nameAlt,
      sortOrder: existing.sortOrder,
    };
    await demoDb.categories.add(updated);

    // Update tags and single-select categories
    const tagsToUpdate = await demoDb.tags.where("category").equals(targetKey).toArray();
    for (const tag of tagsToUpdate) {
      await demoDb.tags.update(tag.id, { category: body.key });
    }

    const ssCat = await demoDb.singleSelectCategories.get(targetKey);
    if (ssCat) {
      await demoDb.singleSelectCategories.delete(targetKey);
      await demoDb.singleSelectCategories.add({ category: body.key });
    }

    return updated;
  } else {
    const updates: Partial<CategoryEntry> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.nameAlt !== undefined) updates.nameAlt = body.nameAlt;
    await demoDb.categories.update(targetKey, updates);
    return { ...existing, ...updates };
  }
}

/** DELETE /api/categories?key= — deletes a category entry. */
export async function deleteCategory(key: string): Promise<void> {
  await ensureSeeded();
  await demoDb.categories.delete(key);
}

// ─── Single-Select Categories ──────────────────────────────────────────────

/** GET /api/single-select-categories — returns category keys. */
export async function getSingleSelectCategories(): Promise<string[]> {
  await ensureSeeded();
  const rows = await demoDb.singleSelectCategories.toArray();
  return rows.map((r) => r.category);
}

/** POST /api/single-select-categories — adds a category. */
export async function addSingleSelectCategory(
  category: string,
): Promise<{ category: string } | { error: string; status: number }> {
  await ensureSeeded();
  const existing = await demoDb.singleSelectCategories.get(category);
  if (existing) {
    return { error: `Category "${category}" is already single-select`, status: 409 };
  }
  await demoDb.singleSelectCategories.add({ category });
  return { category };
}

/** DELETE /api/single-select-categories — removes a category. */
export async function removeSingleSelectCategory(category: string): Promise<void> {
  await ensureSeeded();
  await demoDb.singleSelectCategories.delete(category);
}

// ─── Device Zoom ───────────────────────────────────────────────────────────

/** GET /api/device-zoom — returns zoom level (default 100). */
export async function getDeviceZoom(deviceId: string, songId: number): Promise<number> {
  await ensureSeeded();
  const row = await demoDb.deviceZooms.get([deviceId, songId]);
  return row?.zoom ?? 100;
}

/** PUT /api/device-zoom — upserts zoom level. */
export async function setDeviceZoom(deviceId: string, songId: number, zoom: number): Promise<void> {
  await ensureSeeded();
  const existing = await demoDb.deviceZooms.get([deviceId, songId]);
  if (existing) {
    await demoDb.deviceZooms.update([deviceId, songId], { zoom, updatedAt: nowIso() });
  } else {
    await demoDb.deviceZooms.add({ deviceId, songId, zoom, updatedAt: nowIso() });
  }
}

// ─── Images ────────────────────────────────────────────────────────────────

/** POST /api/pieces/[id]/images — create image entries from pre-read data URLs. */
export async function uploadImages(
  songId: number,
  kind: ImageKind,
  entries: { dataUrl: string; filename: string }[],
): Promise<Song | null> {
  await ensureSeeded();
  const piece = await demoDb.pieces.get(songId);
  if (!piece) return null;

  // Get current max sortOrder for this song+kind
  const existingImages = await demoDb.images.where({ songId, kind }).toArray();
  let maxOrder = existingImages.reduce((max, img) => Math.max(max, img.sortOrder), -1);

  for (const entry of entries) {
    maxOrder++;
    await demoDb.images.add({
      songId,
      kind,
      url: entry.dataUrl,
      filename: entry.filename,
      sortOrder: maxOrder,
      sourceUrl: null,
      createdAt: nowIso(),
    });
  }

  return getPiece(songId);
}

/** PATCH /api/pieces/[id]/images — reorders images. */
export async function reorderImages(songId: number, kind: ImageKind, ids: number[]): Promise<Song | null> {
  await ensureSeeded();
  for (let i = 0; i < ids.length; i++) {
    await demoDb.images
      .where({ id: ids[i], songId, kind })
      .modify({ sortOrder: i });
  }
  return getPiece(songId);
}

/** DELETE /api/pieces/[id]/images — deletes images. */
export async function deleteImages(songId: number, ids: number[]): Promise<Song | null> {
  await ensureSeeded();
  await demoDb.images
    .where("id")
    .anyOf(ids)
    .filter((img) => img.songId === songId)
    .delete();
  return getPiece(songId);
}

/** PATCH /api/pieces/[id]/images/[imageId] — updates image source URL. */
export async function updateImageSource(songId: number, imageId: number, sourceUrl: string | null): Promise<Song | null> {
  await ensureSeeded();
  const image = await demoDb.images.get(imageId);
  if (image && image.songId === songId) {
    await demoDb.images.update(imageId, { sourceUrl } as Partial<SongImage>);
  }
  return getPiece(songId);
}

// ─── Links ─────────────────────────────────────────────────────────────────

/** PUT /api/pieces/[id]/links — replaces all video links for a song. */
export async function saveLinks(
  songId: number,
  links: { label: string; url: string }[],
): Promise<Song | null> {
  await ensureSeeded();
  // Remove existing links for this song
  await demoDb.links.where({ songId }).delete();

  // Add new links
  for (let i = 0; i < links.length; i++) {
    await demoDb.links.add({
      songId,
      label: links[i].label,
      url: links[i].url,
      sortOrder: i,
    });
  }

  return getPiece(songId);
}

// ─── Health ────────────────────────────────────────────────────────────────

/** GET /api/health — returns server status. */
export async function healthCheck(): Promise<{ status: string }> {
  await ensureSeeded();
  return { status: "ok" };
}

/**
 * Client-side sessionStorage data store for the demo site.
 * Mirrors the server-side SQLite + Drizzle data layer (src/lib/data.ts + API routes).
 *
 * 🔄 DEMO SYNC: When src/lib/data.ts or any API route changes behavior,
 *    update the matching function here. Key mappings:
 *   - `getPieces()` ↔ getSongs() in src/lib/data.ts
 *   - `getPiece()` ↔ getSong() in src/lib/data.ts
 *   - `setSongTags()` ↔ setSongTags() in src/lib/data.ts
 *   - etc.
 */

import type { CategoryEntry, ImageKind, Song, SongImage, Tag, VideoLink } from "@/lib/types";
import { SEED_DATA } from "@/lib/demo-seed";

// ─── Normalized store shape ────────────────────────────────────────────────

interface PieceRow {
  id: number;
  title: string;
  titleAlt: string;
  difficulty: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface SongTagJoin {
  songId: number;
  tagId: number;
}

interface DeviceZoomRow {
  deviceId: string;
  songId: number;
  zoom: number;
  updatedAt: string;
}

interface DemoStore {
  nextId: number;
  pieces: PieceRow[];
  tags: Tag[];
  songTags: SongTagJoin[];
  images: SongImage[];
  links: VideoLink[];
  categories: CategoryEntry[];
  singleSelectCategories: string[];
  deviceZooms: DeviceZoomRow[];
}

const STORAGE_KEY = "sheet-folio-demo";

// ─── Core persistence ──────────────────────────────────────────────────────

export function getStore(): DemoStore {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data — reset
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return createEmptyStore();
}

export function saveStore(store: DemoStore): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error("Demo store: failed to save to sessionStorage", e);
  }
}

function createEmptyStore(): DemoStore {
  const seed = SEED_DATA;
  // Build songTags from seed piece tagIds
  const songTags: SongTagJoin[] = [];
  for (const piece of seed.pieces) {
    for (const tagId of piece.tagIds) {
      songTags.push({ songId: piece.id, tagId });
    }
  }

  const maxTagId = seed.tags.length > 0 ? Math.max(...seed.tags.map((t) => t.id)) : 0;
  const maxPieceId = seed.pieces.length > 0 ? Math.max(...seed.pieces.map((p) => p.id)) : 0;

  return {
    nextId: Math.max(maxTagId, maxPieceId) + 1,
    pieces: seed.pieces.map((p) => ({
      id: p.id,
      title: p.title,
      titleAlt: p.titleAlt,
      difficulty: p.difficulty,
      notes: p.notes,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    tags: seed.tags.map((t) => ({ ...t })),
    songTags,
    images: [],
    links: [],
    categories: seed.categories.map((c) => ({ ...c })),
    singleSelectCategories: [...seed.singleSelectCategories],
    deviceZooms: [],
  };
}

function nextId(store: DemoStore): number {
  const id = store.nextId;
  store.nextId = id + 1;
  return id;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function groupTags(tags: Tag[]): Record<string, Tag[]> {
  const cats = new Set(tags.map((t) => t.category));
  return Object.fromEntries(
    [...cats].map((cat) => [cat, tags.filter((t) => t.category === cat)]),
  ) as Record<string, Tag[]>;
}

function findTagInStore(store: DemoStore, category: string, name: string, nameAlt: string, excludeId?: number): Tag | undefined {
  return store.tags.find((t) => {
    if (excludeId !== undefined && t.id === excludeId) return false;
    if (t.category !== category) return false;
    return t.name === name || t.nameAlt === name || t.name === nameAlt || t.nameAlt === nameAlt;
  });
}

// ─── Pieces ────────────────────────────────────────────────────────────────

/** GET /api/pieces — returns all songs with tags grouped by category. */
export function getPieces(): Song[] {
  const store = getStore();
  const tagsById = new Map(store.tags.map((t) => [t.id, t]));
  const joinsBySongId = new Map<number, Tag[]>();
  for (const j of store.songTags) {
    const tag = tagsById.get(j.tagId);
    if (!tag) continue;
    const list = joinsBySongId.get(j.songId) ?? [];
    list.push(tag);
    joinsBySongId.set(j.songId, list);
  }
  return store.pieces.map((p) => ({
    ...p,
    tags: groupTags(joinsBySongId.get(p.id) ?? []),
  }));
}

/** GET /api/pieces/[id] — returns full song with tags, images, links. */
export function getPiece(id: number): Song | null {
  const store = getStore();
  const piece = store.pieces.find((p) => p.id === id);
  if (!piece) return null;

  const selectedTags = store.songTags
    .filter((j) => j.songId === id)
    .map((j) => store.tags.find((t) => t.id === j.tagId))
    .filter((t): t is Tag => !!t);

  const images = store.images
    .filter((img) => img.songId === id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const links = store.links
    .filter((l) => l.songId === id)
    .sort((a, b) => a.sortOrder - a.id || b.sortOrder - b.id);

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
export function createPiece(body: { title?: string; titleAlt?: string }): Song {
  const store = getStore();
  const id = nextId(store);
  const time = nowIso();
  const piece: PieceRow = {
    id,
    title: body.title ?? "",
    titleAlt: body.titleAlt ?? "",
    difficulty: 1,
    notes: "",
    createdAt: time,
    updatedAt: time,
  };
  store.pieces.push(piece);
  saveStore(store);
  return { ...piece, tags: {} };
}

/** PATCH /api/pieces/[id] — updates piece fields and optionally replaces tags. */
export function updatePiece(
  id: number,
  body: {
    title?: string;
    titleAlt?: string;
    difficulty?: number;
    notes?: string;
    tagIds?: number[];
  },
): Song | null {
  const store = getStore();
  const piece = store.pieces.find((p) => p.id === id);
  if (!piece) return null;

  if (body.title !== undefined) piece.title = body.title;
  if (body.titleAlt !== undefined) piece.titleAlt = body.titleAlt;
  if (body.difficulty !== undefined) piece.difficulty = body.difficulty;
  if (body.notes !== undefined) piece.notes = body.notes;
  piece.updatedAt = nowIso();

  if (body.tagIds !== undefined) {
    // Replace all tag associations
    // Remove existing
    const filteredJoins = store.songTags.filter((j) => j.songId !== id);
    store.songTags = filteredJoins;
    // Add new (only valid tag IDs)
    const validIds = new Set(store.tags.map((t) => t.id));
    for (const tagId of body.tagIds) {
      if (validIds.has(tagId)) {
        store.songTags.push({ songId: id, tagId });
      }
    }
  }

  saveStore(store);
  return getPiece(id);
}

/** DELETE /api/pieces/[id] — deletes a piece and its associations. */
export function deletePiece(id: number): void {
  const store = getStore();
  store.pieces = store.pieces.filter((p) => p.id !== id);
  store.songTags = store.songTags.filter((j) => j.songId !== id);
  store.images = store.images.filter((img) => img.songId !== id);
  store.links = store.links.filter((l) => l.songId !== id);
  store.deviceZooms = store.deviceZooms.filter((z) => z.songId !== id);
  saveStore(store);
}

// ─── Tags ──────────────────────────────────────────────────────────────────

/** GET /api/tags — returns all tags with songCount. */
export function getTags(): (Tag & { songCount: number })[] {
  const store = getStore();
  const countByTagId = new Map<number, number>();
  for (const j of store.songTags) {
    countByTagId.set(j.tagId, (countByTagId.get(j.tagId) ?? 0) + 1);
  }
  return store.tags.map((t) => ({
    ...t,
    songCount: countByTagId.get(t.id) ?? 0,
  }));
}

/** POST /api/tags — creates a tag. Checks for duplicates. */
export function createTag(body: { name: string; nameAlt?: string; color: string; category: string }): Tag | { error: string; status: number } {
  const store = getStore();
  if (findTagInStore(store, body.category, body.name, body.nameAlt ?? "")) {
    return { error: "A tag with this name already exists in this category", status: 409 };
  }
  const id = nextId(store);
  const tag: Tag = {
    id,
    name: body.name,
    nameAlt: body.nameAlt ?? "",
    color: body.color,
    category: body.category,
  };
  store.tags.push(tag);
  saveStore(store);
  return tag;
}

/** PATCH /api/tags/[id] — updates a single tag. */
export function updateTag(id: number, body: { name?: string; nameAlt?: string; color?: string; category?: string }): Tag | { error: string; status: number } | null {
  const store = getStore();
  const tag = store.tags.find((t) => t.id === id);
  if (!tag) return null;

  const newName = body.name ?? tag.name;
  const newNameAlt = body.nameAlt !== undefined ? body.nameAlt : tag.nameAlt;
  const newCategory = body.category ?? tag.category;

  // Check duplicate if relevant fields changed
  if (body.name !== undefined || body.nameAlt !== undefined || body.category !== undefined) {
    if (findTagInStore(store, newCategory, newName, newNameAlt, id)) {
      return { error: "A tag with this name already exists in this category", status: 409 };
    }
  }

  if (body.name !== undefined) tag.name = body.name;
  if (body.nameAlt !== undefined) tag.nameAlt = body.nameAlt;
  if (body.color !== undefined) tag.color = body.color;
  if (body.category !== undefined) tag.category = body.category;

  saveStore(store);
  return { ...tag };
}

/** DELETE /api/tags/[id] — deletes a single tag. */
export function deleteTag(id: number): void {
  const store = getStore();
  store.tags = store.tags.filter((t) => t.id !== id);
  store.songTags = store.songTags.filter((j) => j.tagId !== id);
  saveStore(store);
}

/** PATCH /api/tags (bulk rename) — renames a tag category. */
export function renameTagCategory(oldCategory: string, newCategory: string): Tag[] {
  const store = getStore();
  for (const tag of store.tags) {
    if (tag.category === oldCategory) {
      tag.category = newCategory;
    }
  }
  saveStore(store);
  return store.tags.filter((t) => t.category === newCategory);
}

/** DELETE /api/tags?category= — deletes all tags in a category. */
export function deleteTagsInCategory(category: string): number {
  const store = getStore();
  const ids = new Set(store.tags.filter((t) => t.category === category).map((t) => t.id));
  store.tags = store.tags.filter((t) => t.category !== category);
  store.songTags = store.songTags.filter((j) => !ids.has(j.tagId));
  saveStore(store);
  return ids.size;
}

// ─── Categories (tag_categories table) ─────────────────────────────────────

/** GET /api/categories — returns all category entries. */
export function getCategories(): CategoryEntry[] {
  const store = getStore();
  return store.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

/** POST /api/categories — creates a new category. */
export function createCategory(body: { key: string; name?: string; nameAlt?: string }): CategoryEntry | { error: string; status: number } {
  const store = getStore();
  if (store.categories.find((c) => c.key === body.key)) {
    return { error: `Category "${body.key}" already exists`, status: 409 };
  }
  const maxSort = store.categories.length > 0
    ? Math.max(...store.categories.map((c) => c.sortOrder))
    : 2;
  const entry: CategoryEntry = {
    key: body.key,
    name: body.name ?? "",
    nameAlt: body.nameAlt ?? "",
    sortOrder: maxSort + 1,
  };
  store.categories.push(entry);
  saveStore(store);
  return entry;
}

/** PATCH /api/categories — creates or updates a category, supports key rename. */
export function updateCategory(body: { key: string; oldKey?: string; name?: string; nameAlt?: string }): CategoryEntry {
  const store = getStore();
  const targetKey = body.oldKey ?? body.key;
  const existing = store.categories.find((c) => c.key === targetKey);

  if (!existing) {
    // Create
    const maxSort = store.categories.length > 0
      ? Math.max(...store.categories.map((c) => c.sortOrder))
      : 2;
    const entry: CategoryEntry = {
      key: body.key,
      name: body.name ?? "",
      nameAlt: body.nameAlt ?? "",
      sortOrder: maxSort + 1,
    };
    store.categories.push(entry);
    saveStore(store);
    return entry;
  }

  if (body.key !== targetKey) {
    // Key rename
    existing.key = body.key;
    existing.name = body.name ?? existing.name;
    existing.nameAlt = body.nameAlt ?? existing.nameAlt;
    // Also update tag categories and single-select categories
    for (const tag of store.tags) {
      if (tag.category === targetKey) tag.category = body.key;
    }
    const ssIdx = store.singleSelectCategories.indexOf(targetKey);
    if (ssIdx !== -1) {
      store.singleSelectCategories[ssIdx] = body.key;
    }
  } else {
    existing.name = body.name ?? existing.name;
    existing.nameAlt = body.nameAlt ?? existing.nameAlt;
  }

  saveStore(store);
  return { ...existing };
}

/** DELETE /api/categories?key= — deletes a category entry. */
export function deleteCategory(key: string): void {
  const store = getStore();
  store.categories = store.categories.filter((c) => c.key !== key);
  saveStore(store);
}

// ─── Single-Select Categories ──────────────────────────────────────────────

/** GET /api/single-select-categories — returns category keys. */
export function getSingleSelectCategories(): string[] {
  const store = getStore();
  return [...store.singleSelectCategories];
}

/** POST /api/single-select-categories — adds a category. */
export function addSingleSelectCategory(category: string): { category: string } | { error: string; status: number } {
  const store = getStore();
  if (store.singleSelectCategories.includes(category)) {
    return { error: `Category "${category}" is already single-select`, status: 409 };
  }
  store.singleSelectCategories.push(category);
  saveStore(store);
  return { category };
}

/** DELETE /api/single-select-categories — removes a category. */
export function removeSingleSelectCategory(category: string): void {
  const store = getStore();
  store.singleSelectCategories = store.singleSelectCategories.filter((c) => c !== category);
  saveStore(store);
}

// ─── Device Zoom ───────────────────────────────────────────────────────────

/** GET /api/device-zoom — returns zoom level (default 100). */
export function getDeviceZoom(deviceId: string, songId: number): number {
  const store = getStore();
  return store.deviceZooms.find((z) => z.deviceId === deviceId && z.songId === songId)?.zoom ?? 100;
}

/** PUT /api/device-zoom — upserts zoom level. */
export function setDeviceZoom(deviceId: string, songId: number, zoom: number): void {
  const store = getStore();
  const existing = store.deviceZooms.find((z) => z.deviceId === deviceId && z.songId === songId);
  if (existing) {
    existing.zoom = zoom;
    existing.updatedAt = nowIso();
  } else {
    store.deviceZooms.push({ deviceId, songId, zoom, updatedAt: nowIso() });
  }
  saveStore(store);
}

// ─── Images ────────────────────────────────────────────────────────────────

/** POST /api/pieces/[id]/images — create image entries from pre-read data URLs. */
export function uploadImages(
  songId: number,
  kind: ImageKind,
  entries: { dataUrl: string; filename: string }[],
): Song | null {
  const store = getStore();
  const piece = store.pieces.find((p) => p.id === songId);
  if (!piece) return null;

  for (const entry of entries) {
    const id = nextId(store);
    const maxOrder = store.images
      .filter((img) => img.songId === songId && img.kind === kind)
      .reduce((max, img) => Math.max(max, img.sortOrder), -1);
    store.images.push({
      id,
      songId,
      kind,
      url: entry.dataUrl,
      filename: entry.filename,
      sortOrder: maxOrder + 1,
      sourceUrl: null,
      createdAt: nowIso(),
    });
  }

  saveStore(store);
  return getPiece(songId);
}

/** PATCH /api/pieces/[id]/images — reorders images. */
export function reorderImages(songId: number, kind: ImageKind, ids: number[]): Song | null {
  const store = getStore();
  for (let i = 0; i < ids.length; i++) {
    const image = store.images.find((img) => img.id === ids[i] && img.songId === songId && img.kind === kind);
    if (image) image.sortOrder = i;
  }
  saveStore(store);
  return getPiece(songId);
}

/** DELETE /api/pieces/[id]/images — deletes images. */
export function deleteImages(songId: number, ids: number[]): Song | null {
  const store = getStore();
  store.images = store.images.filter(
    (img) => !(img.songId === songId && ids.includes(img.id)),
  );
  saveStore(store);
  return getPiece(songId);
}

/** PATCH /api/pieces/[id]/images/[imageId] — updates image source URL. */
export function updateImageSource(songId: number, imageId: number, sourceUrl: string | null): Song | null {
  const store = getStore();
  const image = store.images.find((img) => img.id === imageId && img.songId === songId);
  if (image) {
    image.sourceUrl = sourceUrl;
    saveStore(store);
  }
  return getPiece(songId);
}

// ─── Links ─────────────────────────────────────────────────────────────────

/** PUT /api/pieces/[id]/links — replaces all video links for a song. */
export function saveLinks(songId: number, links: { label: string; url: string }[]): Song | null {
  const store = getStore();
  // Remove existing links for this song
  store.links = store.links.filter((l) => l.songId !== songId);
  // Add new links
  links.forEach((link, index) => {
    const id = nextId(store);
    store.links.push({
      id,
      songId,
      label: link.label,
      url: link.url,
      sortOrder: index,
    });
  });
  saveStore(store);
  return getPiece(songId);
}

// ─── Health ────────────────────────────────────────────────────────────────

export function healthCheck(): { status: string } {
  return { status: "ok" };
}

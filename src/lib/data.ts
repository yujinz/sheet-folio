import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceZoom, singleSelectCategories, songImages, songs, songTags, tagCategories, tags, videoLinks } from "@/db/schema";
import { seedDefaultCategories } from "@/lib/seed";
import type { CategoryEntry, ImageKind, Song, Tag } from "@/lib/types";

/**
 * 🔄 DEMO SYNC: Each function here has a counterpart in src/lib/demo-store.ts
 * on the `demo` branch. If you add, remove, or change any data function below,
 * update the matching function in demo-store.ts too.
 * See also: src/app/api/pieces/route.ts (same note)
 */

export function nowIso() {
  return new Date().toISOString();
}

export function groupTags(rows: Tag[]): Record<string, Tag[]> {
  const cats = new Set(rows.map((tag) => tag.category));
  return Object.fromEntries([...cats].map((cat) => [cat, rows.filter((tag) => tag.category === cat)])) as Record<string, Tag[]>;
}

export function getSongs(): Song[] {
  const allSongs = db.select().from(songs).orderBy(asc(songs.difficulty), asc(sql`coalesce(${songs.title}, ${songs.titleAlt})`)).all();
  const allTags = db.select().from(tags).all();
  const joins = db.select().from(songTags).all();
  const tagsById = new Map(allTags.map((tag) => [tag.id, tag]));
  const joinsBySongId = new Map<number, Tag[]>();

  for (const join of joins) {
    const tag = tagsById.get(join.tagId);
    if (!tag) continue;
    joinsBySongId.set(join.songId, [...(joinsBySongId.get(join.songId) ?? []), tag]);
  }

  return allSongs.map((song) => {
    return { ...song, tags: groupTags(joinsBySongId.get(song.id) ?? []) };
  });
}

/**
 * GET /api/tags payload — every tag with its song count.
 * Shared by the API route and the server-rendered directory page.
 */
export function getTags(): (Tag & { songCount: number })[] {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      nameAlt: tags.nameAlt,
      color: tags.color,
      category: tags.category,
      songCount: sql<number>`count(${songTags.songId})`.mapWith(Number),
    })
    .from(tags)
    .leftJoin(songTags, sql`${tags.id} = ${songTags.tagId}`)
    .groupBy(tags.id)
    .all();
}

/**
 * GET /api/categories payload — ordered tag category entries.
 * Idempotently seeds the 3 default categories on first run (before a reset
 * re-inserts them), so the directory page never shows zero categories.
 */
export function getCategories(): CategoryEntry[] {
  seedDefaultCategories();
  return db.select().from(tagCategories).orderBy(asc(tagCategories.sortOrder), asc(tagCategories.key)).all();
}

/** GET /api/single-select-categories payload — category keys marked single-select. */
export function getSingleSelectCategories(): string[] {
  return db.select().from(singleSelectCategories).all().map((r) => r.category);
}

export function getSong(id: number): Song | null {
  const song = db.select().from(songs).where(eq(songs.id, id)).get();
  if (!song) return null;
  const selectedTags = db
    .select({ id: tags.id, name: tags.name, nameAlt: tags.nameAlt, color: tags.color, category: tags.category })
    .from(songTags)
    .innerJoin(tags, eq(songTags.tagId, tags.id))
    .where(eq(songTags.songId, id))
    .all() as Tag[];
  const images = db.select().from(songImages).where(eq(songImages.songId, id)).orderBy(asc(songImages.sortOrder), asc(songImages.id)).all();
  const links = db.select().from(videoLinks).where(eq(videoLinks.songId, id)).orderBy(asc(videoLinks.sortOrder), asc(videoLinks.id)).all();
  return {
    ...song,
    tags: groupTags(selectedTags),
    images: {
      staff: images.filter((image) => image.kind === "staff"),
      numbered: images.filter((image) => image.kind === "numbered")
    },
    links
  };
}

export function setSongTags(songId: number, tagIds: number[]) {
  db.delete(songTags).where(eq(songTags.songId, songId)).run();
  const validIds = tagIds.length ? db.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds)).all().map((tag) => tag.id) : [];
  const insert = db.insert(songTags);
  for (const tagId of validIds) {
    insert.values({ songId, tagId }).onConflictDoNothing().run();
  }
}

export function reorderImages(songId: number, kind: ImageKind, ids: number[]) {
  const update = db.update(songImages);
  ids.forEach((id, index) => {
    update
      .set({ sortOrder: index })
      .where(and(eq(songImages.songId, songId), eq(songImages.kind, kind), eq(songImages.id, id)))
      .run();
  });
}

export function getDeviceZoom(deviceId: string, songId: number) {
  return db
    .select({ zoom: deviceZoom.zoom })
    .from(deviceZoom)
    .where(and(eq(deviceZoom.deviceId, deviceId), eq(deviceZoom.songId, songId)))
    .get()?.zoom ?? 100;
}

export function upsertDeviceZoom(deviceId: string, songId: number, zoom: number) {
  db.insert(deviceZoom)
    .values({ deviceId, songId, zoom, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: [deviceZoom.deviceId, deviceZoom.songId],
      set: { zoom, updatedAt: nowIso() }
    })
    .run();
}

export function nextImageOrder(songId: number, kind: ImageKind) {
  const row = db
    .select({ value: sql<number>`coalesce(max(${songImages.sortOrder}), -1)` })
    .from(songImages)
    .where(and(eq(songImages.songId, songId), eq(songImages.kind, kind)))
    .get();
  return (row?.value ?? -1) + 1;
}

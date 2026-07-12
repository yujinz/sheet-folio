import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceZoom, songImages, songs, songTags, tags, videoLinks } from "@/db/schema";
import { CORE_CATEGORIES } from "@/lib/types";
import type { ImageKind, Song, Tag } from "@/lib/types";

export function nowIso() {
  return new Date().toISOString();
}

export function groupTags(rows: Tag[]): Record<string, Tag[]> {
  const cats = new Set(rows.map((tag) => tag.category));
  // Always include core categories so frontend can safely access them
  for (const core of CORE_CATEGORIES) cats.add(core);
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

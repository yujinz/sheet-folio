import { describe, it, expect, afterAll } from "vitest";
import { inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";

// Clean up test data after all tests
const testSongTitles = ["S1", "S2", "Detail Test", "Tag Test", "Order Test", "Reorder Test", "Zoom Test"];

describe("Data layer integration", () => {
  afterAll(async () => {
    const { db } = await import("@/db");
    // Delete test songs — FK cascades remove song_tags, song_images, youtube_links, device_zoom
    db.delete(schema.songs).where(inArray(schema.songs.title, testSongTitles)).run();
    // Delete test tags (those with timestamps)
    db.delete(schema.tags).where(sql`name LIKE 'custom-a-%' OR name LIKE 'custom-b-%' OR name LIKE 'custom-c-%'`).run();
  });

  async function data() {
    return import("@/lib/data");
  }

  it("getSongs returns all songs with tag groups", async () => {
    const { getSongs, nowIso } = await data();
    const { db } = await import("@/db");
    const time = nowIso();
    const before = getSongs().length;
    db.insert(schema.songs).values({ title: "S1", difficulty: 1, notes: "", createdAt: time, updatedAt: time }).run();
    db.insert(schema.songs).values({ title: "S2", difficulty: 2, notes: "", createdAt: time, updatedAt: time }).run();

    const all = getSongs();
    expect(all).toHaveLength(before + 2);
    for (const song of all) {
      expect(song.tags).toBeDefined();
      expect(song.tags.pitch).toBeInstanceOf(Array);
      expect(song.tags.technique).toBeInstanceOf(Array);
      expect(song.tags.rhythm).toBeInstanceOf(Array);
    }
  });

  it("getSong returns a single song with images, links, and tags", async () => {
    const { getSong, nowIso } = await data();
    const { db } = await import("@/db");
    const time = nowIso();
    const song = db.insert(schema.songs).values({ title: "Detail Test", difficulty: 1, notes: "", createdAt: time, updatedAt: time }).returning().get();
    const result = getSong(song.id);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Detail Test");
    expect(result!.images).toEqual({ staff: [], numbered: [] });
    expect(result!.links).toEqual([]);
    expect(result!.tags).toEqual({ pitch: [], technique: [], rhythm: [] });
  });

  it("getSong returns null for nonexistent id", async () => {
    const { getSong } = await data();
    expect(getSong(99999)).toBeNull();
  });

  it("setSongTags replaces tags on a song", async () => {
    const { getSong, setSongTags, nowIso } = await data();
    const { db } = await import("@/db");
    const time = nowIso();
    const song = db.insert(schema.songs).values({ title: "Tag Test", difficulty: 1, notes: "", createdAt: time, updatedAt: time }).returning().get();
    const ts = Date.now();
    const tag1 = db.insert(schema.tags).values({ name: `custom-a-${ts}`, nameEn: "", color: "#ff0000", category: "pitch" }).returning().get();
    const tag2 = db.insert(schema.tags).values({ name: `custom-b-${ts}`, nameEn: "", color: "#00ff00", category: "technique" }).returning().get();
    const tag3 = db.insert(schema.tags).values({ name: `custom-c-${ts}`, nameEn: "", color: "#0000ff", category: "rhythm" }).returning().get();

    setSongTags(song.id, [tag1.id, tag2.id, tag3.id]);
    expect(getSong(song.id)!.tags.pitch.some((t) => t.id === tag1.id)).toBe(true);
    expect(getSong(song.id)!.tags.technique.some((t) => t.id === tag2.id)).toBe(true);
    expect(getSong(song.id)!.tags.rhythm.some((t) => t.id === tag3.id)).toBe(true);

    setSongTags(song.id, [tag3.id]);
    const updated = getSong(song.id);
    expect(updated!.tags.pitch).toHaveLength(0);
    expect(updated!.tags.technique).toHaveLength(0);
    expect(updated!.tags.rhythm.some((t) => t.id === tag3.id)).toBe(true);
  });

  it("nextImageOrder returns sequential order numbers", async () => {
    const { getSong, nextImageOrder, nowIso } = await data();
    const { db } = await import("@/db");
    const time = nowIso();
    const song = db.insert(schema.songs).values({ title: "Order Test", difficulty: 1, notes: "", createdAt: time, updatedAt: time }).returning().get();
    expect(nextImageOrder(song.id, "staff")).toBe(0);
    db.insert(schema.songImages).values({ songId: song.id, kind: "staff", url: "/a.png", filename: "a.png", sortOrder: 0, createdAt: nowIso() }).run();
    expect(nextImageOrder(song.id, "staff")).toBe(1);
    db.insert(schema.songImages).values({ songId: song.id, kind: "staff", url: "/b.png", filename: "b.png", sortOrder: 1, createdAt: nowIso() }).run();
    expect(nextImageOrder(song.id, "staff")).toBe(2);
  });

  it("reorderImages updates sort order", async () => {
    const { getSong, reorderImages, nowIso } = await data();
    const { db } = await import("@/db");
    const time = nowIso();
    const song = db.insert(schema.songs).values({ title: "Reorder Test", difficulty: 1, notes: "", createdAt: time, updatedAt: time }).returning().get();
    const img1 = db.insert(schema.songImages).values({ songId: song.id, kind: "numbered", url: "/1.png", filename: "1.png", sortOrder: 0, createdAt: nowIso() }).returning().get();
    const img2 = db.insert(schema.songImages).values({ songId: song.id, kind: "numbered", url: "/2.png", filename: "2.png", sortOrder: 1, createdAt: nowIso() }).returning().get();
    const img3 = db.insert(schema.songImages).values({ songId: song.id, kind: "numbered", url: "/3.png", filename: "3.png", sortOrder: 2, createdAt: nowIso() }).returning().get();

    reorderImages(song.id, "numbered", [img3.id, img1.id, img2.id]);
    const result = getSong(song.id);
    const numbered = result!.images!.numbered.sort((a, b) => a.sortOrder - b.sortOrder);
    expect(numbered.map((i) => i.id)).toEqual([img3.id, img1.id, img2.id]);
  });

  it("device zoom get/upsert works", async () => {
    const { getDeviceZoom, upsertDeviceZoom, nowIso } = await data();
    const { db } = await import("@/db");
    const time = nowIso();
    const song = db.insert(schema.songs).values({ title: "Zoom Test", difficulty: 1, notes: "", createdAt: time, updatedAt: time }).returning().get();
    expect(getDeviceZoom("device1", song.id)).toBe(100);
    upsertDeviceZoom("device1", song.id, 150);
    expect(getDeviceZoom("device1", song.id)).toBe(150);
    upsertDeviceZoom("device1", song.id, 75);
    expect(getDeviceZoom("device1", song.id)).toBe(75);
    expect(getDeviceZoom("device2", song.id)).toBe(100);
  });

  it("preset tags are seeded on database creation", async () => {
    const { db } = await import("@/db");
    const allTags = db.select().from(schema.tags).all();
    const names = allTags.map((t) => t.name);
    expect(names).toContain("高音");
    expect(names).toContain("低音");
    expect(names).toContain("连音");
    expect(names).toContain("颤音");
    expect(names).toContain("装饰音");
    expect(names).toContain("附点");
    expect(names).toContain("三连音");
  });
});
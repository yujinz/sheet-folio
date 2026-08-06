import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inArray, like, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { ExportDataBundle } from "@/lib/export-types";

// Unique prefix so tests never collide with real or other-test data.
const PREFIX = "ExportTest-";
const CLEANUP_TITLES: string[] = [];
const CLEANUP_TAG_NAMES: string[] = [];

function testDbPath() {
  return process.env.DB_PATH || "./data/test-sheet-folio.db";
}
function snapshotFile() {
  const base = path.basename(testDbPath(), ".db");
  return path.join(path.dirname(testDbPath()), "snapshots", `${base}.db`);
}
function lastExportFile() {
  const base = path.basename(testDbPath(), ".db");
  return path.join(path.dirname(testDbPath()), `${base}.last-export.json`);
}

function bundle(opts?: { pieceId?: number; title?: string; titleAlt?: string; tagName?: string; tagId?: number }): ExportDataBundle {
  const pieceId = opts?.pieceId ?? 99000;
  const title = opts?.title ?? `${PREFIX}Piece`;
  const titleAlt = opts?.titleAlt ?? `${PREFIX}Piece EN`;
  const tagName = opts?.tagName ?? `${PREFIX}Tag`;
  const tagId = opts?.tagId ?? 99500;
  return {
    manifest: { exportedAt: "2026-01-01T00:00:00.000Z", pieceCount: 1, tagCount: 1, imageCount: 0, schemaVersion: 3 },
    pieces: [
      {
        id: pieceId,
        title,
        titleAlt,
        difficulty: 3,
        notes: "test notes",
        tags: { pitch: [{ id: tagId, name: tagName, nameAlt: "", color: "#123456", category: "pitch" }] },
        images: { staff: [], numbered: [] },
        links: [],
      },
    ],
    tags: [{ id: tagId, name: tagName, nameAlt: "", color: "#123456", category: "pitch" }],
    singleSelectCategories: [],
    tagCategories: [],
    images: new Map<string, Buffer>(),
  };
}

describe("export-import", () => {
  afterAll(async () => {
    const { db } = await import("@/db");
    if (CLEANUP_TITLES.length) {
      db.delete(schema.songs).where(inArray(schema.songs.title, CLEANUP_TITLES)).run();
    }
    if (CLEANUP_TAG_NAMES.length) {
      db.delete(schema.tags).where(like(schema.tags.name, `${PREFIX}%`)).run();
    }
    try {
      fs.rmSync(snapshotFile(), { force: true });
      fs.rmSync(lastExportFile(), { force: true });
    } catch {}
  });

  it("parseExportBundle validates a valid bundle and rejects an invalid one", async () => {
    const { parseExportBundle } = await import("@/lib/export-validation");
    const valid = parseExportBundle(bundle());
    expect(valid.pieces).toHaveLength(1);
    expect(valid.images.size).toBe(0);
    expect(() => parseExportBundle({ pieces: "nope" })).toThrow();
  });

  it("getExportStatus returns counts and defaults", async () => {
    const { getExportStatus } = await import("@/lib/export-import");
    const status = getExportStatus();
    expect(status.storageMethod).toBe("sqlite");
    expect(status.pieceCount).toBeGreaterThanOrEqual(0);
    expect(status.tagCount).toBeGreaterThanOrEqual(0);
    expect(status.hasSnapshot).toBe(false);
    expect(status.lastExportedAt).toBeNull();
  });

  it("recordExport writes a timestamp that getExportStatus reports", async () => {
    const { recordExport, getExportStatus } = await import("@/lib/export-import");
    recordExport();
    const status = getExportStatus();
    expect(status.lastExportedAt).not.toBeNull();
    expect(new Date(status.lastExportedAt!).getTime()).not.toBeNaN();
  });

  it("buildExportData returns pieces with tags/links matching the DB", async () => {
    const { buildExportData } = await import("@/lib/export-import");
    const { getSong, nowIso } = await import("@/lib/data");
    const { db } = await import("@/db");
    const time = nowIso();

    const tag = db.insert(schema.tags).values({ name: `${PREFIX}ExportTag`, nameAlt: "", color: "#654321", category: "pitch" }).returning().get();
    CLEANUP_TAG_NAMES.push(tag.name);
    const song = db
      .insert(schema.songs)
      .values({ title: `${PREFIX}Export`, titleAlt: "", difficulty: 2, notes: "x", createdAt: time, updatedAt: time })
      .returning()
      .get();
    CLEANUP_TITLES.push(song.title);
    db.insert(schema.songTags).values({ songId: song.id, tagId: tag.id }).run();
    db.insert(schema.videoLinks).values({ songId: song.id, label: "Tutorial", url: "https://example.com", sortOrder: 0 }).run();

    const data = await buildExportData();
    const exported = data.pieces.find((p) => p.id === song.id);
    expect(exported).toBeDefined();
    expect(exported!.title).toBe(`${PREFIX}Export`);
    expect(exported!.tags.pitch?.map((t) => t.name)).toContain(`${PREFIX}ExportTag`);
    expect(exported!.links).toEqual([{ id: expect.any(Number), label: "Tutorial", url: "https://example.com" }]);
    expect(data.manifest.pieceCount).toBe(data.pieces.length);
    // The image file for this fake image row won't exist, so it's skipped from the map.
    const full = getSong(song.id);
    expect(full).not.toBeNull();
  });

  it("importData merge skips exact duplicates (by id+title) and title-only duplicates", async () => {
    const { importData } = await import("@/lib/export-import");
    const { getSongs } = await import("@/lib/data");
    const { db } = await import("@/db");

    const first = bundle({ pieceId: 99010, title: `${PREFIX}Merge1`, tagName: `${PREFIX}MergeTag1`, tagId: 99510 });
    CLEANUP_TITLES.push(`${PREFIX}Merge1`);
    CLEANUP_TAG_NAMES.push(`${PREFIX}MergeTag1`);

    const r1 = importData(first, "merge");
    expect(r1.imported.pieces).toBe(1);
    expect(r1.skipped.pieces).toBe(0);
    // tag created
    expect(r1.imported.tags).toBe(1);

    // Re-import the exact same bundle → skipped (same id + titles)
    const r2 = importData(first, "merge");
    expect(r2.skipped.pieces).toBe(1);
    expect(r2.imported.tags).toBe(0); // tag already exists

    // Different id but same titles → skipped (dedup by title)
    const sameTitle = bundle({ pieceId: 99011, title: `${PREFIX}Merge1`, titleAlt: `${PREFIX}Piece EN`, tagName: `${PREFIX}MergeTag1`, tagId: 99511 });
    const r3 = importData(sameTitle, "merge");
    expect(r3.skipped.pieces).toBe(1);

    // New piece → imported, and it shares the existing tag id (no new tag row)
    const second = bundle({ pieceId: 99012, title: `${PREFIX}Merge2`, titleAlt: "", tagName: `${PREFIX}MergeTag1`, tagId: 99510 });
    CLEANUP_TITLES.push(`${PREFIX}Merge2`);
    const r4 = importData(second, "merge");
    expect(r4.imported.pieces).toBe(1);
    expect(r4.imported.tags).toBe(0);

    // Verify the new piece references the ORIGINAL tag id (remapped), not the export id
    const songs = getSongs();
    const merged = songs.find((s) => s.title === `${PREFIX}Merge2`);
    expect(merged).toBeDefined();
    const tagIds = (merged!.tags.pitch ?? []).map((t) => t.id);
    const original = db.select().from(schema.tags).where(like(schema.tags.name, `${PREFIX}MergeTag1`)).all();
    expect(tagIds).toEqual(original.map((t) => t.id));

    // cleanup
    db.delete(schema.songs).where(inArray(schema.songs.title, [`${PREFIX}Merge1`, `${PREFIX}Merge2`])).run();
    db.delete(schema.tags).where(like(schema.tags.name, `${PREFIX}Merge%`)).run();
  });

  it("importData stores image URLs with the /api/uploads/ prefix", async () => {
    const { importData } = await import("@/lib/export-import");
    const { db } = await import("@/db");

    const pieceId = 99030;
    const title = `${PREFIX}Images`;
    const tagName = `${PREFIX}ImagesTag`;
    CLEANUP_TITLES.push(title);
    CLEANUP_TAG_NAMES.push(tagName);

    const b = bundle({ pieceId, title, titleAlt: `${PREFIX}Images EN`, tagName, tagId: 99530 });
    const filename = "scan.png";
    b.pieces[0].images = {
      staff: [{ id: 1, filename, sourceUrl: "https://example.com/scan.png" }],
      numbered: [],
    };
    b.images.set(`${pieceId}/staff/${filename}`, Buffer.from("fake-image-bytes"));
    b.manifest.imageCount = 1;

    // Redirect writes to a temp dir so the real data/uploads is untouched.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-folio-upload-"));
    const prev = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = tmp;
    try {
      const r = importData(b, "merge");
      expect(r.imported.pieces).toBe(1);
      expect(r.imported.images).toBe(1);

      const song = db.select().from(schema.songs).where(eq(schema.songs.title, title)).get();
      expect(song).toBeDefined();
      const images = db
        .select()
        .from(schema.songImages)
        .where(eq(schema.songImages.songId, song!.id))
        .all();
      expect(images).toHaveLength(1);
      expect(images[0].url).toBe(`/api/uploads/${song!.id}/staff/${filename}`);
      expect(images[0].filename).toBe(filename);
      // The file itself should have been written under the uploads dir.
      expect(fs.existsSync(path.join(tmp, String(song!.id), "staff", filename))).toBe(true);
    } finally {
      process.env.UPLOAD_DIR = prev;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("importData replace clears everything and imports with original ids", async () => {
    const { importData, createSnapshot, restoreSnapshot } = await import("@/lib/export-import");
    const { getSongs, getSong } = await import("@/lib/data");

    // Safety net: snapshot current state so we can restore after the test
    await createSnapshot();

    const repl = bundle({ pieceId: 99020, title: `${PREFIX}Replace`, titleAlt: "", tagName: `${PREFIX}ReplaceTag`, tagId: 99520 });
    const r = importData(repl, "replace");
    expect(r.imported.pieces).toBe(1);

    // Only the imported piece remains
    const songs = getSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0].id).toBe(99020);
    expect(songs[0].title).toBe(`${PREFIX}Replace`);
    // Preserves the tag
    const full = getSong(99020);
    expect((full!.tags.pitch ?? []).map((t) => t.name)).toContain(`${PREFIX}ReplaceTag`);

    // Restore the pre-test state
    restoreSnapshot();
    expect(getSongs().some((s) => s.id === 99020)).toBe(false);
  });

  it("createSnapshot + restoreSnapshot round-trips the DB", async () => {
    const { createSnapshot, restoreSnapshot } = await import("@/lib/export-import");
    const { getSongs, nowIso } = await import("@/lib/data");
    const { db } = await import("@/db");

    await createSnapshot();
    const time = nowIso();
    db.insert(schema.songs).values({ title: `${PREFIX}Snap`, difficulty: 1, notes: "", createdAt: time, updatedAt: time }).run();

    // Present before rollback
    expect(getSongs().some((s) => s.title === `${PREFIX}Snap`)).toBe(true);

    restoreSnapshot();
    // Gone after rollback
    expect(getSongs().some((s) => s.title === `${PREFIX}Snap`)).toBe(false);
  });
});

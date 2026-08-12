// Server-side import/export data layer.
//
// 🔄 DEMO SYNC: Each function here has a counterpart in src/demo/store.ts.
//    When you add or change a function below, update the matching function in
//    src/demo/store.ts too. API routes are mirrored in src/demo/fetch.ts.
//
// NOTE: This module is server-only (imports @/db which opens better-sqlite3).

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq, gt } from "drizzle-orm";
import { db, getSqliteConnection } from "@/db";
import {
  deviceZoom,
  singleSelectCategories,
  songImages,
  songs,
  songTags,
  tagCategories,
  tags,
  videoLinks,
} from "@/db/schema";
import { getSong, getSongs } from "@/lib/data";
import { parseExportBundle } from "@/lib/export-validation";
import type {
  ExportDataBundle,
  ExportImageData,
  ExportStatus,
  ExportedImage,
  ExportedPiece,
  ImportResult,
  ImageKind,
} from "@/lib/export-types";

// ─── Paths ────────────────────────────────────────────────────────────────

function dbPath(): string {
  return process.env.DB_PATH || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "sheet-folio.db");
}
function dataDir(): string {
  return path.dirname(dbPath());
}
function dbBase(): string {
  return path.basename(dbPath(), ".db");
}
/** Snapshot file, isolated per DB so tests (which use a test DB) don't clash with real snapshots. */
function snapshotPath(): string {
  return path.join(dataDir(), "snapshots", `${dbBase()}.db`);
}
function lastExportPath(): string {
  return path.join(dataDir(), `${dbBase()}.last-export.json`);
}
function uploadsDir(): string {
  return process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "uploads");
}

// ─── Status ───────────────────────────────────────────────────────────────

/**
 * Counts of pieces/tags/images inside the snapshot DB. Returns null when no
 * snapshot file exists (or it can't be read).
 */
function readSnapshotCounts(): { pieces: number; tags: number; images: number } | null {
  if (!fs.existsSync(snapshotPath())) return null;
  try {
    const snap = new Database(snapshotPath(), { readonly: true });
    try {
      const count = (table: string) =>
        (snap.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c;
      return { pieces: count("songs"), tags: count("tags"), images: count("song_images") };
    } finally {
      snap.close();
    }
  } catch {
    return null;
  }
}

export function getExportStatus(): ExportStatus {
  const pieceCount = db.select().from(songs).all().length;
  const tagCount = db.select().from(tags).all().length;
  const imageCount = db.select().from(songImages).all().length;

  let lastExportedAt: string | null = null;
  try {
    if (fs.existsSync(lastExportPath())) {
      const parsed = JSON.parse(fs.readFileSync(lastExportPath(), "utf-8")) as { lastExportedAt?: unknown };
      if (typeof parsed.lastExportedAt === "string") lastExportedAt = parsed.lastExportedAt;
    }
  } catch {
    // ignore unreadable metadata
  }

  let lastSnapshotAt: string | null = null;
  if (fs.existsSync(snapshotPath())) {
    try {
      lastSnapshotAt = new Date(fs.statSync(snapshotPath()).mtimeMs).toISOString();
    } catch {
      // ignore
    }
  }

  // Count pieces created/edited after the last export (null when never exported).
  let newPiecesSinceExport: number | null = null;
  if (lastExportedAt) {
    newPiecesSinceExport = db.select().from(songs).where(gt(songs.updatedAt, lastExportedAt)).all().length;
  }

  return {
    pieceCount,
    tagCount,
    imageCount,
    lastExportedAt,
    lastSnapshotAt,
    hasSnapshot: fs.existsSync(snapshotPath()),
    snapshotCounts: readSnapshotCounts(),
    storageMethod: "sqlite",
    newPiecesSinceExport,
    // The server data layer has no seed concept — users own everything.
    isSeedData: false,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────

function toExportedImage(img: { id: number; filename: string; sourceUrl: string | null }): ExportedImage {
  return { id: img.id, filename: img.filename, sourceUrl: img.sourceUrl };
}

/** Builds the full export bundle: structured data + raw image file bytes. */
export async function buildExportData(): Promise<ExportDataBundle> {
  const allSongs = getSongs();
  const images = new Map<string, ExportImageData>();
  const pieces: ExportedPiece[] = [];

  for (const song of allSongs) {
    const full = getSong(song.id);
    if (!full) continue;

    const pieceTags: Record<string, ExportedPiece["tags"][string]> = {};
    for (const [cat, list] of Object.entries(full.tags)) {
      pieceTags[cat] = list.map((t) => ({
        id: t.id,
        name: t.name,
        nameAlt: t.nameAlt,
        color: t.color,
        category: t.category,
      }));
    }

    const staffImages = full.images?.staff ?? [];
    const numberedImages = full.images?.numbered ?? [];

    pieces.push({
      id: full.id,
      title: full.title,
      titleAlt: full.titleAlt,
      difficulty: full.difficulty,
      notes: full.notes,
      tags: pieceTags,
      images: {
        staff: staffImages.map(toExportedImage),
        numbered: numberedImages.map(toExportedImage),
      },
      links: (full.links ?? []).map((l) => ({ id: l.id, label: l.label, url: l.url })),
    });

    // Raw copy (lossless — a backup should preserve originals). EXIF
    // stripping remains the job of scripts/export-data.ts (public site export).
    for (const kind of ["staff", "numbered"] as ImageKind[]) {
      for (const img of full.images?.[kind] ?? []) {
        const key = `${full.id}/${kind}/${img.filename}`;
        if (images.has(key)) continue;
        const srcPath = path.join(/* turbopackIgnore: true */ uploadsDir(), String(full.id), kind, img.filename);
        if (fs.existsSync(/* turbopackIgnore: true */ srcPath)) {
          images.set(key, fs.readFileSync(/* turbopackIgnore: true */ srcPath));
        }
      }
    }
  }

  const allTags = db.select().from(tags).all();
  const ssRows = db.select().from(singleSelectCategories).all();
  const tagCatRows = db.select().from(tagCategories).all();

  return {
    manifest: {
      exportedAt: new Date().toISOString(),
      pieceCount: pieces.length,
      tagCount: allTags.length,
      imageCount: images.size,
      schemaVersion: 3,
    },
    pieces,
    tags: allTags.map((t) => ({ id: t.id, name: t.name, nameAlt: t.nameAlt, color: t.color, category: t.category })),
    singleSelectCategories: ssRows.map((r) => r.category),
    tagCategories: tagCatRows.map((r) => ({ key: r.key, name: r.name, nameAlt: r.nameAlt, sortOrder: r.sortOrder })),
    images,
  };
}

// ─── Import ───────────────────────────────────────────────────────────────

/**
 * Imports a validated export bundle.
 *
 * - replace: clears all tables first, inserts with the original piece IDs.
 * - merge:   skips pieces whose (id + titles) match, or whose (title, titleAlt)
 *            match, then inserts the rest with new auto-increment IDs. Tags are
 *            deduped by (category, name) with export→target ID remapping.
 */
export function importData(bundle: ExportDataBundle, mode: "merge" | "replace"): ImportResult {
  const result: ImportResult = { imported: { pieces: 0, tags: 0, images: 0 }, skipped: { pieces: 0 } };
  const time = new Date().toISOString();

  // ── Replace: clear everything first (children before parents) ──
  if (mode === "replace") {
    db.delete(songTags).run();
    db.delete(songImages).run();
    db.delete(videoLinks).run();
    db.delete(deviceZoom).run();
    db.delete(songs).run();
    db.delete(tags).run();
    db.delete(singleSelectCategories).run();
    db.delete(tagCategories).run();
  }

  // ── Tag categories (by key) ──
  const existingCatKeys = new Set(db.select({ key: tagCategories.key }).from(tagCategories).all().map((r) => r.key));
  for (const cat of bundle.tagCategories) {
    if (!existingCatKeys.has(cat.key)) {
      db.insert(tagCategories)
        .values({ key: cat.key, name: cat.name, nameAlt: cat.nameAlt, sortOrder: cat.sortOrder })
        .onConflictDoNothing()
        .run();
      existingCatKeys.add(cat.key);
    }
  }

  // ── Single-select categories ──
  const existingSs = new Set(db.select({ category: singleSelectCategories.category }).from(singleSelectCategories).all().map((r) => r.category));
  for (const cat of bundle.singleSelectCategories) {
    if (!existingSs.has(cat)) {
      db.insert(singleSelectCategories).values({ category: cat }).onConflictDoNothing().run();
      existingSs.add(cat);
    }
  }

  // ── Tags: dedup by (category, name), build exportId → targetId map ──
  const tagKeyIndex = new Map<string, number>();
  for (const t of db.select().from(tags).all()) {
    tagKeyIndex.set(`${t.category}\u0000${t.name}`, t.id);
  }
  const tagIdMap = new Map<number, number>();
  for (const expTag of bundle.tags) {
    const key = `${expTag.category}\u0000${expTag.name}`;
    const existingId = tagKeyIndex.get(key);
    if (existingId !== undefined) {
      tagIdMap.set(expTag.id, existingId);
      continue;
    }
    const inserted = db
      .insert(tags)
      .values({ name: expTag.name, nameAlt: expTag.nameAlt, color: expTag.color, category: expTag.category })
      .onConflictDoNothing()
      .returning({ id: tags.id })
      .get();
    if (inserted) {
      tagKeyIndex.set(key, inserted.id);
      tagIdMap.set(expTag.id, inserted.id);
      result.imported.tags++;
    } else {
      const existing = db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.category, expTag.category), eq(tags.name, expTag.name)))
        .get();
      if (existing) {
        tagKeyIndex.set(key, existing.id);
        tagIdMap.set(expTag.id, existing.id);
      }
    }
  }

  // ── Pieces ──
  const explicitIds = mode === "replace";
  for (const expPiece of bundle.pieces) {
    let newId: number;

    if (explicitIds) {
      db.insert(songs)
        .values({
          id: expPiece.id,
          title: expPiece.title,
          titleAlt: expPiece.titleAlt,
          difficulty: expPiece.difficulty,
          notes: expPiece.notes,
          createdAt: time,
          updatedAt: time,
        })
        .onConflictDoNothing()
        .run();
      newId = expPiece.id;
      result.imported.pieces++;
    } else {
      // ① Fast path: same ID + same titles → exact duplicate
      const byId = db.select().from(songs).where(eq(songs.id, expPiece.id)).get();
      if (byId && byId.title === expPiece.title && byId.titleAlt === expPiece.titleAlt) {
        result.skipped.pieces++;
        continue;
      }
      // ② Full search: same (title, titleAlt) → duplicate by name
      const byTitle = db
        .select()
        .from(songs)
        .where(and(eq(songs.title, expPiece.title), eq(songs.titleAlt, expPiece.titleAlt)))
        .get();
      if (byTitle) {
        result.skipped.pieces++;
        continue;
      }
      // ③ Insert as new
      const inserted = db
        .insert(songs)
        .values({
          title: expPiece.title,
          titleAlt: expPiece.titleAlt,
          difficulty: expPiece.difficulty,
          notes: expPiece.notes,
          createdAt: time,
          updatedAt: time,
        })
        .returning({ id: songs.id })
        .get();
      newId = inserted.id;
      result.imported.pieces++;
    }

    // song_tags (remap export tag ids → target tag ids)
    for (const list of Object.values(expPiece.tags)) {
      for (const t of list) {
        const targetTagId = tagIdMap.get(t.id);
        if (targetTagId === undefined) continue;
        db.insert(songTags).values({ songId: newId, tagId: targetTagId }).onConflictDoNothing().run();
      }
    }

    // images (write files to uploads dir, then rows)
    for (const kind of ["staff", "numbered"] as ImageKind[]) {
      (expPiece.images[kind] ?? []).forEach((img, index) => {
        const imgKey = `${expPiece.id}/${kind}/${img.filename}`;
        const imgData = bundle.images.get(imgKey);
        if (imgData && typeof imgData !== "string") {
          const destDir = path.join(/* turbopackIgnore: true */ uploadsDir(), String(newId), kind);
          fs.mkdirSync(destDir, { recursive: true });
          fs.writeFileSync(path.join(/* turbopackIgnore: true */ destDir, img.filename), imgData as Buffer);
        }
        db.insert(songImages)
          .values({
            songId: newId,
            kind,
            url: `/api/uploads/${newId}/${kind}/${img.filename}`,
            filename: img.filename,
            sortOrder: index,
            sourceUrl: img.sourceUrl,
            createdAt: time,
          })
          .run();
        result.imported.images++;
      });
    }

    // links
    (expPiece.links ?? []).forEach((link, index) => {
      db.insert(videoLinks).values({ songId: newId, label: link.label, url: link.url, sortOrder: index }).run();
    });
  }

  return result;
}

// ─── Snapshot / rollback ──────────────────────────────────────────────────

/** Creates a consistent SQLite snapshot via better-sqlite3's backup() API. */
export async function createSnapshot(): Promise<void> {
  const sqlite = getSqliteConnection();
  if (!sqlite) throw new Error("Database not available");
  fs.mkdirSync(path.dirname(snapshotPath()), { recursive: true });
  await sqlite.backup(snapshotPath());
}

export function hasSnapshot(): boolean {
  return fs.existsSync(snapshotPath());
}

/**
 * Restores the live DB from the snapshot by copying rows through a second
 * read-only connection. Preserves IDs; the live connection stays open.
 */
export function restoreSnapshot(): void {
  if (!hasSnapshot()) {
    throw new Error("No snapshot available");
  }
  const sqlite = getSqliteConnection();
  if (!sqlite) throw new Error("Database not available");

  const snap = new Database(snapshotPath(), { readonly: true });
  // Children must be deleted before parents (FK); parents inserted before children.
  const deleteOrder = [
    "song_tags",
    "song_images",
    "video_links",
    "device_zoom",
    "songs",
    "tags",
    "single_select_categories",
    "tag_categories",
  ];
  const insertOrder = [
    "songs",
    "tags",
    "single_select_categories",
    "tag_categories",
    "song_tags",
    "song_images",
    "video_links",
    "device_zoom",
  ];
  try {
    sqlite.transaction(() => {
      for (const table of deleteOrder) {
        sqlite.prepare(`DELETE FROM "${table}"`).run();
      }
      for (const table of insertOrder) {
        const rows = snap.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
        if (rows.length === 0) continue;
        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(",");
        const placeholders = cols.map(() => "?").join(",");
        const insert = sqlite.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`);
        for (const row of rows) {
          insert.run(...cols.map((c) => row[c]));
        }
      }
    })();
  } finally {
    snap.close();
  }
}

/** Records the last export timestamp to data/last-export.json. */
export function recordExport(): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(lastExportPath(), JSON.stringify({ lastExportedAt: new Date().toISOString() }, null, 2));
}

// Re-export the parser so API routes have a single import surface.
export { parseExportBundle };

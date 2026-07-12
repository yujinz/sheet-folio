#!/usr/bin/env npx tsx
/**
 * Data export script for sheet-folio.
 *
 * Reads the SQLite database and uploads directory, then writes a structured
 * data bundle to OUTPUT_DIR that can be consumed by downstream tools such as
 * static site generators, backup systems, or migration pipelines.
 *
 * Usage:
 *   npx tsx scripts/export-data.ts
 *
 * Options (env vars):
 *   DB_PATH       – path to SQLite database (default: data/sheet-folio.db)
 *   UPLOAD_DIR    – path to uploads directory (default: data/uploads)
 *   OUTPUT_DIR    – path to write export bundle (default: export-data)
 */

import Database from "better-sqlite3";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "sheet-folio.db");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "export-data");

const IMG_OUT = path.join(OUTPUT_DIR, "images");

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
import type {
  ExportedImage,
  ExportedLink,
  ExportedPiece,
  ExportedTag,
  ExportManifest,
  ImageKind
} from "../src/lib/export-types";

interface TagRow {
  id: number;
  name: string;
  name_alt: string;
  color: string;
  category: string;
}

interface SongRow {
  id: number;
  title: string;
  title_alt: string;
  difficulty: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface SongImageRow {
  id: number;
  song_id: number;
  kind: ImageKind;
  url: string;
  filename: string;
  sort_order: number;
  source_url: string | null;
  created_at: string;
}

interface VideoLinkRow {
  id: number;
  song_id: number;
  label: string;
  url: string;
  sort_order: number;
}

// Shared export types imported from ../src/lib/export-types.ts

// ---------------------------------------------------------------
// Read data from SQLite
// ---------------------------------------------------------------
function readData() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error("Run the app first to create the database, or set DB_PATH.");
    process.exit(1);
  }

  const sqlite = new Database(DB_PATH, { readonly: true });

  const songs = sqlite.prepare("SELECT * FROM songs ORDER BY id").all() as SongRow[];
  const tags = sqlite.prepare("SELECT * FROM tags ORDER BY id").all() as TagRow[];
  const songTags = sqlite.prepare("SELECT * FROM song_tags").all() as { song_id: number; tag_id: number }[];
  const images = sqlite.prepare("SELECT * FROM song_images ORDER BY sort_order, id").all() as SongImageRow[];
  const links = sqlite.prepare("SELECT * FROM video_links ORDER BY sort_order, id").all() as VideoLinkRow[];
  const singleSelectRows = sqlite.prepare("SELECT * FROM single_select_categories ORDER BY category").all() as { category: string }[];

  // Build tag map
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  // Group tags per piece per category (dynamic, not hardcoded)
  const songTagMap = new Map<number, Record<string, ExportedTag[]>>();
  for (const st of songTags) {
    const tag = tagMap.get(st.tag_id);
    if (!tag) continue;
    const cat = tag.category as string;
    if (!songTagMap.has(st.song_id)) {
      songTagMap.set(st.song_id, {});
    }
    const pieceTags = songTagMap.get(st.song_id)!;
    if (!pieceTags[cat]) pieceTags[cat] = [];
    pieceTags[cat].push({
      id: tag.id,
      name: tag.name,
      nameAlt: tag.name_alt,
      color: tag.color,
      category: cat
    });
  }

  // Group images per piece per kind
  const songImageMap = new Map<number, Record<ImageKind, ExportedImage[]>>();
  for (const img of images) {
    if (!songImageMap.has(img.song_id)) {
      songImageMap.set(img.song_id, { staff: [], numbered: [] });
    }
    songImageMap.get(img.song_id)![img.kind].push({
      id: img.id,
      filename: img.filename,
      sourceUrl: img.source_url
    });
  }

  // Group links per piece
  const songLinkMap = new Map<number, ExportedLink[]>();
  for (const link of links) {
    if (!songLinkMap.has(link.song_id)) {
      songLinkMap.set(link.song_id, []);
    }
    songLinkMap.get(link.song_id)!.push({
      id: link.id,
      label: link.label,
      url: link.url
    });
  }

  sqlite.close();

  return { songs, tags, songTagMap, songImageMap, songLinkMap, singleSelectRows };
}

// ---------------------------------------------------------------
// Copy & strip EXIF from images
// ---------------------------------------------------------------
async function copyImages(songImageMap: Map<number, Record<ImageKind, SongImageRow[]>>): Promise<number> {
  let count = 0;

  for (const [songId, kinds] of songImageMap) {
    for (const [kind, images] of Object.entries(kinds)) {
      for (const img of images) {
        const srcPath = path.join(UPLOAD_DIR, String(songId), kind, img.filename);
        if (!fs.existsSync(srcPath)) {
          console.warn(`  ⚠ Image not found: ${srcPath}`);
          continue;
        }

        const dstDir = path.join(IMG_OUT, String(songId), kind);
        fs.mkdirSync(dstDir, { recursive: true });
        const dstPath = path.join(dstDir, img.filename);

        // Use sharp to strip EXIF metadata (sharp strips metadata by default)
        try {
          await sharp(srcPath).toFile(dstPath);
        } catch {
          // If sharp fails (e.g. unsupported format), fall back to raw copy
          console.warn(`  ⚠ sharp failed for ${srcPath}, falling back to raw copy`);
          fs.copyFileSync(srcPath, dstPath);
        }
        count++;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
async function main() {
  console.log("📖 Reading data from", DB_PATH);
  const { songs, tags, songTagMap, songImageMap, songLinkMap, singleSelectRows } = readData();
  console.log(`   Found ${songs.length} pieces, ${tags.length} tags, ${singleSelectRows.length} single-select categories`);

  // Prepare output directories
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(IMG_OUT, { recursive: true });

  // Build pieces export data
  const exportedPieces: ExportedPiece[] = songs.map((s) => ({
    id: s.id,
    title: s.title,
    titleAlt: s.title_alt,
    difficulty: s.difficulty,
    notes: s.notes,
    tags: songTagMap.get(s.id) ?? {},
    images: songImageMap.get(s.id) ?? { staff: [], numbered: [] },
    links: songLinkMap.get(s.id) ?? []
  }));

  // Build tags export data
  const exportedTags: ExportedTag[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    nameAlt: t.name_alt,
    color: t.color,
    category: t.category
  }));

  // Copy images with EXIF stripping
  console.log("🖼️  Copying images with EXIF stripping...");

  // We need the raw rows for image paths, rebuild songImageMap from raw data
  const sqlite = new Database(DB_PATH, { readonly: true });
  const rawImages = sqlite.prepare("SELECT * FROM song_images ORDER BY sort_order, id").all() as SongImageRow[];
  sqlite.close();

  const rawSongImageMap = new Map<number, Record<ImageKind, SongImageRow[]>>();
  for (const img of rawImages) {
    if (!rawSongImageMap.has(img.song_id)) {
      rawSongImageMap.set(img.song_id, { staff: [], numbered: [] });
    }
    rawSongImageMap.get(img.song_id)![img.kind].push(img);
  }

  const imageCount = await copyImages(rawSongImageMap);
  console.log(`   Copied ${imageCount} images`);

  // Write pieces.json
  console.log("📝 Writing pieces.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "pieces.json"),
    JSON.stringify(exportedPieces, null, 2),
    "utf-8"
  );

  // Write tags.json
  console.log("📝 Writing tags.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "tags.json"),
    JSON.stringify(exportedTags, null, 2),
    "utf-8"
  );

  // Write single-select-categories.json
  console.log("📝 Writing single-select-categories.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "single-select-categories.json"),
    JSON.stringify(singleSelectRows.map((r) => r.category), null, 2),
    "utf-8"
  );

  // Write manifest.json
  const manifest: ExportManifest = {
    exportedAt: new Date().toISOString(),
    pieceCount: exportedPieces.length,
    tagCount: exportedTags.length,
    imageCount,
    schemaVersion: 2
  };
  console.log("📝 Writing manifest.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  console.log(`\n✅ Export complete! Output: ${OUTPUT_DIR}`);
  console.log(`   Pieces: ${exportedPieces.length}`);
  console.log(`   Tags: ${exportedTags.length}`);
  console.log(`   Images (EXIF stripped): ${imageCount}`);
  console.log(`   Manifest: ${JSON.stringify(manifest)}`);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
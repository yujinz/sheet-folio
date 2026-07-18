/**
 * Dexie.js IndexedDB schema for the demo site data store.
 *
 * This is the client-side equivalent of the server-side Drizzle schema
 * (src/db/schema.ts). Tables mirror the server's structure but use Dexie
 * object stores instead of SQLite tables.
 *
 * 🔄 DEMO SYNC: When src/db/schema.ts adds/removes tables or columns,
 *    update the version() block below to match.
 *
 * ⚠️ Dexie is browser-only. This file should only be imported at runtime
 *    in browser context (via demo-store.ts, which is only called by the
 *    fetch interceptor installed by DemoInit.tsx).
 */

import Dexie, { type EntityTable } from "dexie";
import type { CategoryEntry, SongImage, Tag, VideoLink } from "@/lib/types";
import { SEED_DATA } from "@/lib/demo-seed";

// ─── Row types (matches what demo-store.ts stored in JSON) ─────────────────

export interface PieceRow {
  id: number;
  title: string;
  titleAlt: string;
  difficulty: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SongTagJoin {
  songId: number;
  tagId: number;
}

export interface DeviceZoomRow {
  deviceId: string;
  songId: number;
  zoom: number;
  updatedAt: string;
}

// ─── Dexie database class ──────────────────────────────────────────────────

export class DemoDb extends Dexie {
  pieces!: EntityTable<PieceRow, "id">;
  tags!: EntityTable<Tag, "id">;
  songTags!: Dexie.Table<SongTagJoin, [number, number]>; // compound key [songId+tagId]
  images!: EntityTable<SongImage, "id">;
  links!: EntityTable<VideoLink, "id">;
  categories!: Dexie.Table<CategoryEntry, string>;
  singleSelectCategories!: Dexie.Table<{ category: string }, string>;
  deviceZooms!: Dexie.Table<DeviceZoomRow, [string, number]>; // compound key [deviceId+songId]

  constructor() {
    super("sheet-folio-demo");

    this.version(1).stores({
      pieces: "++id, title, createdAt",
      tags: "++id, [category+name]",
      songTags: "[songId+tagId], songId, tagId",
      images: "++id, [songId+kind]",
      links: "++id, songId",
      categories: "&key",
      singleSelectCategories: "&category",
      deviceZooms: "[deviceId+songId]",
    });
  }

  /**
   * On first open, populate tables from demo seed data.
   * Idempotent — checks if pieces table is non-empty before seeding.
   */
  async initializeSeed(): Promise<void> {
    const count = await this.pieces.count();
    if (count > 0) return;

    const seed = SEED_DATA;

    // Tags and pieces use explicit IDs from seed data, so we use add()
    // (not put) and let Dexie respect the IDs. Since tables use ++id,
    // Dexie will use the next auto-increment value — but we want to
    // preserve the seed's IDs. So we use table.bulkAdd() with explicit IDs.
    //
    // Dexie's auto-increment will start after the max seed ID automatically.

    await this.tags.bulkAdd(seed.tags.map((t) => ({ ...t })));

    await this.pieces.bulkAdd(
      seed.pieces.map((p) => ({
        id: p.id,
        title: p.title,
        titleAlt: p.titleAlt,
        difficulty: p.difficulty,
        notes: p.notes,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    );

    // Build song tags from seed piece tagIds
    const songTagRows: SongTagJoin[] = [];
    for (const piece of seed.pieces) {
      for (const tagId of piece.tagIds) {
        songTagRows.push({ songId: piece.id, tagId });
      }
    }
    if (songTagRows.length > 0) {
      await this.songTags.bulkAdd(songTagRows);
    }

    if (seed.categories.length > 0) {
      await this.categories.bulkAdd(seed.categories.map((c) => ({ ...c })));
    }

    if (seed.singleSelectCategories.length > 0) {
      await this.singleSelectCategories.bulkAdd(
        seed.singleSelectCategories.map((c) => ({ category: c })),
      );
    }

    // Seed images by fetching from public URLs and converting to data URLs
    if (seed.images && seed.images.length > 0) {
      const imageRows: SongImage[] = [];
      for (let i = 0; i < seed.images.length; i++) {
        const img = seed.images[i];
        try {
          const response = await fetch(img.url);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          imageRows.push({
            id: i + 1,
            songId: img.songId,
            kind: img.kind,
            url: dataUrl,
            filename: img.filename,
            sortOrder: i + 1,
            sourceUrl: null,
            createdAt: new Date().toISOString(),
          });
        } catch {
          // Skip images that fail to load
          console.warn(`Failed to seed image: ${img.url}`);
        }
      }
      if (imageRows.length > 0) {
        await this.images.bulkAdd(imageRows);
      }
    }
  }
}

/** Singleton database instance. */
export const demoDb = new DemoDb();

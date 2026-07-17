/**
 * Shared interface for data operations.
 *
 * Both `src/lib/data.ts` (main branch, Drizzle/SQLite) and
 * `src/lib/demo-store.ts` (demo branch, Dexie/IndexedDB) structurally
 * comply with this interface. Adding a method here forces both sides
 * to implement it — no more forgetting to sync demo when adding features.
 *
 * 🔄 When you add a new method:
 *  1. Add it to this interface
 *  2. Implement in src/lib/data.ts (main — Drizzle)
 *  3. Implement in src/lib/demo-store.ts (demo — Dexie)
 *  4. Add route handler in src/lib/demo-fetch.ts (demo)
 *  5. Run `pnpm check:demo-routes` (demo) and `pnpm build:demo` (demo)
 *
 * Note: On the main branch, some operations (create/update/delete pieces,
 * tags, categories, etc.) are handled directly in API route handlers
 * rather than in data.ts. The interface documents the full contract.
 * On the demo branch, all operations live in demo-store.ts.
 */

import type { CategoryEntry, ImageKind, Song, SongImage, Tag, VideoLink } from "@/lib/types";

export interface DataLayer {
  // ── Pieces ──────────────────────────────────────────────────────────
  getPieces(): Promise<Song[]>;
  getPiece(id: number): Promise<Song | null>;
  createPiece(body: { title?: string; titleAlt?: string }): Promise<Song>;
  updatePiece(
    id: number,
    body: {
      title?: string;
      titleAlt?: string;
      difficulty?: number;
      notes?: string;
      tagIds?: number[];
    },
  ): Promise<Song | null>;
  deletePiece(id: number): Promise<void>;

  // ── Tags ────────────────────────────────────────────────────────────
  getTags(): Promise<(Tag & { songCount: number })[]>;
  createTag(body: {
    name: string;
    nameAlt?: string;
    color: string;
    category: string;
  }): Promise<Tag | { error: string; status: number }>;
  updateTag(
    id: number,
    body: {
      name?: string;
      nameAlt?: string;
      color?: string;
      category?: string;
    },
  ): Promise<Tag | { error: string; status: number } | null>;
  deleteTag(id: number): Promise<void>;
  renameTagCategory(oldCategory: string, newCategory: string): Promise<Tag[]>;
  deleteTagsInCategory(category: string): Promise<number>;

  // ── Categories ──────────────────────────────────────────────────────
  getCategories(): Promise<CategoryEntry[]>;
  createCategory(body: {
    key: string;
    name?: string;
    nameAlt?: string;
  }): Promise<CategoryEntry | { error: string; status: number }>;
  updateCategory(body: {
    key: string;
    oldKey?: string;
    name?: string;
    nameAlt?: string;
  }): Promise<CategoryEntry>;
  deleteCategory(key: string): Promise<void>;

  // ── Single-Select Categories ────────────────────────────────────────
  getSingleSelectCategories(): Promise<string[]>;
  addSingleSelectCategory(
    category: string,
  ): Promise<{ category: string } | { error: string; status: number }>;
  removeSingleSelectCategory(category: string): Promise<void>;

  // ── Device Zoom ─────────────────────────────────────────────────────
  getDeviceZoom(deviceId: string, songId: number): Promise<number>;
  setDeviceZoom(deviceId: string, songId: number, zoom: number): Promise<void>;

  // ── Images ──────────────────────────────────────────────────────────
  uploadImages(
    songId: number,
    kind: ImageKind,
    entries: { dataUrl: string; filename: string }[],
  ): Promise<Song | null>;
  reorderImages(songId: number, kind: ImageKind, ids: number[]): Promise<Song | null>;
  deleteImages(songId: number, ids: number[]): Promise<Song | null>;
  updateImageSource(songId: number, imageId: number, sourceUrl: string | null): Promise<Song | null>;

  // ── Links ───────────────────────────────────────────────────────────
  saveLinks(
    songId: number,
    links: { label: string; url: string }[],
  ): Promise<Song | null>;

  // ── Health ──────────────────────────────────────────────────────────
  healthCheck(): Promise<{ status: string }>;
}

// Shared export/import types used by both scripts/export-data.ts and the web API.
// These define the data exchange format documented in SCHEMA.md.

export type ImageKind = "staff" | "numbered";

export type ExportedTag = {
  id: number;
  name: string;
  nameAlt: string;
  color: string;
  category: string;
};

export type ExportedImage = {
  id: number;
  filename: string;
  sourceUrl: string | null;
};

export type ExportedLink = {
  id: number;
  label: string;
  url: string;
};

export type ExportedPiece = {
  id: number;
  title: string;
  titleAlt: string;
  difficulty: number;
  notes: string;
  tags: Record<string, ExportedTag[]>;
  images: Record<ImageKind, ExportedImage[]>;
  links: ExportedLink[];
};

export type ExportedTagCategory = {
  key: string;
  name: string;
  nameAlt: string;
  sortOrder: number;
};

export type ExportManifest = {
  exportedAt: string;
  pieceCount: number;
  tagCount: number;
  imageCount: number;
  schemaVersion: number;
};

// ─── Import/export bundle & status types (shared server + demo) ───────────

export type StorageMethod = "sqlite" | "indexeddb";

export type ExportStatus = {
  pieceCount: number;
  tagCount: number;
  imageCount: number;
  lastExportedAt: string | null;
  lastSnapshotAt: string | null;
  hasSnapshot: boolean;
  storageMethod: StorageMethod;
};

/**
 * Image payload in an export bundle.
 * Server: Buffer (raw file bytes). Demo: string (data: URL or static path).
 */
export type ExportImageData = Buffer | string;

/** The structured data exchanged between buildExportData / importData. */
export type ExportDataBundle = {
  manifest: ExportManifest;
  pieces: ExportedPiece[];
  tags: ExportedTag[];
  singleSelectCategories: string[];
  tagCategories: ExportedTagCategory[];
  /** Keyed by `${pieceId}/${kind}/${filename}`. */
  images: Map<string, ExportImageData>;
};

export type ImportResult = {
  imported: { pieces: number; tags: number; images: number };
  skipped: { pieces: number };
};


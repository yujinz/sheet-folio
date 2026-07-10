// Shared export/import types used by both scripts/export-data.ts and the web API.
// These define the data exchange format documented in SCHEMA.md.

export type ImageKind = "staff" | "numbered";

export type ExportedTag = {
  id: number;
  name: string;
  nameEn: string;
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
  titleEn: string;
  difficulty: number;
  notes: string;
  tags: Record<string, ExportedTag[]>;
  images: Record<ImageKind, ExportedImage[]>;
  links: ExportedLink[];
};

export type ExportManifest = {
  exportedAt: string;
  pieceCount: number;
  tagCount: number;
  imageCount: number;
  schemaVersion: number;
};

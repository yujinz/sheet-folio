// Zod validation for the import/export bundle.
// Browser-safe (only imports zod + pure types) — used by both the server API
// routes (src/app/api/import) and the demo fetch interceptor (src/demo/fetch.ts).

import { z } from "zod";
import type { ExportDataBundle } from "@/lib/export-types";

export const exportedTagSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  nameAlt: z.string(),
  color: z.string(),
  category: z.string(),
});

export const exportedImageSchema = z.object({
  id: z.number().int(),
  filename: z.string(),
  sourceUrl: z.string().nullable(),
});

export const exportedLinkSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  url: z.string(),
});

export const exportedPieceSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  titleAlt: z.string(),
  difficulty: z.number(),
  notes: z.string(),
  tags: z.record(z.string(), z.array(exportedTagSchema)),
  images: z.object({
    staff: z.array(exportedImageSchema),
    numbered: z.array(exportedImageSchema),
  }),
  links: z.array(exportedLinkSchema),
});

export const exportedTagCategorySchema = z.object({
  key: z.string(),
  name: z.string(),
  nameAlt: z.string(),
  sortOrder: z.number(),
});

export const exportBundleSchema = z.object({
  manifest: z.object({
    exportedAt: z.string(),
    pieceCount: z.number(),
    tagCount: z.number(),
    imageCount: z.number(),
    schemaVersion: z.number(),
  }),
  pieces: z.array(exportedPieceSchema),
  tags: z.array(exportedTagSchema),
  singleSelectCategories: z.array(z.string()),
  tagCategories: z.array(exportedTagCategorySchema),
});

/**
 * Validates the JSON portion of an export zip and returns a bundle with an
 * empty images map (caller fills it with image data extracted from the zip).
 */
export function parseExportBundle(raw: unknown): ExportDataBundle {
  const parsed = exportBundleSchema.parse(raw);
  return {
    manifest: parsed.manifest,
    pieces: parsed.pieces,
    tags: parsed.tags,
    singleSelectCategories: parsed.singleSelectCategories,
    tagCategories: parsed.tagCategories,
    images: new Map(),
  };
}

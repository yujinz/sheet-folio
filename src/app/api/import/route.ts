import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createSnapshot, importData, parseExportBundle } from "@/lib/export-import";
import { apiError, withErrorHandler } from "@/lib/api";

/**
 * 🔄 DEMO SYNC: mirrored in src/demo/fetch.ts (pattern: /api/import).
 * POST /api/import?mode=merge|replace — accepts a zip backup, imports it.
 * Creates a snapshot first as a safety net (rollback can undo a bad import).
 */
export const POST = withErrorHandler(async (request: Request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "replace" ? "replace" : "merge";

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return apiError("Missing backup file");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return apiError("Invalid zip file");
  }

  const readJson = async (name: string): Promise<unknown> => {
    const entry = zip.file(name);
    if (!entry) return null;
    return JSON.parse(await entry.async("string"));
  };

  const [manifest, pieces, tags, singleSelectCategories, tagCategories] = await Promise.all([
    readJson("manifest.json"),
    readJson("pieces.json"),
    readJson("tags.json"),
    readJson("single-select-categories.json"),
    readJson("tag-categories.json"),
  ]);

  if (!manifest || !Array.isArray(pieces) || !Array.isArray(tags)) {
    return apiError("Backup file is missing required data (manifest.json, pieces.json, tags.json)");
  }

  // Extract images: images/{pieceId}/{kind}/{filename}
  const images = new Map<string, Buffer>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = entry.name.replace(/\\/g, "/");
    if (!name.startsWith("images/")) continue;
    const key = name.slice("images/".length);
    if (!key.includes("/")) continue;
    images.set(key, await entry.async("nodebuffer"));
  }

  const bundle = parseExportBundle({
    manifest,
    pieces,
    tags,
    singleSelectCategories: singleSelectCategories ?? [],
    tagCategories: tagCategories ?? [],
  });
  bundle.images = images;

  // Safety net: snapshot the current state before importing.
  await createSnapshot();

  const result = importData(bundle, mode);
  return NextResponse.json(result);
});

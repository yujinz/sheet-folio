import JSZip from "jszip";
import { buildExportData, createSnapshot, recordExport } from "@/lib/export-import";
import { withErrorHandler } from "@/lib/api";

/**
 * 🔄 DEMO SYNC: mirrored in src/demo/fetch.ts (pattern: /api/export).
 * GET /api/export — streams the full backup as a zip download.
 * Also records a snapshot + last-export timestamp.
 */
export const GET = withErrorHandler(async () => {
  const bundle = await buildExportData();
  const zip = new JSZip();

  zip.file("manifest.json", JSON.stringify(bundle.manifest, null, 2));
  zip.file("pieces.json", JSON.stringify(bundle.pieces, null, 2));
  zip.file("tags.json", JSON.stringify(bundle.tags, null, 2));
  zip.file("single-select-categories.json", JSON.stringify(bundle.singleSelectCategories, null, 2));
  zip.file("tag-categories.json", JSON.stringify(bundle.tagCategories, null, 2));

  for (const [key, data] of bundle.images) {
    if (data instanceof Buffer) {
      zip.file(`images/${key}`, data);
    }
  }

  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // Snapshot + timestamp so the user can roll back to this state.
  await createSnapshot();
  recordExport();

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  // Buffer is a valid BlobPart at runtime; cast bypasses the newer TS
  // ArrayBufferLike/SharedArrayBuffer typing for Node's Buffer.
  return new Response(new Blob([content as unknown as BlobPart]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sheet-folio-backup-${ts}.zip"`,
      "Cache-Control": "no-store",
    },
  });
});

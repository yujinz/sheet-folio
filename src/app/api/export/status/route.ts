import { NextResponse } from "next/server";
import { getExportStatus } from "@/lib/export-import";
import { withErrorHandler } from "@/lib/api";

/**
 * 🔄 DEMO SYNC: mirrored in src/demo/fetch.ts (pattern: /api/export/status).
 * GET /api/export/status — counts, last export time, snapshot availability.
 */
export const GET = withErrorHandler(async () => {
  return NextResponse.json(getExportStatus());
});

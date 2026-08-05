import { NextResponse } from "next/server";
import { restoreSnapshot } from "@/lib/export-import";
import { apiError, withErrorHandler } from "@/lib/api";

/**
 * 🔄 DEMO SYNC: mirrored in src/demo/fetch.ts (pattern: /api/export/rollback).
 * POST /api/export/rollback — restores the live DB from the latest snapshot.
 */
export const POST = withErrorHandler(async () => {
  try {
    restoreSnapshot();
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Restore failed", 400);
  }
  return NextResponse.json({ ok: true });
});

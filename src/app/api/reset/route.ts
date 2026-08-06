import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  deviceZoom,
  singleSelectCategories,
  songImages,
  songs,
  songTags,
  tagCategories,
  tags,
  videoLinks,
} from "@/db/schema";
import { withErrorHandler } from "@/lib/api";

/**
 * DELETE /api/reset — clears all data (children before parents).
 * Mirrors the "replace" clear block in src/lib/export-import.ts importData().
 */
export const DELETE = withErrorHandler(async () => {
  db.delete(songTags).run();
  db.delete(songImages).run();
  db.delete(videoLinks).run();
  db.delete(deviceZoom).run();
  db.delete(songs).run();
  db.delete(tags).run();
  db.delete(singleSelectCategories).run();
  db.delete(tagCategories).run();
  return NextResponse.json({ ok: true });
});

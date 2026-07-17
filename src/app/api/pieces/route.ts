export const dynamic = "force-static";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { getSongs, nowIso } from "@/lib/data";
import { apiError, withErrorHandler } from "@/lib/api";

export const createSongSchema = z.object({
  title: z.string().default(""),
  titleAlt: z.string().default("")
}).refine((data) => data.title.trim() || data.titleAlt.trim(), {
  message: "At least one title (Chinese or English) must be non-empty"
});

export const GET = withErrorHandler(async () => {
  return NextResponse.json(getSongs());
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  const parsed = createSongSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.flatten().fieldErrors);
  const time = nowIso();
  const song = db
    .insert(songs)
    .values({ title: parsed.data.title, titleAlt: parsed.data.titleAlt, difficulty: 1, notes: "", createdAt: time, updatedAt: time })
    .returning()
    .get();
  return NextResponse.json(song);
});

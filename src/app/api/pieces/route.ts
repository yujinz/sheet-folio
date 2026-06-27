import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { getSongs, nowIso } from "@/lib/data";
import { apiError, serverError } from "@/lib/api";

export const createSongSchema = z.object({
  title: z.string().default(""),
  titleEn: z.string().default("")
}).refine((data) => data.title.trim() || data.titleEn.trim(), {
  message: "At least one title (Chinese or English) must be non-empty"
});

export async function GET() {
  try {
    return NextResponse.json(getSongs());
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSongSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.flatten().fieldErrors);
    const time = nowIso();
    const song = db
      .insert(songs)
      .values({ title: parsed.data.title, titleEn: parsed.data.titleEn, difficulty: 1, notes: "", createdAt: time, updatedAt: time })
      .returning()
      .get();
    return NextResponse.json(song);
  } catch (error) {
    return serverError(error);
  }
}

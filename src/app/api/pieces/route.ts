import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { getSongs, nowIso } from "@/lib/data";
import { apiError, serverError } from "@/lib/api";

const createSongSchema = z.object({
  title: z.string().trim().min(1).default("新曲子")
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
      .values({ title: parsed.data.title, difficulty: 1, notes: "", createdAt: time, updatedAt: time })
      .returning()
      .get();
    return NextResponse.json(song);
  } catch (error) {
    return serverError(error);
  }
}

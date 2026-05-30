import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { getSongs, nowIso } from "@/lib/data";

const createSongSchema = z.object({
  title: z.string().trim().min(1).default("新曲子")
});

export async function GET() {
  return NextResponse.json(getSongs());
}

export async function POST(request: Request) {
  const parsed = createSongSchema.parse(await request.json().catch(() => ({})));
  const time = nowIso();
  const song = db
    .insert(songs)
    .values({ title: parsed.title, difficulty: 1, notes: "", createdAt: time, updatedAt: time })
    .returning()
    .get();
  return NextResponse.json(song);
}

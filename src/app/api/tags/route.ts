import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { songTags, tags } from "@/db/schema";
import { apiError, serverError } from "@/lib/api";

const tagSchema = z.object({
  name: z.string().trim().min(1),
  nameEn: z.string().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  category: z.enum(["pitch", "technique", "rhythm"])
});

export async function GET() {
  try {
    const rows = db
      .select({
        id: tags.id,
        name: tags.name,
        nameEn: tags.nameEn,
        color: tags.color,
        category: tags.category,
        songCount: sql<number>`count(${songTags.songId})`.mapWith(Number),
      })
      .from(tags)
      .leftJoin(songTags, sql`${tags.id} = ${songTags.tagId}`)
      .groupBy(tags.id)
      .all();
    return NextResponse.json(rows);
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = tagSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    const row = db
      .insert(tags)
      .values(body.data)
      .onConflictDoNothing()
      .returning()
      .get();
    if (!row) {
      return apiError("A tag with this name already exists in this category", 409);
    }
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}


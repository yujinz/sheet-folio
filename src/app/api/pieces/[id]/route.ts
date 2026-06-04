import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { getSong, nowIso, setSongTags } from "@/lib/data";
import { apiError, serverError } from "@/lib/api";

const updateSongSchema = z.object({
  title: z.string().optional(),
  titleEn: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.number().int()).optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const song = getSong(Number(id));
    if (!song) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json(song);
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const songId = Number(id);
    const body = updateSongSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);

    const update: Partial<typeof songs.$inferInsert> = { updatedAt: nowIso() };
    if (body.data.title !== undefined) update.title = body.data.title;
    if (body.data.titleEn !== undefined) update.titleEn = body.data.titleEn;
    if (body.data.difficulty !== undefined) update.difficulty = body.data.difficulty;
    if (body.data.notes !== undefined) update.notes = body.data.notes;

    if (Object.keys(update).length > 1) {
      db.update(songs).set(update).where(eq(songs.id, songId)).run();
    }
    if (body.data.tagIds) setSongTags(songId, body.data.tagIds);

    const song = getSong(songId);
    if (!song) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json(song);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    db.delete(songs).where(eq(songs.id, Number(id))).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

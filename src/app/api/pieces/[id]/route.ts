import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { getSong, nowIso, setSongTags } from "@/lib/data";

const updateSongSchema = z.object({
  title: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.number().int()).optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = getSong(Number(id));
  if (!song) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(song);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const songId = Number(id);
  const body = updateSongSchema.parse(await request.json());
  const update: Partial<typeof songs.$inferInsert> = { updatedAt: nowIso() };
  if (body.title !== undefined) update.title = body.title;
  if (body.difficulty !== undefined) update.difficulty = body.difficulty;
  if (body.notes !== undefined) update.notes = body.notes;

  if (Object.keys(update).length > 1) {
    db.update(songs).set(update).where(eq(songs.id, songId)).run();
  }
  if (body.tagIds) setSongTags(songId, body.tagIds);

  const song = getSong(songId);
  if (!song) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(song);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.delete(songs).where(eq(songs.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}

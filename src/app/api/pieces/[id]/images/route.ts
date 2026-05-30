import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/db";
import { songImages } from "@/db/schema";
import { getSong, nextImageOrder, nowIso, reorderImages } from "@/lib/data";

const reorderSchema = z.object({
  kind: z.enum(["staff", "numbered"]),
  ids: z.array(z.number().int())
});

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const songId = Number(id);
  const form = await request.formData();
  const kind = z.enum(["staff", "numbered"]).parse(form.get("kind"));
  const files = form.getAll("files").filter((file): file is File => file instanceof File);
  const dir = path.join(uploadRoot(), String(songId), kind);
  await fs.mkdir(dir, { recursive: true });

  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName(file.name)}`;
    await fs.writeFile(path.join(dir, filename), bytes);
    db.insert(songImages)
      .values({
        songId,
        kind,
        filename,
        url: `/api/uploads/${songId}/${kind}/${filename}`,
        sortOrder: nextImageOrder(songId, kind),
        createdAt: nowIso()
      })
      .run();
  }

  return NextResponse.json(getSong(songId));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const songId = Number(id);
  const body = reorderSchema.parse(await request.json());
  reorderImages(songId, body.kind, body.ids);
  return NextResponse.json(getSong(songId));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const songId = Number(id);
  const body = z.object({ ids: z.array(z.number().int()) }).parse(await request.json());
  const rows = body.ids.length
    ? db.select().from(songImages).where(and(eq(songImages.songId, songId), inArray(songImages.id, body.ids))).all()
    : [];
  for (const row of rows) {
    const relative = row.url.replace(/^\/api\/uploads\//, "");
    await fs.unlink(path.join(uploadRoot(), relative)).catch(() => undefined);
  }
  if (body.ids.length) db.delete(songImages).where(and(eq(songImages.songId, songId), inArray(songImages.id, body.ids))).run();
  return NextResponse.json(getSong(songId));
}

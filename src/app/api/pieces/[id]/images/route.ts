import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/db";
import { songImages } from "@/db/schema";
import { getSong, nextImageOrder, nowIso, reorderImages } from "@/lib/data";
import { uploadRoot, safeName } from "@/lib/upload";
import { apiError, withErrorHandler } from "@/lib/api";

const reorderSchema = z.object({
  kind: z.enum(["staff", "numbered"]),
  ids: z.array(z.number().int())
});

export const POST = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const songId = Number(id);
  const form = await request.formData();
  const kindResult = z.enum(["staff", "numbered"]).safeParse(form.get("kind"));
  if (!kindResult.success) return apiError("kind must be 'staff' or 'numbered'");
  const kind = kindResult.data;
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
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const songId = Number(id);
  const body = reorderSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  reorderImages(songId, body.data.kind, body.data.ids);
  return NextResponse.json(getSong(songId));
});

export const DELETE = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const songId = Number(id);
  const body = z.object({ ids: z.array(z.number().int()) }).safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const rows = body.data.ids.length
    ? db.select().from(songImages).where(and(eq(songImages.songId, songId), inArray(songImages.id, body.data.ids))).all()
    : [];
  for (const row of rows) {
    const relative = row.url.replace(/^\/api\/uploads\//, "");
    await fs.unlink(path.join(uploadRoot(), relative)).catch(() => undefined);
  }
  if (body.data.ids.length) db.delete(songImages).where(and(eq(songImages.songId, songId), inArray(songImages.id, body.data.ids))).run();
  return NextResponse.json(getSong(songId));
});

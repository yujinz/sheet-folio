import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { songImages } from "@/db/schema";
import { getSong } from "@/lib/data";
import { apiError, withErrorHandler } from "@/lib/api";

const updateImageSchema = z.object({
  sourceUrl: z.string().nullable()
});

export const dynamic = "force-static";

export function generateStaticParams() {
  // Pre-generate a minimal set so the route builds in static export.
  // The client-side fetch override handles the actual image serving.
  const params: { id: string; imageId: string }[] = [];
  for (let id = 1; id <= 3; id++) {
    for (let imageId = 1; imageId <= 3; imageId++) {
      params.push({ id: String(id), imageId: String(imageId) });
    }
  }
  return params;
}

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) => {
  const { id, imageId } = await params;
  const songId = Number(id);
  const imageIdNum = Number(imageId);
  const body = updateImageSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);

  db.update(songImages)
    .set({ sourceUrl: body.data.sourceUrl })
    .where(eq(songImages.id, imageIdNum))
    .run();

  return NextResponse.json(getSong(songId));
});

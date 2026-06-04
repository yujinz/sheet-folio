import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { songImages } from "@/db/schema";
import { getSong } from "@/lib/data";
import { apiError, serverError } from "@/lib/api";

const updateImageSchema = z.object({
  sourceUrl: z.string().nullable()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  try {
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
  } catch (error) {
    return serverError(error);
  }
}

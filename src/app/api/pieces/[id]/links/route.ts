import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { videoLinks } from "@/db/schema";
import { getSong } from "@/lib/data";
import { apiError, serverError } from "@/lib/api";

const linksSchema = z.object({
  links: z.array(
    z.object({
      id: z.number().int().optional(),
      label: z.string().trim().min(1),
      url: z.string().trim().url()
    })
  )
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const songId = Number(id);
    const body = linksSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    db.delete(videoLinks).where(eq(videoLinks.songId, songId)).run();
    body.data.links.forEach((link, index) => {
      db.insert(videoLinks).values({ songId, label: link.label, url: link.url, sortOrder: index }).run();
    });
    return NextResponse.json(getSong(songId));
  } catch (error) {
    return serverError(error);
  }
}

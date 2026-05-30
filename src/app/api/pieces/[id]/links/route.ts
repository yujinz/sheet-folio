import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { youtubeLinks } from "@/db/schema";
import { getSong } from "@/lib/data";

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
  const { id } = await params;
  const songId = Number(id);
  const body = linksSchema.parse(await request.json());
  db.delete(youtubeLinks).where(eq(youtubeLinks.songId, songId)).run();
  body.links.forEach((link, index) => {
    db.insert(youtubeLinks).values({ songId, label: link.label, url: link.url, sortOrder: index }).run();
  });
  return NextResponse.json(getSong(songId));
}

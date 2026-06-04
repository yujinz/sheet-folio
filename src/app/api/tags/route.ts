import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { apiError, serverError } from "@/lib/api";

const tagSchema = z.object({
  name: z.string().trim().min(1),
  nameEn: z.string().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  category: z.enum(["pitch", "technique", "rhythm"])
});

export async function GET() {
  try {
    return NextResponse.json(db.select().from(tags).all());
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
      .onConflictDoUpdate({
        target: [tags.category, tags.name],
        set: { color: body.data.color, nameEn: body.data.nameEn }
      })
      .returning()
      .get();
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}


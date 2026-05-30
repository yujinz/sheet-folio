import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tags } from "@/db/schema";
import type { TagCategory } from "@/lib/types";

const tagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  category: z.enum(["pitch", "technique", "rhythm"])
});

export async function GET() {
  return NextResponse.json(db.select().from(tags).all());
}

export async function POST(request: Request) {
  const body = tagSchema.parse(await request.json());
  const row = db
    .insert(tags)
    .values(body)
    .onConflictDoUpdate({
      target: [tags.category, tags.name],
      set: { color: body.color }
    })
    .returning()
    .get();
  return NextResponse.json(row);
}

export function tagLabel(category: TagCategory) {
  return category;
}

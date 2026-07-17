import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { apiError, withErrorHandler } from "@/lib/api";
import { findDuplicateTag } from "@/lib/tag-utils";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ id: "1" }];
}

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  nameAlt: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: z.string().min(1).optional(),
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = updateSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const tagId = Number(id);
  const existing = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!existing) return apiError("Tag not found", 404);
  const { name: newName, nameAlt: newNameAlt, category: newCategory } = body.data;
  // If name or nameAlt is changing, check for duplicates against both fields
  if (newName !== undefined || newNameAlt !== undefined || newCategory !== undefined) {
    const checkCategory = newCategory ?? existing.category;
    const checkName = newName ?? existing.name;
    const checkNameAlt = newNameAlt !== undefined ? newNameAlt : existing.nameAlt;
    if (findDuplicateTag(checkCategory, checkName, checkNameAlt, tagId)) {
      return apiError("A tag with this name already exists in this category", 409);
    }
  }
  const row = db.update(tags).set(body.data).where(eq(tags.id, tagId)).returning().get();
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  db.delete(tags).where(eq(tags.id, Number(id))).run();
  return NextResponse.json({ ok: true });
});

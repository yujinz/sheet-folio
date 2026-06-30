import { NextResponse } from "next/server";
import { and, eq, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { apiError, serverError } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  nameEn: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: z.string().min(1).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = updateSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    const tagId = Number(id);
    const existing = db.select().from(tags).where(eq(tags.id, tagId)).get();
    if (!existing) return apiError("Tag not found", 404);
    const { name: newName, nameEn: newNameEn, category: newCategory } = body.data;
    // If name or nameEn is changing, check for duplicates against both fields
    if (newName !== undefined || newNameEn !== undefined || newCategory !== undefined) {
      const checkCategory = newCategory ?? existing.category;
      const checkName = newName ?? existing.name;
      const checkNameEn = newNameEn !== undefined ? newNameEn : existing.nameEn;
      const nameConditions = [eq(tags.name, checkName)];
      if (checkNameEn) {
        nameConditions.push(eq(tags.name, checkNameEn));
        nameConditions.push(eq(tags.nameEn, checkName));
        nameConditions.push(eq(tags.nameEn, checkNameEn));
      }
      const dup = db.select().from(tags).where(
        and(eq(tags.category, checkCategory), ne(tags.id, tagId), or(...nameConditions))
      ).get();
      if (dup) {
        return apiError("A tag with this name already exists in this category", 409);
      }
    }
    const row = db.update(tags).set(body.data).where(eq(tags.id, tagId)).returning().get();
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    db.delete(tags).where(eq(tags.id, Number(id))).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

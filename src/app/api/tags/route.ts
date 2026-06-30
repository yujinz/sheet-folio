import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { apiError, serverError } from "@/lib/api";
import { and, eq, ne, or } from "drizzle-orm";

export const tagSchema = z.object({
  name: z.string().trim().min(1),
  nameEn: z.string().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  category: z.string().min(1)
});

/** Check whether another tag in the same category already has a matching name or nameEn. */
function findDuplicateTag(category: string, name: string, nameEn: string, excludeId?: number) {
  const nameConditions = [eq(tags.name, name)];
  if (nameEn) {
    nameConditions.push(eq(tags.name, nameEn));     // Chinese name matches English input
    nameConditions.push(eq(tags.nameEn, name));      // English name matches Chinese input
    nameConditions.push(eq(tags.nameEn, nameEn));    // English name matches English input
  }
  const conditions: any[] = [eq(tags.category, category), or(...nameConditions)];
  if (excludeId !== undefined) {
    conditions.push(ne(tags.id, excludeId));
  }
  return db.select().from(tags).where(and(...conditions)).get();
}

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
    const { name, nameEn, color, category } = body.data;
    if (findDuplicateTag(category, name, nameEn)) {
      return apiError("A tag with this name already exists in this category", 409);
    }
    const row = db.insert(tags).values({ name, nameEn, color, category }).returning().get();
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}

export const renameCategorySchema = z.object({
  oldCategory: z.string().min(1),
  newCategory: z.string().min(1)
});

export async function PATCH(request: Request) {
  try {
    const body = renameCategorySchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    const { oldCategory, newCategory } = body.data;
    if (oldCategory === newCategory) return apiError("New category must differ from old category", 400);
    const updated = db.update(tags).set({ category: newCategory }).where(eq(tags.category, oldCategory)).returning().all();
    return NextResponse.json({ updated: updated.length, tags: updated });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    if (!category) {
      return apiError("category query parameter is required", 400);
    }
    const deleted = db.delete(tags).where(eq(tags.category, category)).returning().all();
    return NextResponse.json({ deleted: deleted.length });
  } catch (error) {
    return serverError(error);
  }
}


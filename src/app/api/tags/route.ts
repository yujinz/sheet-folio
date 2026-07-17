export const dynamic = "force-static";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { songTags, tags } from "@/db/schema";
import { apiError, withErrorHandler } from "@/lib/api";
import { findDuplicateTag } from "@/lib/tag-utils";

export const tagSchema = z.object({
  name: z.string().trim().min(1),
  nameAlt: z.string().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  category: z.string().min(1)
});

export const renameCategorySchema = z.object({
  oldCategory: z.string().min(1),
  newCategory: z.string().min(1)
});

export const GET = withErrorHandler(async () => {
  const rows = db
    .select({
      id: tags.id,
      name: tags.name,
      nameAlt: tags.nameAlt,
      color: tags.color,
      category: tags.category,
      songCount: sql<number>`count(${songTags.songId})`.mapWith(Number),
    })
    .from(tags)
    .leftJoin(songTags, sql`${tags.id} = ${songTags.tagId}`)
    .groupBy(tags.id)
    .all();
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = tagSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const { name, nameAlt, color, category } = body.data;
  if (findDuplicateTag(category, name, nameAlt)) {
    return apiError("A tag with this name already exists in this category", 409);
  }
  const row = db.insert(tags).values({ name, nameAlt, color, category }).returning().get();
  return NextResponse.json(row);
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const body = renameCategorySchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const { oldCategory, newCategory } = body.data;
  if (oldCategory === newCategory) return apiError("New category must differ from old category", 400);
  const updated = db.update(tags).set({ category: newCategory }).where(eq(tags.category, oldCategory)).returning().all();
  return NextResponse.json({ updated: updated.length, tags: updated });
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  if (!category) {
    return apiError("category query parameter is required", 400);
  }
  const deleted = db.delete(tags).where(eq(tags.category, category)).returning().all();
  return NextResponse.json({ deleted: deleted.length });
});


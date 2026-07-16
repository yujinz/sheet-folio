export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { tagCategories } from "@/db/schema";
import { apiError, withErrorHandler } from "@/lib/api";
import { seedDefaultCategories } from "@/lib/seed";

export const GET = withErrorHandler(async () => {
  seedDefaultCategories();
  const rows = db.select().from(tagCategories).orderBy(asc(tagCategories.sortOrder), asc(tagCategories.key)).all();
  return NextResponse.json(rows);
});

const createSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().default(""),
  nameAlt: z.string().default("")
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = createSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const { key, name, nameAlt } = body.data;
  const existing = db.select().from(tagCategories).where(eq(tagCategories.key, key)).get();
  if (existing) return apiError(`Category "${key}" already exists`, 409);
  const maxSort = db.select({ m: tagCategories.sortOrder }).from(tagCategories).orderBy(asc(tagCategories.sortOrder)).all();
  const sortOrder = maxSort.length > 0 ? maxSort[maxSort.length - 1].m + 1 : 3;
  db.insert(tagCategories).values({ key, name, nameAlt, sortOrder }).run();
  return NextResponse.json({ key, name, nameAlt, sortOrder });
});

const patchSchema = z.object({
  key: z.string().trim().min(1),
  oldKey: z.string().trim().optional(),
  name: z.string().default(""),
  nameAlt: z.string().default("")
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const body = patchSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const { key, oldKey, name, nameAlt } = body.data;
  const targetKey = oldKey ?? key;
  const existing = db.select().from(tagCategories).where(eq(tagCategories.key, targetKey)).get();
  if (!existing) {
    const maxSort = db.select({ m: tagCategories.sortOrder }).from(tagCategories).orderBy(asc(tagCategories.sortOrder)).all();
    const sortOrder = maxSort.length > 0 ? maxSort[maxSort.length - 1].m + 1 : 3;
    db.insert(tagCategories).values({ key, name, nameAlt, sortOrder }).run();
  } else if (key !== targetKey) {
    // Key rename — preserve sortOrder
    db.update(tagCategories)
      .set({ key, name, nameAlt })
      .where(eq(tagCategories.key, targetKey))
      .run();
  } else {
    db.update(tagCategories).set({ name, nameAlt }).where(eq(tagCategories.key, key)).run();
  }
  return NextResponse.json({ key, name, nameAlt });
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return apiError("key query parameter is required", 400);
  db.delete(tagCategories).where(eq(tagCategories.key, key)).run();
  return NextResponse.json({ ok: true });
});

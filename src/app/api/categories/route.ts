export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { categoryLabels } from "@/db/schema";
import { apiError, serverError } from "@/lib/api";
import { seedDefaultCategories } from "@/lib/seed";

export async function GET() {
  try {
    seedDefaultCategories();
    const rows = db.select().from(categoryLabels).orderBy(asc(categoryLabels.sortOrder), asc(categoryLabels.key)).all();
    return NextResponse.json(rows);
  } catch (error) {
    return serverError(error);
  }
}

const createSchema = z.object({
  key: z.string().trim().min(1),
  nameZh: z.string().default(""),
  nameEn: z.string().default("")
});

export async function POST(request: Request) {
  try {
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    const { key, nameZh, nameEn } = body.data;
    const existing = db.select().from(categoryLabels).where(eq(categoryLabels.key, key)).get();
    if (existing) return apiError(`Category "${key}" already exists`, 409);
    const maxSort = db.select({ m: categoryLabels.sortOrder }).from(categoryLabels).orderBy(asc(categoryLabels.sortOrder)).all();
    const sortOrder = maxSort.length > 0 ? maxSort[maxSort.length - 1].m + 1 : 3;
    db.insert(categoryLabels).values({ key, nameZh, nameEn, sortOrder }).run();
    return NextResponse.json({ key, nameZh, nameEn, sortOrder });
  } catch (error) {
    return serverError(error);
  }
}

const patchSchema = z.object({
  key: z.string().trim().min(1),
  oldKey: z.string().trim().optional(),
  nameZh: z.string().default(""),
  nameEn: z.string().default("")
});

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    const { key, oldKey, nameZh, nameEn } = body.data;
    const targetKey = oldKey ?? key;
    const existing = db.select().from(categoryLabels).where(eq(categoryLabels.key, targetKey)).get();
    if (!existing) {
      db.insert(categoryLabels).values({ key, nameZh, nameEn }).run();
    } else if (key !== targetKey) {
      // Key rename — preserve sortOrder
      db.update(categoryLabels)
        .set({ key, nameZh, nameEn })
        .where(eq(categoryLabels.key, targetKey))
        .run();
    } else {
      db.update(categoryLabels).set({ nameZh, nameEn }).where(eq(categoryLabels.key, key)).run();
    }
    return NextResponse.json({ key, nameZh, nameEn });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) return apiError("key query parameter is required", 400);
    db.delete(categoryLabels).where(eq(categoryLabels.key, key)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

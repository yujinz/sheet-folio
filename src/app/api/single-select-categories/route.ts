import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { singleSelectCategories } from "@/db/schema";
import { apiError, withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async () => {
  const rows = db.select().from(singleSelectCategories).all();
  return NextResponse.json(rows.map((r) => r.category));
});

const createSchema = z.object({
  category: z.string().trim().min(1)
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = createSchema.safeParse(await request.json());
  if (!body.success) return apiError(body.error.flatten().fieldErrors);
  const { category } = body.data;
  const existing = db.select().from(singleSelectCategories).where(eq(singleSelectCategories.category, category)).get();
  if (existing) return apiError(`Category "${category}" is already single-select`, 409);
  db.insert(singleSelectCategories).values({ category }).run();
  return NextResponse.json({ category });
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  if (!category) return apiError("category query parameter is required", 400);
  db.delete(singleSelectCategories).where(eq(singleSelectCategories.category, category)).run();
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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
    const row = db.update(tags).set(body.data).where(eq(tags.id, Number(id))).returning().get();
    if (!row) return apiError("Tag not found", 404);
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

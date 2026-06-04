import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { serverError } from "@/lib/api";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    db.delete(tags).where(eq(tags.id, Number(id))).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

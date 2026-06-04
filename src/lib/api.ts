import { NextResponse } from "next/server";

export function apiError(error: unknown, status = 400) {
  if (typeof error === "string") {
    return NextResponse.json({ error }, { status });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status });
  }
  if (error && typeof error === "object") {
    // Could be a Zod field errors object — pass it through
    return NextResponse.json(error, { status });
  }
  return NextResponse.json({ error: "Unknown error" }, { status });
}

export function serverError(error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
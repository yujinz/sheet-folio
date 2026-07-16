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

type RouteParams = Record<string, string>;
type RouteHandler = (...args: any[]) => Response | Promise<Response>;

/**
 * Wraps an API route handler in try/catch, returning `serverError(error)` on failure.
 * Eliminates the try/catch + serverError boilerplate from every route handler.
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (...args: any[]): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return serverError(error);
    }
  };
}
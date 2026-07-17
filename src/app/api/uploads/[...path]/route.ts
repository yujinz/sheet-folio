import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { uploadRoot } from "@/lib/upload";

// force-static + generateStaticParams needed for static export (demo mode).
// In the real (non-demo) build these are ignored — the route runs dynamically.

export const dynamic = "force-static";

export function generateStaticParams() {
  const ids = [1, 2, 3];
  const kinds = ["staff", "numbered"];
  const files = ["placeholder.webp"];
  const params: { path: string[] }[] = [];
  for (const id of ids) {
    for (const kind of kinds) {
      for (const file of files) {
        params.push({ path: [String(id), kind, file] });
      }
    }
  }
  return params;
}

export const dynamicParams = false;

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const root = path.normalize(uploadRoot());
  const target = path.normalize(path.join(root, ...parts));

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  const file = await fs.readFile(target).catch(() => null);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const ext = path.extname(target).toLowerCase();
  const type =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" :
    "image/jpeg";

  return new NextResponse(file, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=31536000, immutable"
    }
  });
}

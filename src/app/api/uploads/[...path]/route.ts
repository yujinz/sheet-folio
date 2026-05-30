import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const root = path.normalize(uploadRoot());
  const target = path.normalize(path.join(root, ...parts));

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  const file = await fs.readFile(target).catch(() => null);
  if (!file) return NextResponse.json({ message: "Not found" }, { status: 404 });

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

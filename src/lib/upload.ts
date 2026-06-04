import path from "node:path";

export function uploadRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
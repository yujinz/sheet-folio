import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadRoot, safeName } from "@/lib/upload";

describe("safeName", () => {
  it("replaces unsafe characters with underscores", () => {
    expect(safeName("hello world.jpg")).toBe("hello_world.jpg");
    expect(safeName("a/b\\c:d")).toBe("a_b_c_d");
    expect(safeName("file name!@#.png")).toBe("file_name___.png");
  });

  it("keeps safe characters unchanged", () => {
    expect(safeName("abc123._-")).toBe("abc123._-");
  });

  it("handles empty string", () => {
    expect(safeName("")).toBe("");
  });
});

describe("uploadRoot", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to data/uploads relative to cwd", () => {
    const root = uploadRoot();
    expect(root).toContain("data/uploads");
    expect(root).toContain(process.cwd());
  });

  it("uses UPLOAD_DIR env var when set", () => {
    process.env.UPLOAD_DIR = "/custom/path";
    expect(uploadRoot()).toBe("/custom/path");
  });
});
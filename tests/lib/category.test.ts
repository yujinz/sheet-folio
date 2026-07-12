import { describe, it, expect } from "vitest";
import { categoryKey, canAddCategory, canRenameCategory, isCoreCategoryLabel } from "@/lib/category";

describe("categoryKey", () => {
  it("generates key from English name", () => {
    expect(categoryKey("", "Dynamics")).toBe("dynamics");
  });

  it("generates key from Chinese name when English is empty", () => {
    expect(categoryKey("力度", "")).toBe("力度");
  });

  it("lowercases the result", () => {
    expect(categoryKey("", "Articulation")).toBe("articulation");
  });

  it("replaces spaces with hyphens", () => {
    expect(categoryKey("", "Music Theory")).toBe("music-theory");
    expect(categoryKey("", "left  hand")).toBe("left-hand");
  });

  it("prefers English over Chinese when both are provided", () => {
    expect(categoryKey("风格", "Style")).toBe("style");
  });

  it("handles trimmable whitespace", () => {
    expect(categoryKey("  artic ", "  articulation ")).toBe("articulation");
  });

  it("returns empty string when both inputs are empty or whitespace", () => {
    expect(categoryKey("", "")).toBe("");
    expect(categoryKey("  ", "  ")).toBe("");
  });
});

describe("canAddCategory", () => {
  it("allows adding a non-conflicting category", () => {
    expect(canAddCategory("dynamics", ["style", "genre"])).toEqual({ valid: true });
  });

  it("rejects empty key", () => {
    const result = canAddCategory("", ["style"]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Key is empty");
  });

  it("rejects core category name (pitch)", () => {
    const result = canAddCategory("pitch", []);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Conflicts with a built-in category");
  });

  it("rejects core category name (technique)", () => {
    const result = canAddCategory("technique", []);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Conflicts with a built-in category");
  });

  it("rejects core category name (rhythm)", () => {
    const result = canAddCategory("rhythm", []);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Conflicts with a built-in category");
  });

  it("rejects duplicate key", () => {
    const result = canAddCategory("dynamics", ["dynamics", "style"]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("A category with this key already exists");
  });
});

describe("canRenameCategory", () => {
  it("allows renaming to a non-conflicting key", () => {
    expect(canRenameCategory("old", "new", [])).toEqual({ valid: true });
  });

  it("returns isNoop when new key equals old key", () => {
    const result = canRenameCategory("dynamics", "dynamics", ["other"]);
    expect(result.valid).toBe(true);
    expect(result.isNoop).toBe(true);
  });

  it("rejects renaming to a core category", () => {
    const result = canRenameCategory("dynamics", "pitch", []);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Conflicts with a built-in category");
  });

  it("rejects renaming to an existing key", () => {
    const result = canRenameCategory("dynamics", "style", ["style", "genre"]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("A category with this name already exists");
  });

  it("rejects empty new key", () => {
    const result = canRenameCategory("dynamics", "", []);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("New key is empty");
  });
});

describe("isCoreCategoryLabel", () => {
  it("matches pitch zh-CN label (音高)", () => {
    expect(isCoreCategoryLabel("音高")).toBe(true);
  });

  it("matches pitch en-US label (Pitch)", () => {
    expect(isCoreCategoryLabel("Pitch")).toBe(true);
  });

  it("matches pitch en-US label lowercased (pitch)", () => {
    expect(isCoreCategoryLabel("pitch")).toBe(true);
  });

  it("matches technique zh-CN label (技巧)", () => {
    expect(isCoreCategoryLabel("技巧")).toBe(true);
  });

  it("matches technique en-US label (Technique)", () => {
    expect(isCoreCategoryLabel("Technique")).toBe(true);
  });

  it("matches rhythm zh-CN label (节拍)", () => {
    expect(isCoreCategoryLabel("节拍")).toBe(true);
  });

  it("matches rhythm en-US label (Rhythm)", () => {
    expect(isCoreCategoryLabel("Rhythm")).toBe(true);
  });

  it("returns false for non-core labels", () => {
    expect(isCoreCategoryLabel("Dynamics")).toBe(false);
    expect(isCoreCategoryLabel("风格")).toBe(false);
    expect(isCoreCategoryLabel("Articulation")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCoreCategoryLabel("")).toBe(false);
  });

  it("is case-insensitive (technique)", () => {
    expect(isCoreCategoryLabel("technique")).toBe(true);
    expect(isCoreCategoryLabel("TECHNIQUE")).toBe(true);
    expect(isCoreCategoryLabel("tEcHnIqUe")).toBe(true);
  });
});

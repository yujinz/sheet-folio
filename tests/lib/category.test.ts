import { describe, it, expect } from "vitest";
import { categoryKey, canAddCategory, canRenameCategory } from "@/lib/category";

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

  it("rejects duplicate key", () => {
    const result = canAddCategory("dynamics", ["dynamics", "style"]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("A category with this name already exists");
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

import { describe, it, expect } from "vitest";
import { createSongSchema } from "@/app/api/pieces/route";
import { updateSongSchema } from "@/app/api/pieces/[id]/route";
import { tagSchema, renameCategorySchema } from "@/app/api/tags/route";

describe("createSongSchema", () => {
  it("rejects when both titles are empty (default)", () => {
    const result = createSongSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("At least one title (Chinese or English) must be non-empty");
    }
  });

  it("rejects when both titles are empty strings", () => {
    const result = createSongSchema.safeParse({ title: "", titleAlt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when both titles are whitespace", () => {
    const result = createSongSchema.safeParse({ title: "   ", titleAlt: "  " });
    expect(result.success).toBe(false);
  });

  it("accepts when title is non-empty", () => {
    const result = createSongSchema.safeParse({ title: "欢乐颂", titleAlt: "" });
    expect(result.success).toBe(true);
  });

  it("accepts when titleAlt is non-empty", () => {
    const result = createSongSchema.safeParse({ title: "", titleAlt: "Ode to Joy" });
    expect(result.success).toBe(true);
  });

  it("accepts when both are non-empty", () => {
    const result = createSongSchema.safeParse({ title: "欢乐颂", titleAlt: "Ode to Joy" });
    expect(result.success).toBe(true);
  });
});

describe("updateSongSchema", () => {
  it("rejects when both title and titleAlt are set to empty", () => {
    const result = updateSongSchema.safeParse({ title: "", titleAlt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("At least one title (Chinese or English) must be non-empty");
    }
  });

  it("rejects when both are set to whitespace", () => {
    const result = updateSongSchema.safeParse({ title: "   ", titleAlt: "  " });
    expect(result.success).toBe(false);
  });

  it("accepts when only title is provided (empty) but titleAlt is omitted", () => {
    const result = updateSongSchema.safeParse({ title: "" });
    expect(result.success).toBe(true);
  });

  it("accepts when only titleAlt is provided (empty) but title is omitted", () => {
    const result = updateSongSchema.safeParse({ titleAlt: "" });
    expect(result.success).toBe(true);
  });

  it("accepts when neither title nor titleAlt is provided", () => {
    const result = updateSongSchema.safeParse({ notes: "just notes" });
    expect(result.success).toBe(true);
  });

  it("accepts when title is non-empty and titleAlt is empty", () => {
    const result = updateSongSchema.safeParse({ title: "欢乐颂", titleAlt: "" });
    expect(result.success).toBe(true);
  });

  it("accepts when titleAlt is non-empty and title is empty", () => {
    const result = updateSongSchema.safeParse({ title: "", titleAlt: "Ode to Joy" });
    expect(result.success).toBe(true);
  });

  it("accepts when both are non-empty", () => {
    const result = updateSongSchema.safeParse({ title: "欢乐颂", titleAlt: "Ode to Joy" });
    expect(result.success).toBe(true);
  });

  it("still validates other fields like difficulty", () => {
    const result = updateSongSchema.safeParse({ difficulty: 6 });
    expect(result.success).toBe(false);
  });
});

describe("tagSchema", () => {
  it("accepts a valid tag", () => {
    const result = tagSchema.safeParse({
      name: "高音",
      nameAlt: "High pitch",
      color: "#2563eb",
      category: "pitch",
    });
    expect(result.success).toBe(true);
  });

  it("defaults nameAlt to empty string", () => {
    const result = tagSchema.safeParse({
      name: "高音",
      color: "#2563eb",
      category: "pitch",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nameAlt).toBe("");
    }
  });

  it("rejects empty name", () => {
    const result = tagSchema.safeParse({
      name: "  ",
      nameAlt: "",
      color: "#2563eb",
      category: "pitch",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid color format", () => {
    const result = tagSchema.safeParse({
      name: "高音",
      color: "blue",
      category: "pitch",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty category", () => {
    const result = tagSchema.safeParse({
      name: "高音",
      color: "#2563eb",
      category: "",
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from name", () => {
    const result = tagSchema.safeParse({
      name: "  高音  ",
      color: "#2563eb",
      category: "pitch",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("高音");
    }
  });
});

describe("renameCategorySchema", () => {
  it("accepts valid rename", () => {
    const result = renameCategorySchema.safeParse({
      oldCategory: "dynamics",
      newCategory: "articulation",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty oldCategory", () => {
    const result = renameCategorySchema.safeParse({
      oldCategory: "",
      newCategory: "articulation",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty newCategory", () => {
    const result = renameCategorySchema.safeParse({
      oldCategory: "dynamics",
      newCategory: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when both are empty", () => {
    const result = renameCategorySchema.safeParse({
      oldCategory: "",
      newCategory: "",
    });
    expect(result.success).toBe(false);
  });
});

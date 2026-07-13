import { describe, it, expect } from "vitest";
import { groupTags, nowIso } from "@/lib/data";
import type { Tag } from "@/lib/types";

const categories = ["pitch", "technique", "rhythm"];

describe("nowIso", () => {
  it("returns a valid ISO string", () => {
    const str = nowIso();
    expect(() => new Date(str)).not.toThrow();
    expect(new Date(str).toISOString()).toBe(str);
  });
});

describe("groupTags", () => {
  it("groups tags by category with all categories present", () => {
    const tags: Tag[] = [
      { id: 1, name: "高音", nameAlt: "", color: "#2563eb", category: "pitch" },
      { id: 2, name: "连音", nameAlt: "", color: "#ea580c", category: "technique" },
      { id: 3, name: "附点", nameAlt: "", color: "#c026d3", category: "rhythm" },
    ];
    const grouped = groupTags(tags);
    for (const cat of categories) {
      expect(grouped).toHaveProperty(cat);
      expect(Array.isArray(grouped[cat])).toBe(true);
    }
    expect(grouped.pitch).toHaveLength(1);
    expect(grouped.technique).toHaveLength(1);
    expect(grouped.rhythm).toHaveLength(1);
  });

  it("returns empty arrays for categories with no tags", () => {
    const tags: Tag[] = [
      { id: 1, name: "高音", nameAlt: "", color: "#2563eb", category: "pitch" },
    ];
    const grouped = groupTags(tags);
    expect(grouped.pitch).toHaveLength(1);
    expect(grouped.technique).toHaveLength(0);
    expect(grouped.rhythm).toHaveLength(0);
  });

  it("handles empty input (core categories still present)", () => {
    const grouped = groupTags([]);
    expect(grouped).toHaveProperty("pitch");
    expect(grouped).toHaveProperty("technique");
    expect(grouped).toHaveProperty("rhythm");
    expect(grouped.pitch).toEqual([]);
    expect(grouped.technique).toEqual([]);
    expect(grouped.rhythm).toEqual([]);
  });

  it("groups custom categories dynamically", () => {
    const tags: Tag[] = [
      { id: 1, name: "Baroque", nameAlt: "", color: "#9e6aba", category: "genre" },
      { id: 2, name: "Classical", nameAlt: "", color: "#c46a9e", category: "genre" },
      { id: 3, name: "高音", nameAlt: "", color: "#2563eb", category: "pitch" },
    ];
    const grouped = groupTags(tags);
    expect(grouped).toHaveProperty("genre");
    expect(grouped).toHaveProperty("pitch");
    expect(grouped.genre).toHaveLength(2);
    expect(grouped.pitch).toHaveLength(1);
    expect(grouped.technique).toEqual([]);
  });
});
import { describe, it, expect } from "vitest";
import { groupTags, nowIso } from "@/lib/data";
import type { Tag, TagCategory } from "@/lib/types";

const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

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
      { id: 1, name: "高音", nameEn: "", color: "#2563eb", category: "pitch" },
      { id: 2, name: "连音", nameEn: "", color: "#ea580c", category: "technique" },
      { id: 3, name: "附点", nameEn: "", color: "#c026d3", category: "rhythm" },
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
      { id: 1, name: "高音", nameEn: "", color: "#2563eb", category: "pitch" },
    ];
    const grouped = groupTags(tags);
    expect(grouped.pitch).toHaveLength(1);
    expect(grouped.technique).toHaveLength(0);
    expect(grouped.rhythm).toHaveLength(0);
  });

  it("handles empty input", () => {
    const grouped = groupTags([]);
    for (const cat of categories) {
      expect(grouped[cat]).toEqual([]);
    }
  });
});
import { describe, it, expect } from "vitest";
import { groupTags, nowIso } from "@/lib/data";
import type { Tag } from "@/lib/types";

describe("nowIso", () => {
  it("returns a valid ISO string", () => {
    const str = nowIso();
    expect(() => new Date(str)).not.toThrow();
    expect(new Date(str).toISOString()).toBe(str);
  });
});

describe("groupTags", () => {
  it("groups tags by category", () => {
    const tags: Tag[] = [
      { id: 1, name: "高音", nameEn: "", color: "#2563eb", category: "pitch" },
      { id: 2, name: "连音", nameEn: "", color: "#ea580c", category: "technique" },
      { id: 3, name: "附点", nameEn: "", color: "#c026d3", category: "rhythm" },
    ];
    const grouped = groupTags(tags);
    expect(grouped.pitch).toHaveLength(1);
    expect(grouped.technique).toHaveLength(1);
    expect(grouped.rhythm).toHaveLength(1);
  });

  it("groups custom categories dynamically", () => {
    const tags: Tag[] = [
      { id: 1, name: "Baroque", nameEn: "", color: "#9e6aba", category: "genre" },
      { id: 2, name: "Classical", nameEn: "", color: "#c46a9e", category: "genre" },
      { id: 3, name: "高音", nameEn: "", color: "#2563eb", category: "pitch" },
    ];
    const grouped = groupTags(tags);
    expect(grouped).toHaveProperty("genre");
    expect(grouped).toHaveProperty("pitch");
    expect(grouped.genre).toHaveLength(2);
    expect(grouped.pitch).toHaveLength(1);
  });

  it("returns empty object for empty input", () => {
    expect(groupTags([])).toEqual({});
  });
});
import { describe, it, expect } from "vitest";
import { tagDisplayName } from "@/components/TagPicker";
import type { Tag } from "@/lib/types";

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: "高音",
    nameEn: "High pitch",
    color: "#2563eb",
    category: "pitch",
    ...overrides,
  };
}

describe("tagDisplayName", () => {
  describe("when locale is en-US", () => {
    it("returns nameEn when both name and nameEn are present", () => {
      const tag = makeTag({ name: "高音", nameEn: "High pitch" });
      expect(tagDisplayName(tag, "en-US")).toBe("High pitch");
    });

    it("falls back to name when nameEn is empty", () => {
      const tag = makeTag({ name: "高音", nameEn: "" });
      expect(tagDisplayName(tag, "en-US")).toBe("高音");
    });

    it("falls back to name when nameEn is undefined-like (empty string)", () => {
      const tag = makeTag({ name: "连音", nameEn: "" });
      expect(tagDisplayName(tag, "en-US")).toBe("连音");
    });
  });

  describe("when locale is zh-CN", () => {
    it("returns name when both name and nameEn are present", () => {
      const tag = makeTag({ name: "高音", nameEn: "High pitch" });
      expect(tagDisplayName(tag, "zh-CN")).toBe("高音");
    });

    it("falls back to nameEn when name is empty", () => {
      const tag = makeTag({ name: "", nameEn: "High pitch" });
      expect(tagDisplayName(tag, "zh-CN")).toBe("High pitch");
    });

    it("falls back to nameEn when name is empty string", () => {
      const tag = makeTag({ name: "", nameEn: "Technique" });
      expect(tagDisplayName(tag, "zh-CN")).toBe("Technique");
    });
  });

  describe("edge cases", () => {
    it("handles tag with only Chinese name", () => {
      const tag = makeTag({ name: "高音", nameEn: "" });
      expect(tagDisplayName(tag, "en-US")).toBe("高音");
      expect(tagDisplayName(tag, "zh-CN")).toBe("高音");
    });

    it("handles tag with only English name", () => {
      const tag = makeTag({ name: "", nameEn: "High pitch" });
      expect(tagDisplayName(tag, "en-US")).toBe("High pitch");
      expect(tagDisplayName(tag, "zh-CN")).toBe("High pitch");
    });
  });
});
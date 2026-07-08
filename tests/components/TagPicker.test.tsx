// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { tagDisplayName, pickDefaultColor } from "@/components/TagPicker";
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

// The TAG_COLORS palette (mirrored from TagPicker.tsx for test clarity):
// Index 0: "#9e6aba", 1: "#c46a9e", 2: "#c45a8a", 3: "#b85a7a",
// 4: "#d46a7a", 5: "#d47a6a", 6: "#d46a4a", 7: "#c47a5a",
// 8: "#b87a6a", 9: "#d48a4a", 10: "#d49a5a", 11: "#d4aa4a",
// 12: "#d4c04a", 13: "#a8b44a", 14: "#9c8c6b", 15: "#8a9a6a"
const FIRST_COLOR = "#9e6aba";
const SECOND_COLOR = "#c46a9e";

function tag(color: string, overrides: Partial<Tag> = {}): Tag {
  return { id: 1, name: "tag", nameEn: "", color, category: "pitch", ...overrides };
}

describe("pickDefaultColor", () => {
  it("returns a different palette color when all colors are unused and currentColor is the first", () => {
    // With no tags, all counts are 0 and the tiebreaker switches away from currentColor
    expect(pickDefaultColor([], FIRST_COLOR)).toBe(SECOND_COLOR);
  });

  it("returns a different palette color when no tags use palette colors", () => {
    // Tags with non-palette colors don't affect counts; all palette counts are 0
    const tags = [tag("#123456"), tag("#abcdef")];
    expect(pickDefaultColor(tags, FIRST_COLOR)).toBe(SECOND_COLOR);
  });

  it("picks the first unused palette color when some are unused", () => {
    // FIRST_COLOR count=2, SECOND_COLOR count=1, #c45a8a count=2,
    // #b85a7a count=1, #d46a7a count=1; all others 0 → picks #d47a6a (index 5, first with 0)
    const tags = [
      tag(FIRST_COLOR), tag(FIRST_COLOR),     // #9e6aba count 2
      tag(SECOND_COLOR),                        // #c46a9e count 1
      tag("#c45a8a"), tag("#c45a8a"),           // count 2
      tag("#b85a7a"),                           // count 1
      tag("#d46a7a"),                           // count 1
    ];
    expect(pickDefaultColor(tags, FIRST_COLOR)).toBe("#d47a6a");
  });

  it("prefers a different color from the current default when tied for least used", () => {
    // FIRST_COLOR and SECOND_COLOR both have count 0; current is FIRST_COLOR → picks SECOND_COLOR
    const tags = [
      tag("#b85a7a"), tag("#b85a7a"),  // count 2
      tag("#d46a7a"),                   // count 1
    ];
    expect(pickDefaultColor(tags, FIRST_COLOR)).toBe(SECOND_COLOR);
  });

  it("keeps the current color when every other palette color is used more often", () => {
    // FIRST_COLOR count=0, all other 15 palette colors count≥1
    const tags = [
      SECOND_COLOR, "#c45a8a", "#b85a7a", "#d46a7a", "#d47a6a",
      "#d46a4a", "#c47a5a", "#b87a6a", "#d48a4a", "#d49a5a",
      "#d4aa4a", "#d4c04a", "#a8b44a", "#9c8c6b", "#8a9a6a",
    ].map((c) => tag(c, { id: 0 }));
    expect(pickDefaultColor(tags, FIRST_COLOR)).toBe(FIRST_COLOR);
  });

  it("rotates away from currentColor when all palette colors are equally used", () => {
    // Every palette color used exactly once; current is FIRST_COLOR → picks SECOND_COLOR
    const allPaletteTags = [
      "#9e6aba", "#c46a9e", "#c45a8a", "#b85a7a",
      "#d46a7a", "#d47a6a", "#d46a4a", "#c47a5a",
      "#b87a6a", "#d48a4a", "#d49a5a", "#d4aa4a",
      "#d4c04a", "#a8b44a", "#9c8c6b", "#8a9a6a",
    ].map((c) => tag(c, { id: 0 }));
    expect(pickDefaultColor(allPaletteTags, FIRST_COLOR)).toBe(SECOND_COLOR);
  });

  it("handles currentColor not in the palette", () => {
    // currentColor is a pitch-generated color outside TAG_COLORS
    // FIRST_COLOR count=1, SECOND_COLOR count=1, others 0
    // Since currentColor is not in TAG_COLORS, tiebreaker never fires
    // picks first color with count 0 → #c45a8a (index 2)
    const tags = [
      tag(FIRST_COLOR),                 // count 1
      tag(SECOND_COLOR),                // count 1
    ];
    expect(pickDefaultColor(tags, "#2563eb")).toBe("#c45a8a");
  });

  it("ignores tags with non-palette colors when counting", () => {
    const tags = [
      tag(FIRST_COLOR),                 // #9e6aba count 1
      tag("#2563eb"),                   // ignored (pitch color)
      tag("#0891b2"),                   // ignored (pitch color)
    ];
    // #9e6aba count=1, all others 0; currentColor=FIRST_COLOR triggers tiebreaker
    // for any other 0-count color → picks SECOND_COLOR (first 0-count not = currentColor)
    expect(pickDefaultColor(tags, FIRST_COLOR)).toBe(SECOND_COLOR);
  });

  it("cross-category: aggregates usage across all tags regardless of category", () => {
    // Demonstrate that tags from pitch/technique/rhythm are all counted together
    const tags = [
      tag(FIRST_COLOR, { category: "pitch" }),
      tag(FIRST_COLOR, { category: "technique" }),
      tag(FIRST_COLOR, { category: "rhythm" }),     // #9e6aba count 3
      tag(SECOND_COLOR, { category: "pitch" }),     // #c46a9e count 1
    ];
    // Counts: #9e6aba=3, #c46a9e=1, others=0
    // currentColor=#d4c04a (not the first 0-count)
    // First iteration picks #9e6aba(cnt=3), then #c46a9e(cnt=1<3) wins,
    // then #c45a8a(cnt=0<1) wins → answer is #c45a8a (first unused)
    expect(pickDefaultColor(tags, "#d4c04a")).toBe("#c45a8a");
  });
});

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TagPicker from "@/components/TagPicker";

vi.mock("@/lib/useLocale", () => ({
  useLocale: () => ({
    locale: "zh-CN",
    t: {
      pitch: "音高",
      technique: "技巧",
      rhythm: "节拍",
      addTag: "新增标签",
      removeTag: "移除标签",
      tagColor: "标签颜色",
      deleteTag: "删除标签",
      tagExists: "标签已存在",
      deleteTagConfirm: "确定删除？",
    },
  }),
}));

// The compact mode was returning early and never rendering the create
// dialog JSX, even though setShowCreateDialog(true) was called via the
// dropdown's "__new__" option. This test guards against that regression.
describe("TagPicker compact mode", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the create tag dialog when '+ 新增标签' is selected from the dropdown", () => {
    const tags = [
      { id: 1, name: "高音", nameEn: "", color: "#2563eb", category: "pitch" as const },
      { id: 2, name: "低音", nameEn: "", color: "#0891b2", category: "pitch" as const },
    ];

    render(
      <TagPicker
        compact
        category="pitch"
        tags={tags}
        selected={[]}
        onChange={() => {}}
        onCreate={async (tag) => ({ ...tag, id: 3 })}
      />
    );

    // The select should exist
    const select = screen.getByLabelText("新增标签") as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    // Select the "__new__" option to trigger the create dialog
    fireEvent.change(select, { target: { value: "__new__" } });

    // The create dialog should now be visible — "新增标签" appears as heading + button
    expect(screen.getAllByText("新增标签").length).toBeGreaterThanOrEqual(2);
    // The dialog should show input fields
    expect(screen.getByPlaceholderText("音高 (中文)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("音高 (English)")).toBeInTheDocument();
    // Cancel button should be present
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });
});

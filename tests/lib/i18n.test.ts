import { describe, it, expect } from "vitest";
import { messages, localeLabels } from "@/lib/i18n";

describe("i18n messages", () => {
  it("zh-CN and en-US have the same message keys", () => {
    const zhKeys = Object.keys(messages["zh-CN"]).sort();
    const enKeys = Object.keys(messages["en-US"]).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("localeLabels covers both locales", () => {
    expect(localeLabels["zh-CN"]).toBe("中文");
    expect(localeLabels["en-US"]).toBe("English");
  });

  it("all message values are non-empty strings", () => {
    for (const [key, value] of Object.entries(messages["zh-CN"])) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(messages["en-US"])) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
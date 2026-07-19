import { describe, it, expect } from "vitest";
import {
  pitchOctaveInfo,
  extractPrimaryPitch,
  getEnharmonicEquivalent,
  normalizeAccidentals,
} from "@/lib/pitch-utils";
import type { Tag } from "@/lib/types";
import { pitchSortKey, pitchColorFromName } from "@/lib/pitch-utils";

describe("extractPrimaryPitch", () => {
  it("returns simple pitch as-is", () => {
    expect(extractPrimaryPitch("C4")).toBe("C4");
    expect(extractPrimaryPitch("♯F5")).toBe("♯F5");
    expect(extractPrimaryPitch("♭B3")).toBe("♭B3");
  });

  it("extracts first part from space-separated format", () => {
    expect(extractPrimaryPitch("♯C4 ♭D4")).toBe("♯C4");
    expect(extractPrimaryPitch("♯F4 ♭G4")).toBe("♯F4");
  });

  it("extracts first part from pipe format (legacy)", () => {
    expect(extractPrimaryPitch("♯C4 | ♭D4")).toBe("♯C4");
  });

  it("trims whitespace", () => {
    expect(extractPrimaryPitch("  C4  ")).toBe("C4");
    expect(extractPrimaryPitch("♯C4 ♭D4 ")).toBe("♯C4");
  });
});

describe("pitchOctaveInfo", () => {
  it("parses simple pitch", () => {
    expect(pitchOctaveInfo("C4")).toEqual({ octave: 4, note: 0, accidental: 0 });
    expect(pitchOctaveInfo("D5")).toEqual({ octave: 5, note: 1, accidental: 0 });
    expect(pitchOctaveInfo("B3")).toEqual({ octave: 3, note: 6, accidental: 0 });
  });

  it("parses sharp pitches", () => {
    expect(pitchOctaveInfo("#C4")).toEqual({ octave: 4, note: 0, accidental: 0.5 });
    expect(pitchOctaveInfo("♯F5")).toEqual({ octave: 5, note: 3, accidental: 0.5 });
  });

  it("parses flat pitches", () => {
    expect(pitchOctaveInfo("bD4")).toEqual({ octave: 4, note: 1, accidental: -0.5 });
    expect(pitchOctaveInfo("♭B3")).toEqual({ octave: 3, note: 6, accidental: -0.5 });
  });

  it("defaults octave to 4 when missing", () => {
    expect(pitchOctaveInfo("C")).toEqual({ octave: 4, note: 0, accidental: 0 });
    expect(pitchOctaveInfo("#F")).toEqual({ octave: 4, note: 3, accidental: 0.5 });
  });

  it("parses space-separated format by extracting primary pitch", () => {
    expect(pitchOctaveInfo("♯C4 ♭D4")).toEqual({ octave: 4, note: 0, accidental: 0.5 });
    expect(pitchOctaveInfo("♭D4 ♯C4")).toEqual({ octave: 4, note: 1, accidental: -0.5 });
  });

  it("returns null for invalid input", () => {
    expect(pitchOctaveInfo("")).toBeNull();
    expect(pitchOctaveInfo("XYZ")).toBeNull();
  });
});

describe("normalizeAccidentals", () => {
  it("converts ASCII # to ♯", () => {
    expect(normalizeAccidentals("#C4")).toBe("♯C4");
  });

  it("converts ASCII b to ♭", () => {
    expect(normalizeAccidentals("bD4")).toBe("♭D4");
  });

  it("handles both in sequence", () => {
    expect(normalizeAccidentals("#C4 bD4")).toBe("♯C4 ♭D4");
  });

  it("leaves already-normalized strings unchanged", () => {
    expect(normalizeAccidentals("♯C4")).toBe("♯C4");
    expect(normalizeAccidentals("♭D4")).toBe("♭D4");
  });
});

describe("getEnharmonicEquivalent", () => {
  it("returns null for natural notes", () => {
    expect(getEnharmonicEquivalent("C4")).toBeNull();
    expect(getEnharmonicEquivalent("D5")).toBeNull();
    expect(getEnharmonicEquivalent("B3")).toBeNull();
  });

  it("computes sharp→flat equivalents", () => {
    expect(getEnharmonicEquivalent("#C4")).toBe("♭D4");
    expect(getEnharmonicEquivalent("#D4")).toBe("♭E4");
    expect(getEnharmonicEquivalent("#F4")).toBe("♭G4");
    expect(getEnharmonicEquivalent("#G4")).toBe("♭A4");
    expect(getEnharmonicEquivalent("#A4")).toBe("♭B4");
  });

  it("computes flat→sharp equivalents", () => {
    expect(getEnharmonicEquivalent("bD4")).toBe("♯C4");
    expect(getEnharmonicEquivalent("bE4")).toBe("♯D4");
    expect(getEnharmonicEquivalent("bG4")).toBe("♯F4");
    expect(getEnharmonicEquivalent("bA4")).toBe("♯G4");
    expect(getEnharmonicEquivalent("bB4")).toBe("♯A4");
  });

  it("handles E#→F natural", () => {
    const result = getEnharmonicEquivalent("#E4");
    expect(result).toBe("F4");
  });

  it("handles B#→C natural (octave up)", () => {
    const result = getEnharmonicEquivalent("#B4");
    expect(result).toBe("C5");
  });

  it("handles Fb→E natural", () => {
    const result = getEnharmonicEquivalent("bF4");
    expect(result).toBe("E4");
  });

  it("handles Cb→B natural (octave down)", () => {
    const result = getEnharmonicEquivalent("bC4");
    expect(result).toBe("B3");
  });

  it("uses ♯♭ for ASCII input", () => {
    expect(getEnharmonicEquivalent("#C4")).toBe("♭D4");
    expect(getEnharmonicEquivalent("bD4")).toBe("♯C4");
  });

  it("returns null for already-formatted names (space-separated)", () => {
    expect(getEnharmonicEquivalent("♯C4 ♭D4")).toBeNull();
  });

  it("returns null for already-formatted names (pipe)", () => {
    expect(getEnharmonicEquivalent("♯C4 | ♭D4")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(getEnharmonicEquivalent("")).toBeNull();
    expect(getEnharmonicEquivalent("XYZ")).toBeNull();
  });
});

describe("pitchSortKey", () => {
  function makeTag(name: string): Tag {
    return { id: 1, name, nameAlt: name, color: "#000", category: "pitch" };
  }

  it("sorts lower pitch before higher", () => {
    expect(pitchSortKey(makeTag("C4"))).toBeLessThan(pitchSortKey(makeTag("D4")));
    expect(pitchSortKey(makeTag("D4"))).toBeLessThan(pitchSortKey(makeTag("E4")));
  });

  it("sorts across octaves", () => {
    expect(pitchSortKey(makeTag("C4"))).toBeLessThan(pitchSortKey(makeTag("C5")));
    expect(pitchSortKey(makeTag("B3"))).toBeLessThan(pitchSortKey(makeTag("C4")));
  });

  it("handles formatted names via extractPrimaryPitch", () => {
    expect(pitchSortKey(makeTag("♯C4 ♭D4"))).toBe(pitchSortKey(makeTag("♯C4")));
  });

  it("returns -1 for non-pitch tags", () => {
    expect(pitchSortKey(makeTag("invalid"))).toBe(-1);
  });
});

describe("pitchColorFromName", () => {
  it("returns a color for valid pitches", () => {
    expect(pitchColorFromName("C4")).toMatch(/^#[0-9a-f]{6}$/);
    expect(pitchColorFromName("♯C4")).toMatch(/^#[0-9a-f]{6}$/);
    expect(pitchColorFromName("♭D4")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns null for invalid names", () => {
    expect(pitchColorFromName("")).toBeNull();
    expect(pitchColorFromName("invalid")).toBeNull();
  });

  it("handles formatted names via extractPrimaryPitch", () => {
    const simple = pitchColorFromName("#C4");
    const formatted = pitchColorFromName("#C4 bD4");
    expect(formatted).toBe(simple);
  });
});

import type { Tag } from "@/lib/types";

// Match pitch notation: optional accidental + letter + optional octave (1-8)
// e.g. C4, ♯C4, F#5, ♭B3, bB3, A♯6, G♮2, D1, C, ♯F
export const PITCH_RE = /^([♯♭♮#bn]?)([A-Ga-g])([1-8])?$/;

const NOTE_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/**
 * If `name` contains a `|` (pipe format like `#C4 | bD4`),
 * return the first segment (the primary pitch). Otherwise return `name` as-is.
 */
export function extractPrimaryPitch(name: string): string {
  const trimmed = name.trim();
  // Check pipe (legacy) first
  const pipeIdx = trimmed.indexOf('|');
  if (pipeIdx !== -1) {
    return trimmed.slice(0, pipeIdx).trim();
  }
  // Check space-separated format (e.g. "♯C4 ♭D4")
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx !== -1) {
    return trimmed.slice(0, spaceIdx).trim();
  }
  return trimmed;
}

/**
 * Given a pitch name with an accidental, compute the enharmonic equivalent.
 * Returns `null` for natural notes (no accidental) or invalid/pipe-format inputs.
 * Always uses Unicode accidental symbols (♯, ♭).
 *
 * Examples:
 *   getEnharmonicEquivalent("#C4")   → "♭D4"
 *   getEnharmonicEquivalent("bD4")   → "♯C4"
 *   getEnharmonicEquivalent("♯C4")   → "♭D4"
 *   getEnharmonicEquivalent("C4")    → null  (natural)
 *   getEnharmonicEquivalent("#E4")   → "F4"  (E# = F natural)
 *   getEnharmonicEquivalent("bC4")   → "B3"  (Cb = B, octave down)
 *   getEnharmonicEquivalent("#B4")   → "C5"  (B# = C, octave up)
 */
export function getEnharmonicEquivalent(pitchName: string): string | null {
  // Already in pipe or space-separated format — don't double-format
  if (pitchName.includes('|') || pitchName.includes(' ')) return null;

  const info = pitchOctaveInfo(pitchName);
  if (!info || info.accidental === 0) return null;

  const { octave, note, accidental } = info;

  if (accidental > 0) {
    // Sharp → flat: go up one note
    const newNote = (note + 1) % 7;
    const newOctave = note === 6 ? octave + 1 : octave;
    const isNatural = note === 2 || note === 6; // E#→F, B#→C
    const prefix = isNatural ? '' : '♭';
    return `${prefix}${NOTE_LETTERS[newNote]}${newOctave}`;
  } else {
    // Flat → sharp: go down one note
    const newNote = (note - 1 + 7) % 7;
    const newOctave = note === 0 ? octave - 1 : octave;
    const isNatural = note === 3 || note === 0; // Fb→E, Cb→B
    const prefix = isNatural ? '' : '♯';
    return `${prefix}${NOTE_LETTERS[newNote]}${newOctave}`;
  }
}

/** Convert ASCII accidentals (#, b) to Unicode music symbols (♯, ♭). */
export function normalizeAccidentals(name: string): string {
  return name.replace('#', '♯').replace('b', '♭');
}

export function pitchOctaveInfo(name: string): { octave: number; note: number; accidental: number } | null {
  const pitch = extractPrimaryPitch(name);
  const match = pitch.match(PITCH_RE);
  if (!match) return null;
  const note = NOTE_INDEX[match[2].toUpperCase()] ?? 0;
  const acc = match[1];
  const accMap: Record<string, number> = { '♯': 0.5, '#': 0.5, '♭': -0.5, 'b': -0.5, '♮': 0, 'n': 0, '': 0 };
  return { octave: match[3] ? parseInt(match[3]) : 4, note, accidental: accMap[acc] ?? 0 };
}

/** Numeric sort key for pitch tags — lower = lower pitch (rainbow order). */
export function pitchSortKey(tag: Tag): number {
  const info = pitchOctaveInfo(tag.name) ?? pitchOctaveInfo(tag.nameAlt);
  if (!info) return -1;
  const { octave, note, accidental } = info;
  // octave spans 100, note spans 10, accidental adjusts within note
  return octave * 100 + note * 10 + Math.round(accidental * 10);
}

function hslToHex(h: number, s: number, l: number): string {
  // Normalize: h ∈ [0, 360), s,l ∈ [0, 100]
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Compute a hex color from a pitch name (e.g. "C4", "F♯5").
 *  The full range octave 1→8 spans hue 0→300 (red→violet).
 *  Within each octave, C→B also spreads across the octave's hue range,
 *  so A4 and F4 get different colors. Accidentals shift hue by half a
 *  note-step, placing e.g. #G4 between G4 and A4 instead of past A4. */
export function pitchColorFromName(name: string): string | null {
  const info = pitchOctaveInfo(name);
  if (!info) return null;
  const { octave, note, accidental } = info;
  // Each octave occupies 1/7 of the 300° range. Within that, 7 notes spread evenly.
  const octaveSpan = 300 / 7;
  const noteStep = octaveSpan / 7;
  const hue = (octave - 1) * octaveSpan + (note + accidental) * noteStep;
  return hslToHex(hue, 40, 65);
}

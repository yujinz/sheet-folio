/** SessionStorage / localStorage keys shared across the app. */
export const STORAGE_KEYS = {
  directoryState: "sheet-folio-directory-state",
  favorites: "sheet-folio-favorites",
  deviceId: "sheet-folio-device-id",
  locale: "sheet-folio-locale",
  pitchCategories: "sheet-folio-pitch-categories",
} as const;

/** Difficulty levels 1–10. */
export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Label colors for each difficulty level (maple → ebony). */
export const DIFFICULTY_COLORS: Record<number, string> = {
  1: "#ecc484",
  2: "#e5b86a",
  3: "#dba55e",
  4: "#c98e46",
  5: "#c47a30",
  6: "#a8774b",
  7: "#8c5a3c",
  8: "#6e422a",
  9: "#4a2a18",
  10: "#1a0e06",
};

/** Zoom range for the image viewer (inclusive). */
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 130;

/** Debounce timings in milliseconds. */
export const DEBOUNCE_MS = {
  /** Auto-save delay for piece title / notes edits. */
  save: 500,
  /** Debounce delay for persisting zoom level. */
  zoom: 250,
} as const;

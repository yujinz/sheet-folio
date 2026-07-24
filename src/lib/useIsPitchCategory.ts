import { useCallback, useMemo, useState } from "react";
import { useLocale } from "@/lib/useLocale";
import { STORAGE_KEYS } from "@/lib/constants";
import { isPitchKey } from "@/lib/types";

const STORAGE_KEY = STORAGE_KEYS.pitchCategories;

/** Read the override set from localStorage (JSON array of category keys). */
function readOverrideSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Write the override set to localStorage. */
function writeOverrideSet(set: Set<string>) {
  if (set.size === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  }
}

/**
 * Manages pitch category detection with localStorage override.
 *
 * Call once at the top level (not in a loop). Returns:
 * - `isPitch(key, label?)` — call inside loops to check each category
 * - `toggle(key)` — add/remove a category key from the override set
 *
 * Detection logic (union):
 * 1. **Auto-detect**: key contains "pitch" OR display name matches `t.pitch`
 * 2. **Override set**: categories the user explicitly toggled in edit mode
 * A category is pitch if **either** condition is true (override is additive).
 */
export function usePitchCategory() {
  const { t } = useLocale();
  const [version, setVersion] = useState(0);

  const overrideSet = useMemo(() => readOverrideSet(), [version]);

  /** Check if a category key is treated as pitch (auto-detect or manually toggled). */
  const isPitch = useCallback(
    (key: string, label?: string): boolean => {
      return (
        overrideSet.has(key) ||
        isPitchKey(key) ||
        (label != null && label === t.pitch)
      );
    },
    [overrideSet, t.pitch],
  );

  /** Add/remove a category key from the override set. */
  const toggle = useCallback((key: string) => {
    const set = readOverrideSet();
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    writeOverrideSet(set);
    setVersion((v) => v + 1);
  }, []);

  return { isPitch, toggle } as const;
}

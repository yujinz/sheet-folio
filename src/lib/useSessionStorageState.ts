/**
 * Read a value from sessionStorage with try/catch safety.
 * Returns `null` when the key doesn't exist, parsing fails, or storage is unavailable.
 */
export function readSessionStorage<T>(key: string): T | null {
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return JSON.parse(saved) as T;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Write a value to sessionStorage with try/catch safety.
 */
export function writeSessionStorage(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (e.g. quota exceeded)
  }
}

/**
 * Merge a partial value into an existing sessionStorage value.
 * Reads the current value, shallow-merges `partial` into it, and writes back.
 */
export function mergeSessionStorage(key: string, partial: Record<string, unknown>): void {
  try {
    const existing = readSessionStorage<Record<string, unknown>>(key) ?? {};
    const next = { ...existing, ...partial };
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

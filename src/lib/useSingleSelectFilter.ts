import { useCallback, useState } from "react";

/**
 * Hook for single-select filter state.
 *
 * When a value is active and another is selected, it **switches** to the new
 * value — the user does not need to manually deselect the previous one.
 * Clicking the same value again deselects it.
 *
 * @example
 * ```ts
 * const difficulty = useSingleSelectFilter<number>();
 * // difficulty.value  → number | null
 * // difficulty.toggle(3) → selects 3 (or deselects if 3 was already selected)
 * // difficulty.reset() → clears selection
 * ```
 *
 * TODO: When adding new single-select filters elsewhere, create additional
 *       instances of this hook and wire them into the reset / sessionStorage
 *       logic in the same way as `difficultyFilter`.
 */
export function useSingleSelectFilter<T>() {
  const [value, setValue] = useState<T | null>(null);

  const toggle = useCallback((newValue: T) => {
    setValue((prev) => (prev === newValue ? null : newValue));
  }, []);

  const reset = useCallback(() => {
    setValue(null);
  }, []);

  return { value, setValue, toggle, reset } as const;
}

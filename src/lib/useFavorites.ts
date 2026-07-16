import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * Shared hook for managing the favorites list.
 * Persisted in localStorage under `STORAGE_KEYS.favorites`.
 */
export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.favorites);
      if (raw) setFavoriteIds(JSON.parse(raw));
    } catch {
      // ignore corrupt data
    }
  }, []);

  const toggleFavorite = useCallback((songId: number) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(songId)
        ? prev.filter((id) => id !== songId)
        : [...prev, songId];
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (songId: number) => favoriteIds.includes(songId),
    [favoriteIds],
  );

  return { favoriteIds, isFavorite, toggleFavorite };
}

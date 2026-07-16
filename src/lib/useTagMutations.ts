import { useCallback } from "react";
import type { Tag } from "@/lib/types";

/**
 * Shared hook for creating a tag via POST /api/tags.
 *
 * Automatically appends the created tag to the local `setTags` state.
 * `onCreated` fires after the tag is saved to state (e.g. to rotate default color).
 */
export function useCreateTag(
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>,
  onCreated?: (tag: Tag) => void
) {
  return useCallback(
    async (tag: Omit<Tag, "id">) => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tag),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error ?? "Failed to create tag");
      setTags((value) => [...value.filter((item) => item.id !== created.id), created]);
      onCreated?.(created);
      return created;
    },
    [setTags, onCreated],
  );
}

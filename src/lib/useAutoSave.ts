import { useCallback, useRef } from "react";
import { useLocale } from "@/lib/useLocale";
import { DEBOUNCE_MS } from "@/lib/constants";
import type { Song } from "@/lib/types";

/** Build the PATCH body from the uncontrolled input refs, handling the locale-aware title mirroring logic. */
function buildSaveBody(
  locale: string,
  piece: Song | null,
  notesRef: React.RefObject<HTMLTextAreaElement | null>,
  titleRef: React.RefObject<HTMLInputElement | null>,
  titleAltRef: React.RefObject<HTMLInputElement | null>,
  shouldSyncOther: boolean,
): Record<string, string> | null {
  const notes = notesRef.current?.value ?? "";
  const body: Record<string, string> = { notes };
  if (locale === "en-US") {
    const titleAlt = titleAltRef.current?.value ?? "";
    body.title = piece?.title ?? "";
    body.titleAlt = titleAlt;
    if (shouldSyncOther && titleAlt.trim()) {
      body.title = titleAlt;
    }
  } else {
    const title = titleRef.current?.value ?? "";
    body.title = title;
    body.titleAlt = piece?.titleAlt ?? "";
    if (shouldSyncOther && title.trim()) {
      body.titleAlt = title;
    }
  }
  if (body.title.trim() === "" && body.titleAlt.trim() === "") return null;
  return body;
}

/**
 * Shared hook for debounced auto-save of piece title + notes.
 *
 * Uses uncontrolled inputs (refs) so the save logic is decoupled from React
 * re-renders. The dirty flag tracks whether there are unsaved changes.
 *
 * Returns refs to attach to the input/textarea elements, plus save/flush/blur handlers.
 */
export function useAutoSave(
  songId: number,
  piece: Song | null,
  setPiece: React.Dispatch<React.SetStateAction<Song | null>>,
) {
  const { t, locale } = useLocale();
  const titleRef = useRef<HTMLInputElement>(null);
  const titleAltRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const isComposingRef = useRef(false);
  // Whether to sync the active field's value to the other locale's field.
  // Re-evaluated on initial piece load and whenever locale changes:
  // true if the other field was empty at that point.
  const shouldSyncOtherRef = useRef(false);
  const syncLocaleRef = useRef<string | null>(null);
  if (piece && syncLocaleRef.current !== locale) {
    syncLocaleRef.current = locale;
    shouldSyncOtherRef.current =
      locale === "en-US" ? !piece.title?.trim() : !piece.titleAlt?.trim();
  }

  const doSave = useCallback(
    (body: Record<string, string>) => {
      void fetch(`/api/pieces/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((updated) => {
          if (updated) setPiece(updated);
          isDirtyRef.current = false;
        });
    },
    [songId, setPiece],
  );

  const scheduleSave = useCallback(() => {
    if (isComposingRef.current) return;
    isDirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Don't save while IME composition is in progress — the input value may
      // contain unconfirmed composition text. The save will be re-triggered
      // via onCompositionEnd when the user finishes composing.
      if (isComposingRef.current) return;
      const body = buildSaveBody(locale, piece, notesRef, titleRef, titleAltRef, shouldSyncOtherRef.current);
      if (body) doSave(body);
    }, DEBOUNCE_MS.save);
  }, [locale, piece, doSave]);

  const flushSave = useCallback(() => {
    if (isComposingRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (isDirtyRef.current) {
      const body = buildSaveBody(locale, piece, notesRef, titleRef, titleAltRef, shouldSyncOtherRef.current);
      if (body) doSave(body);
    }
  }, [locale, piece, doSave]);

  const handleTitleBlur = useCallback(() => {
    flushSave();
    const currentValue = (titleRef.current ?? titleAltRef.current)?.value ?? "";
    const newTitle = locale === "en-US" ? (piece?.title ?? "") : currentValue;
    const newTitleAlt = locale === "en-US" ? currentValue : (piece?.titleAlt ?? "");
    if (newTitle.trim() === "" && newTitleAlt.trim() === "") {
      const fallback = piece?.title || piece?.titleAlt || "";
      if (titleRef.current) titleRef.current.value = fallback;
      if (titleAltRef.current) titleAltRef.current.value = fallback;
      alert(t.titleRequired);
    }
  }, [locale, piece, flushSave, t.titleRequired]);

  return {
    titleRef,
    titleAltRef,
    notesRef,
    scheduleSave,
    handleTitleBlur,
    isComposingRef,
    isDirtyRef,
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { type Locale, localeLabels, messages } from "@/lib/i18n";

const storageKey = "sheet-folio-locale";

function readLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  const stored = localStorage.getItem(storageKey);
  if (stored === "en-US" || stored === "zh-CN") return stored;
  // Default to English in demo mode so visitors see EN first
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? "en-US" : "zh-CN";
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>("zh-CN");

  useEffect(() => {
    setLocaleState(readLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: Locale) {
    localStorage.setItem(storageKey, next);
    setLocaleState(next);
    window.dispatchEvent(new CustomEvent("sheet-folio-locale", { detail: next }));
  }

  useEffect(() => {
    const update = () => setLocaleState(readLocale());
    window.addEventListener("storage", update);
    window.addEventListener("sheet-folio-locale", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("sheet-folio-locale", update);
    };
  }, []);

  return useMemo(() => ({ locale, setLocale, t: messages[locale], localeLabels }), [locale]);
}

"use client";

import { Languages } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useLocale } from "@/lib/useLocale";

const locales: Locale[] = ["zh-CN", "en-US"];

export default function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale, localeLabels } = useLocale();

  return (
    <div className={`inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-white p-1 ${className ?? ""}`} aria-label="Language">
      <Languages size={15} className="mx-1 text-[var(--muted)]" />
      {locales.map((item) => (
        <button
          key={item}
          className={`whitespace-nowrap rounded px-2 py-1 text-sm ${locale === item ? "bg-[var(--accent)] text-white" : "text-[var(--foreground)]"}`}
          type="button"
          onClick={() => setLocale(item)}
        >
          {localeLabels[item]}
        </button>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/useLocale";
import type { ExportStatus } from "@/lib/export-types";

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/** Replaces `{key}` placeholders in an i18n template with string values. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Demo-mode banner about data safety.
 *
 * Shows nothing unless NEXT_PUBLIC_DEMO_MODE is true. The message depends on
 * how much the user has of their own to lose:
 *   - only seed data            → calm "browser version" note (nothing user-created at risk)
 *   - own data, never exported  → urgent warning
 *   - own data, N new pieces    → info with last-backup date & count
 *   - own data, fully backed up → positive confirmation with last-backup date
 */
export default function DemoBanner() {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<ExportStatus | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return;
    let cancelled = false;
    fetch("/api/export/status")
      .then((res) => res.json())
      .then((row: ExportStatus) => {
        if (!cancelled) setStatus(row);
      })
      .catch(() => {
        // ignore — banner just stays hidden on failure
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;
  if (!status) return null; // avoid flashing while loading

  let message: string;
  if (status.isSeedData) {
    // Nothing user-created yet — calm informational note about the browser version.
    message = t.demoBrowserVersion;
  } else if (!status.lastExportedAt) {
    // Own data but never exported — urgent.
    message = t.demoNeverExportedUrgent;
  } else if (status.newPiecesSinceExport && status.newPiecesSinceExport > 0) {
    const count = status.newPiecesSinceExport;
    message = interpolate(
      count === 1 ? t.demoExportedWithNewOne : t.demoExportedWithNew,
      { date: formatDate(status.lastExportedAt, locale), count: String(count) },
    );
  } else {
    // Everything is backed up — positive confirmation.
    message = interpolate(t.demoBackedUp, { date: formatDate(status.lastExportedAt, locale) });
  }

  // Show the "go back up →" pointer only when the user owns data that isn't fully backed up yet.
  const needsBackup = !status.isSeedData && (!status.lastExportedAt || (status.newPiecesSinceExport ?? 0) > 0);

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
      style={{ background: "#fffbeb", borderBottom: "1px solid #fde68a" }}
    >
      <span style={{ color: "#92400e" }}>
        {message}
        {needsBackup && (
          <>
            {locale === "en-US" ? " " : ""}
            <span>{t.demoBackupCta}</span>
          </>
        )}
      </span>
      <Link
        href="/settings"
        className="text-button !min-h-0 !h-auto !py-0.5 !px-2"
        style={{ fontSize: 12, color: "#92400e", borderColor: "#92400e" }}
      >
        <Settings size={12} /> {t.settingsTitle}
      </Link>
    </div>
  );
}

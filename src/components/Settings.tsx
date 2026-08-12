/**
 * Settings page — data backup and restore.
 *
 * UI inspired by the backup page at https://karaoke-shuffle.netlify.app/
 */
"use client";

import Link from "next/link";
import JSZip from "jszip";
import { ArrowLeft, Download, RotateCcw, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
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

type ZipPreviewInfo = {
  exportedAt: string;
  pieceCount: number;
  tagCount: number;
  imageCount: number;
};

/** Replaces `{key}` placeholders in an i18n template with numeric values. */
function interpolate(template: string, vars: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export default function Settings() {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [zipPreview, setZipPreview] = useState<ZipPreviewInfo | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/export/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // status is best-effort
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function handleExport() {
    setBusy(true);
    setMessage(t.exporting);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] ?? "sheet-folio-backup.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage(process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? t.exportSuccess : t.exportSuccess + " " + t.exportHttpWarning);
      await refreshStatus();
    } catch {
      setMessage(t.exportFailed);
    } finally {
      setBusy(false);
    }
  }

  /** Reads manifest.json from the selected zip to show a preview overview. */
  async function readZipPreview(file: File) {
    setZipPreview(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) {
        setZipPreview("error");
        return;
      }
      const raw = JSON.parse(await manifestEntry.async("string")) as {
        exportedAt?: unknown;
        pieceCount?: unknown;
        tagCount?: unknown;
        imageCount?: unknown;
      };
      if (
        typeof raw.exportedAt !== "string" ||
        typeof raw.pieceCount !== "number" ||
        typeof raw.tagCount !== "number" ||
        typeof raw.imageCount !== "number"
      ) {
        setZipPreview("error");
        return;
      }
      setZipPreview({
        exportedAt: raw.exportedAt,
        pieceCount: raw.pieceCount,
        tagCount: raw.tagCount,
        imageCount: raw.imageCount,
      });
    } catch {
      setZipPreview("error");
    }
  }

  async function doImport(mode: "merge" | "replace") {
    if (!file) {
      setMessage(t.importNoFile);
      return;
    }
    if (mode === "replace" && !confirm(t.importReplaceConfirm)) return;
    setBusy(true);
    setMessage(t.importing);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/import?mode=${mode}`, { method: "POST", body: form });
      const result = (await res.json().catch(() => ({}))) as {
        error?: string;
        imported?: { pieces: number; tags: number; images: number };
        skipped?: { pieces: number };
      };
      if (!res.ok) {
        setMessage(result.error ?? t.importFailed);
        return;
      }
      const parts: string[] = [];
      if (result.imported) {
        parts.push(
          interpolate(t.importResultAdded, {
            pieces: result.imported.pieces,
            tags: result.imported.tags,
            images: result.imported.images,
          }),
        );
      }
      if (mode === "merge" && (result.skipped?.pieces ?? 0) > 0) {
        parts.push(interpolate(t.importResultSkipped, { pieces: result.skipped!.pieces }));
      }
      setMessage(parts.length ? parts.join(" · ") : t.importSuccess);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setZipPreview(null);
      await refreshStatus();
    } catch {
      setMessage(t.importFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback() {
    if (!status?.hasSnapshot) return;
    if (!confirm(t.rollbackConfirm)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/export/rollback", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage((err as { error?: string }).error ?? t.importFailed);
        return;
      }
      setMessage(t.rollbackSuccess);
      // Refresh all in-memory state (Directory/Detail) with restored data.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setMessage(t.importFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!confirm(t.resetDataConfirm)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reset", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage((err as { error?: string }).error ?? t.importFailed);
        return;
      }
      setMessage(t.resetDataSuccess);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setMessage(t.importFailed);
    } finally {
      setBusy(false);
    }
  }

  const storageLabel = status?.storageMethod === "indexeddb" ? t.storageIndexedDB : t.storageSqlite;

  return (
    <main className="sheet-page">
      <header className="flex items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <Link href="/" className="icon-button shrink-0" aria-label={t.backToDirectory} title={t.backToDirectory}>
          <ArrowLeft size={18} />
        </Link>
        <h1 className="flex-1 text-lg font-semibold">{t.settingsTitle}</h1>
        <LocaleSwitch />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-4 py-6">
          {message && (
            <div className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm" role="status">
              {message}
            </div>
          )}

          {/* Status card */}
          <section className="rounded-lg border border-[var(--line)] bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">{t.statusTitle}</h2>
            <dl className="divide-y divide-[var(--line)]">
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-[var(--muted)]">{t.statusPieceCount}</dt>
                <dd className="text-sm font-medium">{status?.pieceCount ?? "–"}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-[var(--muted)]">{t.statusTagCount}</dt>
                <dd className="text-sm font-medium">{status?.tagCount ?? "–"}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-[var(--muted)]">{t.statusImageCount}</dt>
                <dd className="text-sm font-medium">{status?.imageCount ?? "–"}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-[var(--muted)]">{t.statusLastExport}</dt>
                <dd className="text-sm font-medium" style={{ color: status?.lastExportedAt ? undefined : "#dc2626" }}>
                  {status?.lastExportedAt ? formatDate(status.lastExportedAt, locale) : t.neverExported}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-[var(--muted)]">{t.statusLastSnapshot}</dt>
                <dd className="text-sm font-medium">
                  {status?.lastSnapshotAt ? formatDate(status.lastSnapshotAt, locale) : t.noSnapshot}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-[var(--muted)]">{t.statusStorageMethod}</dt>
                <dd className="text-sm font-medium">{storageLabel}</dd>
              </div>
            </dl>
          </section>

          {/* Export */}
          <section className="rounded-lg border border-[var(--line)] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.exportTitle}</h2>
            <p className="mb-3 text-sm text-[var(--muted)]">{t.exportDesc}</p>
            {process.env.NEXT_PUBLIC_DEMO_MODE !== "true" && (
              <p className="mb-3 text-xs text-[var(--muted)]">{t.exportHttpWarning}</p>
            )}
            {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
              <p className="mb-3 text-xs text-[var(--muted)]">
                {t.demoSelfHostNote}{" "}
                <a href="https://github.com/yujinz/sheet-folio" target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                  github.com/yujinz/sheet-folio
                </a>
              </p>
            )}
            <button className="text-button primary-button" type="button" onClick={handleExport} disabled={busy}>
              <Download size={16} /> {t.exportButton}
            </button>
          </section>

          {/* Import */}
          <section className="rounded-lg border border-[var(--line)] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.importTitle}</h2>
            <p className="mb-3 text-sm text-[var(--muted)]">{t.importDesc}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                if (next) void readZipPreview(next);
                else setZipPreview(null);
              }}
            />
            <div
              className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--line)] px-4 py-8 text-center hover:border-[var(--accent)]"
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
            >
              <UploadCloud size={18} className="text-[var(--muted)]" />
              <span className="text-sm" style={{ color: file ? undefined : "var(--muted)" }}>
                {file ? file.name : t.importPickFile}
              </span>
            </div>
            {zipPreview && !busy && (
              <div className="mb-3 rounded-lg border border-[var(--line)] bg-white px-3 py-3">
                <h3 className="mb-2 text-sm font-semibold">{t.importPreviewTitle}</h3>
                {zipPreview === "error" ? (
                  <p className="text-sm" style={{ color: "#dc2626" }}>
                    {t.importInvalidZip}
                  </p>
                ) : (
                  <dl className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-[var(--muted)]">{t.importPreviewDate}</dt>
                      <dd>{formatDate(zipPreview.exportedAt, locale)}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-[var(--muted)]">{t.statusPieceCount}</dt>
                      <dd>{zipPreview.pieceCount}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-[var(--muted)]">{t.statusTagCount}</dt>
                      <dd>{zipPreview.tagCount}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-[var(--muted)]">{t.statusImageCount}</dt>
                      <dd>{zipPreview.imageCount}</dd>
                    </div>
                  </dl>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="text-button primary-button" type="button" onClick={() => doImport("merge")} disabled={busy || !file}>
                {t.importMerge}
              </button>
              <button className="text-button" type="button" onClick={() => doImport("replace")} disabled={busy || !file}>
                {t.importReplace}
              </button>
            </div>
          </section>

          {/* Rollback */}
          <section className="rounded-lg border border-[var(--line)] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.rollbackTitle}</h2>
            <p className="mb-3 text-sm text-[var(--muted)]">{t.rollbackDesc}</p>
            {status?.hasSnapshot && status.snapshotCounts && (
              <div className="mb-3 rounded-lg border border-[var(--line)] bg-white px-3 py-3">
                <h3 className="mb-2 text-sm font-semibold">{t.rollbackPreviewTitle}</h3>
                <dl className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-[var(--muted)]">{t.rollbackPreviewDate}</dt>
                    <dd>{formatDate(status.lastSnapshotAt, locale)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-[var(--muted)]">{t.statusPieceCount}</dt>
                    <dd>{status.snapshotCounts.pieces}</dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-[var(--muted)]">{t.statusTagCount}</dt>
                    <dd>{status.snapshotCounts.tags}</dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-[var(--muted)]">{t.statusImageCount}</dt>
                    <dd>{status.snapshotCounts.images}</dd>
                  </div>
                </dl>
              </div>
            )}
            <button
              className="text-button"
              type="button"
              onClick={handleRollback}
              disabled={busy || !status?.hasSnapshot}
              title={status?.hasSnapshot ? undefined : t.rollbackNone}
            >
              <RotateCcw size={16} /> {t.rollbackButton}
            </button>
            {!status?.hasSnapshot && <span className="ml-2 text-xs text-[var(--muted)]">{t.rollbackNone}</span>}
          </section>

          {/* Reset demo data (demo only) */}
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
            <section className="rounded-lg border border-[var(--line)] bg-white p-4">
              <h2 className="mb-1 text-sm font-semibold" style={{ color: "#991b1b" }}>{t.resetDataTitle}</h2>
              <p className="mb-3 text-sm text-[var(--muted)]">{t.resetDataDesc}</p>
              <button className="text-button danger-button" type="button" onClick={handleReset} disabled={busy}>
                {t.resetDataButton}
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

// Build an import zip containing a piece that is NOT in the demo seed data.
// Playwright gives each test a fresh browser context (fresh IndexedDB), so the
// demo DB always starts with the 3 seed pieces.
// process.pid keeps the path unique per worker (tests run fully parallel).
const IMPORT_ZIP_PATH = path.join(os.tmpdir(), `sheet-folio-e2e-import-${process.pid}.zip`);
const IMPORT_TITLE = "E2E Import Piece";
const SEED_PIECE_COUNT = 3;

test.beforeAll(async () => {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({ exportedAt: "2026-08-05T00:00:00.000Z", pieceCount: 1, tagCount: 0, imageCount: 0, schemaVersion: 3 }),
  );
  zip.file(
    "pieces.json",
    JSON.stringify([
      {
        id: 500,
        title: IMPORT_TITLE,
        titleAlt: "",
        difficulty: 1,
        notes: "",
        tags: {},
        images: { staff: [], numbered: [] },
        links: [],
      },
    ]),
  );
  zip.file("tags.json", JSON.stringify([]));
  zip.file("single-select-categories.json", JSON.stringify([]));
  zip.file("tag-categories.json", JSON.stringify([]));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(IMPORT_ZIP_PATH, buffer);
});

test.afterAll(() => {
  try {
    fs.rmSync(IMPORT_ZIP_PATH, { force: true });
  } catch {
    // ignore
  }
});

// Force English UI so selectors are deterministic (demo mode may default to zh-CN).
async function openSettings(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("sheet-folio-locale", "en-US"));
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /Data & Backup/ })).toBeVisible();
}

// The status card's "Total pieces" row. Scoped to the status card because the
// Rollback section's snapshot preview card also shows a "Total pieces" row.
function statusPieceCount(page: import("@playwright/test").Page) {
  return page.locator("section", { hasText: /Current Status/ }).locator('dt:has-text("Total pieces") + dd');
}

test("status card shows library counts", async ({ page }) => {
  await openSettings(page);
  await expect(statusPieceCount(page)).toHaveText(String(SEED_PIECE_COUNT));
  await expect(page.locator('dt:has-text("Storage method") + dd')).toHaveText(/IndexedDB|SQLite/);
});

test("export downloads a backup zip and records a snapshot", async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('dt:has-text("Previous snapshot") + dd')).toHaveText("None");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export Backup/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  // Snapshot status updates after export
  await expect(page.locator('dt:has-text("Previous snapshot") + dd')).not.toHaveText("None");

  // Snapshot preview card appears in the Rollback section with the snapshot's counts.
  const rollbackSection = page.locator("section", { hasText: /Rollback/ });
  await expect(rollbackSection.getByRole("heading", { name: /Snapshot overview/ })).toBeVisible();
  await expect(rollbackSection.locator('dt:has-text("Total pieces") + dd')).toHaveText(String(SEED_PIECE_COUNT));
  await expect(rollbackSection.locator('dt:has-text("Snapshot taken") + dd')).not.toBeEmpty();
});

test("import merge adds a new piece", async ({ page }) => {
  await openSettings(page);
  await expect(statusPieceCount(page)).toHaveText(String(SEED_PIECE_COUNT));

  await page.locator('input[type="file"]').setInputFiles(IMPORT_ZIP_PATH);
  await expect(page.locator(`text=${path.basename(IMPORT_ZIP_PATH)}`)).toBeVisible();

  await page.getByRole("button", { name: /Merge/ }).click();
  // Import result breakdown is shown (not "Import successful", which only
  // appears when nothing was added).
  await expect(page.locator("text=/Added: 1 pieces/")).toBeVisible();

  // Status refreshed: one more piece than seed
  await expect(statusPieceCount(page)).toHaveText(String(SEED_PIECE_COUNT + 1));
});

test("rollback restores the pre-import snapshot", async ({ page }) => {
  await openSettings(page);

  // Import creates a pre-import snapshot (SEED count), then adds a piece.
  await page.locator('input[type="file"]').setInputFiles(IMPORT_ZIP_PATH);
  await page.getByRole("button", { name: /Merge/ }).click();
  await expect(statusPieceCount(page)).toHaveText(String(SEED_PIECE_COUNT + 1));

  // Snapshot exists → rollback button enabled.
  await expect(page.locator('dt:has-text("Previous snapshot") + dd')).not.toHaveText("None");

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Restore to previous version/ }).click();

  // Page reloads and status reflects the restored (seed) count.
  await expect(page.getByRole("heading", { name: /Data & Backup/ })).toBeVisible();
  await expect(statusPieceCount(page)).toHaveText(String(SEED_PIECE_COUNT));
});

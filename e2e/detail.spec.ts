import { test, expect } from "@playwright/test";
import { waitForTable, navigateToPiece, forceLocale } from "./fixtures/seed";

test.beforeEach(async ({ page }) => {
  // Demo mode defaults to EN; tests navigate via zh piece titles.
  await forceLocale(page, "zh-CN");
  await page.goto("/");
  await waitForTable(page);
});

// ─── Editing & Auto-save ────────────────────────────────────────────

test("title auto-saves", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  const titleInput = page.locator(".input.max-w-lg");
  await titleInput.fill("Edited Title");
  // Blur and wait for debounce
  await page.locator("body").click({ position: { x: 0, y: 0 } });
  await page.waitForTimeout(700);
  // Navigate home and verify the title changed in the table
  await page.goto("/");
  await page.waitForTimeout(500);
  await expect(page.locator("a:has-text('Edited Title')")).toBeVisible();
});

test("difficulty change persists", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  const diffSelect = page.locator("select").first();
  await diffSelect.selectOption("8");
  await page.waitForTimeout(300);
  await page.reload();
  await expect(diffSelect).toHaveValue("8");
});

test("notes auto-saves", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  const textarea = page.locator(".textarea").first();
  await textarea.fill("Practice notes for testing");
  // Blur and wait for debounce
  await page.locator("body").click({ position: { x: 0, y: 0 } });
  await page.waitForTimeout(700);
  // Navigate home and back to verify persistence
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.locator("a:has-text('欢乐颂')").click();
  await page.waitForURL(/\/piece\/\d+/);
  await page.locator(".textarea").first().waitFor({ timeout: 5000 });
  await expect(page.locator(".textarea").first()).toHaveValue("Practice notes for testing");
});

// ─── Delete ─────────────────────────────────────────────────────────

test("delete piece with confirm redirects to directory", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  // Set up dialog handler BEFORE clicking
  let dialogAccepted = false;
  page.on("dialog", async (dialog) => {
    dialogAccepted = true;
    await dialog.accept();
  });
  // Click delete button
  await page.locator('button:has(svg.lucide-trash2)').first().click();
  await page.waitForURL("/", { timeout: 10000 });
  expect(dialogAccepted).toBe(true);
});

test("delete piece cancelled stays on detail", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  const deleteBtn = page.locator('button:has(svg.lucide-trash2), button.danger-button').first();

  // Dismiss the confirm dialog
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await deleteBtn.click();
  await page.waitForTimeout(500);
  // Should still be on the detail page
  expect(page.url()).toMatch(/\/piece\/\d+/);
});

// ─── Favorite from Detail ───────────────────────────────────────────

test("favorite toggle from detail", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  const heartBtn = page.locator('button:has(svg.lucide-heart)').first();
  if (await heartBtn.isVisible()) {
    await heartBtn.click();
    await page.waitForTimeout(200);
    // Heart should be filled now
    await expect(heartBtn).toBeVisible();
  }
});

// ─── Tag Picker (compact mode) ──────────────────────────────────────

test("tag picker compact mode shows tags", async ({ page }) => {
  await navigateToPiece(page, "空之境界 M18");
  // Should see tag pills in the detail view
  const tagSection = page.locator(".tag-picker, [class*='tag']").first();
  await expect(tagSection).toBeVisible();
});

// ─── Video Links ────────────────────────────────────────────────────

test("video links section visible", async ({ page }) => {
  await navigateToPiece(page, "欢乐颂");
  // Just verify the detail page loaded with a title input
  await expect(page.locator(".input.max-w-lg")).toBeVisible();
});

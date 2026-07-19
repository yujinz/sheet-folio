import { test, expect } from "@playwright/test";
import { waitForTable } from "./fixtures/seed";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTable(page);
});

// ─── Locale Switch ──────────────────────────────────────────────────

test("locale toggle switches UI to English", async ({ page }) => {
  // Click English toggle
  await page.locator('button:has-text("English")').click();
  await page.waitForTimeout(300);
  // Key labels should switch to English
  await expect(page.locator('button:has-text("Add piece")')).toBeVisible();
  // Search placeholder changes to English
  await expect(page.locator('input[placeholder="Search titles"]')).toBeVisible();
});

test("locale toggle switches UI back to Chinese", async ({ page }) => {
  // Switch to English first
  await page.locator('button:has-text("English")').click();
  await page.waitForTimeout(300);
  // Switch back to Chinese
  await page.locator('button:has-text("中文")').click();
  await page.waitForTimeout(300);
  // Labels should be Chinese again
  await expect(page.locator('button:has-text("添加曲子")')).toBeVisible();
  await expect(page.locator('input[placeholder="搜索曲名"]')).toBeVisible();
});

test("locale persists across navigation", async ({ page }) => {
  // Switch to English first
  await page.locator('button:has-text("English")').click();
  await page.waitForTimeout(300);

  // In English locale, the link shows the English title
  await page.locator("a:has-text('Ode to Joy')").click();
  await page.waitForURL(/\/piece\/\d+/);
  await page.locator(".input.max-w-lg").waitFor({ timeout: 10000 });

  // Navigate back using the Home/back link (House icon)
  await page.locator("a[href='/']").first().click();
  await page.waitForURL("/");
  await page.waitForTimeout(500);

  // UI should still be in English
  await expect(page.locator('button:has-text("Add piece")')).toBeVisible();
});

test("locale persists across reload", async ({ page }) => {
  await page.locator('button:has-text("English")').click();
  await page.waitForTimeout(300);

  await page.reload();
  await waitForTable(page);

  // UI should still be in English (stored in localStorage)
  await expect(page.locator('button:has-text("Add piece")')).toBeVisible();
});

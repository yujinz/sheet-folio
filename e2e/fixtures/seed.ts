import type { Page } from "@playwright/test";

/**
 * Wait for the table to have at least `minRows` rows.
 * Throws if the table doesn't appear within the timeout.
 */
export async function waitForTable(page: Page, minRows = 1, timeout = 10000): Promise<void> {
  await page.waitForSelector(".song-table tbody tr", { timeout });
  const count = await page.locator(".song-table tbody tr").count();
  if (count < minRows) {
    throw new Error(`Expected at least ${minRows} rows, got ${count}`);
  }
}

/**
 * Get the number of visible data rows in the table (excluding header).
 */
export async function getTableRowCount(page: Page): Promise<number> {
  return page.locator(".song-table tbody tr").count();
}

/**
 * Click a piece link by its title text.
 */
export async function navigateToPiece(page: Page, title: string): Promise<void> {
  await page.locator(`a:has-text("${title}")`).first().click();
  await page.waitForURL(/\/piece\/\d+/);
  // Wait for the detail page to finish loading (input appears)
  await page.locator(".input.max-w-lg").waitFor({ timeout: 10000 });
}

/**
 * Click a tag pill button by its text content within a category section.
 */
export async function clickTagPill(page: Page, tagName: string): Promise<void> {
  await page.locator(`button:has-text("${tagName}")`).first().click();
}

/**
 * Force the app to a specific locale for this test.
 * Demo mode defaults to EN (see src/lib/useLocale.ts), but many specs and
 * their selectors assume a zh-CN default, so set it before the first goto.
 */
export async function forceLocale(page: Page, locale: "zh-CN" | "en-US"): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem("sheet-folio-locale", value), locale);
}

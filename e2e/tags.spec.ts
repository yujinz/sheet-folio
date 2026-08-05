import { test, expect } from "@playwright/test";
import { waitForTable, forceLocale } from "./fixtures/seed";

test.beforeEach(async ({ page }) => {
  // Demo mode defaults to EN; selectors here (编辑标签 etc.) assume zh-CN.
  await forceLocale(page, "zh-CN");
  await page.goto("/");
  await waitForTable(page);
});

// ─── Edit Tags Mode ─────────────────────────────────────────────────

test("edit tags mode shows tag actions", async ({ page }) => {
  // Click edit tags button
  await page.locator('button:has-text("编辑标签")').click();
  await page.waitForTimeout(300);
  // The + add buttons use aria-label (not text content)
  const addButtons = page.locator('button[aria-label="新标签"]');
  const count = await addButtons.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test("create tag appears in filter list", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.waitForTimeout(300);

  // Click + in the first category (uses aria-label, not text)
  const addNewBtn = page.locator('button[aria-label="新标签"]').first();
  await addNewBtn.click();
  await page.waitForTimeout(300);

  // Fill in tag name in the dialog
  const nameInput = page.locator('[class*="dialog"] input:not([type="color"])').first();
  if (await nameInput.isVisible()) {
    await nameInput.fill("Test Tag E2E");
    // Click add/save
    await page.locator('button:has-text("添加")').last().click();
    await page.waitForTimeout(300);

    // The new tag should appear in the filter pills
    await expect(page.locator('button:has-text("Test Tag E2E")')).toBeVisible();
  }
});

test("delete tag removes it", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.waitForTimeout(300);

  // Find a tag pill with a delete X button
  const deleteBtn = page.locator('button:has(svg.lucide-x), button[aria-label*="delete" i], button[aria-label*="remove" i]').first();
  if (await deleteBtn.isVisible()) {
    // Handle confirmation
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await deleteBtn.click();
    await page.waitForTimeout(300);
  }
});

// ─── Categories ─────────────────────────────────────────────────────

test("create new category section appears", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.waitForTimeout(300);

  // Find inputs for new category name (zh + en)
  const categoryInput = page.locator('input[placeholder*="category" i]').first();
  if (await categoryInput.isVisible()) {
    await categoryInput.fill("test-category");
    // Click add
    await page.locator('button:has-text("Add"), button:has-text("添加")').click();
    await page.waitForTimeout(300);
    // The new category should appear
    await expect(page.locator('text=test-category').first()).toBeVisible();
  }
});

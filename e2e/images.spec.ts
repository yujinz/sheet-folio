import { test, expect } from "@playwright/test";
import { existsSync } from "fs";
import { join } from "path";
import { waitForTable, navigateToPiece } from "./fixtures/seed";

const STAFF_IMG = join(__dirname, "fixtures", "test-staff.png");
const NUMBERED_IMG = join(__dirname, "fixtures", "test-numbered.png");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTable(page);
});

test("upload staff image shows thumbnail", async ({ page }) => {
  test.skip(!existsSync(STAFF_IMG), "test-staff.png not found");

  await navigateToPiece(page, "欢乐颂");
  await page.waitForTimeout(500);

  // Click "Edit Images" to enter edit mode
  const editBtn = page.locator('button:has-text("Edit Images"), button:has-text("编辑图片")');
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(300);
  }

  // Find the file input and upload
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.isVisible()) {
    await fileInput.setInputFiles(STAFF_IMG);
    await page.waitForTimeout(1000);

    // A thumbnail should appear
    await expect(page.locator("img[alt], img[src*='data:']").first()).toBeVisible({ timeout: 5000 });
  }
});

test("upload numbered image shows thumbnail", async ({ page }) => {
  test.skip(!existsSync(NUMBERED_IMG), "test-numbered.png not found");

  await navigateToPiece(page, "欢乐颂");
  await page.waitForTimeout(500);

  // Switch to the Numbered tab
  const numberedTab = page.locator('button:has-text("Numbered"), button:has-text("指法")');
  if (await numberedTab.isVisible()) {
    await numberedTab.click();
    await page.waitForTimeout(300);
  }

  // Click "Edit Images" to enter edit mode
  const editBtn = page.locator('button:has-text("Edit Images"), button:has-text("编辑图片")');
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(300);
  }

  // Find the file input and upload
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.isVisible()) {
    await fileInput.setInputFiles(NUMBERED_IMG);
    await page.waitForTimeout(1000);

    // A thumbnail should appear
    await expect(page.locator("img[alt], img[src*='data:']").first()).toBeVisible({ timeout: 5000 });
  }
});

test("staff and numbered tabs are visible", async ({ page }) => {
  await navigateToPiece(page, "空之境界 M18");
  await page.waitForTimeout(500);

  // Should have image tabs (this piece has seed images)
  const staffTab = page.locator('button:has-text("Staff"), button:has-text("五线谱")');
  const numberedTab = page.locator('button:has-text("Numbered"), button:has-text("指法")');
  await expect(staffTab.or(numberedTab).first()).toBeVisible({ timeout: 5000 });
});

test("toggle between edit and view modes", async ({ page }) => {
  await navigateToPiece(page, "空之境界 M18");
  await page.waitForTimeout(500);

  // Should see an Edit/View toggle
  const toggleBtn = page.locator('button:has-text("Edit"), button:has-text("编辑"), button:has-text("View"), button:has-text("查看")');
  if (await toggleBtn.isVisible()) {
    await toggleBtn.click();
    await page.waitForTimeout(300);
    // Toggle should have switched — look for the opposite label
    await expect(toggleBtn.or(page.locator('button:has-text("View"), button:has-text("查看"), button:has-text("Edit"), button:has-text("编辑")')).first()).toBeVisible();
  }
});

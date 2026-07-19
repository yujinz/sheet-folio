import { test, expect } from "@playwright/test";
import { waitForTable } from "./fixtures/seed";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForTable(page);
});

// ─── Format Enharmonic Button ──────────────────────────────────────────

test("shows format enharmonic button when pitch has accidental", async ({ page }) => {
  // Enter edit-tags mode and open the pitch add-tag dialog
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  // Type a pitch with accidental (#C4)
  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  await nameInput.fill("#C4");
  await page.waitForTimeout(200);

  // Format button should be visible and not disabled
  const formatBtn = page.locator('button:has-text("Format enharmonic")');
  await expect(formatBtn).toBeVisible();
  await expect(formatBtn).not.toBeDisabled();

  // Should be in "active" state (highlighted)
  await expect(formatBtn).toHaveClass(/border-\[var\(--accent\)\]/);
});

test("does not show highlighted format button for natural pitch", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  await nameInput.fill("C4");
  await page.waitForTimeout(200);

  // Format button should be visible but greyed/disabled for natural note
  const formatBtn = page.locator('button:has-text("Format enharmonic")');
  await expect(formatBtn).toBeVisible();
  await expect(formatBtn).toBeDisabled();
});

test("format button converts to Unicode pair with sharp first", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  const nameAltInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').nth(1);

  // Type #C4 and format
  await nameInput.fill("#C4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Format enharmonic")').click();

  // Should produce ♯C4 ♭D4 (sharp first, flat second)
  await expect(nameInput).toHaveValue("♯C4 ♭D4");
  await expect(nameAltInput).toHaveValue("♯C4 ♭D4");
});

test("format converts flat input to sharp-first order", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();

  // Type bD4 (flat) and format — should still produce sharp first
  await nameInput.fill("bD4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Format enharmonic")').click();

  // Should be sharp first even though input was flat
  await expect(nameInput).toHaveValue("♯C4 ♭D4");
});

test("re-clicking format on already-formatted name does nothing", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();

  // Format once
  await nameInput.fill("#C4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Format enharmonic")').click();
  await page.waitForTimeout(100);
  await expect(nameInput).toHaveValue("♯C4 ♭D4");

  // Re-click format — value should not change (no "null" appended)
  await page.locator('button:has-text("Format enharmonic")').click();
  await page.waitForTimeout(100);
  await expect(nameInput).toHaveValue("♯C4 ♭D4");
});

test("format button shows normal state when already formatted", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();

  // Format first
  await nameInput.fill("#C4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Format enharmonic")').click();

  // After formatting, button should be in "done" state (normal, not highlighted, not disabled)
  const formatBtn = page.locator('button:has-text("Format enharmonic")');
  await expect(formatBtn).toBeVisible();
  await expect(formatBtn).not.toBeDisabled();
  await expect(formatBtn).not.toHaveClass(/border-\[var\(--accent\)\]/); // not highlighted
  await expect(formatBtn).not.toHaveClass(/opacity-40/); // not greyed
});

// ─── Assign Color Button ───────────────────────────────────────────────

test("assign color button highlights when pitch is detected", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  await nameInput.fill("C4");
  await page.waitForTimeout(200);

  // Assign color button should be highlighted (active)
  const colorBtn = page.locator('button:has-text("Assign color by pitch")');
  await expect(colorBtn).toBeVisible();
  await expect(colorBtn).not.toBeDisabled();
  await expect(colorBtn).toHaveClass(/border-\[var\(--accent\)\]/);
});

test("assign color button works on already-formatted pitch", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();

  // Format to ♯C4 ♭D4
  await nameInput.fill("#C4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Format enharmonic")').click();

  // Assign color button should still work (not greyed) for formatted name
  const colorBtn = page.locator('button:has-text("Assign color by pitch")');
  await expect(colorBtn).toBeVisible();
  await expect(colorBtn).not.toBeDisabled();
});

// ─── Accidental Sync ───────────────────────────────────────────────────

test("accidental button syncs to both name inputs", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();
  await page.locator('button[aria-label="新标签"]').first().click();

  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  const nameAltInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').nth(1);

  // Type base note in name, click ♯ accidental button
  await nameInput.fill("F4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("♯")').first().click();
  await page.waitForTimeout(200);

  // Both inputs should have ♯F4 (sync triggered by autoFillSourceRef)
  await expect(nameInput).toHaveValue("♯F4");
  await expect(nameAltInput).toHaveValue("♯F4");
});

// ─── Save and Display ──────────────────────────────────────────────────

test("formatted pitch tag saves and displays correctly", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();

  // Open create dialog, type pitch, format, and save
  await page.locator('button[aria-label="新标签"]').first().click();
  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  await nameInput.fill("#C4");
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Format enharmonic")').click();

  // Click save (dialog's "新标签" save button, not the aria-label button)
  await page.locator('[data-testid="create-dialog"] button:has-text("新标签")').click();
  await page.waitForTimeout(300);

  // Verify the formatted tag appears in the filter area
  const tagPill = page.locator('button:has-text("♯C4 ♭D4")');
  await expect(tagPill).toBeVisible();
});

// ─── Edit Dialog ───────────────────────────────────────────────────────

test("edit dialog shows format button for non-formatted pitch with accidental", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();

  // Create a pitch tag WITHOUT formatting
  await page.locator('button[aria-label="新标签"]').first().click();
  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  await nameInput.fill("#A4");
  await page.locator('[data-testid="create-dialog"] button:has-text("新标签")').click();
  await page.waitForTimeout(300);

  // Open edit dialog for the new tag
  const editBtn = page.locator('button[aria-label*="Edit #A4"]');
  await editBtn.click();
  await page.waitForTimeout(200);

  // Format button should appear in edit dialog
  const formatBtn = page.locator('[data-testid="create-dialog"] button:has-text("Format enharmonic")');
  await expect(formatBtn).toBeVisible();
  await expect(formatBtn).not.toBeDisabled();
});

test("edit dialog format button works", async ({ page }) => {
  await page.locator('button:has-text("编辑标签")').click();

  // Create a pitch tag without formatting
  await page.locator('button[aria-label="新标签"]').first().click();
  const nameInput = page.locator('[data-testid="create-dialog"] input:not([type="color"])').first();
  await nameInput.fill("#G4");
  await page.locator('[data-testid="create-dialog"] button:has-text("新标签")').click();
  await page.waitForTimeout(300);

  // Edit the tag and format it
  const editBtn = page.locator('button[aria-label*="Edit #G4"]');
  await editBtn.click();
  await page.waitForTimeout(200);

  await page.locator('[data-testid="create-dialog"] button:has-text("Format enharmonic")').click();

  // Save the edit
  await page.locator('[data-testid="create-dialog"] button:has-text("保存")').click();
  await page.waitForTimeout(300);

  // Should now display as formatted
  const tagPill = page.locator('button:has-text("♯G4 ♭A4")');
  await expect(tagPill).toBeVisible();
});

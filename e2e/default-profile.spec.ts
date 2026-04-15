import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for the built-in `Default` profile.
 *
 * Covers:
 *  - On a fresh load (no stored config), Default is auto-seeded and selected.
 *  - In the profile-selector dropdown, Default has a Lock icon (no Trash).
 *  - In the Profiles settings panel, Rename + Delete buttons are hidden for
 *    the reserved Default row.
 *  - Default reappears after a hard reload — it is genuinely permanent.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function clearGridStorage(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('GridCustomizerDB');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) =>
        k.startsWith('gc-state:') ||
        k.startsWith('gc-grid:') ||
        k.startsWith('gc-active-profile:') ||
        k.startsWith('gc-filters:') ||
        k.startsWith('gc-profile:') ||
        k === 'gc-defaults',
      )
      .forEach((k) => localStorage.removeItem(k));
  });
}

/** ProfileSelector trigger — the button inside `.gc-profile-badge` */
function profileSelectorTrigger(page: Page) {
  return page.locator('.gc-profile-badge button').first();
}

async function openProfileSelector(page: Page) {
  await profileSelectorTrigger(page).click();
  await page.waitForTimeout(200);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.waitForTimeout(300);
}

async function openProfilesTab(page: Page) {
  await page.getByRole('button', { name: /^Profiles$/ }).first().click();
  await page.waitForTimeout(200);
}

async function saveProfile(page: Page, name: string) {
  const input = page.locator('input[placeholder="Profile name..."]');
  await input.fill(name);
  await input.locator('xpath=following-sibling::button').first().click();
  await page.waitForTimeout(500);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Default profile — built-in, permanent, auto-selected', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await clearGridStorage(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('Default profile is auto-selected on a fresh grid load', async ({ page }) => {
    // The header trigger should display "Default" as the active profile name.
    await expect(profileSelectorTrigger(page)).toContainText('Default');
  });

  test('Default appears in the profile-selector dropdown with a Lock (not Trash)', async ({ page }) => {
    await openProfileSelector(page);

    // The list contains a row whose label is "Default".
    const defaultRow = page.locator('[role="button"]', { hasText: /^Default$/ }).first();
    await expect(defaultRow).toBeVisible();

    // Lock icon present on the Default row, no Trash button.
    const lock = defaultRow.locator('[title*="cannot be deleted"]');
    await expect(lock).toBeVisible();
    const trash = defaultRow.locator('button[title="Delete profile"]');
    await expect(trash).toHaveCount(0);
  });

  test('user-created profile rows still show a Trash (delete remains for non-reserved)', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);
    await saveProfile(page, 'Mine');

    // Close settings sheet so the header dropdown is reachable.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await openProfileSelector(page);
    const mineRow = page.locator('[role="button"]', { hasText: /^Mine$/ }).first();
    await expect(mineRow.locator('button[title="Delete profile"]')).toBeVisible();
    // And no lock — only Default has one.
    await expect(mineRow.locator('[title*="cannot be deleted"]')).toHaveCount(0);
  });

  test('Profiles settings panel hides Rename + Delete for the reserved Default row', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);

    // The Default row in the panel.
    const defaultPanelRow = page.locator('.gc-profile-item[data-reserved="true"]');
    await expect(defaultPanelRow).toHaveCount(1);

    // Rename + Delete buttons are NOT present on the reserved row.
    await expect(defaultPanelRow.locator('button[title="Rename"]')).toHaveCount(0);
    await expect(defaultPanelRow.locator('button[title="Delete"]')).toHaveCount(0);

    // The Star (set/unset default) and Download (export) buttons remain — Default
    // is still exportable and can be marked as the user-default.
    await expect(defaultPanelRow.locator('button[title="Export JSON"]')).toBeVisible();
  });

  test('Default profile survives a full reload (auto-re-seed is idempotent)', async ({ page }) => {
    await expect(profileSelectorTrigger(page)).toContainText('Default');

    // Open the dropdown BEFORE the reload to count Default rows in the list.
    await openProfileSelector(page);
    const beforeCount = await page.locator('[role="button"]').filter({ hasText: /^Default$/ }).count();
    expect(beforeCount).toBe(1);
    // Close the dropdown so it doesn't interfere with the reload.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.reload();
    await waitForGrid(page);

    await expect(profileSelectorTrigger(page)).toContainText('Default');
    await openProfileSelector(page);
    const afterCount = await page.locator('[role="button"]').filter({ hasText: /^Default$/ }).count();
    // Same number of "Default"-labelled rows as before — no duplicate seeding.
    expect(afterCount).toBe(beforeCount);
  });

  test('after deleting a user profile, selector falls back to Default', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);
    await saveProfile(page, 'Disposable');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // After save, the active profile is "Disposable".
    await expect(profileSelectorTrigger(page)).toContainText('Disposable');

    // Delete it from the header dropdown.
    await openProfileSelector(page);
    const row = page.locator('[role="button"]', { hasText: /^Disposable$/ }).first();
    page.once('dialog', (d) => d.accept()); // window.confirm
    await row.locator('button[title="Delete profile"]').click();
    await page.waitForTimeout(500);

    // Selector now reflects Default.
    await expect(profileSelectorTrigger(page)).toContainText('Default');
  });
});

import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for multi-profile support.
 * Covers: panel wiring, save, switch, set-default, delete, export/import.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function clearIndexedDb(page: Page) {
  await page.evaluate(async () => {
    const names = ['GridCustomizerDB'];
    for (const name of names) {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }
    Object.keys(localStorage)
      .filter((k) =>
        k.startsWith('gc-state:') ||
        k.startsWith('gc-grid:') ||
        k.startsWith('gc-active-profile:') ||
        // Legacy keys (pre per-grid-config refactor) — drop too if present
        k.startsWith('gc-profile:') ||
        k === 'gc-defaults'
      )
      .forEach((k) => localStorage.removeItem(k));
  });
}

async function openSettings(page: Page) {
  // Settings button contains "⚙ Settings"
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.waitForTimeout(300);
}

async function openProfilesTab(page: Page) {
  // Click the "Profiles" nav item in the settings sheet
  await page.getByRole('button', { name: /^Profiles$/ }).first().click();
  await page.waitForTimeout(200);
}

async function saveProfile(page: Page, name: string) {
  const input = page.locator('input[placeholder="Profile name..."]');
  await input.fill(name);
  // The Save button sits next to the input inside the Save Current State section
  await input.locator('xpath=following-sibling::button').first().click();
  await page.waitForTimeout(500);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Multi-Profile UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await clearIndexedDb(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('Profiles panel is wired up (no "not configured" empty state)', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);

    await expect(page.getByText(/not configured/i)).toHaveCount(0);
    await expect(page.getByText(/Save Current State/i)).toBeVisible();
    // The built-in Default profile is now auto-seeded — the panel is never
    // truly empty. We assert the Default row is visible instead.
    await expect(page.locator('.gc-profile-item[data-reserved="true"]')).toHaveCount(1);
  });

  test('saves a user profile alongside the built-in Default', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);

    await saveProfile(page, 'My Profile');

    // Default + My Profile = 2 rows.
    await expect(page.locator('.gc-profile-item')).toHaveCount(2);
    await expect(page.locator('.gc-profile-item').filter({ hasText: 'My Profile' })).toHaveCount(1);
    await expect(page.getByText(/Saved Profiles \(2\)/i)).toBeVisible();
  });

  test('saves two user profiles and switches between them (Default still listed)', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);

    await saveProfile(page, 'Alpha');
    await saveProfile(page, 'Beta');

    // Default + Alpha + Beta = 3 rows.
    await expect(page.locator('.gc-profile-item')).toHaveCount(3);

    // Beta is the most-recently-saved → active.
    const beta = page.locator('.gc-profile-item').filter({ hasText: 'Beta' });
    const alpha = page.locator('.gc-profile-item').filter({ hasText: 'Alpha' });
    await expect(beta).toHaveAttribute('data-active', 'true');

    // Click Alpha → it becomes active.
    await alpha.click();
    await page.waitForTimeout(300);
    await expect(alpha).toHaveAttribute('data-active', 'true');
    await expect(beta).toHaveAttribute('data-active', 'false');

    // Badge reflects active profile.
    await expect(page.locator('.gc-profile-badge')).toContainText('Alpha');
  });

  test('sets a default profile and shows the DEFAULT pill (on a user profile)', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);

    await saveProfile(page, 'Default Candidate');

    const item = page.locator('.gc-profile-item').filter({ hasText: 'Default Candidate' });
    await item.locator('button[title="Set as default"]').click();
    await page.waitForTimeout(300);

    await expect(item).toContainText('DEFAULT');
  });

  test('deletes a user profile (Default cannot be deleted and remains)', async ({ page }) => {
    await openSettings(page);
    await openProfilesTab(page);

    await saveProfile(page, 'Disposable');
    // Default + Disposable
    await expect(page.locator('.gc-profile-item')).toHaveCount(2);

    // Delete the user profile — note the selector targets non-reserved rows
    // since the reserved Default row has no Delete button at all.
    await page
      .locator('.gc-profile-item:not([data-reserved="true"]) button[title="Delete"]')
      .first()
      .click();
    await page.waitForTimeout(400);

    // Default is the only one left.
    await expect(page.locator('.gc-profile-item')).toHaveCount(1);
    await expect(page.locator('.gc-profile-item[data-reserved="true"]')).toHaveCount(1);
  });

  test('active profile badge always reflects the current profile (Default by default)', async ({ page }) => {
    // After clear+reload Default is auto-selected → badge is present from the start.
    await expect(page.locator('.gc-profile-badge')).toContainText('Default');

    await openSettings(page);
    await openProfilesTab(page);
    await saveProfile(page, 'Badgy');

    await expect(page.locator('.gc-profile-badge')).toContainText('Badgy');
  });
});

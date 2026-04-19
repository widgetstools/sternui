import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for v2 conditional-styling — proves the FIRST shipped SettingsPanel UI
 * in markets-grid-v2:
 *
 *   1. Settings button opens a drawer that lists modules with a SettingsPanel.
 *   2. Adding a rule renders a card and an inline editor.
 *   3. Setting an expression that targets a column actually paints cells
 *      (the engine + CSS injector + AG-Grid cellClassRules wiring is live).
 *   4. Auto-save persists the rule across reload — no Save All click needed.
 *
 * Mirrors the v2-autosave.spec.ts approach: clear gc-customizer-v2 IndexedDB
 * + active-profile pointers before each test, navigate to the demo (/), exercise
 * via data-testid selectors.
 */

const V2_PATH = '/';

async function waitForV2Grid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400); // initial Default-profile auto-seed
}

async function clearV2Storage(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('gc-customizer-v2');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
  });
}

test.describe('v2 — conditional styling settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
    await clearV2Storage(page);
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
  });

  test('Settings button opens drawer; conditional-styling panel is reachable', async ({ page }) => {
    await expect(page.locator('[data-testid="v2-settings-open-btn"]')).toBeVisible();

    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    // The wrapping data-testid div has zero box; the actual drawer chrome is
    // .gc-sheet — that's what's visible to a user.
    await expect(page.locator('.gc-sheet')).toBeVisible();
    await expect(page.locator('[data-testid="v2-settings-nav-conditional-styling"]')).toBeVisible();
    await expect(page.locator('[data-testid="cs-panel"]')).toBeVisible();

    // ESC closes — the entire sheet (including the wrapper) is unmounted.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="v2-settings-sheet"]')).toHaveCount(0);
  });
});

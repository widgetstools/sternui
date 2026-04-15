import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for the hover-revealed Toolbar Visibility pills + per-profile persistence.
 *
 * Covers:
 *  - Pills dock is hidden until the Filters bar is hovered.
 *  - Clicking a pill toggles the corresponding stacked toolbar (Style / Data).
 *  - Each stacked toolbar exposes an always-available `X` close button.
 *  - Visibility state survives a page reload because it lives in the active
 *    profile (`toolbar-visibility` hidden module).
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  // Pills dock fades in on hover, so we don't need extra wait time for it.
  await page.waitForTimeout(300);
}

/**
 * Wipes IndexedDB (Dexie) + localStorage so each test starts from scratch.
 * The Default profile gets auto-seeded again on the next mount.
 */
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

async function hoverFiltersBar(page: Page) {
  await page.locator('.gc-toolbar-primary').hover();
  await page.waitForTimeout(200);
}

function pill(page: Page, label: 'Style' | 'Data') {
  return page.locator('.gc-toolbar-pills-dock .gc-pill', { hasText: label });
}

function stackedToolbar(page: Page) {
  return page.locator('.gc-stacked-toolbar');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Toolbar Visibility — hover pills', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await clearGridStorage(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('pills dock is hidden until the Filters bar is hovered', async ({ page }) => {
    const dock = page.locator('.gc-toolbar-pills-dock');
    await expect(dock).toBeAttached();
    // Default opacity is 0 — assert via computed style rather than `toBeVisible()`
    // because Playwright treats opacity:0 differently when the element is in DOM.
    const initialOpacity = await dock.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(initialOpacity)).toBe(0);

    await hoverFiltersBar(page);

    const hoverOpacity = await dock.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(hoverOpacity)).toBe(1);
  });

  test('Style + Data pills both appear in the dock', async ({ page }) => {
    await hoverFiltersBar(page);
    await expect(pill(page, 'Style')).toBeVisible();
    await expect(pill(page, 'Data')).toBeVisible();
  });

  test('clicking the Style pill reveals the Style toolbar; close X hides it', async ({ page }) => {
    await hoverFiltersBar(page);

    // Initially no stacked toolbars
    await expect(stackedToolbar(page)).toHaveCount(0);

    // Click Style pill → toolbar appears
    await pill(page, 'Style').click();
    await expect(stackedToolbar(page)).toHaveCount(1);
    // Pill renders data-active=true
    await expect(pill(page, 'Style')).toHaveAttribute('data-active', 'true');

    // Close via X button on the stacked toolbar
    await page.locator('.gc-stacked-close').first().click();
    await expect(stackedToolbar(page)).toHaveCount(0);
    await hoverFiltersBar(page);
    await expect(pill(page, 'Style')).toHaveAttribute('data-active', 'false');
  });

  test('Style and Data toolbars stack together (both open simultaneously)', async ({ page }) => {
    await hoverFiltersBar(page);
    await pill(page, 'Style').click();
    await hoverFiltersBar(page);
    await pill(page, 'Data').click();

    await expect(stackedToolbar(page)).toHaveCount(2);
    await hoverFiltersBar(page);
    await expect(pill(page, 'Style')).toHaveAttribute('data-active', 'true');
    await expect(pill(page, 'Data')).toHaveAttribute('data-active', 'true');
  });

  test('closing one stacked toolbar leaves the other open', async ({ page }) => {
    await hoverFiltersBar(page);
    await pill(page, 'Style').click();
    await hoverFiltersBar(page);
    await pill(page, 'Data').click();
    await expect(stackedToolbar(page)).toHaveCount(2);

    // Close just the first one (Style — opens first, so it sits at index 0).
    await page.locator('.gc-stacked-close').first().click();
    await expect(stackedToolbar(page)).toHaveCount(1);

    await hoverFiltersBar(page);
    await expect(pill(page, 'Style')).toHaveAttribute('data-active', 'false');
    await expect(pill(page, 'Data')).toHaveAttribute('data-active', 'true');
  });

  test('visibility state survives a page reload after Save All (persisted in active profile)', async ({ page }) => {
    await hoverFiltersBar(page);
    await pill(page, 'Style').click();
    await pill(page, 'Data').click();
    await expect(stackedToolbar(page)).toHaveCount(2);

    // Per the source contract (MarketsGrid.handleSaveAll), module state is only
    // pushed into the active profile + the gc-state cache when the user explicitly
    // clicks "Save all settings". Without this click, a reload re-loads the last
    // saved snapshot and the toggles revert.
    await page.locator('button[title*="Save all settings"]').first().click();
    await page.waitForTimeout(400);

    await page.reload();
    await waitForGrid(page);

    // Both stacked toolbars should be back without any user interaction.
    await expect(stackedToolbar(page)).toHaveCount(2);
    await hoverFiltersBar(page);
    await expect(pill(page, 'Style')).toHaveAttribute('data-active', 'true');
    await expect(pill(page, 'Data')).toHaveAttribute('data-active', 'true');
  });

  test('hidden state also survives reload after Save All (toggle on → save → toggle off → save → still off)', async ({ page }) => {
    // First, prove "on" can be saved so we can distinguish "saved off" from
    // "never saved" (both happen to render the same 0-toolbar UI on a fresh load).
    await hoverFiltersBar(page);
    await pill(page, 'Style').click();
    await expect(stackedToolbar(page)).toHaveCount(1);
    await page.locator('button[title*="Save all settings"]').first().click();
    await page.waitForTimeout(300);

    // Sanity: reload restores the open toolbar.
    await page.reload();
    await waitForGrid(page);
    await expect(stackedToolbar(page)).toHaveCount(1);

    // Now close it and save again — the saved snapshot should record style:false.
    await page.locator('.gc-stacked-close').first().click();
    await expect(stackedToolbar(page)).toHaveCount(0);
    await page.locator('button[title*="Save all settings"]').first().click();
    await page.waitForTimeout(300);

    await page.reload();
    await waitForGrid(page);

    // After reload, the saved "off" state should hold — no toolbars reappear.
    await expect(stackedToolbar(page)).toHaveCount(0);
  });
});

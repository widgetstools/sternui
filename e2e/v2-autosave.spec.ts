import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for @grid-customizer/markets-grid-v2 — proves the auto-save contract
 * that makes the manual `Save all settings` click obsolete.
 *
 * These tests target the v2 demo mount (the demo (/)) which uses:
 *  - `@grid-customizer/core-v2`'s `useProfileManager` with a 300ms debounced
 *    auto-save subscriber on the Zustand store.
 *  - IndexedDB database `gc-customizer-v2` (distinct from v1's
 *    `GridCustomizerDB`), keyed by gridId `demo-blotter-v2`.
 *  - `ProfileSelector` wired to `core.persistAll()` via `profiles.saveActiveProfile()`.
 *
 * Scope of what's proven here:
 *  - Default profile is auto-seeded on first mount (reserved id `__default__`).
 *  - A user-created profile persists + becomes active without any Save click.
 *  - A captured saved-filter persists across reload within 500ms of capture
 *    (one auto-save debounce window + a generous flush buffer).
 *
 * What's NOT covered (deferred to v2.1 when the pill/stacked-toolbar UI
 * ports over): toolbar-visibility UI, Settings sheet, Profiles settings panel,
 * Style/Data stacked toolbars.
 */

const GRID_ID_V2 = 'demo-blotter-v2';
const V2_PATH = '/';

async function waitForV2Grid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  // Give useProfileManager's initial auto-seed of Default a beat.
  await page.waitForTimeout(400);
}

async function clearV2Storage(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('gc-customizer-v2');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    // Only the active-profile pointer for v2's gridId is written by v2 —
    // clear everything in the gc-active-profile:* namespace for safety.
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
  });
}

function profileTrigger(page: Page) {
  return page.locator('[data-testid="profile-selector-trigger"]');
}

async function openProfilePopover(page: Page) {
  await profileTrigger(page).click();
  await page.locator('[data-testid="profile-selector-popover"]').waitFor({ state: 'visible' });
}

async function createProfile(page: Page, name: string) {
  await openProfilePopover(page);
  await page.locator('[data-testid="profile-name-input"]').fill(name);
  await page.locator('[data-testid="profile-create-btn"]').click();
  // Popover closes on create; wait for the trigger to reflect the new name.
  await expect(profileTrigger(page)).toContainText(name);
}

async function setFilterModel(page: Page, model: Record<string, unknown>) {
  await page.evaluate((m) => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return;
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (root as any)[fiberKey];
    for (let i = 0; i < 80 && fiber; i++) {
      const candidates: any[] = [];
      if (fiber.stateNode?.api) candidates.push(fiber.stateNode.api);
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.api) candidates.push(s.memoizedState.api);
          if (s.memoizedState?.current?.api) candidates.push(s.memoizedState.current.api);
          s = s.next;
        }
      }
      for (const api of candidates) {
        if (api && typeof api.setFilterModel === 'function') {
          api.setFilterModel(m);
          return;
        }
      }
      fiber = fiber.return;
    }
  }, model);
  await page.waitForTimeout(300);
}

test.describe('v2 — auto-save (no Save All click needed)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
    await clearV2Storage(page);
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
  });

  test('Default profile is auto-seeded on first mount (reserved + Lock, not Trash)', async ({ page }) => {
    await expect(profileTrigger(page)).toContainText('Default');

    await openProfilePopover(page);
    // Reserved default row is present and carries the Lock icon (no delete btn).
    const defaultRow = page.locator('[data-testid="profile-row-__default__"]');
    await expect(defaultRow).toBeVisible();
    await expect(defaultRow.locator('button[title="Delete profile"]')).toHaveCount(0);
  });

  test('user-created profile persists across reload without clicking Save All', async ({ page }) => {
    await createProfile(page, 'Autosave-Test');

    // NO Save All click. Just wait past the 300ms debounce and reload.
    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    // Last-active profile is re-selected on mount. The profile persisted only
    // because auto-save fired — no explicit persistAll() was invoked.
    await expect(profileTrigger(page)).toContainText('Autosave-Test');

    await openProfilePopover(page);
    // Both Default and the user profile should be listed after reload.
    await expect(page.locator('[data-testid="profile-row-__default__"]')).toBeVisible();
    // Scope to the popover to avoid matching the trigger's own label span.
    const popover = page.locator('[data-testid="profile-selector-popover"]');
    await expect(popover.getByText('Autosave-Test', { exact: true })).toBeVisible();
  });

  test('captured filter pill auto-persists across reload (no Save All click)', async ({ page }) => {
    // Apply a filter so the FiltersToolbar capture button has something to capture.
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });

    // Click the capture button in the FiltersToolbar — same class name v1 uses.
    await page.locator('.gc-filters-add-btn').click();
    await expect(page.locator('.gc-filter-pill')).toHaveCount(1);

    // Wait one debounce window + flush margin, then reload — NO Save All click.
    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    // Pill survives purely because auto-save wrote to the Default profile.
    await expect(page.locator('.gc-filter-pill')).toHaveCount(1);
  });

  test('Save All button is still available as a visible-confirmation affordance', async ({ page }) => {
    const saveBtn = page.locator('[data-testid="save-all-btn"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    // Click should complete without error; flash state lives inside the button
    // but we don't need to assert the icon swap — just that the click succeeds.
    await page.waitForTimeout(700);
  });
});

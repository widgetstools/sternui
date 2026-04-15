import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for per-profile saved filters.
 *
 * Covers:
 *  - Saved filter pills capture into the active profile's `saved-filters` module.
 *  - Switching profiles swaps the visible pills AND re-applies the merged
 *    filter model to AG-Grid (filtered row count changes).
 *  - One-time legacy migration: pre-existing `localStorage[gc-filters:<gridId>]`
 *    is loaded into the Default profile on first mount and the legacy key is
 *    removed.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const GRID_ID = 'demo-blotter';
const LEGACY_KEY = `gc-filters:${GRID_ID}`;

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

/** Walk the React fiber tree to grab the AG-Grid api. Reused across specs. */
async function callGridApi(page: Page, fn: (api: any) => unknown) {
  return page.evaluate((fnSrc) => {
    const handler = new Function('api', `return (${fnSrc})(api)`) as (a: unknown) => unknown;
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return 'no-grid-root';
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return 'no-fiber';
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
        if (api && typeof (api as any).getDisplayedRowCount === 'function') {
          return handler(api);
        }
      }
      fiber = fiber.return;
    }
    return 'not-found';
  }, fn.toString());
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
  await page.waitForTimeout(400);
}

async function getFilterModel(page: Page): Promise<unknown> {
  return callGridApi(page, (api: any) => api.getFilterModel());
}

async function getDisplayedRowCount(page: Page): Promise<number> {
  const result = (await callGridApi(page, (api: any) => api.getDisplayedRowCount())) as number;
  return typeof result === 'number' ? result : -1;
}

function profileSelectorTrigger(page: Page) {
  return page.locator('.gc-profile-badge button').first();
}

async function selectProfile(page: Page, name: string) {
  await profileSelectorTrigger(page).click();
  await page.waitForTimeout(200);
  await page.locator('[role="button"]', { hasText: new RegExp(`^${name}$`) }).first().click();
  await page.waitForTimeout(500);
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

async function captureCurrentFilter(page: Page) {
  await page.locator('.gc-filters-add-btn').click();
  await page.waitForTimeout(400);
}

function pillCount(page: Page) {
  return page.locator('.gc-filter-pill').count();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Saved filters — per-profile persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await clearGridStorage(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('captured pills belong to the active profile only', async ({ page }) => {
    // Start under Default → capture a filter.
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);
    expect(await pillCount(page)).toBe(1);

    // Save a brand-new profile "B" — captures the current state which already
    // has 1 pill. (Save creates the profile but copies live state into it.)
    await openSettings(page);
    await openProfilesTab(page);
    await saveProfile(page, 'B');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Switch back to Default — its saved-filters state was seeded BEFORE the
    // pill was added, so the pill list should be empty under Default.
    await selectProfile(page, 'Default');
    expect(await pillCount(page)).toBe(0);

    // Switch back to B — pill is restored.
    await selectProfile(page, 'B');
    expect(await pillCount(page)).toBe(1);
  });

  test('switching profiles re-applies the merged filter model to AG-Grid', async ({ page }) => {
    // Under Default — record unfiltered row count.
    const unfilteredCount = await getDisplayedRowCount(page);
    expect(unfilteredCount).toBeGreaterThan(0);

    // Apply + capture a filter, then save as profile "Filtered".
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);
    const filteredCount = await getDisplayedRowCount(page);
    expect(filteredCount).toBeLessThan(unfilteredCount);

    await openSettings(page);
    await openProfilesTab(page);
    await saveProfile(page, 'Filtered');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Switching to Default must clear the filter model on the live grid
    // (Default has zero saved filters → applyActiveFilters → setFilterModel(null)).
    await selectProfile(page, 'Default');
    expect(await pillCount(page)).toBe(0);
    const defaultCount = await getDisplayedRowCount(page);
    expect(defaultCount).toBe(unfilteredCount);

    // Switching back to "Filtered" must reinstate the filter.
    await selectProfile(page, 'Filtered');
    expect(await pillCount(page)).toBe(1);
    const restored = await getDisplayedRowCount(page);
    expect(restored).toBe(filteredCount);
  });

  test('saved pills survive a full reload (per-profile state lives in IndexedDB)', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);
    expect(await pillCount(page)).toBe(1);

    await openSettings(page);
    await openProfilesTab(page);
    await saveProfile(page, 'Persistent');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await page.reload();
    await waitForGrid(page);

    // Active profile = Persistent (last-active is restored), pill comes back.
    await expect(profileSelectorTrigger(page)).toContainText('Persistent');
    expect(await pillCount(page)).toBe(1);
    // And the live grid's filter model matches.
    const fm = await getFilterModel(page);
    expect(fm).toEqual({ side: { filterType: 'set', values: ['BUY'] } });
  });

  test('legacy localStorage[gc-filters:<id>] is migrated on first mount and the key removed', async ({ page }) => {
    // Plant a legacy entry BEFORE the grid initializes its saved-filters state.
    // Reload, then check the pill appears and the legacy key is gone.
    await page.evaluate(({ key }) => {
      const legacyFilters = [
        {
          id: 'legacy_sf_1',
          label: 'Legacy BUY',
          filterModel: { side: { filterType: 'set', values: ['BUY'] } },
          active: true,
        },
      ];
      localStorage.setItem(key, JSON.stringify(legacyFilters));
    }, { key: LEGACY_KEY });

    await page.reload();
    await waitForGrid(page);
    // Migration runs in a useEffect — give it a beat.
    await page.waitForTimeout(500);

    // Pill from the legacy entry should now be visible.
    expect(await pillCount(page)).toBe(1);
    const pillText = await page.locator('.gc-filter-pill').first().textContent();
    expect(pillText).toContain('Legacy BUY');

    // And the legacy key MUST be cleared.
    const remaining = await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY);
    expect(remaining).toBeNull();

    // Persist the migrated state into the active profile via Save All — without
    // this click, module state lives only in the in-memory store and the next
    // reload re-applies the (empty) saved snapshot. This matches the source's
    // explicit-save contract (MarketsGrid.handleSaveAll).
    await page.locator('button[title*="Save all settings"]').first().click();
    await page.waitForTimeout(400);

    // Reloading a second time MUST NOT re-migrate (no doubling, no errors) —
    // and the saved pill must come back from the profile snapshot, not the
    // (now-deleted) legacy key.
    await page.reload();
    await waitForGrid(page);
    await page.waitForTimeout(300);
    expect(await pillCount(page)).toBe(1);
    const stillGone = await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY);
    expect(stillGone).toBeNull();
  });

  test('removing the only saved filter clears the live grid filter model', async ({ page }) => {
    const unfilteredCount = await getDisplayedRowCount(page);
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);
    expect(await pillCount(page)).toBe(1);
    expect(await getDisplayedRowCount(page)).toBeLessThan(unfilteredCount);

    // Hover and click the trash icon to remove the pill.
    const pill = page.locator('.gc-filter-pill').first();
    await pill.hover();
    await pill.locator('button[title="Remove"]').click();
    await page.waitForTimeout(400);

    expect(await pillCount(page)).toBe(0);
    // The unified `useEffect(() => applyActiveFilters(filters), [filters])`
    // should have pushed `setFilterModel(null)` after the array became empty.
    expect(await getDisplayedRowCount(page)).toBe(unfilteredCount);
  });
});

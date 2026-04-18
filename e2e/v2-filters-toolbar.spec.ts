import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the v2 FiltersToolbar (/ demo mount).
 *
 * Mirrors the v1 `filters-toolbar.spec.ts` test surface for the features that
 * were intentionally preserved across the port:
 *  - empty state, capture, toggle, AND/OR composition, hover icons,
 *    rename, remove, auto-save persistence (Dexie, no Save All click), and
 *    scroll-overflow chrome.
 *
 * Intentionally OMITTED vs v1 (deliberate cuts in v2):
 *  - row-count badges on pills (would re-couple v2 to rowData)
 *  - localStorage-key save assertions (`gc-filters:<gridId>` — v2 persists via
 *    profile snapshot in IndexedDB, no legacy keys are written)
 *  - toolbar-switcher dance — v2 renders FiltersToolbar inline, no pill click
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearV2Persistence(page: Page) {
  // v2 persists in IndexedDB via DexieAdapter. Wipe the gc-customizer-v2 db
  // and the active-profile pointer so each test starts from a clean slate.
  await page.evaluate(async () => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('gc-active-profile:') || k.startsWith('gc-state:') || k.startsWith('gc-grid:'))
      .forEach(k => localStorage.removeItem(k));
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('gc-customizer-v2');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

function filterPills(page: Page) {
  return page.locator('[data-testid^="filter-pill-"]');
}

function filterToggleBtn(page: Page, index: number) {
  return filterPills(page).nth(index).locator('.gc-filter-pill-btn');
}

async function getFilterPillCount(page: Page): Promise<number> {
  return filterPills(page).count();
}

async function clickAddFilter(page: Page) {
  await page.locator('.gc-filters-add-btn').click();
  await page.waitForTimeout(400);
}

async function getDisplayedRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Prefer the AG-Grid api (returns the total filtered count, not just the
    // virtualised viewport count). Walk the React fiber tree to find it.
    const gridRoot = document.querySelector('.ag-root-wrapper');
    if (!gridRoot) return -1;
    const fiberKey = Object.keys(gridRoot).find(k => k.startsWith('__reactFiber'));
    if (fiberKey) {
      let fiber = (gridRoot as never)[fiberKey];
      for (let i = 0; i < 80 && fiber; i++) {
        if (fiber.stateNode?.api?.getDisplayedRowCount) {
          return fiber.stateNode.api.getDisplayedRowCount();
        }
        if (fiber.memoizedState) {
          let state = fiber.memoizedState;
          while (state) {
            const ms = state.memoizedState;
            if (ms?.api?.getDisplayedRowCount) return ms.api.getDisplayedRowCount();
            if (ms?.current?.api?.getDisplayedRowCount) return ms.current.api.getDisplayedRowCount();
            state = state.next;
          }
        }
        fiber = fiber.return;
      }
    }
    // Fallback: parse status bar.
    const statusText = document.querySelector('.ag-status-bar')?.textContent ?? '';
    const match = statusText.match(/(\d+)\s+of\s+(\d+)/);
    if (match) return parseInt(match[1], 10);
    return -1;
  });
}

/** Reach the AG-Grid api by walking the React fiber tree. Same idiom as v1 spec. */
async function setFilterViaApi(page: Page, filterModel: Record<string, unknown>) {
  await page.evaluate((model) => {
    const gridRoot = document.querySelector('.ag-root-wrapper');
    if (!gridRoot) return;
    const fiberKey = Object.keys(gridRoot).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (gridRoot as never)[fiberKey];
    for (let i = 0; i < 80 && fiber; i++) {
      if (fiber.stateNode?.api?.setFilterModel) {
        fiber.stateNode.api.setFilterModel(model);
        return;
      }
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          const ms = state.memoizedState;
          if (ms?.api?.setFilterModel) { ms.api.setFilterModel(model); return; }
          if (ms?.current?.api?.setFilterModel) { ms.current.api.setFilterModel(model); return; }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
  }, filterModel);
  await page.waitForTimeout(500);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('v2 FiltersToolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearV2Persistence(page);
    await page.goto('/');
    await waitForGrid(page);
    // Sanity: the filters toolbar is visible inline (no switcher in v2).
    await expect(page.locator('[data-testid="filters-toolbar"]')).toBeVisible();
  });

  test('shows empty toolbar with only + button', async ({ page }) => {
    await expect(page.locator('.gc-filters-add-btn')).toBeVisible();
    expect(await getFilterPillCount(page)).toBe(0);
    // No clear-all button with no pills
    await expect(page.locator('.gc-filters-clear-btn')).toHaveCount(0);
  });

  test('+ button does nothing when no grid filter is set', async ({ page }) => {
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(0);
  });

  test('captures current filter as pill', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(1);
    const text = await filterPills(page).first().textContent();
    expect(text).toBeTruthy();
  });

  test('toggle off removes filter from grid', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    const filteredCount = await getDisplayedRowCount(page);
    await clickAddFilter(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);
    const unfilteredCount = await getDisplayedRowCount(page);
    expect(unfilteredCount).toBeGreaterThan(filteredCount);
  });

  test('toggle on re-applies filter', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    const filteredCount = await getDisplayedRowCount(page);
    await clickAddFilter(page);

    const btn = filterToggleBtn(page, 0);
    await btn.click();
    await page.waitForTimeout(500);
    expect(await getDisplayedRowCount(page)).toBeGreaterThan(filteredCount);

    await btn.click();
    await page.waitForTimeout(500);
    expect(await getDisplayedRowCount(page)).toBeLessThanOrEqual(filteredCount + 1);
  });

  test('multiple filters compose with AND across columns', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    const buyOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);

    await setFilterViaApi(page, { venue: { filterType: 'set', values: ['NYSE'] } });
    await clickAddFilter(page);
    const venueOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click(); // BUY back on
    await page.waitForTimeout(500);
    const both = await getDisplayedRowCount(page);
    expect(both).toBeLessThanOrEqual(Math.min(buyOnly, venueOnly));
  });

  test('same-column set filters merge values with OR', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    const buyOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);

    await setFilterViaApi(page, { side: { filterType: 'set', values: ['SELL'] } });
    await clickAddFilter(page);
    const sellOnly = await getDisplayedRowCount(page);

    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(500);
    const both = await getDisplayedRowCount(page);
    expect(both).toBeGreaterThanOrEqual(Math.max(buyOnly, sellOnly));
  });

  test('hover reveals rename + remove icons', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);

    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);
    await expect(pill.locator('button[title="Rename"]')).toBeVisible();
    await expect(pill.locator('button[title="Remove"]')).toBeVisible();
  });

  test('rename updates label', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);

    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);
    await pill.locator('button[title="Rename"]').click();
    await page.waitForTimeout(300);

    const input = page.locator('.gc-filter-rename-input');
    await expect(input).toBeVisible();
    await input.fill('My BUY Filter');
    await input.press('Enter');
    await page.waitForTimeout(300);

    const text = await filterPills(page).first().textContent();
    expect(text).toContain('My BUY Filter');
  });

  test('remove deletes pill', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(1);

    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);
    await pill.locator('button[title="Remove"]').click();
    await page.waitForTimeout(300);
    expect(await getFilterPillCount(page)).toBe(0);
  });

  test('clear-all deactivates every pill (does not delete them)', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(300);

    await setFilterViaApi(page, { venue: { filterType: 'set', values: ['NYSE'] } });
    await clickAddFilter(page);
    await filterToggleBtn(page, 0).click();
    await page.waitForTimeout(300);

    expect(await getFilterPillCount(page)).toBe(2);
    await page.locator('.gc-filters-clear-btn').click();
    await page.waitForTimeout(300);
    // Pills still present, but all data-active=false
    expect(await getFilterPillCount(page)).toBe(2);
    const activeStates = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="filter-pill-"]'))
        .map(el => el.getAttribute('data-active')));
    expect(activeStates.every(s => s === 'false')).toBe(true);
  });

  test('saved filters auto-persist across reload (no Save All click)', async ({ page }) => {
    await setFilterViaApi(page, { side: { filterType: 'set', values: ['BUY'] } });
    await clickAddFilter(page);
    expect(await getFilterPillCount(page)).toBe(1);

    // Wait past the auto-save debounce window before reload.
    await page.waitForTimeout(800);
    await page.reload();
    await waitForGrid(page);
    await expect(page.locator('[data-testid="filters-toolbar"]')).toBeVisible();
    expect(await getFilterPillCount(page)).toBe(1);
  });

  test('scroll caret-right appears when pills overflow', async ({ page }) => {
    // Resize the viewport down so a small number of pills suffice to overflow
    // the scroll-area regardless of how the toolbar splits its width with the
    // profile selector / save / settings buttons.
    await page.setViewportSize({ width: 720, height: 600 });
    await page.waitForTimeout(300);

    // Capture pills with long labels (multi-key filter models so generateLabel
    // produces "col1 + col2" / "col1 + N more" — wider than single-value pills).
    const cases = [
      { side: { filterType: 'set', values: ['BUY'] }, venue: { filterType: 'set', values: ['NYSE'] } },
      { side: { filterType: 'set', values: ['SELL'] }, venue: { filterType: 'set', values: ['NASDAQ'] } },
      { security: { filterType: 'text', type: 'contains', filter: 'AAPL US Equity Common Stock' } },
      { security: { filterType: 'text', type: 'contains', filter: 'MSFT US Equity Common Stock' } },
      { trader: { filterType: 'set', values: ['Alice Johnson Senior Trader'] } },
      { trader: { filterType: 'set', values: ['Bob Williams Junior Trader'] } },
      { account: { filterType: 'set', values: ['ACCT-PRINCIPAL-001-LARGE-LABEL'] } },
      { counterparty: { filterType: 'set', values: ['VERY-LONG-COUNTERPARTY-NAME-FOR-OVERFLOW'] } },
    ];
    for (const model of cases) {
      await setFilterViaApi(page, model);
      await clickAddFilter(page);
      const idx = (await getFilterPillCount(page)) - 1;
      if (idx >= 0) {
        await filterToggleBtn(page, idx).click();
      }
      await page.waitForTimeout(150);
    }
    expect(await getFilterPillCount(page)).toBe(cases.length);

    // Wait for ResizeObserver / state update to commit.
    await page.waitForFunction(() => {
      const s = document.querySelector('.gc-filter-scroll') as HTMLElement | null;
      return !!s && s.scrollWidth > s.clientWidth + 2;
    }, { timeout: 8000 });

    // Pills are appended at the right edge so the scroll-area auto-scrolls to
    // the end during capture — that means caret-LEFT is initially visible
    // (we have scrolled past 2px) and caret-RIGHT is hidden (nothing more
    // to scroll to). Reset to the leftmost position before asserting.
    await page.evaluate(() => {
      const s = document.querySelector('.gc-filter-scroll') as HTMLElement | null;
      if (s) s.scrollLeft = 0;
    });
    await page.waitForTimeout(200);

    const caretRight = page.locator('[data-testid="filters-caret-right"]');
    await expect(caretRight).toBeVisible();
    await expect(page.locator('[data-testid="filters-caret-left"]')).toHaveCount(0);

    // Click the right caret repeatedly — left caret should appear.
    for (let i = 0; i < 5; i++) {
      await caretRight.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('[data-testid="filters-caret-left"]')).toBeVisible();
  });
});

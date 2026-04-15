import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the Filters Toolbar feature.
 * Tests: empty state, capture, toggle on/off, AND logic, hover icons,
 * rename, remove, save/persist.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearPersistedState(page: Page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('gc-state:') || k.startsWith('gc-filters:'))
      .forEach(k => localStorage.removeItem(k));
  });
}

async function switchToFilters(page: Page) {
  // Open the toolbar switcher dropdown and select Filters
  const trigger = page.locator('.gc-switcher-trigger');
  await trigger.click();
  await page.waitForTimeout(200);
  const filtersItem = page.locator('.gc-switcher-item:nth-child(2)');
  await filtersItem.click();
  await page.waitForTimeout(400);
}

/** Locator for filter pill containers */
function filterPills(page: Page) {
  return page.locator('.gc-filter-pill');
}

/** The clickable toggle button inside a pill */
function filterToggleBtn(page: Page, index: number) {
  return filterPills(page).nth(index).locator('.gc-filter-pill-btn');
}

async function getFilterPillCount(page: Page): Promise<number> {
  return filterPills(page).count();
}

async function clickAddFilter(page: Page) {
  // The + button in the filters actions area
  const addBtn = page.locator('.gc-filters-add-btn');
  await addBtn.click();
  await page.waitForTimeout(400);
}

async function getDisplayedRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Use the status bar text which shows "X of Y" filtered count
    const statusText = document.querySelector('.ag-status-bar')?.textContent ?? '';
    const match = statusText.match(/(\d+)\s+of\s+(\d+)/);
    if (match) return parseInt(match[1], 10);

    // Fallback: walk React fiber to find grid API
    const gridRoot = document.querySelector('.ag-root-wrapper');
    if (!gridRoot) return -1;
    const fiberKey = Object.keys(gridRoot).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return -1;
    let fiber = (gridRoot as any)[fiberKey];
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
    return -1;
  });
}

/**
 * Set filter model on the AG-Grid instance by walking the React fiber tree.
 */
async function setFilterViaApi(page: Page, filterModel: Record<string, any>) {
  const result = await page.evaluate((model) => {
    const gridRoot = document.querySelector('.ag-root-wrapper');
    if (!gridRoot) return 'no-grid-root';

    // Walk React fiber to find the grid API
    const fiberKey = Object.keys(gridRoot).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return 'no-fiber';

    let fiber = (gridRoot as any)[fiberKey];
    for (let i = 0; i < 80 && fiber; i++) {
      // Check stateNode for class components (AgGridReact)
      if (fiber.stateNode && fiber.stateNode.api && typeof fiber.stateNode.api.setFilterModel === 'function') {
        fiber.stateNode.api.setFilterModel(model);
        return 'ok-stateNode';
      }
      // Check memoizedState chain for hooks
      if (fiber.memoizedState) {
        let state = fiber.memoizedState;
        while (state) {
          const ms = state.memoizedState;
          if (ms && ms.api && typeof ms.api.setFilterModel === 'function') {
            ms.api.setFilterModel(model);
            return 'ok-memoizedState';
          }
          // Check queue-based refs
          if (ms && ms.current && ms.current.api && typeof ms.current.api.setFilterModel === 'function') {
            ms.current.api.setFilterModel(model);
            return 'ok-ref';
          }
          state = state.next;
        }
      }
      fiber = fiber.return;
    }
    return 'not-found';
  }, filterModel);
  await page.waitForTimeout(500);
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Filters Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearPersistedState(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('shows empty toolbar with only + button', async ({ page }) => {
    await switchToFilters(page);

    // The + button should exist
    const addBtn = page.locator('.gc-filters-add-btn');
    await expect(addBtn).toBeVisible();

    // No filter pills should exist
    const count = await getFilterPillCount(page);
    expect(count).toBe(0);
  });

  test('+ button does nothing when no filters are set', async ({ page }) => {
    await switchToFilters(page);

    // Click + with no grid filters active
    await clickAddFilter(page);

    // Still no filter pills
    const count = await getFilterPillCount(page);
    expect(count).toBe(0);
  });

  test('captures current filter as toggle button', async ({ page }) => {
    // Set a filter on the grid programmatically
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });

    // Switch to Filters toolbar
    await switchToFilters(page);

    // Click + to capture
    await clickAddFilter(page);

    // Verify a pill appeared
    const count = await getFilterPillCount(page);
    expect(count).toBe(1);

    // Verify the pill has the filter icon and label text
    const pill = filterPills(page).first();
    await expect(pill).toBeVisible();
    const text = await pill.textContent();
    expect(text).toBeTruthy();
  });

  test('toggle off removes filter from grid', async ({ page }) => {
    // Set a filter
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });

    // Capture the filtered row count
    const filteredCount = await getDisplayedRowCount(page);

    // Switch to Filters and capture
    await switchToFilters(page);
    await clickAddFilter(page);

    // Toggle off by clicking the toggle button inside the pill
    const btn = filterToggleBtn(page, 0);
    await btn.click();
    await page.waitForTimeout(500);

    // Row count should increase (filter removed)
    const unfilteredCount = await getDisplayedRowCount(page);
    expect(unfilteredCount).toBeGreaterThan(filteredCount);
  });

  test('toggle on re-applies filter', async ({ page }) => {
    // Set a filter
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });

    const filteredCount = await getDisplayedRowCount(page);

    // Switch to Filters, capture, toggle off
    await switchToFilters(page);
    await clickAddFilter(page);

    const btn = filterToggleBtn(page, 0);
    await btn.click(); // toggle off
    await page.waitForTimeout(500);

    const unfilteredCount = await getDisplayedRowCount(page);
    expect(unfilteredCount).toBeGreaterThan(filteredCount);

    // Toggle on again
    await btn.click();
    await page.waitForTimeout(500);

    const reFilteredCount = await getDisplayedRowCount(page);
    expect(reFilteredCount).toBeLessThan(unfilteredCount);
  });

  test('multiple filters with AND logic', async ({ page }) => {
    // Set and capture first filter: side=BUY
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });
    await switchToFilters(page);
    await clickAddFilter(page);

    const buyOnlyCount = await getDisplayedRowCount(page);

    // Toggle off first filter before setting second
    const btn1 = filterToggleBtn(page, 0);
    await btn1.click();
    await page.waitForTimeout(500);

    // Set and capture second filter: a different column (e.g. venue)
    await setFilterViaApi(page, {
      venue: { filterType: 'set', values: ['NYSE'] },
    });
    await page.waitForTimeout(300);
    await clickAddFilter(page);

    const venueOnlyCount = await getDisplayedRowCount(page);

    // Now activate both — should be AND logic showing fewer rows
    await btn1.click(); // toggle BUY back on
    await page.waitForTimeout(500);

    const bothCount = await getDisplayedRowCount(page);
    // AND of two filters should show <= min(buy, venue) rows
    expect(bothCount).toBeLessThanOrEqual(Math.min(buyOnlyCount, venueOnlyCount));
  });

  test('same-column set filters merge values with OR', async ({ page }) => {
    // Capture filter for side=BUY
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });
    await switchToFilters(page);
    await clickAddFilter(page);

    const buyOnlyCount = await getDisplayedRowCount(page);
    expect(buyOnlyCount).toBeGreaterThan(0);

    // Toggle off first filter, set side=SELL, capture
    const btn1 = filterToggleBtn(page, 0);
    await btn1.click();
    await page.waitForTimeout(500);

    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['SELL'] },
    });
    await page.waitForTimeout(300);
    await clickAddFilter(page);

    const sellOnlyCount = await getDisplayedRowCount(page);
    expect(sellOnlyCount).toBeGreaterThan(0);

    // Activate both — same column should OR (union values: BUY + SELL)
    await btn1.click();
    await page.waitForTimeout(500);

    const bothCount = await getDisplayedRowCount(page);
    // OR of BUY + SELL should show MORE rows than either alone
    expect(bothCount).toBeGreaterThanOrEqual(Math.max(buyOnlyCount, sellOnlyCount));
  });

  test('hover shows edit and remove icons', async ({ page }) => {
    // Set a filter and capture
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });
    await switchToFilters(page);
    await clickAddFilter(page);

    // Hover over the pill
    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);

    // Edit (Rename) and Remove icons should be visible
    const renameBtn = pill.locator('button[title="Rename"]');
    const removeBtn = pill.locator('button[title="Remove"]');
    await expect(renameBtn).toBeVisible();
    await expect(removeBtn).toBeVisible();
  });

  test('rename updates label via hover icon', async ({ page }) => {
    // Set a filter and capture
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });
    await switchToFilters(page);
    await clickAddFilter(page);

    // Hover and click rename icon
    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);

    const renameBtn = pill.locator('button[title="Rename"]');
    await renameBtn.click();
    await page.waitForTimeout(300);

    // An input should appear
    const input = page.locator('.gc-filter-rename-input');
    await expect(input).toBeVisible();

    // Clear and type new name
    await input.fill('My BUY Filter');
    await input.press('Enter');
    await page.waitForTimeout(300);

    // Verify the pill now contains the new label text
    const updatedPill = filterPills(page).first();
    const text = await updatedPill.textContent();
    expect(text).toContain('My BUY Filter');
  });

  test('remove deletes pill via hover icon', async ({ page }) => {
    // Set a filter and capture
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });
    await switchToFilters(page);
    await clickAddFilter(page);

    expect(await getFilterPillCount(page)).toBe(1);

    // Hover and click remove icon
    const pill = filterPills(page).first();
    await pill.hover();
    await page.waitForTimeout(300);

    const removeBtn = pill.locator('button[title="Remove"]');
    await removeBtn.click();
    await page.waitForTimeout(300);

    // Pill should be gone
    expect(await getFilterPillCount(page)).toBe(0);
  });

  test('save persists across reload', async ({ page }) => {
    // Set a filter and capture
    await setFilterViaApi(page, {
      side: { filterType: 'set', values: ['BUY'] },
    });
    await switchToFilters(page);
    await clickAddFilter(page);

    expect(await getFilterPillCount(page)).toBe(1);

    // Click Save button (last icon btn in filters actions)
    const saveBtn = page.locator('.gc-filters-icon-btn').last();
    await saveBtn.click();
    await page.waitForTimeout(500);

    // Verify localStorage
    const hasSaved = await page.evaluate(() => {
      return localStorage.getItem('gc-filters:demo-blotter') !== null;
    });
    expect(hasSaved).toBe(true);

    // Reload and verify persistence
    await page.reload();
    await waitForGrid(page);
    await switchToFilters(page);

    expect(await getFilterPillCount(page)).toBe(1);
  });
});

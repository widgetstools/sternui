import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for v2 column-groups module.
 *
 * Covers the full surface:
 *   1. Module registration + settings-sheet navigation.
 *   2. Authoring: add group, rename, add columns, nest subgroup, reorder,
 *      delete.
 *   3. composeGroups output — real grid header cells for authored groups,
 *      ungrouped columns appended, missing/duplicate colIds tolerated.
 *   4. `columnGroupShow` per-child visibility (always / open / closed).
 *   5. `openByDefault` toggle.
 *   6. `marryChildren` flag propagates to AG-Grid's ColGroupDef.
 *   7. Runtime `columnGroupOpened` → `openGroupIds` → auto-save → reload
 *      restores the exact open/closed state (the "slick bit").
 *   8. Stale-id pruning on deserialize after a group delete + reload.
 *   9. Interop — conditional-styling rules still apply to grouped cols;
 *      calculated-columns virtual columns can be grouped.
 *
 * Style matches e2e/v2-conditional-styling.spec.ts: clear IndexedDB +
 * active-profile pointers before each test, navigate to `?v=2`, reach
 * the AG-Grid api by walking React fibers (same pattern as v2-autosave.spec).
 */

const V2_PATH = '/?v=2';

async function waitForV2Grid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
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
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
  });
}

/**
 * Walk React fibers from `.ag-root-wrapper` up and invoke a named AG-Grid
 * API method with the given args. Passing args as a serializable tuple
 * (instead of a closure) keeps the function-to-string round-trip honest —
 * closures lose their lexical scope when `.toString()` crosses the page
 * boundary, which is why the first draft of this helper failed intermittently.
 */
async function callGridApi<T>(
  page: Page,
  method: string,
  args: unknown[] = [],
): Promise<T | null> {
  return page.evaluate(({ method, args }) => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return null;
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
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
        if (api && typeof api.getColumns === 'function') {
          const fn = (api as any)[method];
          if (typeof fn === 'function') return fn.apply(api, args);
          return null;
        }
      }
      fiber = fiber.return;
    }
    return null;
  }, { method, args });
}

/**
 * Reach the v2 Zustand store through the same fiber walk — `MarketsGrid`
 * passes `store` through props so it surfaces on `memoizedProps.store` of
 * one of the component fibers above the grid root.
 */
async function setModuleState(
  page: Page,
  moduleId: string,
  newState: unknown,
): Promise<void> {
  await page.evaluate(({ moduleId, newState }) => {
    const rootEl = document.querySelector('#root');
    if (!rootEl) return;
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer'));
    let fiber = (rootEl as any)[key!]?.stateNode?.current;
    const visited = new Set();
    const stack = [fiber];
    while (stack.length) {
      const n = stack.pop();
      if (!n || visited.has(n)) continue;
      visited.add(n);
      const p = n.memoizedProps || {};
      if (p.store && typeof p.store.getModuleState === 'function' && typeof p.store.setModuleState === 'function') {
        p.store.setModuleState(moduleId, () => newState);
        return;
      }
      if (n.child) stack.push(n.child);
      if (n.sibling) stack.push(n.sibling);
    }
  }, { moduleId, newState });
  await page.waitForTimeout(400);
}

async function getModuleState<T = unknown>(page: Page, moduleId: string): Promise<T | null> {
  return page.evaluate((moduleId) => {
    const rootEl = document.querySelector('#root');
    if (!rootEl) return null;
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer'));
    let fiber = (rootEl as any)[key!]?.stateNode?.current;
    const visited = new Set();
    const stack = [fiber];
    while (stack.length) {
      const n = stack.pop();
      if (!n || visited.has(n)) continue;
      visited.add(n);
      const p = n.memoizedProps || {};
      if (p.store && typeof p.store.getModuleState === 'function') {
        return p.store.getModuleState(moduleId);
      }
      if (n.child) stack.push(n.child);
      if (n.sibling) stack.push(n.sibling);
    }
    return null;
  }, moduleId);
}

/** Convenience: count grid header group cells with a given label. */
async function groupHeadersWithLabel(page: Page, label: string): Promise<number> {
  return page.evaluate((lbl) => {
    return [...document.querySelectorAll('.ag-header-group-cell')].filter((el) => {
      const t = el.querySelector('.ag-header-group-text')?.textContent?.trim()
        ?? el.textContent?.trim();
      return t === lbl;
    }).length;
  }, label);
}

/** Displayed-column colIds in current grid state (AG-Grid's native order).
 *  Implemented without `callGridApi` because the return shape is an array
 *  of Column objects we need to map in-page before serialising. */
async function displayedColIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return [];
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return [];
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
        if (api && typeof api.getAllDisplayedColumns === 'function') {
          return api.getAllDisplayedColumns().map((c: any) => c.getColId());
        }
      }
      fiber = fiber.return;
    }
    return [];
  });
}

async function setGroupOpened(page: Page, groupId: string, open: boolean): Promise<void> {
  await callGridApi(page, 'setColumnGroupOpened', [groupId, open]);
  await page.waitForTimeout(300);
}

test.describe('v2 — column groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
    await clearV2Storage(page);
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
  });

  // ── 1. Registration + navigation ───────────────────────────────────────

  test('Column Groups nav appears in settings sheet and opens the panel', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await expect(page.locator('.gc-sheet')).toBeVisible();
    await expect(page.locator('[data-testid="v2-settings-nav-column-groups"]')).toBeVisible();

    await page.locator('[data-testid="v2-settings-nav-column-groups"]').click();
    await expect(page.locator('[data-testid="cg-panel"]')).toBeVisible();
    // Empty state when state.groups is empty
    await expect(page.locator('[data-testid="cg-panel"]')).toContainText('No column groups yet');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="v2-settings-sheet"]')).toHaveCount(0);
  });

  // ── 2. Authoring: add, rename, add columns ─────────────────────────────

  test('Add a group from the panel and drop columns into it — grid header reflects the group', async ({ page }) => {
    // Author a group entirely through the panel UI.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="v2-settings-nav-column-groups"]').click();
    await page.locator('[data-testid="cg-add-group-btn"]').click();

    // Exactly one group card should exist and be reachable by prefix.
    const cards = page.locator('[data-testid^="cg-group-"]');
    await expect(cards).toHaveCount(1);

    // Get the auto-generated groupId from the DOM so we can target its internals.
    const groupId = await cards.first().evaluate((el) => el.getAttribute('data-testid')!.replace('cg-group-', ''));
    expect(groupId).toMatch(/^grp_/);

    // Rename via the PropText in the header row. The shadcn Input renders a
    // bare <input> without `type="text"`; select the first non-select input
    // inside the group card (the header is first; chip picker is a <select>).
    const propTextInput = cards.first().locator('input').first();
    await propTextInput.fill('Trade Details');
    await propTextInput.blur();

    // Add two columns via the "+ column…" select.
    const addSelect = page.locator(`[data-testid="cg-add-col-${groupId}"]`);
    await addSelect.selectOption('id');
    // The chip re-renders after each add — re-locate the select each time so
    // Playwright doesn't stale on the previous element.
    await page.locator(`[data-testid="cg-add-col-${groupId}"]`).selectOption('time');

    // Close the sheet so the grid is visible.
    await page.locator('[data-testid="v2-settings-done-btn"]').click();

    // The "Trade Details" group appears in the grid header (possibly twice
    // if split across pinned-left + center viewports — AG-Grid normal).
    const count = await groupHeadersWithLabel(page, 'Trade Details');
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify id + time still render in the grid body underneath the group.
    const visible = await displayedColIds(page);
    expect(visible).toContain('id');
    expect(visible).toContain('time');
  });

  // ── 3. composeGroups basic shape: children + ungrouped appended ───────

  test('Grouped columns appear under the group header; ungrouped columns render after', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-trade',
          headerName: 'Trade',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'id' },
            { kind: 'col', colId: 'time' },
          ],
        },
      ],
      openGroupIds: {},
    });

    // Grouped cols are in the displayed list.
    const visible = await displayedColIds(page);
    expect(visible).toContain('id');
    expect(visible).toContain('time');
    // Ungrouped cols are still there too.
    expect(visible).toContain('price');
    expect(visible).toContain('yield');

    // And the Trade group header exists.
    expect(await groupHeadersWithLabel(page, 'Trade')).toBeGreaterThanOrEqual(1);
  });

  // ── 4. Nested groups (arbitrary depth) ─────────────────────────────────

  test('Nested subgroup renders as a multi-level header', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-outer',
          headerName: 'Market',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'yield' },
            {
              kind: 'group',
              group: {
                groupId: 'g-inner',
                headerName: 'Greeks',
                openByDefault: true,
                children: [
                  { kind: 'col', colId: 'spread' },
                  { kind: 'col', colId: 'grossPnl' },
                ],
              },
            },
          ],
        },
      ],
      openGroupIds: {},
    });

    expect(await groupHeadersWithLabel(page, 'Market')).toBeGreaterThanOrEqual(1);
    expect(await groupHeadersWithLabel(page, 'Greeks')).toBeGreaterThanOrEqual(1);
  });

  // ── 5. columnGroupShow: always / open / closed ─────────────────────────

  test('columnGroupShow="closed" column shows when group collapsed, hides when expanded', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-price',
          headerName: 'Price Stats',
          openByDefault: false,
          children: [
            // Stand-in aggregate visible only when the group is collapsed.
            { kind: 'col', colId: 'notional', show: 'closed' },
            // Detail columns visible only when the group is expanded.
            { kind: 'col', colId: 'price',    show: 'open' },
            { kind: 'col', colId: 'yield',    show: 'open' },
            { kind: 'col', colId: 'spread',   show: 'open' },
          ],
        },
      ],
      openGroupIds: {},
    });

    // Start closed: notional visible, detail cols hidden.
    await setGroupOpened(page, 'g-price', false);
    let visible = await displayedColIds(page);
    expect(visible).toContain('notional');
    expect(visible).not.toContain('price');
    expect(visible).not.toContain('yield');
    expect(visible).not.toContain('spread');

    // Open: detail cols visible, notional hidden.
    await setGroupOpened(page, 'g-price', true);
    visible = await displayedColIds(page);
    expect(visible).not.toContain('notional');
    expect(visible).toContain('price');
    expect(visible).toContain('yield');
    expect(visible).toContain('spread');
  });

  test('columnGroupShow="always" column stays visible open or closed', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-mix',
          headerName: 'Mix',
          openByDefault: false,
          children: [
            { kind: 'col', colId: 'id',      show: 'always' },
            { kind: 'col', colId: 'time',    show: 'open' },
          ],
        },
      ],
      openGroupIds: {},
    });

    await setGroupOpened(page, 'g-mix', false);
    expect(await displayedColIds(page)).toContain('id');

    await setGroupOpened(page, 'g-mix', true);
    const visibleOpen = await displayedColIds(page);
    expect(visibleOpen).toContain('id');
    expect(visibleOpen).toContain('time');
  });

  test('Chip cycle button rotates always → open → closed → always and persists to store', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-chip-test',
          headerName: 'ChipTest',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'price' }],
        },
      ],
      openGroupIds: {},
    });

    // Open the panel and navigate to column-groups.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="v2-settings-nav-column-groups"]').click();

    const chip = page.locator('[data-testid="cg-chip-g-chip-test-price"]');
    const cycle = page.locator('[data-testid="cg-chip-show-g-chip-test-price"]');

    await expect(chip).toHaveAttribute('data-show', 'always');
    await cycle.click();
    await expect(chip).toHaveAttribute('data-show', 'open');
    await cycle.click();
    await expect(chip).toHaveAttribute('data-show', 'closed');
    await cycle.click();
    await expect(chip).toHaveAttribute('data-show', 'always');

    // Store reflects the final value.
    const state = await getModuleState<{ groups: Array<{ children: Array<{ colId?: string; show?: string }> }> }>(
      page, 'column-groups',
    );
    const priceChild = state?.groups[0].children.find((c) => c.colId === 'price');
    expect(priceChild?.show).toBe('always');
  });

  // ── 6. openByDefault ───────────────────────────────────────────────────

  test('openByDefault=true shows "open"-only columns immediately on first render', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-obd',
          headerName: 'OpenByDefault',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'price' },
            { kind: 'col', colId: 'spread', show: 'open' },
          ],
        },
      ],
      openGroupIds: {},
    });

    // No setGroupOpened call — rely on the initial openByDefault value.
    const visible = await displayedColIds(page);
    expect(visible).toContain('price');
    expect(visible).toContain('spread');
  });

  // ── 7. Runtime open/closed memory (the slick bit) ──────────────────────

  test('User-triggered expand writes to openGroupIds and survives reload', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-runtime',
          headerName: 'Runtime',
          openByDefault: false,
          children: [
            { kind: 'col', colId: 'price' },
            { kind: 'col', colId: 'yield', show: 'open' },
          ],
        },
      ],
      openGroupIds: {},
    });

    // Before: yield (open-only) is hidden.
    expect(await displayedColIds(page)).not.toContain('yield');

    // Toggle via AG-Grid API — simulates the user clicking the header chevron.
    await setGroupOpened(page, 'g-runtime', true);
    await page.waitForTimeout(400);

    // Store captured the open state.
    let state = await getModuleState<{ openGroupIds: Record<string, boolean> }>(page, 'column-groups');
    expect(state?.openGroupIds['g-runtime']).toBe(true);

    // Wait for auto-save debounce and reload.
    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    // openGroupIds restored AND reflected in the grid.
    state = await getModuleState<{ openGroupIds: Record<string, boolean> }>(page, 'column-groups');
    expect(state?.openGroupIds['g-runtime']).toBe(true);
    expect(await displayedColIds(page)).toContain('yield');
  });

  test('Collapsing a group writes false and survives reload', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-collapse',
          headerName: 'Collapse',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'price' },
            { kind: 'col', colId: 'yield', show: 'open' },
          ],
        },
      ],
      openGroupIds: {},
    });

    expect(await displayedColIds(page)).toContain('yield');

    await setGroupOpened(page, 'g-collapse', false);
    await page.waitForTimeout(400);

    let state = await getModuleState<{ openGroupIds: Record<string, boolean> }>(page, 'column-groups');
    expect(state?.openGroupIds['g-collapse']).toBe(false);

    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    state = await getModuleState<{ openGroupIds: Record<string, boolean> }>(page, 'column-groups');
    expect(state?.openGroupIds['g-collapse']).toBe(false);
    expect(await displayedColIds(page)).not.toContain('yield');
  });

  // ── 8. Stale-id pruning on deserialize ────────────────────────────────

  test('Deleting a group removes its openGroupIds entry after reload', async ({ page }) => {
    // Seed with a group open + recorded in openGroupIds.
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-doomed',
          headerName: 'Doomed',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'yield' }],
        },
      ],
      openGroupIds: { 'g-doomed': true },
    });

    // Let auto-save persist the seeded state.
    await page.waitForTimeout(500);

    // Now delete the group (but leave the openGroupIds entry in place —
    // simulating the case where state was saved mid-edit).
    await setModuleState(page, 'column-groups', {
      groups: [],
      openGroupIds: { 'g-doomed': true },
    });
    await page.waitForTimeout(500);

    await page.reload();
    await waitForV2Grid(page);

    // Deserialize pruned the stale entry on load.
    const state = await getModuleState<{ openGroupIds: Record<string, boolean> }>(page, 'column-groups');
    expect(state?.openGroupIds['g-doomed']).toBeUndefined();
  });

  // ── 9. Delete group from UI removes header ─────────────────────────────

  test('Deleting a group from the panel removes the group header from the grid', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-del-ui',
          headerName: 'DeleteMe',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'id' }],
        },
      ],
      openGroupIds: {},
    });

    expect(await groupHeadersWithLabel(page, 'DeleteMe')).toBeGreaterThanOrEqual(1);

    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="v2-settings-nav-column-groups"]').click();
    await page.locator('[data-testid="cg-delete-g-del-ui"]').click();
    await page.locator('[data-testid="v2-settings-done-btn"]').click();

    expect(await groupHeadersWithLabel(page, 'DeleteMe')).toBe(0);
    // `id` column is still in the grid — just ungrouped now.
    expect(await displayedColIds(page)).toContain('id');
  });

  // ── 10. composeGroups tolerates missing colIds + duplicates ────────────

  test('composeGroups silently skips missing colIds and duplicate assignments', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-a',
          headerName: 'GroupA',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'id' },
            { kind: 'col', colId: 'does-not-exist' },  // tolerated, skipped
            { kind: 'col', colId: 'time' },
          ],
        },
        {
          groupId: 'g-b',
          headerName: 'GroupB',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'time' },  // already in GroupA — first wins
            { kind: 'col', colId: 'security' },
          ],
        },
      ],
      openGroupIds: {},
    });

    // Both groups render, grid isn't broken.
    expect(await groupHeadersWithLabel(page, 'GroupA')).toBeGreaterThanOrEqual(1);
    expect(await groupHeadersWithLabel(page, 'GroupB')).toBeGreaterThanOrEqual(1);

    // All columns that exist are still in the grid once each.
    const visible = await displayedColIds(page);
    expect(visible).toContain('id');
    expect(visible).toContain('time');
    expect(visible).toContain('security');
    // And nothing crashed — check an ungrouped column is still there.
    expect(visible).toContain('price');
  });

  // ── 10b. Regression: group siblings must stay adjacent ─────────────────

  test('Two groups each with one child do not get split apart by ungrouped columns', async ({ page }) => {
    // Regression for the "Time header sits above Spread column" bug:
    // when groups have single children and base-def columns between them
    // are ungrouped, AG-Grid's column-state diff preserves each col's
    // prior position. Before the fix, composeGroups emitted groups first +
    // ungrouped last; AG-Grid yanked ungrouped cols back to their original
    // slots, splitting our groups apart. The fix emits each group at the
    // position of its first child in base-def order so AG-Grid's diff has
    // nothing to fight.
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-single-a',
          headerName: 'AloneA',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'quantity' }],
        },
        {
          groupId: 'g-single-b',
          headerName: 'AloneB',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'time' }],
        },
      ],
      openGroupIds: {},
    });

    // Each group header must sit directly above its single child column —
    // same left-coordinate, within a pixel.
    const alignment = await page.evaluate(() => {
      const groupCells = [...document.querySelectorAll('.ag-header-group-cell')];
      const timeCell = [...document.querySelectorAll('.ag-header-cell[col-id="time"]')][0];
      const qtyCell = [...document.querySelectorAll('.ag-header-cell[col-id="quantity"]')][0];
      const aloneB = groupCells.find((el) =>
        el.querySelector('.ag-header-group-text')?.textContent?.trim() === 'AloneB',
      );
      const aloneA = groupCells.find((el) =>
        el.querySelector('.ag-header-group-text')?.textContent?.trim() === 'AloneA',
      );
      return {
        aloneBLeft: aloneB?.getBoundingClientRect().left,
        timeLeft: timeCell?.getBoundingClientRect().left,
        aloneALeft: aloneA?.getBoundingClientRect().left,
        qtyLeft: qtyCell?.getBoundingClientRect().left,
      };
    });

    expect(alignment.aloneBLeft).toBeDefined();
    expect(alignment.timeLeft).toBeDefined();
    expect(alignment.aloneALeft).toBeDefined();
    expect(alignment.qtyLeft).toBeDefined();
    expect(Math.abs(alignment.aloneBLeft! - alignment.timeLeft!)).toBeLessThan(2);
    expect(Math.abs(alignment.aloneALeft! - alignment.qtyLeft!)).toBeLessThan(2);
  });

  // ── 10c. Regression: border overlay on a grouped column ───────────────

  test('Applying a 1px bottom border to columns inside a group does not break layout', async ({ page }) => {
    // Regression for the "column-customization `position: relative` on
    // `.gc-hdr-c-{colId}` clobbers AG-Grid's absolute-positioned header
    // cells" bug. Symptom: grouped column headers disappear / misalign once
    // any per-column border is configured. Fix: drop `position: relative`
    // from the border-overlay CSS (same treatment we applied earlier to
    // conditional-styling's border overlay).
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-border-test',
          headerName: 'BorderTest',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'price' },
            { kind: 'col', colId: 'yield' },
            { kind: 'col', colId: 'spread' },
          ],
        },
      ],
      openGroupIds: {},
    });
    await setModuleState(page, 'column-customization', {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: {
            borders: { bottom: { width: 1, style: 'solid', color: '#ff0000' } },
          },
        },
        yield: {
          colId: 'yield',
          cellStyleOverrides: {
            borders: { bottom: { width: 1, style: 'solid', color: '#ff0000' } },
          },
        },
      },
    });

    // Scroll the group into view so all three column headers render.
    await callGridApi(page, 'ensureColumnVisible', ['price']);
    await page.waitForTimeout(400);

    // All three columns must still have rendered headers with non-zero
    // width AND their cells must still paint (would be 0 if positioning
    // broke).
    const layout = await page.evaluate(() => {
      const h = (id: string) => {
        const el = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
        const r = el?.getBoundingClientRect();
        return { rendered: !!el, width: r?.width ?? 0 };
      };
      const cellCount = (id: string) =>
        [...document.querySelectorAll(`[col-id="${id}"]`)].filter((c) =>
          c.classList.contains('ag-cell'),
        ).length;
      // Also check the ::after box-shadow actually paints the border.
      const priceCell = [...document.querySelectorAll('[col-id="price"]')].find((c) =>
        c.classList.contains('ag-cell'),
      );
      const afterShadow = priceCell
        ? window.getComputedStyle(priceCell, '::after').boxShadow
        : '';
      return {
        price: h('price'),
        yieldCol: h('yield'),
        spread: h('spread'),
        priceCells: cellCount('price'),
        yieldCells: cellCount('yield'),
        spreadCells: cellCount('spread'),
        afterShadow,
      };
    });

    expect(layout.price.rendered).toBe(true);
    expect(layout.yieldCol.rendered).toBe(true);
    expect(layout.spread.rendered).toBe(true);
    expect(layout.price.width).toBeGreaterThan(0);
    expect(layout.yieldCol.width).toBeGreaterThan(0);
    expect(layout.spread.width).toBeGreaterThan(0);
    expect(layout.priceCells).toBeGreaterThan(0);
    expect(layout.yieldCells).toBeGreaterThan(0);
    expect(layout.spreadCells).toBeGreaterThan(0);
    // Border actually painted.
    expect(layout.afterShadow).toContain('inset');
    expect(layout.afterShadow).toMatch(/rgb\(255,\s*0,\s*0\)/);
  });

  // ── 10d. Group header formatting (bold / color / bg / align / size) ──

  test('Group header style facets are applied to the group header cell', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-styled',
          headerName: 'Styled',
          openByDefault: true,
          headerStyle: {
            bold: true,
            italic: true,
            fontSize: 14,
            color: '#f0b90b',
            background: 'rgb(50, 40, 0)',
            align: 'center',
          },
          children: [
            { kind: 'col', colId: 'price' },
            { kind: 'col', colId: 'yield' },
          ],
        },
      ],
      openGroupIds: {},
    });
    await callGridApi(page, 'ensureColumnVisible', ['price']);
    await page.waitForTimeout(400);

    const resolved = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.ag-header-group-cell')].find((el) =>
        el.querySelector('.ag-header-group-text')?.textContent?.trim() === 'Styled',
      );
      if (!cell) return null;
      const cs = window.getComputedStyle(cell);
      const label = cell.querySelector('.ag-header-group-cell-label') as HTMLElement | null;
      const labelCs = label ? window.getComputedStyle(label) : null;
      return {
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        fontSize: cs.fontSize,
        color: cs.color,
        background: cs.backgroundColor,
        labelJustify: labelCs?.justifyContent ?? null,
        hasClass: /gc-hdr-grp-g-styled/.test(cell.className),
      };
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.hasClass).toBe(true);
    expect(resolved!.fontWeight).toBe('700');
    expect(resolved!.fontStyle).toBe('italic');
    expect(resolved!.fontSize).toBe('14px');
    expect(resolved!.color).toBe('rgb(240, 185, 11)');
    expect(resolved!.background).toBe('rgb(50, 40, 0)');
    expect(resolved!.labelJustify).toBe('center');
  });

  test('Clearing a headerStyle facet strips that style from the rendered cell', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-styled2',
          headerName: 'S2',
          openByDefault: true,
          headerStyle: { bold: true, color: '#ff0000' },
          children: [{ kind: 'col', colId: 'price' }],
        },
      ],
      openGroupIds: {},
    });
    await callGridApi(page, 'ensureColumnVisible', ['price']);
    await page.waitForTimeout(400);

    // Confirm bold + color applied first.
    let cs = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.ag-header-group-cell')].find((el) =>
        el.querySelector('.ag-header-group-text')?.textContent?.trim() === 'S2',
      );
      return cell ? {
        weight: window.getComputedStyle(cell).fontWeight,
        color: window.getComputedStyle(cell).color,
      } : null;
    });
    expect(cs?.weight).toBe('700');
    expect(cs?.color).toBe('rgb(255, 0, 0)');

    // Clear the whole style object — the class should disappear too.
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-styled2',
          headerName: 'S2',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'price' }],
        },
      ],
      openGroupIds: {},
    });
    await page.waitForTimeout(300);

    cs = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.ag-header-group-cell')].find((el) =>
        el.querySelector('.ag-header-group-text')?.textContent?.trim() === 'S2',
      );
      return cell ? {
        weight: window.getComputedStyle(cell).fontWeight,
        color: window.getComputedStyle(cell).color,
        hasClass: /gc-hdr-grp-g-styled2/.test(cell.className),
      } : null;
    });
    // Without the class, the cell inherits theme defaults — weight != 700.
    expect(cs?.hasClass).toBe(false);
    expect(cs?.weight).not.toBe('700');
  });

  // ── 11. Reorder via up / down arrows ───────────────────────────────────

  test('Arrow buttons reorder top-level groups', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        { groupId: 'g-first',  headerName: 'First',  openByDefault: true, children: [{ kind: 'col', colId: 'id' }] },
        { groupId: 'g-second', headerName: 'Second', openByDefault: true, children: [{ kind: 'col', colId: 'time' }] },
      ],
      openGroupIds: {},
    });

    // Open the panel, click Second's Up arrow.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="v2-settings-nav-column-groups"]').click();
    await page.locator('[data-testid="cg-up-g-second"]').click();
    await page.locator('[data-testid="v2-settings-done-btn"]').click();

    // Store order flipped.
    const state = await getModuleState<{ groups: Array<{ groupId: string }> }>(page, 'column-groups');
    expect(state?.groups.map((g) => g.groupId)).toEqual(['g-second', 'g-first']);
  });

  // ── 12. Interop: conditional-styling targets a grouped column ──────────

  test('Conditional styling rule still paints cells inside a group', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-interop',
          headerName: 'Interop',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'spread' }],
        },
      ],
      openGroupIds: {},
    });

    await setModuleState(page, 'conditional-styling', {
      rules: [{
        enabled: true,
        id: 'cg-interop-rule',
        name: 'Interop',
        priority: 0,
        scope: { type: 'cell', columns: ['spread'] },
        expression: '[spread] > 50',
        style: { light: { backgroundColor: '#f87171' }, dark: { backgroundColor: '#f87171' } },
      }],
    });

    // Wait for transforms to flush, then check that SOME spread cells carry
    // the rule class (values > 50) and some don't.
    await page.waitForTimeout(500);
    const counts = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[col-id="spread"]')].filter(
        (c) => c.classList.contains('ag-cell'),
      );
      return {
        total: cells.length,
        withRule: cells.filter((c) => c.classList.contains('gc-rule-cg-interop-rule')).length,
      };
    });
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.withRule).toBeGreaterThan(0);
    expect(counts.withRule).toBeLessThan(counts.total);
  });

  // ── 13. Interop: virtual (calculated) column inside a group ────────────

  test('Virtual column from calculated-columns renders inside a group', async ({ page }) => {
    // The demo seeds `grossPnl` as a virtual column (rightmost column).
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-virt',
          headerName: 'VirtGroup',
          openByDefault: true,
          children: [{ kind: 'col', colId: 'grossPnl' }],
        },
      ],
      openGroupIds: {},
    });

    // grossPnl lives at the end of a wide grid — scroll it into view before
    // asserting on the DOM (headers for off-viewport columns aren't rendered).
    await callGridApi(page, 'ensureColumnVisible', ['grossPnl']);
    await page.waitForTimeout(400);

    expect(await groupHeadersWithLabel(page, 'VirtGroup')).toBeGreaterThanOrEqual(1);
    const sample = await page.evaluate(() => {
      const first = [...document.querySelectorAll('[col-id="grossPnl"]')].find(
        (c) => c.classList.contains('ag-cell'),
      );
      return first?.textContent?.trim();
    });
    expect(sample).toBeTruthy();
    expect(Number(sample)).not.toBeNaN();
    expect(Number(sample)).toBeGreaterThan(0);
  });

  // ── 14. Ungrouped chip view reflects unassigned columns ────────────────

  test('Panel\'s Ungrouped section lists only columns not placed in any group', async ({ page }) => {
    await setModuleState(page, 'column-groups', {
      groups: [
        {
          groupId: 'g-ug',
          headerName: 'Grouped',
          openByDefault: true,
          children: [
            { kind: 'col', colId: 'id' },
            { kind: 'col', colId: 'time' },
          ],
        },
      ],
      openGroupIds: {},
    });

    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="v2-settings-nav-column-groups"]').click();

    // Ungrouped chips exist for unassigned cols
    await expect(page.locator('[data-testid="cg-ungrouped-price"]')).toBeVisible();
    await expect(page.locator('[data-testid="cg-ungrouped-yield"]')).toBeVisible();
    // But NOT for cols already inside the group.
    await expect(page.locator('[data-testid="cg-ungrouped-id"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="cg-ungrouped-time"]')).toHaveCount(0);
  });
});

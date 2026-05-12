import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for @starui/markets-grid — explicit-save layout contract.
 *
 * Layouts used to auto-persist every change via a 300ms debounce.
 * That silently captured edits the user hadn't committed, which was
 * confusing in practice — layouts now behave like saved documents:
 * changes live in-memory until the user clicks Save, and a dirty
 * indicator plus an unsaved-changes prompt guard the "switch / reload
 * while dirty" paths.
 *
 * This spec (still filed as "autosave" for historical continuity)
 * proves the current contract:
 *  - Default is still auto-seeded on first mount.
 *  - User-created layouts persist on creation (create() is an
 *    explicit write path — no debounce needed).
 *  - Changes made AFTER save do NOT persist on reload unless Save is
 *    clicked. A captured filter pill that hasn't been saved disappears.
 *  - A captured filter pill, once saved, survives reload.
 *  - The Save button surfaces a dirty indicator (`data-state="dirty"`
 *    plus a `save-all-dirty` child) while there are unsaved edits and
 *    clears it after a save.
 *  - Switching layouts while dirty triggers the AlertDialog with
 *    three actions: Cancel / Discard / Save-and-switch.
 */

const V2_PATH = '/';

async function waitForV2Grid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  // Layout manager boot + initial dirty-subscription hookup.
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
      .filter((k) => k.startsWith('gc-active-layout:') || k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
  });
}

function layoutTrigger(page: Page) {
  return page.locator('[data-testid="layout-selector-trigger"]');
}

async function openLayoutPopover(page: Page) {
  await layoutTrigger(page).click();
  await page.locator('[data-testid="layout-selector-popover"]').waitFor({ state: 'visible' });
}

async function createLayout(page: Page, name: string) {
  await openLayoutPopover(page);
  await page.locator('[data-testid="layout-name-input"]').fill(name);
  await page.locator('[data-testid="layout-create-btn"]').click();
  await expect(layoutTrigger(page)).toContainText(name);
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
  await page.waitForTimeout(250);
}

async function clickSaveAll(page: Page) {
  await page.locator('[data-testid="save-all-btn"]').click();
  // Dirty flag clears synchronously on save; the 600ms flash is cosmetic.
  await page.waitForTimeout(200);
}

async function captureCurrentFilter(page: Page) {
  await page.locator('.ds-filters-add-btn').click();
  await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
}

test.describe('v2 — explicit save (layouts = committed snapshots)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
    await clearV2Storage(page);
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
  });

  test('Default layout is auto-seeded on first mount (reserved + Lock, not Trash)', async ({ page }) => {
    await expect(layoutTrigger(page)).toContainText('Default');

    await openLayoutPopover(page);
    const defaultRow = page.locator('[data-testid="layout-row-__default__"]');
    await expect(defaultRow).toBeVisible();
    await expect(defaultRow.locator('button[title="Delete layout"]')).toHaveCount(0);
  });

  test('user-created layout persists across reload (create() is an explicit write)', async ({ page }) => {
    await createLayout(page, 'Persist-Test');

    // Layout creation is an explicit write, not a debounced auto-save —
    // no Save click needed. Reload + assert the layout + the last-active
    // pointer both survived.
    await page.reload();
    await waitForV2Grid(page);

    await expect(layoutTrigger(page)).toContainText('Persist-Test');

    await openLayoutPopover(page);
    await expect(page.locator('[data-testid="layout-row-__default__"]')).toBeVisible();
    const popover = page.locator('[data-testid="layout-selector-popover"]');
    await expect(popover.getByText('Persist-Test', { exact: true })).toBeVisible();
  });

  test('unsaved filter pill DOES NOT persist across reload (explicit save contract)', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    // Note: NO Save click. Reload — the pill must vanish because nothing
    // was committed to disk. This is the core behavior the refactor
    // introduced.
    await page.reload();
    await waitForV2Grid(page);

    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);
  });

  test('saved filter pill SURVIVES reload after clicking Save', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await clickSaveAll(page);

    await page.reload();
    await waitForV2Grid(page);

    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });

  test('Save button surfaces a dirty indicator while there are unsaved edits', async ({ page }) => {
    const saveBtn = page.locator('[data-testid="save-all-btn"]');
    // Initially clean — no dirty dot, data-state should not be "dirty".
    await expect(saveBtn).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('[data-testid="save-all-dirty"]')).toHaveCount(0);

    // Mutate: capture a filter. The store change flips dirty=true.
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await expect(saveBtn).toHaveAttribute('data-state', 'dirty');
    await expect(page.locator('[data-testid="save-all-dirty"]')).toBeVisible();

    // Save clears the indicator. data-state cycles through 'saved' for
    // ~600ms of flash then back to 'idle'.
    await clickSaveAll(page);
    await page.waitForTimeout(800);
    await expect(saveBtn).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('[data-testid="save-all-dirty"]')).toHaveCount(0);
  });

  test('switching layouts while dirty opens the unsaved-changes AlertDialog', async ({ page }) => {
    await createLayout(page, 'Switch-Target');

    // Go back to Default so we have somewhere to switch TO and FROM.
    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-__default__"]').click();
    await expect(layoutTrigger(page)).toContainText('Default');

    // Make Default dirty.
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);
    await expect(page.locator('[data-testid="save-all-btn"]')).toHaveAttribute('data-state', 'dirty');

    // Try to switch. The AlertDialog intercepts.
    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-switch-target"]').click();
    await expect(page.locator('[data-testid="layout-switch-confirm"]')).toBeVisible();

    // Cancel keeps us where we are + preserves dirty state.
    await page.locator('[data-testid="layout-switch-cancel"]').click();
    await expect(page.locator('[data-testid="layout-switch-confirm"]')).toHaveCount(0);
    await expect(layoutTrigger(page)).toContainText('Default');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });

  test('Discard path on layout switch throws away unsaved edits + switches', async ({ page }) => {
    await createLayout(page, 'Discard-Target');

    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-__default__"]').click();
    await expect(layoutTrigger(page)).toContainText('Default');

    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-discard-target"]').click();
    await page.locator('[data-testid="layout-switch-discard"]').click();

    // We landed on the target layout, and the pill we captured under
    // Default was thrown away.
    await expect(layoutTrigger(page)).toContainText('Discard-Target');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);

    // Going back to Default should also show no pill — the discard
    // reverted the in-memory state to the last saved snapshot of
    // Default, which had no pills.
    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-__default__"]').click();
    await expect(layoutTrigger(page)).toContainText('Default');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);
  });

  test('Save-and-switch path writes the outgoing layout then switches', async ({ page }) => {
    await createLayout(page, 'Save-Target');

    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-__default__"]').click();
    await expect(layoutTrigger(page)).toContainText('Default');

    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureCurrentFilter(page);

    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-save-target"]').click();
    await page.locator('[data-testid="layout-switch-save"]').click();

    // We landed on the target layout. Default now persists the pill
    // we saved at switch-time: flipping back proves the write succeeded.
    await expect(layoutTrigger(page)).toContainText('Save-Target');

    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-row-__default__"]').click();
    await expect(layoutTrigger(page)).toContainText('Default');
    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });
});

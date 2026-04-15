import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for v2 conditional-styling against REAL blotter columns.
 *
 * Where `v2-conditional-styling.spec.ts` proves the wiring (drawer opens, add /
 * disable / delete cycle works), this spec proves the rules are useful: each
 * test models a real-world FI-trading desk question against the actual demo
 * columns (`side`, `status`, `quantity`, `spread`, plus a row-scoped
 * `status='CANCELLED'` rule), then reloads with NO Save All click to confirm
 * the rules survive in the Default profile.
 *
 * The Default profile (`__default__`) is auto-loaded on first mount; auto-save
 * persists every store change on a 300ms debounce, so a successful reload
 * round-trip is the strongest possible proof that the rules landed in the
 * Default snapshot in IndexedDB.
 *
 * One deliberate cross-cutting test (`Multiple column rules + Default-profile
 * survival`) directly inspects the Dexie row to assert the snapshot shape, so
 * the contract is verified at both the DOM and the storage layer.
 */

const V2_PATH = '/?v=2';
const GRID_ID = 'demo-blotter-v2';
const DB_NAME = 'gc-customizer-v2';
const DEFAULT_PROFILE_ID = '__default__';

async function waitForV2Grid(page: Page) {
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400); // initial Default-profile auto-seed
}

async function clearV2Storage(page: Page) {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
  }, DB_NAME);
}

/**
 * Add one cell-scoped rule via the SettingsSheet UI. Returns the rule's id
 * (read off the rendered card) so tests can assert against the exact gc-rule-*
 * class AG-Grid emits — no broad `[class*="gc-rule-"]` matches that could be
 * fooled by a leftover rule from another test.
 */
async function addCellRule(
  page: Page,
  opts: { colId: string; expression: string },
): Promise<string> {
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  await expect(page.locator('[data-testid="cs-panel"]')).toBeVisible();

  const beforeIds = await page
    .locator('[data-testid^="cs-rule-card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('cs-rule-card-', '')));

  await page.locator('[data-testid="cs-add-rule-btn"]').click();
  await expect(page.locator('[data-testid="cs-rule-editor"]')).toBeVisible();

  await page.locator('select.gc-cs-col-add').selectOption(opts.colId);

  const exprInput = page.locator('[data-testid="cs-rule-expression-input"]');
  await exprInput.fill(opts.expression);
  await exprInput.blur();

  // Find the new card by diffing against the pre-add snapshot.
  const afterIds = await page
    .locator('[data-testid^="cs-rule-card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('cs-rule-card-', '')));
  const newId = afterIds.find((id) => !beforeIds.includes(id));
  if (!newId) throw new Error('Could not identify newly-added rule id');

  await page.locator('[data-testid="v2-settings-done-btn"]').click();
  return newId;
}

async function addRowRule(page: Page, expression: string): Promise<string> {
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  await expect(page.locator('[data-testid="cs-panel"]')).toBeVisible();

  const beforeIds = await page
    .locator('[data-testid^="cs-rule-card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('cs-rule-card-', '')));

  await page.locator('[data-testid="cs-add-rule-btn"]').click();
  await expect(page.locator('[data-testid="cs-rule-editor"]')).toBeVisible();

  // Switch the new rule's scope from cell → row. The editor renders three
  // <select> elements; in DOM order the first non-column-picker select is
  // Scope (the column picker carries `.gc-cs-col-add`).
  const scopeSelect = page
    .locator('[data-testid="cs-rule-editor"] select:not(.gc-cs-col-add)')
    .first();
  await scopeSelect.selectOption('row');
  // The column picker unmounts when scope flips to row.
  await expect(page.locator('select.gc-cs-col-add')).toHaveCount(0);

  const exprInput = page.locator('[data-testid="cs-rule-expression-input"]');
  await exprInput.fill(expression);
  await exprInput.blur();

  const afterIds = await page
    .locator('[data-testid^="cs-rule-card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('cs-rule-card-', '')));
  const newId = afterIds.find((id) => !beforeIds.includes(id));
  if (!newId) throw new Error('Could not identify newly-added rule id');

  await page.locator('[data-testid="v2-settings-done-btn"]').click();
  return newId;
}

/** Count cells in a given column that carry a specific gc-rule-<id> class. */
async function countStyledCells(page: Page, colId: string, ruleId: string): Promise<number> {
  return page.locator(`.ag-cell[col-id="${colId}"].gc-rule-${ruleId}`).count();
}

/** Read the persisted Default-profile rules straight out of IndexedDB. */
async function readDefaultProfileRules(
  page: Page,
): Promise<Array<{ id: string; expression: string; scope: { type: string; columns?: string[] } }>> {
  return page.evaluate(
    async ({ dbName, gridId, profileId }) => {
      return new Promise<Array<{ id: string; expression: string; scope: { type: string; columns?: string[] } }>>((resolve) => {
        const open = indexedDB.open(dbName);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('profiles')) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction('profiles', 'readonly');
          const store = tx.objectStore('profiles');
          const get = store.get(`${gridId}::${profileId}`);
          get.onsuccess = () => {
            const row = get.result as { state?: Record<string, { data?: { rules?: unknown[] } }> } | undefined;
            const rules = row?.state?.['conditional-styling']?.data?.rules ?? [];
            resolve(rules as Array<{ id: string; expression: string; scope: { type: string; columns?: string[] } }>);
            db.close();
          };
          get.onerror = () => {
            resolve([]);
            db.close();
          };
        };
        open.onerror = () => resolve([]);
      });
    },
    { dbName: DB_NAME, gridId: GRID_ID, profileId: DEFAULT_PROFILE_ID },
  );
}

test.describe('v2 — conditional styling against real blotter columns', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
    await clearV2Storage(page);
    await page.goto(V2_PATH);
    await waitForV2Grid(page);
  });

  test('Side === BUY → highlighted Side cells; survives reload via Default profile', async ({ page }) => {
    const ruleId = await addCellRule(page, { colId: 'side', expression: "x == 'BUY'" });

    // The blotter generator picks side via Math.random() > 0.5, so we expect
    // both BUY and SELL rows; rule should hit the BUY cells only.
    const styledBefore = await countStyledCells(page, 'side', ruleId);
    expect(styledBefore).toBeGreaterThan(0);

    // No SELL cell should carry the rule class — pure expression sanity check.
    const sellWithRule = await page.locator(`.ag-cell[col-id="side"].gc-rule-${ruleId}`).evaluateAll((cells) =>
      cells.filter((c) => (c.textContent ?? '').trim() === 'SELL').length,
    );
    expect(sellWithRule).toBe(0);

    // No Save All click — auto-save (300ms) handles it.
    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    const styledAfter = await countStyledCells(page, 'side', ruleId);
    expect(styledAfter).toBeGreaterThan(0);

    // The Default profile is the active one after reload (no other profile
    // exists), so the survival above implicitly proves persistence into
    // Default. Belt-and-braces: confirm the persisted snapshot agrees.
    const persisted = await readDefaultProfileRules(page);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      id: ruleId,
      expression: "x == 'BUY'",
      scope: { type: 'cell', columns: ['side'] },
    });
  });

  test('Status === FILLED → highlighted Status cells', async ({ page }) => {
    const ruleId = await addCellRule(page, { colId: 'status', expression: "x == 'FILLED'" });

    const styled = await countStyledCells(page, 'status', ruleId);
    expect(styled).toBeGreaterThan(0);

    // Spot-check that every styled cell really shows "FILLED".
    const labels = await page
      .locator(`.ag-cell[col-id="status"].gc-rule-${ruleId}`)
      .evaluateAll((cells) => cells.map((c) => (c.textContent ?? '').trim()));
    expect(new Set(labels)).toEqual(new Set(['FILLED']));
  });

  test('Quantity > 1000 → highlighted Qty cells; reload preserves rule', async ({ page }) => {
    const ruleId = await addCellRule(page, { colId: 'quantity', expression: 'x > 1000' });

    const styled = await countStyledCells(page, 'quantity', ruleId);
    expect(styled).toBeGreaterThan(0);

    // Every styled cell's numeric content must be > 1000.
    const values = await page
      .locator(`.ag-cell[col-id="quantity"].gc-rule-${ruleId}`)
      .evaluateAll((cells) => cells.map((c) => Number((c.textContent ?? '').replace(/[^0-9.-]/g, ''))));
    for (const v of values) expect(v).toBeGreaterThan(1000);

    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    expect(await countStyledCells(page, 'quantity', ruleId)).toBeGreaterThan(0);
  });

  test('Spread > 50 → highlighted Spread cells (wide-spread alert)', async ({ page }) => {
    const ruleId = await addCellRule(page, { colId: 'spread', expression: 'x > 50' });

    const styled = await countStyledCells(page, 'spread', ruleId);
    expect(styled).toBeGreaterThan(0);
  });

  test('Row-scope: data.status == "FILLED" paints whole row', async ({ page }) => {
    // Use FILLED (~25% of generated rows) rather than CANCELLED (~1%) so the
    // viewport reliably contains matching rows — the data generator in
    // apps/demo/src/data.ts is randomized per page-load, so a status that
    // statistically appears in <2% of rows can land in 0 of the visible 42.
    const ruleId = await addRowRule(page, "data.status == 'FILLED'");

    // Sanity: the persisted snapshot has the rule as scope:row with the
    // expected expression. If this fails the UI didn't drive the correct
    // state and the row-painting check below would mislead us.
    await page.waitForTimeout(500);
    const persisted = await readDefaultProfileRules(page);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      id: ruleId,
      scope: { type: 'row' },
      expression: "data.status == 'FILLED'",
    });

    // Row-scope rules attach the gc-rule-<id> class to the .ag-row element,
    // not individual cells. Locate any rendered row carrying the class.
    const styledRows = await page.locator(`.ag-row.gc-rule-${ruleId}`).count();
    expect(styledRows).toBeGreaterThan(0);

    // Confirm those rows really show FILLED in their status column. Some
    // styled rows may have their status cell virtualized out (pinned section
    // / horizontal scroll), so filter out blanks before asserting.
    const statuses = (
      await page
        .locator(`.ag-row.gc-rule-${ruleId} .ag-cell[col-id="status"]`)
        .evaluateAll((cells) => cells.map((c) => (c.textContent ?? '').trim()))
    ).filter((s) => s.length > 0);
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses)).toEqual(new Set(['FILLED']));

    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    expect(await page.locator(`.ag-row.gc-rule-${ruleId}`).count()).toBeGreaterThan(0);
  });

  test('Multiple column rules + Default-profile survival across reload', async ({ page }) => {
    // Three independent rules, three different columns, three different
    // expression shapes (string equality, numeric threshold, compound
    // boolean). They must coexist, all survive reload, and all appear in the
    // single Default-profile snapshot.
    const sideId = await addCellRule(page, { colId: 'side', expression: "x == 'BUY'" });
    const qtyId = await addCellRule(page, { colId: 'quantity', expression: 'x >= 5000' });
    const spreadId = await addCellRule(page, { colId: 'spread', expression: 'x > 0 && x < 25' });

    expect(await countStyledCells(page, 'side', sideId)).toBeGreaterThan(0);
    expect(await countStyledCells(page, 'quantity', qtyId)).toBeGreaterThan(0);
    expect(await countStyledCells(page, 'spread', spreadId)).toBeGreaterThan(0);

    // Persisted snapshot reflects all 3 rules in the Default profile.
    await page.waitForTimeout(500);
    let persisted = await readDefaultProfileRules(page);
    expect(persisted).toHaveLength(3);
    expect(persisted.map((r) => r.id).sort()).toEqual([sideId, qtyId, spreadId].sort());

    // Reload — no Save All click. Active profile is Default; auto-save
    // already wrote the snapshot.
    await page.reload();
    await waitForV2Grid(page);

    // All three rules' cells are styled again.
    expect(await countStyledCells(page, 'side', sideId)).toBeGreaterThan(0);
    expect(await countStyledCells(page, 'quantity', qtyId)).toBeGreaterThan(0);
    expect(await countStyledCells(page, 'spread', spreadId)).toBeGreaterThan(0);

    // Active profile selector still shows "Default".
    await expect(page.locator('[data-testid="profile-selector-trigger"]')).toContainText('Default');

    // Re-open settings — all three cards are present.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await expect(page.locator('[data-testid^="cs-rule-card-"]')).toHaveCount(3);

    // Persisted snapshot still has all 3.
    persisted = await readDefaultProfileRules(page);
    expect(persisted).toHaveLength(3);
  });
});

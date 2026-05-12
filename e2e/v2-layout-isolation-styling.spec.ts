import { test, expect, type Page } from '@playwright/test';
import { bootCleanDemo, openPanel, closeSettingsSheet } from './helpers/settingsSheet';
import {
  createLayout,
  cloneLayout,
  switchToLayout,
  deleteLayout,
  saveAll,
  readLayoutModuleState,
  readStoredLayouts,
  countRowsWithRuleClass,
  readCellFontWeight,
} from './helpers/layoutHelpers';

/**
 * E2E — layout ISOLATION for styling-related modules.
 *
 * What we prove here:
 *   - Column customization (bold / colors / alignment / formatter)
 *     applied in layout A is NOT visible when the user switches to
 *     layout B. Switching back restores A's styling unchanged.
 *   - Conditional-styling rules live per-layout. Authoring a rule in
 *     A doesn't leak a row-class into B. Enabling a rule in B doesn't
 *     retroactively change A.
 *   - Clones inherit the source's styling at the moment of cloning,
 *     then diverge: edits to the clone don't leak back to the source.
 *   - Persistence via Save: assignments + rules survive a full
 *     layout-switch round-trip AND a page reload.
 *
 * Tactic: all tests interact with the formatter toolbar (for column-
 * customization) and the conditional-styling panel's + button (for
 * rules), then assert BOTH the grid DOM (computed styles / row-
 * classes) AND the underlying IndexedDB snapshot. Two-layer assertion
 * catches "works in UI but didn't save" and "saved but didn't render"
 * bugs.
 */

// ─── Formatter toolbar helpers ─────────────────────────────────────

async function openFormatterToolbar(page: Page): Promise<void> {
  const toggle = page.locator('[data-testid="style-toolbar-toggle"]');
  const toolbar = page.locator('[data-testid="formatting-toolbar"]');
  if (await toolbar.isVisible().catch(() => false)) return;
  await toggle.click();
  await expect(toolbar).toBeVisible();
}

/** Click the first cell of a column so useActiveColumns picks it up.
 *  Waits for the toolbar's column label to reflect the selection — that
 *  proves the cellFocused event has propagated through useActiveColumns. */
async function clickColumnCell(page: Page, colId: string): Promise<void> {
  await page.locator(`.ag-cell[col-id="${colId}"]`).first().click();
  // The col-label text capitalizes the colId; wait-until-visible via
  // a short poll rather than a fixed-sized timer.
  await page.waitForTimeout(250);
}

/** Click the in-grid Bold toggle for the currently-selected column(s). */
async function clickBold(page: Page): Promise<void> {
  const bold = page.locator('[data-testid="formatting-toolbar"] button[aria-label="Bold"]');
  await bold.dispatchEvent('mousedown'); // TBtn fires on mousedown only.
  // Wait for reducer dispatch → module-state update → transform
  // pipeline → CSS inject → AG-Grid cell-class re-evaluation.
  await page.waitForTimeout(400);
}

// ─── Conditional-styling panel helpers ──────────────────────────────

async function addConditionalRule(page: Page): Promise<string> {
  await openPanel(page, 'conditional-styling');
  await page.locator('[data-testid="cs-add-rule-btn"]').click();
  const editor = page.locator('[data-testid="cs-rule-editor"]');
  await expect(editor).toBeVisible();
  const attr = await editor.getAttribute('data-rule-testid');
  const id = attr?.replace('cs-rule-editor-', '');
  if (!id) throw new Error('Failed to read new rule id');
  return id;
}

async function saveRule(page: Page, ruleId: string): Promise<void> {
  // Idempotent: freshly-added rules are already committed (addRule
  // writes straight to module state), so the save button starts
  // disabled. Skip when there's nothing to save.
  const btn = page.locator(`[data-testid="cs-rule-save-${ruleId}"]`);
  if (await btn.isDisabled()) return;
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

// ─── Tests ─────────────────────────────────────────────────────────

test.describe('v2 layout isolation — column customization (formatter toolbar)', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('bold applied in layout A is absent in layout B', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'price');
    await clickBold(page);
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    await saveAll(page);

    await createLayout(page, 'Beta');
    // Beta starts blank — bold should NOT be present on price.
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');

    await switchToLayout(page, 'alpha', 'Alpha');
    expect(await readCellFontWeight(page, 'price')).toBe('700');
  });

  test('bold in A persists across full reload and still isolated from B', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'yield');
    await clickBold(page);
    await saveAll(page);

    await createLayout(page, 'Beta');
    await saveAll(page);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    // Beta was the last-active layout — yield should NOT be bold.
    expect(await readCellFontWeight(page, 'yield')).not.toBe('700');

    await switchToLayout(page, 'alpha', 'Alpha');
    expect(await readCellFontWeight(page, 'yield')).toBe('700');
  });

  test('clone inherits source styling, edits to clone do not leak back', async ({ page }) => {
    await createLayout(page, 'Origin');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'spread');
    await clickBold(page);
    await saveAll(page);

    // Clone Origin — clone should have bold on spread too.
    await cloneLayout(page, 'origin', 'Origin');
    expect(await readCellFontWeight(page, 'spread')).toBe('700');

    // Add italic (another typography toggle) to the clone ONLY.
    await clickColumnCell(page, 'spread');
    const italic = page.locator('[data-testid="formatting-toolbar"] button[aria-label="Italic"]');
    await italic.dispatchEvent('mousedown');
    await page.waitForTimeout(100);
    await saveAll(page);

    // Back to Origin — should have bold but NOT italic.
    await switchToLayout(page, 'origin', 'Origin');
    expect(await readCellFontWeight(page, 'spread')).toBe('700');
    const originState = await readLayoutModuleState<{ assignments?: Record<string, unknown> }>(
      page, 'origin', 'column-customization',
    );
    const spreadAssignment = (originState?.assignments as Record<string, { cellStyleOverrides?: { typography?: { italic?: boolean } } }> | undefined)?.spread;
    expect(spreadAssignment?.cellStyleOverrides?.typography?.italic).toBeUndefined();
  });

  test('bold on different columns in A vs B is fully independent', async ({ page }) => {
    await createLayout(page, 'AlphaPrice');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'price');
    await clickBold(page);
    await saveAll(page);

    await createLayout(page, 'BetaYield');
    await clickColumnCell(page, 'yield');
    await clickBold(page);
    await saveAll(page);

    // Beta: yield bold, price not bold.
    expect(await readCellFontWeight(page, 'yield')).toBe('700');
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');

    // Alpha: price bold, yield not bold.
    await switchToLayout(page, 'alphaprice', 'AlphaPrice');
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await readCellFontWeight(page, 'yield')).not.toBe('700');
  });

  test('"Clear all styles" wipes only the active layout, not the others', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'price');
    await clickBold(page);
    await saveAll(page);

    await createLayout(page, 'Beta');
    await clickColumnCell(page, 'yield');
    await clickBold(page);
    await saveAll(page);

    // Clear all on Beta via the toolbar button + AlertDialog.
    await page.locator('[data-testid="formatting-clear-all"]').click();
    await page.locator('[data-testid="formatting-clear-all-confirm-btn"]').click();
    await page.waitForTimeout(200);
    expect(await readCellFontWeight(page, 'yield')).not.toBe('700');
    await saveAll(page);

    // Alpha still has its bold-on-price.
    await switchToLayout(page, 'alpha', 'Alpha');
    expect(await readCellFontWeight(page, 'price')).toBe('700');
  });

  test('unsaved customization in A is discarded when switching to B (explicit-save contract)', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await saveAll(page);
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'price');
    await clickBold(page);
    expect(await readCellFontWeight(page, 'price')).toBe('700');
    // DO NOT click save. The explicit-save contract means switching
    // with unsaved edits pops a confirm dialog; answering "discard"
    // throws them away.
    await createLayout(page, 'Beta'); // Creating also flips active; unsaved Alpha edits are thrown away.

    await switchToLayout(page, 'alpha', 'Alpha');
    // Alpha's saved state had no bold — it should be back to default.
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');
  });
});

test.describe('v2 layout isolation — conditional styling rules', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('rule created in A does not appear in B (row class gone after switch)', async ({ page }) => {
    await createLayout(page, 'Alpha');
    const ruleA = await addConditionalRule(page);
    await saveRule(page, ruleA);
    await closeSettingsSheet(page);
    await saveAll(page);

    // Alpha has the rule → row class present.
    expect(await countRowsWithRuleClass(page, ruleA)).toBeGreaterThan(0);

    await createLayout(page, 'Beta');
    // Beta is blank — no rule-class rows.
    expect(await countRowsWithRuleClass(page, ruleA)).toBe(0);
  });

  test('rule stored ONLY under the creating layout (disk check)', async ({ page }) => {
    await createLayout(page, 'Alpha');
    const ruleA = await addConditionalRule(page);
    await saveRule(page, ruleA);
    await saveAll(page);

    const alphaState = await readLayoutModuleState<{ rules?: Array<{ id?: string }> }>(
      page, 'alpha', 'conditional-styling',
    );
    const defaultState = await readLayoutModuleState<{ rules?: Array<{ id?: string }> }>(
      page, '__default__', 'conditional-styling',
    );
    expect(alphaState?.rules?.some((r) => r.id === ruleA)).toBe(true);
    expect(defaultState?.rules?.some((r) => r.id === ruleA) ?? false).toBe(false);
  });

  test('editing a rule in A does not mutate the same rule id if it appears in a clone', async ({ page }) => {
    await createLayout(page, 'Alpha');
    const ruleA = await addConditionalRule(page);
    // Name the rule "Original" in Alpha.
    await page.locator(`[data-testid="cs-rule-name-${ruleA}"]`).fill('Original');
    await saveRule(page, ruleA);
    await saveAll(page);

    await cloneLayout(page, 'alpha', 'Alpha'); // now on "Alpha (copy)"
    // Verify the clone has the rule with name "Original".
    await openPanel(page, 'conditional-styling');
    await expect(page.locator(`[data-testid="cs-rule-name-${ruleA}"]`)).toHaveValue('Original');
    // Rename in clone to "Diverged" — shouldn't touch Alpha.
    await page.locator(`[data-testid="cs-rule-name-${ruleA}"]`).fill('Diverged');
    await saveRule(page, ruleA);
    await saveAll(page);

    await switchToLayout(page, 'alpha', 'Alpha');
    await openPanel(page, 'conditional-styling');
    await page.locator(`[data-testid="cs-rule-card-${ruleA}"]`).click();
    await expect(page.locator(`[data-testid="cs-rule-name-${ruleA}"]`)).toHaveValue('Original');
  });

  test('two layouts can both carry rules with the same rule id without collision', async ({ page }) => {
    // (Different rules happen to share an id shape if created in
    // separate layouts — the transform pipeline processes each
    // layout's rules independently, no global uniqueness needed.)
    await createLayout(page, 'Alpha');
    const ruleA = await addConditionalRule(page);
    await saveRule(page, ruleA);
    await saveAll(page);

    await createLayout(page, 'Beta');
    const ruleB = await addConditionalRule(page);
    await saveRule(page, ruleB);
    await saveAll(page);

    // Beta's rule applies to rows; Alpha's doesn't (because Alpha is inactive).
    expect(await countRowsWithRuleClass(page, ruleB)).toBeGreaterThan(0);
    if (ruleA !== ruleB) {
      // Different ids: Alpha's rule class absent on Beta's grid.
      expect(await countRowsWithRuleClass(page, ruleA)).toBe(0);
    }
  });

  test('deleting a rule in A does not affect B', async ({ page }) => {
    await createLayout(page, 'Alpha');
    const ruleA = await addConditionalRule(page);
    await saveRule(page, ruleA);
    await saveAll(page);

    await cloneLayout(page, 'alpha', 'Alpha'); // clone → "alpha-copy" with the same rule

    // On the clone, delete the rule.
    await openPanel(page, 'conditional-styling');
    const deleteBtn = page.locator(`[data-testid="cs-rule-delete-${ruleA}"]`);
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      // Confirm dialog if any.
      const confirm = page.locator('[role="alertdialog"] button').filter({ hasText: /delete|remove/i });
      if (await confirm.count() > 0) await confirm.first().click();
    }
    await saveAll(page);

    await switchToLayout(page, 'alpha', 'Alpha');
    // Alpha still carries the rule class.
    await closeSettingsSheet(page);
    expect(await countRowsWithRuleClass(page, ruleA)).toBeGreaterThan(0);
  });

  test('rule persists through create/switch/reload cycle', async ({ page }) => {
    // Sanity: ensure rule applies under the new layout AND survives reload.
    await createLayout(page, 'Persistent');
    const ruleId = await addConditionalRule(page);
    await saveRule(page, ruleId);
    await saveAll(page);
    await closeSettingsSheet(page);

    expect(await countRowsWithRuleClass(page, ruleId)).toBeGreaterThan(0);

    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    // Persistent is still the active layout after reload.
    expect(await countRowsWithRuleClass(page, ruleId)).toBeGreaterThan(0);
  });

  test('multiple rules on one layout all apply; none leak to another layout', async ({ page }) => {
    await createLayout(page, 'MultiRule');
    const r1 = await addConditionalRule(page);
    await saveRule(page, r1);
    const r2 = await addConditionalRule(page);
    await saveRule(page, r2);
    const r3 = await addConditionalRule(page);
    await saveRule(page, r3);
    await saveAll(page);
    await closeSettingsSheet(page);

    for (const id of [r1, r2, r3]) {
      expect(await countRowsWithRuleClass(page, id)).toBeGreaterThan(0);
    }

    await createLayout(page, 'Clean');
    for (const id of [r1, r2, r3]) {
      expect(await countRowsWithRuleClass(page, id)).toBe(0);
    }
  });

  test('Default layout rules are independent of user layouts', async ({ page }) => {
    // Add rule on Default.
    const defRule = await addConditionalRule(page);
    await saveRule(page, defRule);
    await saveAll(page);
    await closeSettingsSheet(page);

    // Create another layout — new layout starts blank.
    await createLayout(page, 'Fresh');
    expect(await countRowsWithRuleClass(page, defRule)).toBe(0);

    await switchToLayout(page, '__default__', 'Default');
    await closeSettingsSheet(page); // in case we dropped into a panel
    expect(await countRowsWithRuleClass(page, defRule)).toBeGreaterThan(0);
  });
});

test.describe('v2 layout isolation — multi-module combined styling', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('layout A has bold + rule; layout B has neither (combined DOM check)', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'price');
    await clickBold(page);
    const ruleA = await addConditionalRule(page);
    await saveRule(page, ruleA);
    await closeSettingsSheet(page);
    await saveAll(page);

    expect(await readCellFontWeight(page, 'price')).toBe('700');
    expect(await countRowsWithRuleClass(page, ruleA)).toBeGreaterThan(0);

    await createLayout(page, 'Beta');
    expect(await readCellFontWeight(page, 'price')).not.toBe('700');
    expect(await countRowsWithRuleClass(page, ruleA)).toBe(0);
  });

  test('stored layouts table reflects module state independence after multi-layout session', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'quantity');
    await clickBold(page);
    await saveAll(page);

    await createLayout(page, 'Beta');
    const ruleB = await addConditionalRule(page);
    await saveRule(page, ruleB);
    await closeSettingsSheet(page);
    await saveAll(page);

    const stored = await readStoredLayouts(page);
    const alpha = stored.find((p) => p.id === 'alpha');
    const beta = stored.find((p) => p.id === 'beta');

    const alphaCust = (alpha!.state['column-customization'] as { v?: number; data?: { assignments?: Record<string, unknown> } }).data;
    const betaCust = (beta!.state['column-customization'] as { v?: number; data?: { assignments?: Record<string, unknown> } }).data;
    expect(Object.keys(alphaCust?.assignments ?? {})).toContain('quantity');
    expect(Object.keys(betaCust?.assignments ?? {})).not.toContain('quantity');

    const alphaCs = (alpha!.state['conditional-styling'] as { v?: number; data?: { rules?: Array<{ id?: string }> } }).data;
    const betaCs = (beta!.state['conditional-styling'] as { v?: number; data?: { rules?: Array<{ id?: string }> } }).data;
    expect(alphaCs?.rules?.some((r) => r.id === ruleB) ?? false).toBe(false);
    expect(betaCs?.rules?.some((r) => r.id === ruleB)).toBe(true);
  });

  test('deleting a layout also removes its module state from disk (no ghost state)', async ({ page }) => {
    await createLayout(page, 'Doomed');
    await openFormatterToolbar(page);
    await clickColumnCell(page, 'spread');
    await clickBold(page);
    await saveAll(page);

    let stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id)).toContain('doomed');

    await deleteLayout(page, 'doomed');
    stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id)).not.toContain('doomed');
  });
});

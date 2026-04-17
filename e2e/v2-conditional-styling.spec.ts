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
 * + active-profile pointers before each test, navigate to `?v=2`, exercise
 * via data-testid selectors.
 */

const V2_PATH = '/?v=2';

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

  test('Adding a rule paints matching cells and survives reload (auto-save, no Save All)', async ({ page }) => {
    // 1. Open sheet, add a rule
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await expect(page.locator('[data-testid="cs-panel"]')).toBeVisible();
    await page.locator('[data-testid="cs-add-rule-btn"]').click();

    const editor = page.locator('[data-testid="cs-rule-editor"]');
    await expect(editor).toBeVisible();

    // 2. Switch scope to Cell so the column picker renders, then pick Qty
    //    (colId `quantity`).
    await page
      .locator('[data-testid="cs-panel"] select:not(.gc-cs-col-add)')
      .first()
      .selectOption('cell');
    const colSelect = page.locator('select.gc-cs-col-add');
    await colSelect.selectOption('quantity');
    await expect(page.locator('.gc-cs-col-chip')).toContainText('Qty');

    // 3. Set expression `x > 0` through the Monaco editor. setValue pushes
    //    the text into the model; Tab blurs so ExpressionEditor's
    //    onDidBlurEditorWidget handler commits via onCommit.
    await page.waitForFunction(
      () => !!(window as any).monaco?.editor?.getEditors?.().length,
      { timeout: 10_000 },
    );
    await page.evaluate(() => {
      const ed = (window as any).monaco.editor.getEditors()[0];
      ed?.setValue('x > 0');
      ed?.focus();
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // 4. Per-card Save — edits no longer auto-commit on keystroke. Click the
    //    rule's SAVE pill to push the draft into module state.
    const cardId = await editor.evaluate(
      (el) => el.getAttribute('data-rule-testid')!.replace('cs-rule-editor-', ''),
    );
    await page.locator(`[data-testid="cs-rule-save-${cardId}"]`).click();

    // 5. Close the sheet so cells aren't obscured by the overlay
    await page.locator('[data-testid="v2-settings-done-btn"]').click();

    // 5. Verify at least one cell got the rule class. The class is
    //    `gc-rule-<id>` where id is the auto-generated rule id; we don't know
    //    it here, so match any element whose className contains 'gc-rule-'.
    const styledCount = await page.locator('[class*="gc-rule-"]').count();
    expect(styledCount).toBeGreaterThan(0);

    // 6. Wait past the auto-save debounce, then reload — NO Save All click.
    await page.waitForTimeout(500);
    await page.reload();
    await waitForV2Grid(page);

    // 7. Cells survive: the rule was persisted and re-applied on mount.
    const styledAfterReload = await page.locator('[class*="gc-rule-"]').count();
    expect(styledAfterReload).toBeGreaterThan(0);

    // 8. The rule itself is back in the panel.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await expect(page.locator('[data-testid^="cs-rule-card-"]')).toHaveCount(1);
  });

  test('Disabling a rule removes the cell styling without deleting it', async ({ page }) => {
    // Add a rule, switch to Cell scope + target Qty.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="cs-add-rule-btn"]').click();
    await page
      .locator('[data-testid="cs-panel"] select:not(.gc-cs-col-add)')
      .first()
      .selectOption('cell');
    await page.locator('select.gc-cs-col-add').selectOption('quantity');

    // Commit the draft (per-card Save) so the rule ships to module state.
    const editor = page.locator('[data-testid="cs-rule-editor"]');
    const ruleId = await editor.evaluate(
      (el) => el.getAttribute('data-rule-testid')!.replace('cs-rule-editor-', ''),
    );
    await page.locator(`[data-testid="cs-rule-save-${ruleId}"]`).click();
    await page.locator('[data-testid="v2-settings-done-btn"]').click();

    expect(await page.locator('[class*="gc-rule-"]').count()).toBeGreaterThan(0);

    // Open sheet, toggle the rule's Status switch off. The shadcn Switch
    // keeps the real <input> as `sr-only` (positioned off-viewport for
    // accessibility), so dispatch the click programmatically on the
    // underlying input.
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.evaluate(() => {
      const cb = document.querySelector(
        '[data-testid="cs-rule-editor"] input[type="checkbox"]',
      ) as HTMLInputElement | null;
      cb?.click();
    });

    // Save the toggle change and close.
    await page.locator(`[data-testid="cs-rule-save-${ruleId}"]`).click();
    await page.locator('[data-testid="v2-settings-done-btn"]').click();

    // Cells should no longer carry any gc-rule-* class.
    expect(await page.locator('[class*="gc-rule-"]').count()).toBe(0);
  });

  test('Deleting a rule removes it from the panel and the grid', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await page.locator('[data-testid="cs-add-rule-btn"]').click();
    await page
      .locator('[data-testid="cs-panel"] select:not(.gc-cs-col-add)')
      .first()
      .selectOption('cell');
    await page.locator('select.gc-cs-col-add').selectOption('quantity');

    const card = page.locator('[data-testid^="cs-rule-card-"]').first();
    const ruleId = await card.evaluate((el) => el.getAttribute('data-testid')!.replace('cs-rule-card-', ''));

    // Commit once so the rule exists in module state before deletion.
    await page.locator(`[data-testid="cs-rule-save-${ruleId}"]`).click();

    await page.locator(`[data-testid="cs-rule-delete-${ruleId}"]`).click();

    await expect(page.locator('[data-testid^="cs-rule-card-"]')).toHaveCount(0);
    await page.locator('[data-testid="v2-settings-done-btn"]').click();
    expect(await page.locator('[class*="gc-rule-"]').count()).toBe(0);
  });
});

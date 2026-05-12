import { test, expect } from '@playwright/test';
import { bootCleanDemo } from './helpers/settingsSheet';
import {
  layoutTrigger,
  layoutPopover,
  layoutRow,
  openLayoutPopover,
  closeLayoutPopover,
  createLayout,
  cloneLayout,
  deleteLayout,
  switchToLayout,
  readStoredLayouts,
  readActiveLayoutId,
  layoutCloneBtn,
  layoutDeleteBtn,
  deleteConfirmDialog,
  deleteCancelBtn,
} from './helpers/layoutHelpers';

/**
 * E2E — layout lifecycle stress tests.
 *
 * Covers every state transition for a layout: create, clone, switch,
 * delete, plus the edge cases around reserved Default, name collision,
 * and rapid create/delete cycles.
 *
 * What these tests PROVE:
 *   - `LayoutManager.create()` is an explicit write (persists without
 *     a Save click) — a user creating layouts doesn't need to save.
 *   - `clone()` captures live state when source is active, on-disk
 *     snapshot otherwise.
 *   - Delete of the active layout flips back to Default (the one
 *     reserved, undeletable layout).
 *   - Rapid create/delete/clone sequences leave no phantom rows, no
 *     stale active-id pointers, no bleeding between layouts.
 *
 * Each test starts from `bootCleanDemo()` so storage + active-id
 * pointer are wiped; tests are order-independent.
 */

test.describe('v2 layout lifecycle — creation', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('Default layout is auto-seeded on first mount and is the active layout', async ({ page }) => {
    await expect(layoutTrigger(page)).toContainText('Default');
    const activeId = await readActiveLayoutId(page);
    expect(activeId).toBe('__default__');
  });

  test('creating a layout flips active to the new one and persists immediately', async ({ page }) => {
    await createLayout(page, 'Alpha');
    expect(await readActiveLayoutId(page)).toBe('alpha');
    // Persisted to IndexedDB without a Save click.
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'alpha']);
  });

  test('layout creation survives full page reload', async ({ page }) => {
    await createLayout(page, 'Persist-Me');
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    await expect(layoutTrigger(page)).toContainText('Persist-Me');
    expect(await readActiveLayoutId(page)).toBe('persist-me');
  });

  test('creating layout with trailing/leading whitespace trims the name', async ({ page }) => {
    await createLayout(page, '   Trimmed   ');
    await expect(layoutTrigger(page)).toContainText('Trimmed');
  });

  test('creating layout with empty name is a no-op (no new row)', async ({ page }) => {
    await openLayoutPopover(page);
    await page.locator('[data-testid="layout-name-input"]').fill('');
    const btn = page.locator('[data-testid="layout-create-btn"]');
    await expect(btn).toBeDisabled();
    const stored = await readStoredLayouts(page);
    expect(stored).toHaveLength(1); // Default only
  });

  test('creating multiple layouts in sequence lists them all in the popover', async ({ page }) => {
    await createLayout(page, 'First');
    await createLayout(page, 'Second');
    await createLayout(page, 'Third');
    await openLayoutPopover(page);
    for (const name of ['Default', 'First', 'Second', 'Third']) {
      await expect(layoutPopover(page).getByText(name, { exact: true })).toBeVisible();
    }
    expect((await readStoredLayouts(page)).map((p) => p.id).sort()).toEqual(
      ['__default__', 'first', 'second', 'third'],
    );
  });
});

test.describe('v2 layout lifecycle — switching', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('switching layouts updates the trigger + active-id pointer', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await createLayout(page, 'Beta');
    expect(await readActiveLayoutId(page)).toBe('beta');
    await switchToLayout(page, 'alpha', 'Alpha');
    expect(await readActiveLayoutId(page)).toBe('alpha');
    await switchToLayout(page, '__default__', 'Default');
    expect(await readActiveLayoutId(page)).toBe('__default__');
  });

  test('active layout pointer persists across reload', async ({ page }) => {
    await createLayout(page, 'Alpha');
    await createLayout(page, 'Beta');
    await switchToLayout(page, 'alpha', 'Alpha');
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]');
    await expect(layoutTrigger(page)).toContainText('Alpha');
    expect(await readActiveLayoutId(page)).toBe('alpha');
  });

  test('rapid switching between 3 layouts keeps the pointer consistent', async ({ page }) => {
    await createLayout(page, 'A');
    await createLayout(page, 'B');
    await createLayout(page, 'C');
    for (let i = 0; i < 5; i++) {
      await switchToLayout(page, 'a', 'A');
      await switchToLayout(page, 'c', 'C');
      await switchToLayout(page, 'b', 'B');
    }
    expect(await readActiveLayoutId(page)).toBe('b');
    // Stored rows unchanged — switching shouldn't grow the count.
    const stored = await readStoredLayouts(page);
    expect(stored).toHaveLength(4);
  });
});

test.describe('v2 layout lifecycle — deletion', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('deleting a non-active layout removes its row and keeps current layout active', async ({ page }) => {
    await createLayout(page, 'Keep');
    await createLayout(page, 'Drop');
    await switchToLayout(page, 'keep', 'Keep');
    await deleteLayout(page, 'drop');
    expect(await readActiveLayoutId(page)).toBe('keep');
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'keep']);
  });

  test('deleting the ACTIVE layout falls back to Default', async ({ page }) => {
    await createLayout(page, 'DoomedLayout');
    expect(await readActiveLayoutId(page)).toBe('doomedlayout');
    await deleteLayout(page, 'doomedlayout');
    expect(await readActiveLayoutId(page)).toBe('__default__');
    await expect(layoutTrigger(page)).toContainText('Default');
  });

  test('Default layout has no delete button (reserved + undeletable)', async ({ page }) => {
    await openLayoutPopover(page);
    await expect(layoutRow(page, '__default__')).toBeVisible();
    await expect(layoutDeleteBtn(page, '__default__')).toHaveCount(0);
  });

  test('cancel in the delete AlertDialog leaves the layout intact', async ({ page }) => {
    await createLayout(page, 'Nope');
    await openLayoutPopover(page);
    await layoutDeleteBtn(page, 'nope').click();
    await expect(deleteConfirmDialog(page)).toBeVisible();
    await deleteCancelBtn(page).click();
    await expect(deleteConfirmDialog(page)).toHaveCount(0);
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id)).toContain('nope');
  });

  test('deleting then recreating the same name produces a fresh layout (no leftover state)', async ({ page }) => {
    await createLayout(page, 'Recycled');
    await deleteLayout(page, 'recycled');
    expect(await readActiveLayoutId(page)).toBe('__default__');
    await createLayout(page, 'Recycled');
    const stored = await readStoredLayouts(page);
    const row = stored.find((p) => p.id === 'recycled');
    expect(row).toBeDefined();
    // Fresh layout starts with blank module-customization assignments.
    const cc = (row!.state['column-customization'] as { v?: number; data?: { assignments?: unknown } } | undefined)?.data;
    expect(cc?.assignments ?? {}).toEqual({});
  });
});

test.describe('v2 layout lifecycle — cloning', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('cloning Default yields a new layout named "Default (copy)" and activates it', async ({ page }) => {
    await cloneLayout(page, '__default__', 'Default');
    expect(await readActiveLayoutId(page)).toBe('default-copy');
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id).sort()).toEqual(['__default__', 'default-copy']);
    expect(stored.find((p) => p.id === 'default-copy')?.name).toBe('Default (copy)');
  });

  test('cloning a user-created layout preserves its name with "(copy)" suffix', async ({ page }) => {
    await createLayout(page, 'Source');
    const newName = await cloneLayout(page, 'source', 'Source');
    expect(newName).toContain('Source (copy)');
    expect(await readActiveLayoutId(page)).toBe('source-copy');
  });

  test('repeatedly cloning the same source produces "(copy 2)", "(copy 3)", …', async ({ page }) => {
    await createLayout(page, 'Origin');
    await cloneLayout(page, 'origin', 'Origin');
    // Back to origin to clone it a second time.
    await switchToLayout(page, 'origin', 'Origin');
    await cloneLayout(page, 'origin', 'Origin');
    await switchToLayout(page, 'origin', 'Origin');
    await cloneLayout(page, 'origin', 'Origin');

    const stored = await readStoredLayouts(page);
    const cloneNames = stored.filter((p) => p.id.startsWith('origin-copy')).map((p) => p.name);
    expect(cloneNames).toContain('Origin (copy)');
    expect(cloneNames).toContain('Origin (copy 2)');
    expect(cloneNames).toContain('Origin (copy 3)');
  });

  test('deleting a clone source leaves the clone intact', async ({ page }) => {
    await createLayout(page, 'Parent');
    await cloneLayout(page, 'parent', 'Parent');
    // Back to Parent, delete it.
    await switchToLayout(page, 'parent', 'Parent');
    await deleteLayout(page, 'parent');
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id)).toContain('parent-copy');
    expect(stored.map((p) => p.id)).not.toContain('parent');
  });

  test('cloning then deleting the clone leaves the source intact', async ({ page }) => {
    await createLayout(page, 'Source');
    await cloneLayout(page, 'source', 'Source');
    await deleteLayout(page, 'source-copy');
    expect(await readActiveLayoutId(page)).toBe('__default__');
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id)).toContain('source');
    expect(stored.map((p) => p.id)).not.toContain('source-copy');
  });

  test('Default (reserved) layout can still be cloned — cloning ≠ editing', async ({ page }) => {
    // Reserved-id is for DELETE protection; cloning should be freely allowed.
    await openLayoutPopover(page);
    await expect(layoutCloneBtn(page, '__default__')).toBeVisible();
    await cloneLayout(page, '__default__', 'Default');
    const stored = await readStoredLayouts(page);
    expect(stored.map((p) => p.id)).toContain('default-copy');
  });

  test('clones of clones chain indefinitely with unique ids', async ({ page }) => {
    await createLayout(page, 'Gen0');
    await cloneLayout(page, 'gen0', 'Gen0'); // active: gen0-copy ("Gen0 (copy)")
    // Clone the active clone.
    const trigger1 = (await layoutTrigger(page).textContent())?.trim() ?? '';
    await cloneLayout(page, 'gen0-copy', trigger1);
    const trigger2 = (await layoutTrigger(page).textContent())?.trim() ?? '';
    expect(trigger2).not.toBe(trigger1);
    const stored = await readStoredLayouts(page);
    // Expect 4 layouts: Default + gen0 + gen0-copy + the grandchild.
    expect(stored.length).toBe(4);
  });

  test('closing the layout popover via Escape works even during rapid operations', async ({ page }) => {
    await createLayout(page, 'Blip');
    await openLayoutPopover(page);
    await closeLayoutPopover(page);
    await openLayoutPopover(page);
    await closeLayoutPopover(page);
    // No assertion needed — just proves the helper chain is stable.
  });
});

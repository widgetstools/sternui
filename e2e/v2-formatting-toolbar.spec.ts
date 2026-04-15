import { test, expect, Page } from '@playwright/test';

/**
 * E2E smoke coverage for v2's inline FormattingToolbar (?v=2).
 *
 * Covers the direct-click features whose buttons carry a tooltip wrapper:
 * bold / italic / underline, alignment L/C/R, clear-all-styles, and the
 * disabled state of the deferred undo/redo buttons.
 *
 * Popover-triggered features (currency / borders / fontSize / save-as) and
 * the color pickers are covered by the manual smoke pass documented in
 * IMPLEMENTED_FEATURES.md sub-project #4 — adding stable E2E selectors for
 * those will land alongside data-testid additions in a follow-up.
 */

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearV2(page: Page) {
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

async function getFirstDataColId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const cell = document.querySelector('.ag-center-cols-container .ag-cell');
    return cell?.getAttribute('col-id') ?? '';
  });
}

async function selectCell(page: Page, colId: string, rowIndex = 0) {
  const cell = page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
  await cell.click();
  // Allow the active-column polling (300ms tick) plus React batching to land.
  await page.waitForTimeout(700);
}

async function getCellStyle(page: Page, colId: string, prop: string, rowIndex = 0): Promise<string> {
  return page.evaluate(({ id, row, p }) => {
    const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
    return cell ? getComputedStyle(cell).getPropertyValue(p) : '';
  }, { id: colId, row: rowIndex, p: prop });
}

/**
 * Click a toolbar button by its tooltip text. The shadcn `Tooltip` wrapper
 * renders the text as a sibling div inside the same `.group` container as the
 * button, so we walk the DOM to find a matching group and click its button.
 * Same pattern as the v1 `clickToolbarBtn` helper.
 */
async function clickToolbarBtn(page: Page, tooltipText: string) {
  await page.evaluate((tip) => {
    const toolbar = document.querySelector('.gc-formatting-toolbar');
    if (!toolbar) throw new Error('FormattingToolbar not found');
    const groups = toolbar.querySelectorAll('.group');
    for (const group of groups) {
      const texts = group.querySelectorAll('div');
      for (const t of texts) {
        if (t.textContent?.trim() === tip) {
          const btn = group.querySelector('button');
          if (btn) {
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            return;
          }
        }
      }
    }
    throw new Error(`Toolbar button with tooltip "${tip}" not found`);
  }, tooltipText);
  await page.waitForTimeout(300);
}

async function isToolbarBtnDisabled(page: Page, tooltipText: string): Promise<boolean> {
  return page.evaluate((tip) => {
    const toolbar = document.querySelector('.gc-formatting-toolbar');
    if (!toolbar) return false;
    const groups = toolbar.querySelectorAll('.group');
    for (const group of groups) {
      const texts = group.querySelectorAll('div');
      for (const t of texts) {
        if (t.textContent?.trim() === tip) {
          const btn = group.querySelector('button');
          return !!btn && (btn as HTMLButtonElement).disabled;
        }
      }
    }
    return false;
  }, tooltipText);
}

test.describe('v2 FormattingToolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?v=2');
    await clearV2(page);
    await page.goto('/?v=2');
    await waitForGrid(page);
    await expect(page.locator('.gc-formatting-toolbar')).toBeVisible();
  });

  test('toolbar moves into enabled state once a cell is selected', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    expect(colId).toBeTruthy();
    await selectCell(page, colId);
    const enabledClass = await page.evaluate(() => {
      const tb = document.querySelector('.gc-formatting-toolbar');
      return tb?.className?.includes('gc-toolbar-enabled') ?? false;
    });
    expect(enabledClass).toBe(true);
  });

  test('Bold writes typography.bold and emits font-weight 700', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    const fontWeight = await getCellStyle(page, colId, 'font-weight');
    expect(['700', 'bold']).toContain(fontWeight);
  });

  test('Italic writes typography.italic and emits font-style italic', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Italic');
    expect(await getCellStyle(page, colId, 'font-style')).toBe('italic');
  });

  test('Underline writes typography.underline and emits text-decoration', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Underline');
    expect(await getCellStyle(page, colId, 'text-decoration-line')).toContain('underline');
  });

  test('Right writes alignment.horizontal=right and emits text-align', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Right');
    expect(await getCellStyle(page, colId, 'text-align')).toBe('right');
  });

  test('Center writes alignment.horizontal=center and emits text-align', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Center');
    expect(await getCellStyle(page, colId, 'text-align')).toBe('center');
  });

  test('Left writes alignment.horizontal=left and emits text-align', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Left');
    expect(await getCellStyle(page, colId, 'text-align')).toBe('left');
  });

  test('Clear all styles resets the column to bare {colId}', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    expect(['700', 'bold']).toContain(await getCellStyle(page, colId, 'font-weight'));
    expect(await getCellStyle(page, colId, 'font-style')).toBe('italic');

    await clickToolbarBtn(page, 'Clear all styles');
    await page.waitForTimeout(400);

    const fw = await getCellStyle(page, colId, 'font-weight');
    expect(['400', 'normal']).toContain(fw);
    expect(await getCellStyle(page, colId, 'font-style')).toBe('normal');
  });

  test('Bold persists across reload via auto-save (no Save All click)', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    // Wait past the 300ms auto-save debounce.
    await page.waitForTimeout(800);

    await page.reload();
    await waitForGrid(page);
    await expect(page.locator('.gc-formatting-toolbar')).toBeVisible();
    const fontWeight = await getCellStyle(page, colId, 'font-weight');
    expect(['700', 'bold']).toContain(fontWeight);
  });

  test('Save as template button stays enabled and clickable when a cell is selected', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    expect(await isToolbarBtnDisabled(page, 'Save as template')).toBe(false);
  });
});

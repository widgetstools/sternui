import { test, expect, Page } from '@playwright/test';

/**
 * E2E: Custom border styling must not break AG-Grid cell selection.
 *
 * Borders are rendered via a ::after pseudo-element with box-shadow: inset.
 * AG-Grid's cell selection uses box-shadow on the cell itself.
 * Both must coexist — selecting a bordered cell should show the blue selection
 * highlight AND the custom border simultaneously.
 */

/** Wait for AG-Grid to fully render rows */
async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

/** Click a data cell and wait for the toolbar to recognize it */
async function selectCell(page: Page, colId: string, rowIndex = 0) {
  const cell = page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
  await cell.click();
  // Wait for toolbar to detect the selection (polls via setInterval)
  await page.waitForTimeout(600);
}

/** Get the first non-pinned column ID visible in the grid */
async function getFirstDataColId(page: Page): Promise<string> {
  const colId = await page.evaluate(() => {
    const cells = document.querySelectorAll('.ag-center-cols-container .ag-cell');
    for (const cell of cells) {
      const id = cell.getAttribute('col-id');
      if (id) return id;
    }
    return null;
  });
  if (!colId) throw new Error('No data column found in grid');
  return colId;
}

/** Wait for toolbar to show a column name (not "Select a cell") */
async function waitForColumnSelected(page: Page) {
  // The toolbar shows the column name when a cell is selected
  // Poll until the toolbar no longer shows "Select a cell"
  await expect(async () => {
    const text = await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      return toolbar?.textContent ?? '';
    });
    expect(text).not.toContain('Select a cell');
  }).toPass({ timeout: 5000 });
}

/** Apply "All" borders via the border editor popover */
async function applyAllBorders(page: Page) {
  // Click the borders button (Grid3X3 icon) — find via the popover that contains "All" and "None" buttons
  await page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    // Find all Popover trigger wrappers — they're div.relative.inline-flex
    const wrappers = toolbar.querySelectorAll(':scope > div.relative.inline-flex, :scope > div > div.relative.inline-flex');
    // The border popover trigger is inside a TGroup, near the end of the toolbar
    // We find the last icon-button popover (excluding font size which has text)
    const triggers = toolbar.querySelectorAll('.cursor-pointer');
    // Click the last cursor-pointer that wraps a button with just an SVG (no text)
    for (let i = triggers.length - 1; i >= 0; i--) {
      const btn = triggers[i].querySelector('button');
      if (!btn) continue;
      // Grid3X3 icon — button with SVG and no text content
      const text = btn.textContent?.trim();
      const hasSvg = btn.querySelector('svg');
      if (hasSvg && (!text || text.length === 0)) {
        (triggers[i] as HTMLElement).click();
        return;
      }
    }
    throw new Error('Border editor trigger not found');
  });

  await page.waitForTimeout(300);

  // Click "All" button
  const allBtn = page.getByRole('button', { name: /All/i }).first();
  await allBtn.click({ force: true });
  await page.waitForTimeout(500);
}

/** Click "None" in the border editor popover */
async function clearAllBorders(page: Page) {
  const noneBtn = page.getByRole('button', { name: /None/i }).first();
  await noneBtn.click({ force: true });
  await page.waitForTimeout(500);
}

/** Close any open popover by pressing Escape */
async function closePopover(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** Check if the gc-col-c-{colId}::after rule has inset box-shadow */
async function hasBorderOverlay(page: Page, colId: string): Promise<boolean> {
  return page.evaluate((id) => {
    // Check if any stylesheet has a rule for .gc-col-c-{colId}::after with box-shadow
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const text = rule.cssText;
          if (text.includes(`gc-col-c-${id}`) && text.includes('::after') && text.includes('inset')) {
            return true;
          }
        }
      } catch { /* cross-origin */ }
    }
    return false;
  }, colId);
}

/** Check if the cell itself (not ::after) has inset box-shadow in its styles */
async function cellHasDirectInsetShadow(page: Page, colId: string, rowIndex: number): Promise<boolean> {
  return page.evaluate(({ id, row }) => {
    // Check injected stylesheet rules for direct (non-::after) box-shadow on this cell
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const text = rule.cssText;
          // Must match our cell class, have box-shadow with inset, but NOT be a ::after rule
          if (text.includes(`gc-col-c-${id}`) && !text.includes('::after') && text.includes('box-shadow') && text.includes('inset')) {
            return true;
          }
        }
      } catch { /* cross-origin */ }
    }
    return false;
  }, { id: colId, row: rowIndex });
}

test.describe('Border styling and cell selection coexistence', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear any persisted state from previous sessions
    await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('gc-state:')) localStorage.removeItem(key);
      }
    });
    await page.reload();
    await waitForGrid(page);
  });

  test('custom borders use ::after pseudo-element, not direct box-shadow on cell', async ({ page }) => {
    const colId = await getFirstDataColId(page);

    // Select cell and wait for toolbar recognition
    await selectCell(page, colId, 0);
    await waitForColumnSelected(page);

    // Debug: capture toolbar state
    const toolbarText = await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      return toolbar?.textContent ?? 'no toolbar';
    });
    console.log('Toolbar text:', toolbarText);
    console.log('Selected column:', colId);

    // Apply all borders
    await applyAllBorders(page);

    // Debug: check all stylesheets for gc-col rules
    const rules = await page.evaluate((id) => {
      const found: string[] = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.includes(`gc-col-c-${id}`) || rule.cssText.includes('gc-col-bo')) {
              found.push(rule.cssText.substring(0, 120));
            }
          }
        } catch {}
      }
      return found;
    }, colId);
    console.log('CSS rules for column:', JSON.stringify(rules, null, 2));

    // Verify: ::after rule exists with inset box-shadow
    const hasOverlay = await hasBorderOverlay(page, colId);
    expect(hasOverlay).toBe(true);

    // Verify: cell itself does NOT have direct inset box-shadow rule
    const hasDirect = await cellHasDirectInsetShadow(page, colId, 0);
    expect(hasDirect).toBe(false);
  });

  test('AG-Grid cell selection still works on bordered cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);

    // Select cell and apply borders
    await selectCell(page, colId, 0);
    await waitForColumnSelected(page);
    await applyAllBorders(page);

    // Close the popover so it doesn't intercept clicks
    await closePopover(page);

    // Click a different row in the same column to trigger range selection
    const targetCell = page.locator(`.ag-row[row-index="2"] .ag-cell[col-id="${colId}"]`);
    await targetCell.click();
    await page.waitForTimeout(300);

    // Verify cell has AG-Grid's range selection class
    await expect(targetCell).toHaveClass(/ag-cell-range-selected/);

    // Verify ::after border overlay is still present in stylesheets
    const hasOverlay = await hasBorderOverlay(page, colId);
    expect(hasOverlay).toBe(true);
  });

  test('clearing borders removes the ::after overlay rule', async ({ page }) => {
    const colId = await getFirstDataColId(page);

    // Select cell and apply borders
    await selectCell(page, colId, 0);
    await waitForColumnSelected(page);
    await applyAllBorders(page);

    // Confirm borders were applied
    expect(await hasBorderOverlay(page, colId)).toBe(true);

    // The border popover stays open after "All" — click "None" in same popover
    // If popover closed, reopen it
    const noneBtn = page.getByRole('button', { name: /None/i }).first();
    if (!(await noneBtn.isVisible())) {
      await closePopover(page);
      await applyAllBorders(page); // reopens the popover
    }
    await clearAllBorders(page);
    await page.waitForTimeout(500);

    // Close popover to let styles settle
    await closePopover(page);
    await page.waitForTimeout(300);

    // Verify overlay rule is gone
    const hasOverlay = await hasBorderOverlay(page, colId);
    expect(hasOverlay).toBe(false);
  });

  test('column separator borders are not affected by custom borders', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    const cellSelector = `.ag-row[row-index="0"] .ag-cell[col-id="${colId}"]`;

    // Measure the cell's right border (AG-Grid column separator) before customization
    const borderBefore = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return window.getComputedStyle(el).borderRightWidth;
    }, cellSelector);

    // Apply borders
    await selectCell(page, colId, 0);
    await waitForColumnSelected(page);
    await applyAllBorders(page);

    // Measure after — should be identical (separator intact)
    const borderAfter = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return window.getComputedStyle(el).borderRightWidth;
    }, cellSelector);

    expect(borderAfter).toBe(borderBefore);
  });

  test('border-only styles add cellClass so ::after selector matches', async ({ page }) => {
    const colId = await getFirstDataColId(page);

    // Select cell, apply ONLY borders (no font/color changes)
    await selectCell(page, colId, 0);
    await waitForColumnSelected(page);
    await applyAllBorders(page);

    // Verify the cell has the gc-col-c class applied
    const hasClass = await page.evaluate(({ id }) => {
      const cell = document.querySelector(`.ag-row[row-index="0"] .ag-cell[col-id="${id}"]`);
      return cell?.className.includes(`gc-col-c-${id}`) ?? false;
    }, { id: colId });
    expect(hasClass).toBe(true);

    // Verify the ::after overlay rule exists
    expect(await hasBorderOverlay(page, colId)).toBe(true);

    // Verify the ::after pseudo-element actually renders with box-shadow
    const afterShadow = await page.evaluate(({ id }) => {
      const cell = document.querySelector(`.ag-row[row-index="0"] .ag-cell[col-id="${id}"]`);
      if (!cell) return 'not-found';
      return window.getComputedStyle(cell, '::after').boxShadow;
    }, { id: colId });
    expect(afterShadow).toContain('inset');
  });

  test('header borders render via ::after overlay when HDR mode is active', async ({ page }) => {
    const colId = await getFirstDataColId(page);

    // Select cell
    await selectCell(page, colId, 0);
    await waitForColumnSelected(page);

    // Switch to HDR mode
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      const tabs = toolbar?.querySelectorAll('[role="tab"]') ?? [];
      for (const tab of tabs) {
        if (tab.textContent?.trim() === 'Header') { (tab as HTMLElement).click(); return; }
      }
    });
    await page.waitForTimeout(300);

    // Apply all borders in HDR mode
    await applyAllBorders(page);

    // Verify header has the gc-hdr-c class
    const hasHdrClass = await page.evaluate(({ id }) => {
      const hdr = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
      return hdr?.className.includes(`gc-hdr-c-${id}`) ?? false;
    }, { id: colId });
    expect(hasHdrClass).toBe(true);

    // Verify the header ::after overlay rule exists
    const hasHdrOverlay = await page.evaluate((id) => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.includes(`gc-hdr-c-${id}`) && rule.cssText.includes('::after') && rule.cssText.includes('inset')) return true;
          }
        } catch {}
      }
      return false;
    }, colId);
    expect(hasHdrOverlay).toBe(true);

    // Verify the header ::after renders with box-shadow
    const hdrAfterShadow = await page.evaluate(({ id }) => {
      const hdr = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
      if (!hdr) return 'not-found';
      return window.getComputedStyle(hdr, '::after').boxShadow;
    }, { id: colId });
    expect(hdrAfterShadow).toContain('inset');
  });
});

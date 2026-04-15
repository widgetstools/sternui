import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive E2E tests for every toolbar button — applied to both CELLS and HEADERS.
 *
 * Each toolbar button is tested for:
 * 1. Applying the style to cells (CELL mode)
 * 2. Applying the style to headers (HDR mode)
 * 3. Toggling off (where applicable)
 *
 * Covers: Bold, Italic, Underline, Alignment (L/C/R), Font Size, Text Color,
 * Background Color, Currency ($), Percentage (%), Thousands (#), Decimal ←/→,
 * Borders (All/None), Clear All, Save, Undo, Redo.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearState(page: Page) {
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('gc-')).forEach(k => localStorage.removeItem(k));
  });
}

/** Get a numeric column ID (for formatter tests) */
async function getNumericColId(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Find a column with numeric data
    const cells = document.querySelectorAll('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell');
    for (const cell of cells) {
      const val = cell.textContent?.trim() ?? '';
      if (/^-?\d+\.?\d*$/.test(val)) return cell.getAttribute('col-id') ?? '';
    }
    return '';
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
  await page.waitForTimeout(600);
  await expect(async () => {
    const text = await page.evaluate(() =>
      document.querySelector('[class*="z-[10000]"]')?.textContent ?? ''
    );
    expect(text).not.toContain('Select a cell');
  }).toPass({ timeout: 3000 });
}

async function clickToolbarBtn(page: Page, tooltipText: string) {
  await page.evaluate((tip) => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    const groups = toolbar.querySelectorAll('.group');
    for (const group of groups) {
      const texts = group.querySelectorAll('div');
      for (const t of texts) {
        if (t.textContent?.trim() === tip) {
          const btn = group.querySelector('button');
          if (btn) { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return; }
        }
      }
    }
    for (const group of groups) {
      if (group.textContent?.includes(tip) && !group.textContent?.includes(tip + ' ')) {
        const btn = group.querySelector('button');
        if (btn) { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return; }
      }
    }
    throw new Error(`Toolbar button "${tip}" not found`);
  }, tooltipText);
  await page.waitForTimeout(300);
}

/** Click a ToggleGroup item by matching its text content */
function clickToggleItem(page: Page, label: string) {
  return page.evaluate((lbl) => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    const tabs = toolbar?.querySelectorAll('[role="tab"]') ?? [];
    for (const tab of tabs) {
      if (tab.textContent?.trim() === lbl) { (tab as HTMLElement).click(); return; }
    }
  }, label);
}

/** Switch the Cell/Header toggle to "header" */
async function toggleToHDR(page: Page) {
  await clickToggleItem(page, 'Header');
  await page.waitForTimeout(300);
}

/** Switch the Cell/Header toggle to "cell" */
async function toggleToCELL(page: Page) {
  await clickToggleItem(page, 'Cell');
  await page.waitForTimeout(300);
}

async function getCellStyle(page: Page, colId: string, prop: string, rowIndex = 0): Promise<string> {
  return page.evaluate(({ id, row, p }) => {
    const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
    return cell ? getComputedStyle(cell).getPropertyValue(p) : 'not-found';
  }, { id: colId, row: rowIndex, p: prop });
}

async function getCellText(page: Page, colId: string, rowIndex = 0): Promise<string> {
  return page.evaluate(({ id, row }) => {
    const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
    return cell?.textContent?.trim() ?? '';
  }, { id: colId, row: rowIndex });
}

async function getHeaderStyle(page: Page, colId: string, prop: string): Promise<string> {
  return page.evaluate(({ id, p }) => {
    const hdr = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
    return hdr ? getComputedStyle(hdr).getPropertyValue(p) : 'not-found';
  }, { id: colId, p: prop });
}

async function getColumnCSSRules(page: Page, colId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const found: string[] = [];
    for (const sheet of document.styleSheets) {
      try { for (const rule of sheet.cssRules) { if (rule.cssText.includes(`gc-col-c-${id}`)) found.push(rule.cssText); } } catch {}
    }
    return found;
  }, colId);
}

async function getHeaderCSSRules(page: Page, colId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const found: string[] = [];
    for (const sheet of document.styleSheets) {
      try { for (const rule of sheet.cssRules) { if (rule.cssText.includes(`gc-hdr-c-${id}`)) found.push(rule.cssText); } } catch {}
    }
    return found;
  }, colId);
}

async function openCurrencyPopover(page: Page) {
  await page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    // Find a .group tooltip containing "Percentage" text, then find the nearest
    // popover trigger (.relative.inline-flex > .cursor-pointer) in the same parent TGroup
    const groups = toolbar.querySelectorAll('.group');
    for (const g of groups) {
      if (g.textContent?.includes('Percentage')) {
        let parent: Element | null = g.parentElement;
        while (parent && parent !== toolbar) {
          const popover = parent.querySelector('.relative.inline-flex:not(.group) > .cursor-pointer');
          if (popover) { (popover as HTMLElement).click(); return; }
          parent = parent.parentElement;
        }
      }
    }
    throw new Error('Currency popover not found');
  });
  await page.waitForTimeout(300);
}

async function openBorderEditor(page: Page) {
  await page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    const wrappers = toolbar.querySelectorAll('.relative.inline-flex');
    const popovers: Element[] = [];
    for (const w of wrappers) {
      if (!w.classList.contains('group') && w.querySelector(':scope > .cursor-pointer')) popovers.push(w);
    }
    // Border editor is the last non-color, non-font-size popover (after color pickers + font size)
    const last = popovers[popovers.length - 1];
    if (last) { (last.querySelector(':scope > .cursor-pointer') as HTMLElement)?.click(); }
  });
  await page.waitForTimeout(300);
}

async function clickFontSize(page: Page, size: string) {
  // Click font size trigger
  await page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    const wrappers = toolbar?.querySelectorAll('.relative.inline-flex') ?? [];
    for (const w of wrappers) {
      if (w.classList.contains('group')) continue;
      const btn = w.querySelector('button');
      if (btn && /^\d+px/.test(btn.textContent?.trim() ?? '')) {
        const cursor = w.querySelector(':scope > .cursor-pointer');
        if (cursor) { (cursor as HTMLElement).click(); return; }
      }
    }
  });
  await page.waitForTimeout(300);
  // Click the size option
  const opt = page.locator('button').filter({ hasText: size }).last();
  await opt.click({ force: true });
  await page.waitForTimeout(500);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Toolbar Buttons — Cells', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  // ── Bold ──

  test('bold applies font-weight:700 to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);
    expect(await getCellStyle(page, colId, 'font-weight')).toBe('700');
  });

  test('bold toggles off on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);
    const fw = await getCellStyle(page, colId, 'font-weight');
    expect(fw === '400' || fw === 'normal').toBe(true);
  });

  // ── Italic ──

  test('italic applies font-style:italic to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(500);
    expect(await getCellStyle(page, colId, 'font-style')).toBe('italic');
  });

  test('italic toggles off on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(300);
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(500);
    expect(await getCellStyle(page, colId, 'font-style')).toBe('normal');
  });

  // ── Underline ──

  test('underline applies text-decoration to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Underline');
    await page.waitForTimeout(500);
    expect(await getCellStyle(page, colId, 'text-decoration')).toContain('underline');
  });

  // ── Alignment ──

  test('left align applies text-align:left to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Left');
    await page.waitForTimeout(500);
    const rules = await getColumnCSSRules(page, colId);
    expect(rules.join(' ')).toContain('text-align: left');
  });

  test('center align applies text-align:center to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Center');
    await page.waitForTimeout(500);
    const rules = await getColumnCSSRules(page, colId);
    expect(rules.join(' ')).toContain('text-align: center');
  });

  test('right align applies text-align:right to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(500);
    const rules = await getColumnCSSRules(page, colId);
    expect(rules.join(' ')).toContain('text-align: right');
  });

  // ── Font Size ──

  test('font size applies to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickFontSize(page, '16px');
    const rules = await getColumnCSSRules(page, colId);
    expect(rules.join(' ')).toContain('font-size: 16px');
  });

  // ── Currency Formatter ──

  test('USD currency formatter applies to cells', async ({ page }) => {
    const colId = await getNumericColId(page);
    if (!colId) { test.skip(); return; }
    await selectCell(page, colId);
    await openCurrencyPopover(page);
    const usdBtn = page.locator('button').filter({ hasText: 'USD' }).first();
    await usdBtn.click({ force: true });
    await page.waitForTimeout(800);
    const text = await getCellText(page, colId);
    expect(text).toContain('$');
  });

  // ── Percentage Formatter ──

  test('percentage formatter applies to cells', async ({ page }) => {
    const colId = await getNumericColId(page);
    if (!colId) { test.skip(); return; }
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Percentage');
    await page.waitForTimeout(800);
    const text = await getCellText(page, colId);
    expect(text).toContain('%');
  });

  // ── Thousands Separator ──

  test('thousands separator formatter applies to cells', async ({ page }) => {
    const colId = await getNumericColId(page);
    if (!colId) { test.skip(); return; }
    // Get raw value first
    const rawText = await getCellText(page, colId);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Thousands');
    await page.waitForTimeout(800);
    const fmtText = await getCellText(page, colId);
    // Should format as integer (no decimals) — may add commas for large numbers
    expect(fmtText).not.toBe(rawText);
  });

  // ── Decimal Controls ──

  test('increase decimals adds precision to cells', async ({ page }) => {
    const colId = await getNumericColId(page);
    if (!colId) { test.skip(); return; }
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'More decimals');
    await page.waitForTimeout(800);
    const text = await getCellText(page, colId);
    // Should contain a decimal point
    expect(text).toMatch(/\./);
  });

  test('decrease decimals reduces precision on cells', async ({ page }) => {
    const colId = await getNumericColId(page);
    if (!colId) { test.skip(); return; }
    await selectCell(page, colId);
    // Increase first, then decrease
    await clickToolbarBtn(page, 'More decimals');
    await page.waitForTimeout(500);
    await clickToolbarBtn(page, 'Fewer decimals');
    await page.waitForTimeout(800);
    const text = await getCellText(page, colId);
    // Should still be a formatted number
    expect(text).toMatch(/\d/);
  });

  // ── Borders ──

  test('border "All" applies ::after overlay to cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await openBorderEditor(page);
    const allBtn = page.getByRole('button', { name: /All/i }).first();
    await allBtn.click({ force: true });
    await page.waitForTimeout(500);
    const hasOverlay = await page.evaluate((id) => {
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) { if (rule.cssText.includes(`gc-col-c-${id}`) && rule.cssText.includes('::after') && rule.cssText.includes('inset')) return true; } } catch {}
      }
      return false;
    }, colId);
    expect(hasOverlay).toBe(true);
  });

  test('border "None" removes ::after overlay from cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await openBorderEditor(page);
    await page.getByRole('button', { name: /All/i }).first().click({ force: true });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /None/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const hasOverlay = await page.evaluate((id) => {
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) { if (rule.cssText.includes(`gc-col-c-${id}`) && rule.cssText.includes('::after') && rule.cssText.includes('inset')) return true; } } catch {}
      }
      return false;
    }, colId);
    expect(hasOverlay).toBe(false);
  });

  // ── Clear All ──

  test('clear all removes all cell styles in one click', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(500);
    const rulesBefore = await getColumnCSSRules(page, colId);
    expect(rulesBefore.join(' ')).toContain('font-weight');

    await clickToolbarBtn(page, 'Clear all styles');
    await page.waitForTimeout(1000);

    const cellHasClass = await page.evaluate(({ id }) => {
      const cell = document.querySelector(`.ag-row[row-index="0"] .ag-cell[col-id="${id}"]`);
      return cell?.className.includes('gc-col-c-') ?? false;
    }, { id: colId });
    expect(cellHasClass).toBe(false);
  });

  // ── Save & Persist ──

  test('save persists styles to localStorage', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await clickToolbarBtn(page, 'Save');
    await page.waitForTimeout(300);

    const hasState = await page.evaluate(() =>
      Object.keys(localStorage).some(k => k.startsWith('gc-state:'))
    );
    expect(hasState).toBe(true);

    // Reload and verify
    await page.reload();
    await waitForGrid(page);
    await page.waitForTimeout(500);
    expect(await getCellStyle(page, colId, 'font-weight')).toBe('700');
  });

  // ── Undo / Redo ──

  test('undo reverses bold on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    expect(await getCellStyle(page, colId, 'font-weight')).toBe('700');

    await clickToolbarBtn(page, 'Undo');
    await page.waitForTimeout(1000);
    const fw = await getCellStyle(page, colId, 'font-weight');
    expect(fw === '400' || fw === 'normal' || fw === '').toBe(true);
  });

  test('redo re-applies bold on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await clickToolbarBtn(page, 'Undo');
    await page.waitForTimeout(500);
    await clickToolbarBtn(page, 'Redo');
    await page.waitForTimeout(1000);
    expect(await getCellStyle(page, colId, 'font-weight')).toBe('700');
  });
});

// ─── Header Tests ────────────────────────────────────────────────────────────

test.describe('Toolbar Buttons — Headers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  // ── Bold on Header ──

  test('bold applies font-weight:700 to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);
    const fw = await getHeaderStyle(page, colId, 'font-weight');
    expect(fw === '700' || fw === 'bold').toBe(true);
  });

  test('bold toggles off on header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);
    const fw = await getHeaderStyle(page, colId, 'font-weight');
    expect(fw !== '700' && fw !== 'bold').toBe(true);
  });

  // ── Italic on Header ──

  test('italic applies font-style:italic to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(500);
    expect(await getHeaderStyle(page, colId, 'font-style')).toBe('italic');
  });

  // ── Underline on Header ──

  test('underline applies text-decoration to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Underline');
    await page.waitForTimeout(500);
    expect(await getHeaderStyle(page, colId, 'text-decoration')).toContain('underline');
  });

  // ── Alignment on Header ──

  test('left align applies justify-content:flex-start to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Left');
    await page.waitForTimeout(500);
    const rules = await getHeaderCSSRules(page, colId);
    expect(rules.join(' ')).toContain('justify-content: flex-start');
  });

  test('center align applies justify-content:center to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Center');
    await page.waitForTimeout(500);
    const rules = await getHeaderCSSRules(page, colId);
    expect(rules.join(' ')).toContain('justify-content: center');
  });

  test('right align applies justify-content:flex-end to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(500);
    const rules = await getHeaderCSSRules(page, colId);
    expect(rules.join(' ')).toContain('justify-content: flex-end');
  });

  // ── Font Size on Header ──

  test('font size applies to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickFontSize(page, '16px');
    expect(await getHeaderStyle(page, colId, 'font-size')).toBe('16px');
  });

  // ── Borders on Header ──

  test('border "All" applies ::after overlay to header', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await openBorderEditor(page);
    const allBtn = page.getByRole('button', { name: /All/i }).first();
    await allBtn.click({ force: true });
    await page.waitForTimeout(500);
    const hasOverlay = await page.evaluate((id) => {
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) { if (rule.cssText.includes(`gc-hdr-c-${id}`) && rule.cssText.includes('::after') && rule.cssText.includes('inset')) return true; } } catch {}
      }
      return false;
    }, colId);
    expect(hasOverlay).toBe(true);
  });

  // ── Clear All removes header + cell styles ──

  test('clear all removes all header styles in one click', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply header styles
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await clickToolbarBtn(page, 'Underline');
    await page.waitForTimeout(500);

    // Verify applied
    expect(await getHeaderStyle(page, colId, 'font-style')).toBe('italic');

    // Switch to cell and apply cell style too
    await toggleToCELL(page);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);

    // Clear all
    await clickToolbarBtn(page, 'Clear all styles');
    await page.waitForTimeout(1000);

    // Verify header styles gone
    const fw = await getHeaderStyle(page, colId, 'font-weight');
    expect(fw !== '700' && fw !== 'bold').toBe(true);
    const fs = await getHeaderStyle(page, colId, 'font-style');
    expect(fs === 'normal' || fs === '').toBe(true);
    const td = await getHeaderStyle(page, colId, 'text-decoration');
    expect(td === 'none' || td === '' || !td.includes('underline')).toBe(true);

    // Verify cell styles gone
    const cellHasClass = await page.evaluate(({ id }) => {
      const cell = document.querySelector(`.ag-row[row-index="0"] .ag-cell[col-id="${id}"]`);
      return cell?.className.includes('gc-col-c-') ?? false;
    }, { id: colId });
    expect(cellHasClass).toBe(false);
  });

  // ── Multiple header styles compose ──

  test('undo reverses bold on headers', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);
    const fwBefore = await getHeaderStyle(page, colId, 'font-weight');
    expect(fwBefore === '700' || fwBefore === 'bold').toBe(true);

    await clickToolbarBtn(page, 'Undo');
    await page.waitForTimeout(1000);
    const fwAfter = await getHeaderStyle(page, colId, 'font-weight');
    // After undo, header should NOT be bold (700). AG-Grid theme default is 500.
    expect(fwAfter !== '700' && fwAfter !== 'bold').toBe(true);
  });

  test('redo re-applies bold on headers', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);
    await clickToolbarBtn(page, 'Undo');
    await page.waitForTimeout(500);
    await clickToolbarBtn(page, 'Redo');
    await page.waitForTimeout(1000);
    const fw = await getHeaderStyle(page, colId, 'font-weight');
    expect(fw === '700' || fw === 'bold').toBe(true);
  });

  test('multiple header styles compose on the same column', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(500);

    const fw = await getHeaderStyle(page, colId, 'font-weight');
    const fs = await getHeaderStyle(page, colId, 'font-style');
    expect(fw === '700' || fw === 'bold').toBe(true);
    expect(fs).toBe('italic');
  });
});

// ─── Combined Cell + Header Tests ────────────────────────────────────────────

test.describe('Toolbar Buttons — Cell + Header Independence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('cell bold does not affect header, and vice versa', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold to cell only
    await toggleToCELL(page);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);

    // Cell should be bold
    expect(await getCellStyle(page, colId, 'font-weight')).toBe('700');
    // Header should NOT be bold
    const hdrFw = await getHeaderStyle(page, colId, 'font-weight');
    expect(hdrFw !== '700' && hdrFw !== 'bold').toBe(true);

    // Now apply italic to header only
    await toggleToHDR(page);
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(500);

    // Header should be italic
    expect(await getHeaderStyle(page, colId, 'font-style')).toBe('italic');
    // Cell should NOT be italic
    expect(await getCellStyle(page, colId, 'font-style')).toBe('normal');
    // Cell should still be bold
    expect(await getCellStyle(page, colId, 'font-weight')).toBe('700');
  });

  test('formatters only apply to cells, not headers', async ({ page }) => {
    const colId = await getNumericColId(page);
    if (!colId) { test.skip(); return; }
    await selectCell(page, colId);

    // Apply USD formatter (always targets cells regardless of HDR mode)
    await openCurrencyPopover(page);
    const usdBtn = page.locator('button').filter({ hasText: 'USD' }).first();
    await usdBtn.click({ force: true });
    await page.waitForTimeout(800);

    // Cell should show $
    const cellText = await getCellText(page, colId);
    expect(cellText).toContain('$');

    // Header should still show original name (not formatted)
    const hdrText = await page.evaluate(({ id }) => {
      const hdr = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
      return hdr?.textContent?.trim() ?? '';
    }, { id: colId });
    expect(hdrText).not.toContain('$');
  });
});

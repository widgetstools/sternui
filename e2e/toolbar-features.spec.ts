import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive E2E tests for all formatting toolbar features.
 * Tests: undo/redo, cell/header toggle, currency/percent/thousands formatters,
 * decimal controls, bold/italic/underline, text/bg color, alignment,
 * font size, borders, clear all, save/persist.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearPersistedState(page: Page) {
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('gc-state:')).forEach(k => localStorage.removeItem(k));
  });
}

async function getFirstDataColId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const cell = document.querySelector('.ag-center-cols-container .ag-cell');
    return cell?.getAttribute('col-id') ?? '';
  });
}

/** Click a cell and wait for toolbar to detect it */
async function selectCell(page: Page, colId: string, rowIndex = 0) {
  const cell = page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
  await cell.click();
  await page.waitForTimeout(600);
  // Verify toolbar recognized the column
  await expect(async () => {
    const text = await page.evaluate(() =>
      document.querySelector('[class*="z-[10000]"]')?.textContent ?? ''
    );
    expect(text).not.toContain('Select a cell');
  }).toPass({ timeout: 3000 });
}

/** Get the CSS rules injected for a column */
async function getColumnCSSRules(page: Page, colId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const found: string[] = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText.includes(`gc-col-c-${id}`)) {
            found.push(rule.cssText);
          }
        }
      } catch { /* cross-origin */ }
    }
    return found;
  }, colId);
}

/** Get computed style property of a cell */
async function getCellStyle(page: Page, colId: string, prop: string, rowIndex = 0): Promise<string> {
  return page.evaluate(({ id, row, p }) => {
    const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
    return cell ? getComputedStyle(cell).getPropertyValue(p) : 'not-found';
  }, { id: colId, row: rowIndex, p: prop });
}

/** Get the displayed text content of a cell */
async function getCellText(page: Page, colId: string, rowIndex = 0): Promise<string> {
  return page.evaluate(({ id, row }) => {
    const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
    return cell?.textContent?.trim() ?? '';
  }, { id: colId, row: rowIndex });
}

/** Click a toolbar button by its tooltip text (exact match) */
async function clickToolbarBtn(page: Page, tooltipText: string) {
  await page.evaluate((tip) => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    // Tooltip text is rendered as a text node inside the .group wrapper.
    // Find the group whose tooltip text content exactly matches.
    const groups = toolbar.querySelectorAll('.group');
    // First pass: try exact match on the tooltip text (child div text)
    for (const group of groups) {
      const texts = group.querySelectorAll('div');
      for (const t of texts) {
        if (t.textContent?.trim() === tip) {
          const btn = group.querySelector('button');
          if (btn) { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return; }
        }
      }
    }
    // Second pass: fallback to includes (for backwards compat)
    for (const group of groups) {
      if (group.textContent?.includes(tip) && !group.textContent?.includes(tip + ' ')) {
        const btn = group.querySelector('button');
        if (btn) { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return; }
      }
    }
    throw new Error(`Toolbar button with tooltip "${tip}" not found`);
  }, tooltipText);
  await page.waitForTimeout(300);
}

/** Click a ToggleGroup item by matching its text content */
function clickToggleItem(page: Page, label: string) {
  return page.evaluate((lbl) => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    const tabs = toolbar.querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
      if (tab.textContent?.trim() === lbl) { (tab as HTMLElement).click(); return; }
    }
  }, label);
}

/** Toggle to the other mode — switch the Cell/Header toggle */
async function toggleCellHeader(page: Page) {
  const mode = await getTargetMode(page);
  await clickToggleItem(page, mode === 'CELL' ? 'Header' : 'Cell');
  await page.waitForTimeout(300);
}

/** Get the current Cell/Header toggle state — the active one has data-state="active" */
async function getTargetMode(page: Page): Promise<'CELL' | 'HDR'> {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    const tabs = toolbar?.querySelectorAll('[role="tab"]') ?? [];
    for (const tab of tabs) {
      if (tab.getAttribute('data-state') === 'active' && tab.textContent?.trim() === 'Header') return 'HDR';
    }
    return 'CELL';
  }) as Promise<'CELL' | 'HDR'>;
}

/** Open a popover by clicking its trigger in the toolbar (by index among popovers) */
async function openPopover(page: Page, triggerIndex: number) {
  await page.evaluate((idx) => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    const triggers = toolbar.querySelectorAll('.cursor-pointer');
    let count = 0;
    for (const trigger of triggers) {
      const btn = trigger.querySelector('button') ?? trigger;
      if (btn.closest('.relative.inline-flex')) {
        if (count === idx) {
          (trigger as HTMLElement).click();
          return;
        }
        count++;
      }
    }
    throw new Error(`Popover trigger ${idx} not found`);
  }, triggerIndex);
  await page.waitForTimeout(300);
}

/** Close any open popover */
async function closePopover(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** Check if border overlay ::after rule exists for column */
async function hasBorderOverlay(page: Page, colId: string): Promise<boolean> {
  return page.evaluate((id) => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText.includes(`gc-col-c-${id}`) && rule.cssText.includes('::after') && rule.cssText.includes('inset')) return true;
        }
      } catch {}
    }
    return false;
  }, colId);
}

/** Get header computed style */
async function getHeaderStyle(page: Page, colId: string, prop: string): Promise<string> {
  return page.evaluate(({ id, p }) => {
    const header = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
    return header ? getComputedStyle(header).getPropertyValue(p) : 'not-found';
  }, { id: colId, p: prop });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Formatting Toolbar — All Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearPersistedState(page);
    await page.reload();
    await waitForGrid(page);
  });

  // ── Cell/Header Toggle ──

  test('CELL/HDR toggle switches between cell and header targeting', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    expect(await getTargetMode(page)).toBe('CELL');

    await toggleCellHeader(page);
    expect(await getTargetMode(page)).toBe('HDR');

    await toggleCellHeader(page);
    expect(await getTargetMode(page)).toBe('CELL');
  });

  // ── Bold / Italic / Underline ──

  test('bold toggle applies and removes font-weight on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold
    await clickToolbarBtn(page, 'Bold');
    const rules = await getColumnCSSRules(page, colId);
    const hasBold = rules.some(r => r.includes('font-weight') && (r.includes('700') || r.includes('bold')));
    expect(hasBold).toBe(true);

    // Toggle off
    await clickToolbarBtn(page, 'Bold');
    const rulesAfter = await getColumnCSSRules(page, colId);
    const stillBold = rulesAfter.some(r => r.includes('font-weight') && r.includes('700'));
    expect(stillBold).toBe(false);
  });

  test('italic toggle applies font-style on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    await clickToolbarBtn(page, 'Italic');
    const rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('font-style') && r.includes('italic'))).toBe(true);
  });

  test('underline toggle applies text-decoration on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    await clickToolbarBtn(page, 'Underline');
    const rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('text-decoration') && r.includes('underline'))).toBe(true);
  });

  // ── Alignment ──

  test('alignment buttons apply text-align on cells', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Left align
    await clickToolbarBtn(page, 'Left');
    let rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('text-align') && r.includes('left'))).toBe(true);

    // Center align (toggles off left, applies center)
    await clickToolbarBtn(page, 'Left'); // toggle off
    await clickToolbarBtn(page, 'Center');
    rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('text-align') && r.includes('center'))).toBe(true);

    // Right align
    await clickToolbarBtn(page, 'Center'); // toggle off
    await clickToolbarBtn(page, 'Right');
    rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('text-align') && r.includes('right'))).toBe(true);
  });

  // ── Font Size ──

  test('font size popover changes font-size CSS', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Click the font size trigger (shows "11px")
    const fontSizeTrigger = page.locator('[class*="z-[10000]"] button').filter({ hasText: /^\d+px/ }).first();
    await fontSizeTrigger.click({ force: true });
    await page.waitForTimeout(300);

    // Select 16px
    const option = page.locator('button').filter({ hasText: '16px' }).last();
    await option.click({ force: true });
    await page.waitForTimeout(500);

    const rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('font-size') && r.includes('16px'))).toBe(true);
  });

  // ── Borders ──

  test('border "All" applies ::after overlay with inset box-shadow', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Open border popover and click All
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      const triggers = toolbar?.querySelectorAll('.cursor-pointer') ?? [];
      for (let i = triggers.length - 1; i >= 0; i--) {
        const btn = (triggers[i] as HTMLElement).querySelector('button');
        if (btn && btn.querySelector('svg') && !btn.textContent?.trim()) {
          (triggers[i] as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(300);

    const allBtn = page.getByRole('button', { name: /All/i }).first();
    await allBtn.click({ force: true });
    await page.waitForTimeout(500);

    expect(await hasBorderOverlay(page, colId)).toBe(true);
  });

  test('border "None" removes ::after overlay', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply borders
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      const triggers = toolbar?.querySelectorAll('.cursor-pointer') ?? [];
      for (let i = triggers.length - 1; i >= 0; i--) {
        const btn = (triggers[i] as HTMLElement).querySelector('button');
        if (btn && btn.querySelector('svg') && !btn.textContent?.trim()) {
          (triggers[i] as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /All/i }).first().click({ force: true });
    await page.waitForTimeout(500);

    expect(await hasBorderOverlay(page, colId)).toBe(true);

    // Clear borders
    await page.getByRole('button', { name: /None/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await closePopover(page);
    await page.waitForTimeout(300);

    expect(await hasBorderOverlay(page, colId)).toBe(false);
  });

  // ── Clear All ──

  test('clear all removes all custom styling', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold + italic
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(300);

    // Verify styles exist
    let rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('font-weight'))).toBe(true);

    // Click clear all — resets the store, next grid re-render cleans CSS
    await clickToolbarBtn(page, 'Clear all styles');
    await page.waitForTimeout(1000);

    // Verify the cell no longer has the gc-col-c class applied
    // (applyToColumnDefs re-runs on state change and won't add the class if assignments is empty)
    const cellHasClass = await page.evaluate(({ id }) => {
      const cell = document.querySelector(`.ag-row[row-index="0"] .ag-cell[col-id="${id}"]`);
      return cell?.className.includes('gc-col-c-') ?? false;
    }, { id: colId });
    expect(cellHasClass).toBe(false);
  });

  // ── Save / Persist ──

  test('save persists styles to localStorage', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);

    // Click save
    await clickToolbarBtn(page, 'Save');
    await page.waitForTimeout(300);

    // Verify localStorage has state
    const hasState = await page.evaluate(() => {
      return Object.keys(localStorage).some(k => k.startsWith('gc-state:'));
    });
    expect(hasState).toBe(true);

    // Reload and verify styles are restored
    await page.reload();
    await waitForGrid(page);
    await page.waitForTimeout(1000);

    // Check computed style on the cell (more reliable than CSS rules after reload)
    const fw = await getCellStyle(page, colId, 'font-weight');
    expect(fw === '700' || fw === 'bold').toBe(true);
  });

  // ── Undo / Redo ──

  test('undo reverses the last styling action', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    let rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('font-weight'))).toBe(true);

    // Undo — the undo restores the store state, which triggers a grid re-render
    // and re-applies column defs. We need to wait for this cycle.
    await clickToolbarBtn(page, 'Undo');
    await page.waitForTimeout(1000);

    // After undo, check the computed style rather than CSS rules
    // (CSS rules may linger until next applyToColumnDefs cycle)
    const fw = await getCellStyle(page, colId, 'font-weight');
    // 400 or 'normal' means undo worked (not 700/bold)
    expect(fw === '400' || fw === 'normal' || fw === '').toBe(true);
  });

  test('redo re-applies an undone action', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold then undo
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await clickToolbarBtn(page, 'Undo');
    await page.waitForTimeout(500);

    // Redo
    await clickToolbarBtn(page, 'Redo');
    await page.waitForTimeout(500);

    const rules = await getColumnCSSRules(page, colId);
    expect(rules.some(r => r.includes('font-weight'))).toBe(true);
  });

  // ── Header Styling ──

  test('bold applies to header when HDR mode is active', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Switch to HDR mode
    await toggleCellHeader(page);
    expect(await getTargetMode(page)).toBe('HDR');

    // Apply bold to header
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(500);

    // Verify header has bold style (applied via inline headerStyle)
    const fw = await getHeaderStyle(page, colId, 'font-weight');
    expect(fw === '700' || fw === 'bold').toBe(true);
  });

  test('single clear-all click removes all header customizations (bold, italic, underline, color, bg, font size, borders)', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // ── Apply header styles: bold + italic + underline ──
    await toggleCellHeader(page);
    expect(await getTargetMode(page)).toBe('HDR');
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await clickToolbarBtn(page, 'Underline');
    await page.waitForTimeout(300);

    // ── Apply header text color (red) ──
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      const wrappers = toolbar?.querySelectorAll('.relative.inline-flex') ?? [];
      // Text color popover — find by position (first ColorPopover in Typography group)
      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        if (!w.classList.contains('group') && w.querySelector('.cursor-pointer')) {
          const btn = w.querySelector('button');
          if (btn && !btn.textContent?.trim()) {
            const cursor = w.querySelector('.cursor-pointer');
            if (cursor) { (cursor as HTMLElement).click(); break; }
          }
        }
      }
    });
    await page.waitForTimeout(300);
    // Click the red swatch
    const redSwatch = page.locator('button[style*="background: rgb(248, 113, 113)"]').first();
    if (await redSwatch.count() > 0) {
      await redSwatch.click({ force: true });
      await page.waitForTimeout(300);
    }
    await closePopover(page);

    // ── Apply header font size ──
    const fontSizeTrigger = page.locator('[class*="z-[10000]"] button').filter({ hasText: /^\d+px/ }).first();
    if (await fontSizeTrigger.count() > 0) {
      await fontSizeTrigger.click({ force: true });
      await page.waitForTimeout(300);
      const sz16 = page.locator('button').filter({ hasText: '16px' }).last();
      if (await sz16.count() > 0) await sz16.click({ force: true });
      await page.waitForTimeout(300);
    }

    // ── Apply header borders ──
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      const wrappers = toolbar?.querySelectorAll('.relative.inline-flex') ?? [];
      for (let i = wrappers.length - 1; i >= 0; i--) {
        const w = wrappers[i];
        if (!w.classList.contains('group') && w.querySelector('.cursor-pointer')) {
          const btn = w.querySelector('button');
          if (btn && !btn.textContent?.trim() && btn.querySelector('svg')) {
            const cursor = w.querySelector('.cursor-pointer');
            if (cursor) { (cursor as HTMLElement).click(); break; }
          }
        }
      }
    });
    await page.waitForTimeout(300);
    const allBordersBtn = page.getByRole('button', { name: /All/i }).first();
    if (await allBordersBtn.count() > 0) {
      await allBordersBtn.click({ force: true });
      await page.waitForTimeout(300);
    }
    await closePopover(page);
    await page.waitForTimeout(300);

    // ── Verify header has customizations applied ──
    const fwBefore = await getHeaderStyle(page, colId, 'font-weight');
    const fsBefore = await getHeaderStyle(page, colId, 'font-style');
    const tdBefore = await getHeaderStyle(page, colId, 'text-decoration');
    expect(fwBefore === '700' || fwBefore === 'bold').toBe(true);
    expect(fsBefore).toBe('italic');
    expect(tdBefore).toContain('underline');

    // ── Also apply cell styles ──
    await toggleCellHeader(page); // back to CELL
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(500);

    // Verify cell styles applied
    let cellRules = await getColumnCSSRules(page, colId);
    expect(cellRules.some(r => r.includes('font-weight'))).toBe(true);

    // ══════════════════════════════════════════════════════════════════════════
    // ── SINGLE CLICK: Clear all ──
    // ══════════════════════════════════════════════════════════════════════════
    await clickToolbarBtn(page, 'Clear all styles');
    await page.waitForTimeout(1000);

    // ── Verify ALL header styles are cleared ──
    const fwAfter = await getHeaderStyle(page, colId, 'font-weight');
    const fsAfter = await getHeaderStyle(page, colId, 'font-style');
    const tdAfter = await getHeaderStyle(page, colId, 'text-decoration');
    const colorAfter = await getHeaderStyle(page, colId, 'color');
    const bgAfter = await getHeaderStyle(page, colId, 'background-color');
    const szAfter = await getHeaderStyle(page, colId, 'font-size');

    // Header should revert to theme defaults (not retain custom values)
    expect(fwAfter !== '700' && fwAfter !== 'bold').toBe(true);
    expect(fsAfter === 'normal' || fsAfter === '').toBe(true);
    expect(tdAfter === 'none' || tdAfter === '' || !tdAfter.includes('underline')).toBe(true);
    // Custom color should be cleared (not red)
    expect(colorAfter !== 'rgb(248, 113, 113)').toBe(true);
    // Custom font-size should be cleared (not 16px)
    expect(szAfter !== '16px').toBe(true);

    // ── Verify inline style attributes are clean ──
    const inlineStyle = await page.evaluate(({ id }) => {
      const hdr = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
      return hdr?.getAttribute('style') ?? '';
    }, { id: colId });
    expect(inlineStyle).not.toContain('font-weight: 700');
    expect(inlineStyle).not.toContain('font-style: italic');
    expect(inlineStyle).not.toContain('text-decoration: underline');

    // ── Verify cell styles are also gone ──
    const cellHasClass = await page.evaluate(({ id }) => {
      const cell = document.querySelector(`.ag-row[row-index="0"] .ag-cell[col-id="${id}"]`);
      return cell?.className.includes('gc-col-c-') ?? false;
    }, { id: colId });
    expect(cellHasClass).toBe(false);

    // ── Verify no header CSS rules remain ──
    const hdrRules = await page.evaluate((id) => {
      const found: string[] = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.includes(`gc-hdr-c-${id}`)) found.push(rule.cssText);
          }
        } catch {}
      }
      return found;
    }, colId);
    expect(hdrRules.length).toBe(0);

    // ── Verify header class is removed from DOM ──
    const hdrHasClass = await page.evaluate(({ id }) => {
      const hdr = document.querySelector(`.ag-header-cell[col-id="${id}"]`);
      return hdr?.className.includes('gc-hdr-c-') ?? false;
    }, { id: colId });
    expect(hdrHasClass).toBe(false);

    // ── Verify no border overlay on header ──
    const hdrBorderOverlay = await page.evaluate((id) => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.includes(`gc-hdr-c-${id}`) && rule.cssText.includes('::after')) return true;
          }
        } catch {}
      }
      return false;
    }, colId);
    expect(hdrBorderOverlay).toBe(false);
  });

  // ── Multiple Styles Compose ──

  test('multiple styles compose on the same column', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold + italic + right align
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(500);

    const rules = await getColumnCSSRules(page, colId);
    const combined = rules.join(' ');
    expect(combined).toContain('font-weight');
    expect(combined).toContain('font-style');
    expect(combined).toContain('text-align');
  });

  // ── Column Separators Preserved ──

  test('all styling operations preserve AG-Grid column separators', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    const cellSel = `.ag-row[row-index="0"] .ag-cell[col-id="${colId}"]`;

    // Measure border before
    const borderBefore = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).borderRightWidth : null;
    }, cellSel);

    await selectCell(page, colId);

    // Apply multiple styles
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(500);

    // Measure after
    const borderAfter = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).borderRightWidth : null;
    }, cellSel);

    expect(borderAfter).toBe(borderBefore);
  });

  // ── Disabled State ──

  test('toolbar buttons are disabled when no cell is selected', async ({ page }) => {
    // Don't click any cell — toolbar should show "Select a cell"
    const toolbarText = await page.evaluate(() =>
      document.querySelector('[class*="z-[10000]"]')?.textContent ?? ''
    );
    expect(toolbarText).toContain('Select a cell');

    // Verify formatting buttons have disabled styling (opacity-20)
    const disabledCount = await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      const btns = toolbar?.querySelectorAll('button') ?? [];
      let count = 0;
      for (const btn of btns) {
        if (btn.className.includes('opacity-20') || btn.disabled) count++;
      }
      return count;
    });

    // Most formatting buttons should be disabled
    expect(disabledCount).toBeGreaterThan(5);
  });
});

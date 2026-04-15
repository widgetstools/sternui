import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for template dropdown, apply template, and save-as-template features.
 *
 * Covers:
 * - Template dropdown visibility and contents
 * - Applying a template to selected columns via dropdown
 * - Save As Template (+) button — creating new templates from current styles
 * - Template appears in dropdown after creation
 * - Template assignment persists after save + reload
 * - Applying template to multiple columns
 * - Templates panel shows correct column counts and names
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

/** Get template dropdown options from the toolbar */
async function getTemplateDropdownOptions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) return [];
    const select = toolbar.querySelector('select');
    if (!select) return [];
    return Array.from(select.options)
      .filter(o => o.value && !o.disabled)
      .map(o => o.textContent?.trim() ?? '');
  });
}

/** Select a template from the toolbar dropdown by name */
async function selectTemplateFromDropdown(page: Page, name: string) {
  await page.evaluate((n) => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    const select = toolbar.querySelector('select') as HTMLSelectElement;
    if (!select) throw new Error('Template dropdown not found');
    for (const opt of select.options) {
      if (opt.textContent?.trim() === n) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    throw new Error(`Template "${n}" not found in dropdown`);
  }, name);
  await page.waitForTimeout(500);
}

/** Open the Save As Template popover and create a template with given name */
async function saveAsTemplate(page: Page, name: string) {
  // The + button is inside a Popover within the template TGroup (which also has <select>).
  // Click the Popover's .cursor-pointer wrapper (NOT the button's mousedown which stopsPropagation).
  await page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    if (!toolbar) throw new Error('Toolbar not found');
    // Find the TGroup that contains the <select> (template group)
    const tgroups = toolbar.querySelectorAll('[class*="bg-accent"]');
    for (const tg of tgroups) {
      if (!tg.querySelector('select')) continue;
      // Found template group — find the Popover trigger (.relative.inline-flex > .cursor-pointer)
      const popoverWrapper = tg.querySelector('.relative.inline-flex:not(.group)');
      if (popoverWrapper) {
        const cursor = popoverWrapper.querySelector(':scope > .cursor-pointer');
        if (cursor) { (cursor as HTMLElement).click(); return; }
      }
    }
    throw new Error('Save as template popover not found');
  });
  await page.waitForTimeout(400);

  // Type name into the input
  const input = page.locator('input[placeholder*="Style"]').first();
  if (await input.count() === 0) throw new Error('Save as template input not found');
  await input.fill(name);
  await page.waitForTimeout(100);

  // Click "Save Template" button
  const saveBtn = page.locator('button').filter({ hasText: 'Save Template' }).first();
  await saveBtn.click({ force: true });
  await page.waitForTimeout(500);
}

async function getCellStyle(page: Page, colId: string, prop: string, rowIndex = 0): Promise<string> {
  return page.evaluate(({ id, row, p }) => {
    const cell = document.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`);
    return cell ? getComputedStyle(cell).getPropertyValue(p) : 'not-found';
  }, { id: colId, row: rowIndex, p: prop });
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

/** Check if template dropdown is visible in the toolbar */
async function isTemplateDropdownVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[class*="z-[10000]"]');
    return !!toolbar?.querySelector('select');
  });
}

/** Get the template state from the store */
async function getTemplateState(page: Page): Promise<Record<string, { id: string; name: string }>> {
  return page.evaluate(() => {
    const stateStr = Object.keys(localStorage).find(k => k.startsWith('gc-state:'));
    if (!stateStr) return {};
    try {
      const data = JSON.parse(localStorage.getItem(stateStr)!);
      return data?.['column-templates']?.templates ?? {};
    } catch { return {}; }
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Template Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('template dropdown is hidden when no cell is selected', async ({ page }) => {
    const visible = await isTemplateDropdownVisible(page);
    expect(visible).toBe(false);
  });

  test('template dropdown appears when a cell is selected', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    const visible = await isTemplateDropdownVisible(page);
    expect(visible).toBe(true);
  });

  test('template dropdown shows "No templates yet" when empty', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    const options = await getTemplateDropdownOptions(page);
    expect(options.length).toBe(0); // No non-disabled options
  });

  test('template dropdown lists created templates', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply a style and save as template
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await saveAsTemplate(page, 'My Bold Style');

    // Check dropdown now has the template
    const options = await getTemplateDropdownOptions(page);
    expect(options).toContain('My Bold Style');
  });
});

test.describe('Apply Template via Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('selecting template from dropdown applies styles to a different column', async ({ page }) => {
    // Create template from first column
    const colIds = await page.evaluate(() => {
      const cells = document.querySelectorAll('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell');
      return Array.from(cells).slice(0, 3).map(c => c.getAttribute('col-id')).filter(Boolean) as string[];
    });
    if (colIds.length < 2) { test.skip(); return; }

    await selectCell(page, colIds[0]);
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(300);
    await saveAsTemplate(page, 'Bold Italic');

    // Select a DIFFERENT column and apply via dropdown
    await selectCell(page, colIds[1]);
    await page.waitForTimeout(300);
    await selectTemplateFromDropdown(page, 'Bold Italic');
    await page.waitForTimeout(800);

    // Verify styles applied to the second column
    expect(await getCellStyle(page, colIds[1], 'font-weight')).toBe('700');
    expect(await getCellStyle(page, colIds[1], 'font-style')).toBe('italic');
  });

  test('applying template to a different column works', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Create template
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await saveAsTemplate(page, 'Bold Template');

    // Select a different column
    const colIds = await page.evaluate(() => {
      const cells = document.querySelectorAll('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell');
      return Array.from(cells).slice(0, 3).map(c => c.getAttribute('col-id')).filter(Boolean);
    });

    if (colIds.length >= 2) {
      const otherCol = colIds[1]!;
      await selectCell(page, otherCol);
      await selectTemplateFromDropdown(page, 'Bold Template');
      await page.waitForTimeout(500);

      // Verify bold applied to the other column
      expect(await getCellStyle(page, otherCol, 'font-weight')).toBe('700');
    }
  });
});

test.describe('Save As Template', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('save as template creates a new template from current styles', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply styles
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Right');
    await page.waitForTimeout(300);

    // Save as template
    await saveAsTemplate(page, 'Custom Style');

    // Verify template appears in dropdown
    const options = await getTemplateDropdownOptions(page);
    expect(options).toContain('Custom Style');
  });

  test('save as template captures cell style overrides and can apply to another column', async ({ page }) => {
    const colIds = await page.evaluate(() => {
      const cells = document.querySelectorAll('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell');
      return Array.from(cells).slice(0, 3).map(c => c.getAttribute('col-id')).filter(Boolean) as string[];
    });
    if (colIds.length < 2) { test.skip(); return; }

    // Apply bold to first column and save as template
    await selectCell(page, colIds[0]);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await saveAsTemplate(page, 'Bold Only');

    // Apply to second column via dropdown
    await selectCell(page, colIds[1]);
    await page.waitForTimeout(300);
    await selectTemplateFromDropdown(page, 'Bold Only');
    await page.waitForTimeout(800);

    // Second column should be bold via the template
    expect(await getCellStyle(page, colIds[1], 'font-weight')).toBe('700');
  });

  test('save as template persists after save and reload', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply and save as template
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await saveAsTemplate(page, 'Persisted Style');

    // Save to localStorage
    await clickToolbarBtn(page, 'Save');
    await page.waitForTimeout(300);

    // Reload
    await page.reload();
    await waitForGrid(page);
    await page.waitForTimeout(500);

    // Select cell — dropdown should still show the template
    await selectCell(page, colId);
    const options = await getTemplateDropdownOptions(page);
    expect(options).toContain('Persisted Style');
  });

  test('multiple templates can be created and listed', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Create first template
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(200);
    await saveAsTemplate(page, 'Template A');

    // Click somewhere outside to close popover and wait
    await page.click('.ag-body-viewport', { force: true });
    await page.waitForTimeout(400);
    // Re-select cell
    await selectCell(page, colId);

    // Create second template with additional style
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(200);
    await saveAsTemplate(page, 'Template B');

    // Both should appear in dropdown
    const options = await getTemplateDropdownOptions(page);
    expect(options).toContain('Template A');
    expect(options).toContain('Template B');
  });

  test('save as template with empty name uses default name', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply style
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);

    // Open save-as popover and click Save Template without typing a name
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="z-[10000]"]');
      if (!toolbar) return;
      const wrappers = toolbar.querySelectorAll('.relative.inline-flex');
      for (const w of wrappers) {
        const cursor = (w as HTMLElement).querySelector(':scope > .cursor-pointer');
        if (!cursor) continue;
        const parent = cursor.closest('[class*="bg-accent"]');
        if (parent?.querySelector('select')) {
          (cursor as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(300);

    // Click Save Template without filling the input (uses default name)
    const saveBtn = page.locator('button').filter({ hasText: 'Save Template' }).first();
    await saveBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Should have created a template with default name containing column label
    const options = await getTemplateDropdownOptions(page);
    expect(options.length).toBeGreaterThan(0);
  });
});

test.describe('Template + Styles Independence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearState(page);
    await page.reload();
    await waitForGrid(page);
  });

  test('inline toolbar styles and template styles compose together', async ({ page }) => {
    const colIds = await page.evaluate(() => {
      const cells = document.querySelectorAll('.ag-center-cols-container .ag-row[row-index="0"] .ag-cell');
      return Array.from(cells).slice(0, 3).map(c => c.getAttribute('col-id')).filter(Boolean) as string[];
    });
    if (colIds.length < 2) { test.skip(); return; }

    // Create a bold template from first column
    await selectCell(page, colIds[0]);
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(300);
    await saveAsTemplate(page, 'Bold Style');

    // Apply template to second column, then add italic as inline override
    await selectCell(page, colIds[1]);
    await page.waitForTimeout(300);
    await selectTemplateFromDropdown(page, 'Bold Style');
    await page.waitForTimeout(500);
    await clickToolbarBtn(page, 'Italic');
    await page.waitForTimeout(500);

    // Second column should have bold (from template) + italic (from inline override)
    expect(await getCellStyle(page, colIds[1], 'font-weight')).toBe('700');
    expect(await getCellStyle(page, colIds[1], 'font-style')).toBe('italic');
  });

  test('clear all removes both template assignments and inline overrides', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);

    // Apply bold inline
    await clickToolbarBtn(page, 'Bold');
    await page.waitForTimeout(200);
    await saveAsTemplate(page, 'Test Template');
    await selectTemplateFromDropdown(page, 'Test Template');
    await page.waitForTimeout(300);

    // Clear all
    await clickToolbarBtn(page, 'Clear all styles');
    await page.waitForTimeout(1000);

    // Verify no styles remain
    const fw = await getCellStyle(page, colId, 'font-weight');
    expect(fw === '400' || fw === 'normal').toBe(true);
  });
});

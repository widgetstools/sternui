import { test, expect, type Page } from '@playwright/test';

/**
 * Smart Edit e2e — markets-grid-lab Smart Edit tab (:5300).
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-smart-edit';
const SEED_FLAG_KEY = `lab-demo-profiles-v2:${GRID_ID}`;

async function clearLabStorage(page: Page): Promise<void> {
  await page.evaluate((flagKey) => {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('markets-grid-bundle:lab-') ||
          k.startsWith('gc-active-profile:lab-') ||
          k.startsWith('lab-seeded:') ||
          k.startsWith('lab-demo-profiles-'),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(flagKey);
  }, SEED_FLAG_KEY);
}

async function bootSmartEditTab(page: Page): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[role="tab"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-smart-edit"]').click();
  await page.waitForSelector('[data-testid="smart-edit-toolbar-pinned"]', { timeout: 20_000 });
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 15_000 });
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-body-viewport .ag-row`, {
    timeout: 15_000,
  });
}

async function openSmartEditPanel(page: Page): Promise<void> {
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  await page.locator('.ds-sheet').waitFor({ state: 'visible' });
  await page.locator('[data-testid="v2-settings-module-dropdown"]').click();
  await page.locator('[data-testid="v2-settings-nav-menu-smart-edit"]').click();
  await page.locator('[data-testid="smart-edit-panel"]').waitFor({ state: 'visible' });
}

test.describe('Smart Edit lab tab', () => {
  test('toolbar renders with operand input and op buttons', async ({ page }) => {
    await bootSmartEditTab(page);
    await expect(page.getByTestId('smart-edit-toolbar')).toBeVisible();
    await expect(page.getByTestId('smart-edit-operand')).toBeVisible();
    await expect(page.getByTestId('smart-edit-op-multiply')).toBeVisible();
    await expect(page.getByTestId('smart-edit-op-set')).toBeVisible();
  });

  test('settings sheet opens Smart Edit panel', async ({ page }) => {
    await bootSmartEditTab(page);
    await openSmartEditPanel(page);
    await expect(page.getByTestId('se-enabled-toggle')).toBeVisible();
    await expect(page.getByTestId('se-magnitude-toggle')).toBeVisible();
  });

  test('multiply op updates a cell after range selection', async ({ page }) => {
    await bootSmartEditTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const firstCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const secondCell = grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="quantityFace"]');
    await firstCell.waitFor({ state: 'visible' });

    const before = (await firstCell.innerText()).trim();
    await firstCell.click();
    await page.keyboard.down('Shift');
    await secondCell.click();
    await page.keyboard.up('Shift');

    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect
      .poll(async () => (await firstCell.innerText()).trim(), { timeout: 5000 })
      .not.toBe(before);
  });
});

import { test, expect } from '@playwright/test';

const URL = 'http://localhost:5310/';

test.describe('design-system demo', () => {
  test('boots on the Market tab with the blotter', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('ds-topbar')).toBeVisible();
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to the Design System tab and renders the gallery', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('ds-tab-design-system').click();
    await expect(page.getByTestId('ds-designsystem')).toBeVisible();
    await page.getByTestId('ds-section-buttons').click();
    await expect(page.getByTestId('ds-demo-button')).toBeVisible();
  });

  test('theme toggle flips data-theme', async ({ page }) => {
    await page.goto(URL);
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.getByTestId('theme-toggle').click();
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(after).not.toBe(before);
  });
});

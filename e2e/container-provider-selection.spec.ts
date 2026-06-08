import { test, expect } from '@playwright/test';
import { bootClean, openPanel, waitForGrid, liveProviderTrigger, PROVIDER_B } from './helpers/containerHost';
import { pickSelectOptionByLocator } from './helpers/shadcnSelect';

/**
 * Provider selection is grid-level state (persists across profile switches,
 * stored via the storage adapter's gridLevelData — see current-features
 * "Provider selection"). These cover the switch re-attaching cleanly and the
 * selection surviving a full reload.
 */

test('switching the live provider re-attaches and keeps rows on screen', async ({ page }) => {
  await bootClean(page);

  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();

  // The grid remounts on provider B and must come back with data.
  await waitForGrid(page);
  expect(await page.locator('.ag-body-viewport .ag-row').count()).toBeGreaterThan(0);
});

test('the live-provider selection persists across a full reload', async ({ page }) => {
  await bootClean(page);

  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();
  await waitForGrid(page);

  // gridLevelData persisted the selection → it survives a reload.
  await page.reload();
  await waitForGrid(page);
  await openPanel(page, 'toolbar-date-settings');
  await expect(liveProviderTrigger(page)).toContainText(PROVIDER_B);
});

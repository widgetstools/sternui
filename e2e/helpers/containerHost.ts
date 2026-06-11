import { expect, type Page } from '@playwright/test';
import { navigateToModule } from './settingsSheet';

/**
 * Helpers for the isolated MarketsGridContainer mock host
 * (apps/demos/marketsgrid-container-e2e, port 5215). The customizer testids
 * are library-level, so they match the shared settings-sheet helpers; only
 * the boot/storage wiring is app-specific (mock providers + localStorage +
 * ConfigManager catalog re-seeded by the app on load).
 */

export const GRID_ID = 'mock-blotter';
export const PROVIDER_A = 'Mock Positions A';
export const PROVIDER_B = 'Mock Positions B';

/** Wait for the grid + first rows + the Default-profile auto-seed settle. */
export async function waitForGrid(page: Page): Promise<void> {
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 20_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 20_000 });
  await page.waitForTimeout(400);
}

/** Wipe every IndexedDB db + localStorage so the next load is pristine
 *  (the app re-seeds its mock provider catalog + a fresh Default profile). */
export async function clearHostStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs.map((d) =>
        d.name
          ? new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            })
          : Promise.resolve(),
      ),
    );
    localStorage.clear();
  });
}

/** Boot to a known-clean state: grid up, storage wiped, fresh reload. */
export async function bootClean(page: Page): Promise<void> {
  await page.goto('/');
  await waitForGrid(page);
  await clearHostStorage(page);
  await page.goto('/');
  await waitForGrid(page);
}

/** Open the customizer sheet via the toolbar overflow menu. Idempotent. */
export async function openCustomizer(page: Page): Promise<void> {
  const sheet = page.locator('.ds-sheet');
  if (await sheet.isVisible().catch(() => false)) return;
  await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  await expect(sheet).toBeVisible();
}

/** Navigate to a customizer module panel via the grouped menubar. */
export async function openPanel(page: Page, moduleId: string): Promise<void> {
  await openCustomizer(page);
  await navigateToModule(page, moduleId);
}

/** The Custom Settings provider <Select> renders its testid on both the Row
 *  wrapper and the trigger button — target the button to stay unambiguous. */
export function liveProviderTrigger(page: Page) {
  return page.locator('button[data-testid="provider-live-select"]');
}

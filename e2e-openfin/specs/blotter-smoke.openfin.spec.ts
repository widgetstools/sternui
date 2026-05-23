/**
 * Starter OpenFin e2e spec — proves the harness can spawn the
 * platform, attach Playwright, and reach the blotter view.
 *
 * Mirrors apps/e2e/browser-blotter's starter spec where possible so
 * future specs can be lifted between harnesses with minimal edits.
 */
import { test, expect } from '../fixtures/launchOpenFin';

test.describe('openfin-workspace — blotter smoke', () => {
  test('blotter view mounts inside OpenFin and exposes the grid api', async ({ blotterPage }) => {
    await expect(blotterPage.getByTestId('openfin-workspace-blotter')).toBeVisible({ timeout: 30_000 });
    await expect(blotterPage.locator('.ag-body-viewport .ag-row').first()).toBeVisible({ timeout: 30_000 });

    await blotterPage.waitForFunction(
      () => typeof (window as any).__openfinWorkspaceApi !== 'undefined',
      null,
      { timeout: 10_000 },
    );

    const rowCount = await blotterPage.evaluate(() => {
      const api = (window as any).__openfinWorkspaceApi;
      return api?.getDisplayedRowCount?.() ?? 0;
    });
    expect(rowCount).toBe(500);
  });

  test('ticker mutates row data while running inside OpenFin', async ({ blotterPage }) => {
    await blotterPage.waitForFunction(
      () => typeof (window as any).__openfinWorkspaceApi !== 'undefined',
      null,
      { timeout: 30_000 },
    );

    const sampleRow = async () => blotterPage.evaluate(() => {
      const api = (window as any).__openfinWorkspaceApi;
      const node = api?.getDisplayedRowAtIndex?.(0);
      return node?.data ? { price: node.data.price, yield: node.data.yield } : null;
    });

    const before = await sampleRow();
    expect(before).not.toBeNull();

    let changed = false;
    for (let i = 0; i < 20 && !changed; i++) {
      await blotterPage.waitForTimeout(50);
      const after = await sampleRow();
      if (after && (after.price !== before!.price || after.yield !== before!.yield)) {
        changed = true;
      }
    }
    expect(changed).toBe(true);
  });
});

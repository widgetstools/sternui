import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for navigating the v2 settings sheet in Playwright tests.
 *
 * Settings-sheet navigation subtleties the helpers paper over:
 *
 *   1. `data-testid="v2-settings-nav-<id>"` buttons are a HIDDEN accessible
 *      nav: 1px × 1px with opacity:0. Screen readers see them; `click()`
 *      with pointer-events fails because the 5 buttons stack at
 *      overlapping coordinates and Playwright's built-in pointer-event
 *      check rejects the intercepting sibling. Using `{ force: true }`
 *      on THIS testid bypasses that check — safe because the button IS
 *      wired to an onClick handler.
 *
 *   2. The VISIBLE nav is a shadcn Popover opened by
 *      `v2-settings-module-dropdown`, with menu items testidded
 *      `v2-settings-nav-menu-<id>`. This is the realistic user path.
 *
 * We default to the visible path (`openPanel`) because it exercises the
 * actual user flow. `forceNavigateToPanel` is the escape hatch when a
 * test needs to skip the dropdown animation or trigger navigation from
 * an already-open panel.
 */

export const V2_PATH = '/';

export async function waitForV2Grid(page: Page): Promise<void> {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400); // initial Default-profile auto-seed
}

export async function clearV2Storage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('gc-customizer-v2');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:'))
      .forEach((k) => localStorage.removeItem(k));
  });
}

/**
 * Boots the demo at a known-clean state: grid rendered, profile storage
 * wiped, fresh reload. Use this in `beforeEach` for any test that
 * depends on starting from no prior overrides.
 */
export async function bootCleanDemo(page: Page): Promise<void> {
  await page.goto(V2_PATH);
  await waitForV2Grid(page);
  await clearV2Storage(page);
  await page.goto(V2_PATH);
  await waitForV2Grid(page);
}

/** Opens the settings sheet via the header Settings button. Idempotent. */
export async function openSettingsSheet(page: Page): Promise<void> {
  const sheet = page.locator('.gc-sheet');
  if (await sheet.isVisible().catch(() => false)) return;
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  await expect(sheet).toBeVisible();
}

/** Closes the settings sheet via ESC. Waits for full unmount. */
export async function closeSettingsSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="v2-settings-sheet"]')).toHaveCount(0);
}

/**
 * Canonical module ids exposed by the settings nav. Keep in sync with the
 * keys on `Module.SettingsPanel` definitions in `packages/core/src/modules/`.
 */
export type PanelModuleId =
  | 'general-settings'
  | 'column-customization'
  | 'calculated-columns'
  | 'column-groups'
  | 'conditional-styling';

/**
 * Expected panel-root testid per module. Each is the wrapper the panel
 * renders at the top of its tree, the standard assertion anchor after
 * navigating.
 */
export const PANEL_ROOT_TESTID: Record<PanelModuleId, string> = {
  // Grid Options panel — historical `go-` prefix (for "grid options"),
  // preserved even though the module id is `general-settings`.
  'general-settings': 'go-panel',
  'column-customization': 'cols-panel',
  'calculated-columns': 'cc-panel',
  'column-groups': 'cg-panel',
  'conditional-styling': 'cs-panel',
};

/**
 * Opens the settings sheet (if closed) and navigates to the given
 * module's panel via the visible header dropdown — the realistic user
 * path. Waits for the panel root testid to become visible before
 * returning.
 */
export async function openPanel(page: Page, moduleId: PanelModuleId): Promise<void> {
  await openSettingsSheet(page);

  // If already on the target panel, no-op.
  const rootTestid = PANEL_ROOT_TESTID[moduleId];
  if (await page.locator(`[data-testid="${rootTestid}"]`).isVisible().catch(() => false)) {
    return;
  }

  // Open the dropdown and pick the module.
  await page.locator('[data-testid="v2-settings-module-dropdown"]').click();
  await page.locator(`[data-testid="v2-settings-nav-menu-${moduleId}"]`).click();
  await expect(page.locator(`[data-testid="${rootTestid}"]`)).toBeVisible();
}

/**
 * Bypasses the visible dropdown and navigates via the hidden accessible
 * nav. Use only when the dropdown interaction itself is out of scope
 * (e.g. a test that's already inside a Popover and doesn't want to
 * close it).
 *
 * The hidden nav is 1px square with `overflow: hidden` on its wrapper,
 * so `click({ force: true })` still fails Playwright's viewport check.
 * We dispatch a synthetic `click` event directly on the element — the
 * button's React onClick handler fires the same way as a real click.
 */
export async function forceNavigateToPanel(
  page: Page,
  moduleId: PanelModuleId,
): Promise<void> {
  await openSettingsSheet(page);
  await page
    .locator(`[data-testid="v2-settings-nav-${moduleId}"]`)
    .evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.locator(`[data-testid="${PANEL_ROOT_TESTID[moduleId]}"]`)).toBeVisible();
}

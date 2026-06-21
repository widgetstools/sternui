import type { Page, Locator } from '@playwright/test';

/**
 * Open the primary toolbar's View menu — the single dropdown that now holds
 * Columns, Auto Format, and the Formatting / Editing toolbar toggles (they
 * were moved off the toolbar to keep it uncluttered).
 *
 * Menu items portal to <body>, so after opening, click them via
 * `page.locator('[data-testid="…"]')`. Pass a grid-scoped `Locator` for the
 * trigger when more than one grid is on the page.
 */
export async function openViewMenu(scope: Page | Locator): Promise<void> {
  await scope.locator('[data-testid="toolbar-view-menu-trigger"]').first().click();
}

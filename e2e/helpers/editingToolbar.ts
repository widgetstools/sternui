import type { Page } from '@playwright/test';
import { openViewMenu } from './viewMenu';

/** Open the unified editing toolbar via the primary-row View menu. */
export async function openEditingToolbar(page: Page): Promise<void> {
  if (!(await page.getByTestId('editing-toolbar-pinned').isVisible())) {
    await openViewMenu(page);
    const toggle = page.getByTestId('editing-toolbar-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 20_000 });
    await toggle.click();
  }
  await page.waitForSelector('[data-testid="editing-toolbar-pinned"]', { timeout: 5_000 });
}

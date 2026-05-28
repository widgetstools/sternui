import type { Page } from '@playwright/test';

/** Open the unified editing toolbar via the primary-row toggle. */
export async function openEditingToolbar(page: Page): Promise<void> {
  const toggle = page.getByTestId('editing-toolbar-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 20_000 });
  if (!(await page.getByTestId('editing-toolbar-pinned').isVisible())) {
    await toggle.click();
  }
  await page.waitForSelector('[data-testid="editing-toolbar-pinned"]', { timeout: 5_000 });
}

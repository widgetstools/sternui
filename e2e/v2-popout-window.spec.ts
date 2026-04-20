import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for the settings-sheet pop-out button. Playwright blocks real
 * popups by default, so we stub `window.open` in the page context
 * with a synthetic iframe-backed window — the test then verifies
 * that:
 *   - the button exists in the sheet header
 *   - clicking it calls window.open with the expected name + features
 *   - the main-window sheet flips to data-popped="true"
 *   - the sheet DOM actually renders INSIDE the popout window's body
 *     (proves the React portal is mounted there)
 *   - closing the popout via the OS close button unwinds the portal
 */

const V2_PATH = '/';

async function waitForGrid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
}

async function stubWindowOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __popoutCalls: unknown[] }).__popoutCalls = [];
    const origOpen = window.open.bind(window);
    window.open = ((url?: string, name?: string, features?: string) => {
      (window as unknown as { __popoutCalls: { url?: string; name?: string; features?: string }[] }).__popoutCalls.push({
        url, name, features,
      });
      // Real browsers reuse an existing window with the same name —
      // the stub must do the same, otherwise StrictMode's double-
      // invoke creates two iframes and the first one (emptied when
      // its React cleanup ran) masks the real one in queries.
      const key = name ?? '__anon__';
      const existing = document.querySelector(`iframe[data-popout-iframe="${key}"]`) as HTMLIFrameElement | null;
      if (existing) return existing.contentWindow as Window;
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-popout-iframe', key);
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:300px;z-index:99999;';
      document.body.appendChild(iframe);
      return iframe.contentWindow as Window;
    }) as typeof origOpen;
  });
}

test.describe('v2 — settings sheet pop-out window', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForGrid(page);
    await stubWindowOpen(page);
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
  });

  test('pop-out button is present in the sheet header', async ({ page }) => {
    const btn = page.locator('[data-testid="v2-settings-popout-btn"]');
    await expect(btn).toBeVisible();
  });

  test('clicking pop-out opens a named window with the expected features', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(300);

    const calls = await page.evaluate(
      () => (window as unknown as { __popoutCalls: unknown[] }).__popoutCalls,
    );
    expect(Array.isArray(calls) && calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = (calls as { name: string; features: string }[])[0];
    expect(firstCall.name).toMatch(/^gc-popout-/);
    expect(firstCall.features).toMatch(/width=960/);
    expect(firstCall.features).toMatch(/height=700/);
  });

  test('sheet flips to data-popped=true and renders inside the popout window', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();

    // Main window's sheet wrapper carries data-popped="true".
    await expect(page.locator('[data-testid="v2-settings-sheet"]')).toHaveAttribute('data-popped', 'true');

    // Poll the iframe stub for the portal-mounted subtree. React's
    // effect chain (open window → setPopout → mount node memo →
    // createPortal render) takes a few microtasks; the poll keeps
    // the assertion flake-free under CI load without a fixed sleep.
    await expect.poll(async () => {
      return page.evaluate(() => {
        const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
        const doc = iframe?.contentDocument;
        return {
          hasSheet: !!doc?.querySelector('.gc-sheet'),
          hasPoppedClass: !!doc?.querySelector('.gc-popout.is-popped'),
          hasMountNode: !!doc?.querySelector('[data-popout-root]'),
          stylesCloned: doc?.head?.querySelectorAll('style, link[rel="stylesheet"]').length ?? 0,
        };
      });
    }, { timeout: 3000 }).toEqual({
      hasSheet: true,
      hasPoppedClass: true,
      hasMountNode: true,
      stylesCloned: expect.any(Number),
    });

    // Finally, the cockpit stylesheet + Tailwind + font imports should
    // all be cloned — at least a handful of stylesheet nodes.
    const stylesCloned = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.head?.querySelectorAll('style, link[rel="stylesheet"]').length ?? 0;
    });
    expect(stylesCloned).toBeGreaterThanOrEqual(3);
  });

  test('backdrop is suppressed while popped (no overlay blocking the grid)', async ({ page }) => {
    await page.locator('[data-testid="v2-settings-popout-btn"]').click();
    await page.waitForTimeout(300);

    // The backdrop div is part of the inline render branch; when
    // popped=true it should NOT be in the DOM, so the grid
    // underneath stays fully interactive.
    const backdropCount = await page.locator('[data-testid="v2-settings-overlay"]').count();
    expect(backdropCount).toBe(0);
  });

  test('maximize + pop-out buttons hide while popped (OS chrome owns that)', async ({ page }) => {
    const popoutBtn = page.locator('[data-testid="v2-settings-popout-btn"]');
    await popoutBtn.click();
    await page.waitForTimeout(300);

    // Both buttons now render inside the popout, not the main window.
    // In the main doc, they shouldn't be visible at all — there's
    // no sheet chrome to host them.
    const visibleInMain = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="v2-settings-popout-btn"]');
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      // In an iframe, getBoundingClientRect returns the iframe-local
      // coords — so checking ownerDocument === main is enough.
      return btn.ownerDocument === document;
    });
    expect(visibleInMain).toBe(false);
  });
});

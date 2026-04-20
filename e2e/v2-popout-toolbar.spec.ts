import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for the FormattingToolbar pop-out. Same shape as the settings
 * sheet popout spec (window.open is stubbed with an iframe so we can
 * introspect the popout's document without asking Playwright to
 * open a real second window — which doesn't compose well with the
 * default `use.page` fixture).
 *
 * What we prove:
 *   - Button exists on the inline toolbar.
 *   - Clicking it opens a named, gridId-scoped window with the
 *     expected dimensions and alwaysOnTop passthrough.
 *   - Toolbar `data-popped` flips + `.is-popped` class lands inside
 *     the popout.
 *   - Every Radix/shadcn popover (templates menu etc.) inside the
 *     popped toolbar renders INSIDE the popout — regression against
 *     the portal-container bug.
 *   - Re-clicking the main window's brush button focuses the buried
 *     popout instead of no-op-toggling the inline toolbar away.
 *   - Title carries the gridId suffix.
 */

const V2_PATH = '/';

async function waitForGrid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
}

async function stubWindowOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __popoutCalls: unknown[] }).__popoutCalls = [];
    const orig = window.open.bind(window);
    window.open = ((url?: string, name?: string, features?: string) => {
      (window as unknown as { __popoutCalls: { url?: string; name?: string; features?: string }[] }).__popoutCalls.push({
        url, name, features,
      });
      const key = name ?? '__anon__';
      const existing = document.querySelector(`iframe[data-popout-iframe="${key}"]`) as HTMLIFrameElement | null;
      if (existing) return existing.contentWindow as Window;
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-popout-iframe', key);
      // `pointer-events: none` so the stub iframe never intercepts
      // clicks on main-window UI we still need to drive (e.g. the
      // brush button at top-right). Clicks inside the popup are
      // synthesized via `contentDocument.querySelector(...).click()`
      // in the tests — direct DOM dispatch, no pointer routing.
      iframe.style.cssText = 'position:fixed;bottom:0;left:0;width:700px;height:200px;z-index:99999;pointer-events:none;';
      document.body.appendChild(iframe);
      return iframe.contentWindow as Window;
    }) as typeof orig;
  });
}

test.describe('v2 — formatting toolbar pop-out window', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(V2_PATH);
    await waitForGrid(page);
    await stubWindowOpen(page);
    // Open the inline toolbar via the primary row's brush button.
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
    await expect(page.locator('[data-testid="formatting-toolbar"]')).toBeVisible();
  });

  test('pop-out button is present on the inline toolbar', async ({ page }) => {
    await expect(page.locator('[data-testid="formatting-popout-btn"]')).toBeVisible();
  });

  test('clicking the pop-out opens a gridId-scoped window with the expected features', async ({ page }) => {
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    const calls = await page.evaluate(
      () => (window as unknown as { __popoutCalls: { name: string; features: string }[] }).__popoutCalls,
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].name).toBe('gc-popout-toolbar-demo-blotter-v2');
    expect(calls[0].features).toMatch(/width=900/);
    expect(calls[0].features).toMatch(/height=120/);
  });

  test('toolbar flips to is-popped and renders inside the popout window', async ({ page }) => {
    await page.locator('[data-testid="formatting-popout-btn"]').click();

    // Main doc should contain NO toolbar anymore — the whole subtree
    // moved into the popout via PortalPortal.
    await expect(page.locator('[data-testid="formatting-toolbar"]')).toHaveCount(0);

    await expect.poll(async () => {
      return page.evaluate(() => {
        const iframe = document.querySelector('iframe[data-popout-iframe^="gc-popout-toolbar-"]') as HTMLIFrameElement | null;
        const doc = iframe?.contentDocument;
        return {
          hasToolbar: !!doc?.querySelector('[data-testid="formatting-toolbar"]'),
          hasPoppedClass: !!doc?.querySelector('.gc-formatting-toolbar.is-popped'),
          stylesCloned: doc?.head?.querySelectorAll('style, link[rel="stylesheet"]').length ?? 0,
          popOutBtnHidden: !doc?.querySelector('[data-testid="formatting-popout-btn"]'),
        };
      });
    }, { timeout: 3000 }).toEqual({
      hasToolbar: true,
      hasPoppedClass: true,
      stylesCloned: expect.any(Number),
      popOutBtnHidden: true,
    });
  });

  test('popout window title is suffixed with the grid\'s gridId', async ({ page }) => {
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    const title = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="gc-popout-toolbar-"]') as HTMLIFrameElement | null;
      return iframe?.contentDocument?.title ?? '';
    });
    expect(title).toContain('Formatting');
    expect(title).toContain('demo-blotter-v2');
  });

  test('shadcn popovers (templates menu) from the popped toolbar render INSIDE the popout', async ({ page }) => {
    // Templates menu trigger is disabled until at least one cell is
    // selected (no column context = no template to apply). Click a
    // cell first so the Radix Popover trigger is enabled + clickable.
    await page.locator('.ag-row .ag-cell[col-id="price"]').first().click();
    await page.waitForTimeout(100);

    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => document.querySelectorAll('[data-radix-popper-content-wrapper]').length);
    expect(before).toBe(0);

    // Click the templates menu trigger inside the popout iframe.
    const clicked = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="gc-popout-toolbar-"]') as HTMLIFrameElement | null;
      const btn = iframe?.contentDocument?.querySelector('[data-testid="templates-menu-trigger"]') as HTMLElement | null;
      if (!btn) return false;
      btn.click();
      return true;
    });
    expect(clicked).toBe(true);
    await page.waitForTimeout(250);

    const where = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="gc-popout-toolbar-"]') as HTMLIFrameElement | null;
      const popoutDoc = iframe?.contentDocument;
      return {
        wrappersInMain: document.querySelectorAll('[data-radix-popper-content-wrapper]').length,
        wrappersInPopout: popoutDoc?.querySelectorAll('[data-radix-popper-content-wrapper]').length ?? 0,
      };
    });
    expect(where.wrappersInMain).toBe(0);
    expect(where.wrappersInPopout).toBeGreaterThanOrEqual(1);
  });

  test('re-clicking the brush button while popped focuses the popout instead of closing inline', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __focusCalls: number }).__focusCalls = 0;
    });
    await page.locator('[data-testid="formatting-popout-btn"]').click();
    await page.waitForTimeout(300);

    // Intercept focus() on the iframe's contentWindow.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-popout-iframe^="gc-popout-toolbar-"]') as HTMLIFrameElement | null;
      const win = iframe?.contentWindow as unknown as { focus: () => void } | null;
      if (!win) return;
      const orig = win.focus?.bind(win) ?? (() => {});
      win.focus = () => {
        (window as unknown as { __focusCalls: number }).__focusCalls += 1;
        orig();
      };
    });

    // Re-click brush — should raise the popout, not toggle off.
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
    await page.waitForTimeout(200);

    const { focusCalls, iframeCount, inlineToolbarCount } = await page.evaluate(() => {
      return {
        focusCalls: (window as unknown as { __focusCalls: number }).__focusCalls,
        iframeCount: document.querySelectorAll('iframe[data-popout-iframe^="gc-popout-toolbar-"]').length,
        // Inline toolbar should NOT re-mount in main.
        inlineToolbarCount: document.querySelectorAll('[data-testid="formatting-toolbar"]').length,
      };
    });
    expect(focusCalls).toBeGreaterThanOrEqual(1);
    expect(iframeCount).toBe(1);
    expect(inlineToolbarCount).toBe(0);
  });
});

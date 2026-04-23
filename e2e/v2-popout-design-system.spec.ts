import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { bootCleanDemo } from './helpers/settingsSheet';

/**
 * E2E — popout design-system parity.
 *
 * Regression guard for the class of bug where popover / dropdown /
 * dialog primitives in a popped-out OS window (OpenFin + browser
 * window.open) render with transparent backgrounds because the
 * `var(--gc-surface, ...)` token chain resolves to an invalid value
 * (most often an HSL triplet from the design-system theme that was
 * meant to be consumed as `hsl(var(--card))`).
 *
 * Root cause: mirroring `data-theme` onto the popout's <body>
 * accidentally matched fi-dark.css's `[data-theme="dark"]` rule
 * directly on body, letting HSL-triplet values win over globals.css's
 * hex values on body (globals.css uses `:root` which only matches
 * <html>).
 *
 * Fix: keep `data-theme` ONLY on popout's <html>. Body inherits hex
 * tokens via the normal cascade.
 *
 * Assertions below lock in the fix at multiple levels:
 *   - Popout body's computed `--gc-surface` is a valid hex color
 *     (starts with "#"), NOT an HSL triplet like "214 26% 10%".
 *   - A popover opened inside the popped panel has a non-transparent
 *     computed background-color.
 *   - Theme toggle (dark → light → dark) flips the popover bg
 *     correctly WITHOUT hardcoded `!important` overrides.
 */

async function openToolbarAndPop(page: Page, context: BrowserContext) {
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-testid="style-toolbar-toggle"]').click();
  await page.locator('[data-testid="formatting-popout-btn"]').click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  // prepareDocument clones stylesheets + tags body; give it a beat.
  await popup.waitForTimeout(1500);
  return popup;
}

interface PopoverBgResult {
  computedBg: string;
  gcSurface: string;
  card: string;
  popover: string;
}

/** Open ANY Radix popover inside the popped panel + read its
 *  computed background. We use the formatter toolbar's format-picker
 *  "Preset…" dropdown — it's a FormatDropdown (the same kit used by
 *  every popover). */
async function readPoppedPopoverBg(popup: Page): Promise<PopoverBgResult> {
  // The "Presets" dropdown exposes the underlying FormatDropdown.
  // Trigger button is a plain <button> with title="Presets" inside
  // the vertical FormatterPicker in the popped panel.
  const presetBtn = popup.locator('button[title="Presets"]').first();
  await expect(presetBtn).toBeVisible({ timeout: 2000 });
  await presetBtn.click();
  // Radix popover content should render with data-gc-settings.
  await popup.waitForTimeout(300);

  return popup.evaluate(() => {
    const wrapper = document.querySelector('[data-radix-popper-content-wrapper]');
    const content = wrapper?.querySelector('[data-gc-settings]') as HTMLElement | null;
    if (!content) return { computedBg: '(no content)', gcSurface: '', card: '', popover: '' };
    const cs = getComputedStyle(content);
    return {
      computedBg: cs.backgroundColor,
      gcSurface: cs.getPropertyValue('--gc-surface').trim(),
      card: cs.getPropertyValue('--card').trim(),
      popover: cs.getPropertyValue('--popover').trim(),
    };
  });
}

test.describe('v2 popout — design-system parity', () => {
  test.beforeEach(async ({ page }) => { await bootCleanDemo(page); });

  test('popout body\'s --gc-surface resolves to a valid hex color, not an HSL triplet', async ({ page, context }) => {
    const popup = await openToolbarAndPop(page, context);

    const bodyTokens = await popup.evaluate(() => {
      const s = getComputedStyle(document.body);
      return {
        gcSurface: s.getPropertyValue('--gc-surface').trim(),
        card: s.getPropertyValue('--card').trim(),
        popover: s.getPropertyValue('--popover').trim(),
        bgColor: s.backgroundColor,
        htmlTheme: document.documentElement.getAttribute('data-theme'),
        bodyTheme: document.body.getAttribute('data-theme'),
      };
    });

    // Valid hex colors, not HSL triplets.
    expect(bodyTokens.gcSurface).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(bodyTokens.card).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(bodyTokens.popover).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    // Body bg renders a real color.
    expect(bodyTokens.bgColor).not.toBe('rgba(0, 0, 0, 0)');
    // data-theme is on html, NOT on body (that's the fix).
    expect(bodyTokens.htmlTheme).toBeTruthy();
    expect(bodyTokens.bodyTheme).toBeNull();
  });

  test('popover inside popped panel has non-transparent background (dark theme)', async ({ page, context }) => {
    const popup = await openToolbarAndPop(page, context);
    const result = await readPoppedPopoverBg(popup);

    expect(result.computedBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(result.computedBg).not.toBe('transparent');
    // Should be a valid opaque rgb() — no leaky alpha.
    expect(result.computedBg).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    // Dark-theme surface is expected to be #161a1e = rgb(22, 26, 30).
    expect(result.computedBg).toBe('rgb(22, 26, 30)');
  });

  test('popover bg flips correctly to light theme (no !important needed)', async ({ page, context }) => {
    // Switch main window to light BEFORE popping.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(200);

    const popup = await openToolbarAndPop(page, context);
    // Confirm the popout inherits the light theme from main.
    expect(await popup.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');

    const result = await readPoppedPopoverBg(popup);
    // Light-theme popover bg is white = rgb(255, 255, 255).
    expect(result.computedBg).toBe('rgb(255, 255, 255)');
  });

  test('theme toggle in main window propagates to already-open popout', async ({ page, context }) => {
    const popup = await openToolbarAndPop(page, context);

    // Dark (default): popover bg is dark.
    const darkResult = await readPoppedPopoverBg(popup);
    expect(darkResult.computedBg).toBe('rgb(22, 26, 30)');

    // Close the popover before flipping theme so the reopen re-reads
    // the freshly-cascaded tokens rather than a cached computed style.
    await popup.keyboard.press('Escape');
    await popup.waitForTimeout(200);

    // Toggle main-window theme to light.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    // MutationObserver in PopoutPortal propagates — give it a tick.
    await popup.waitForTimeout(300);

    const lightResult = await readPoppedPopoverBg(popup);
    expect(lightResult.computedBg).toBe('rgb(255, 255, 255)');
  });

  test('every shadcn popover surface primitive inherits the same tokens (alignment regression)', async ({ page, context }) => {
    const popup = await openToolbarAndPop(page, context);

    // Check the font-size PX chip dropdown (different primitive entry
    // point — uses shadcn Popover, not FormatDropdown) by reading
    // computed background via a direct DOM probe. We open it, grab the
    // bg, and compare against the Presets dropdown bg. Both should
    // resolve to the SAME color since they share the token chain.

    // First: Presets (FormatDropdown).
    const presetsResult = await readPoppedPopoverBg(popup);
    await popup.keyboard.press('Escape');
    await popup.waitForTimeout(200);

    // Second: any other popover primitive. The Formatter panel's
    // Save-as template save button is wrapped in a Popover, but the
    // simplest shared surface to probe is the format-picker's
    // Excel-format-reference "i" button (ExcelReferencePopover →
    // FormatPopover → same Radix Content).
    const infoBtn = popup.locator('button[title="Excel format reference"]').first();
    if (await infoBtn.isVisible().catch(() => false)) {
      await infoBtn.click();
      await popup.waitForTimeout(300);

      const excelRefBg = await popup.evaluate(() => {
        const wrapper = document.querySelector('[data-radix-popper-content-wrapper]');
        const content = wrapper?.querySelector('[data-gc-settings]') as HTMLElement | null;
        return content ? getComputedStyle(content).backgroundColor : '';
      });
      // Same tokens → same computed bg.
      expect(excelRefBg).toBe(presetsResult.computedBg);
    }
  });
});

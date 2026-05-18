#!/usr/bin/env node
/**
 * One-shot v1 visual-reference capture.
 *
 * Boots playwright directly (no test-runner), reuses a single page
 * across every capture, and writes one PNG per (theme, surface) into
 * the v2 monorepo's docs/visual-reference/v1/{light,dark}/ tree.
 *
 * Usage:
 *
 *     # In a SINGLE bash invocation, because the sandbox doesn't
 *     # persist background processes:
 *     ( npm run dev -w @starui/demo-react & ) \
 *       && sleep 6 \
 *       && node scripts/capture-v1-visuals.mjs
 *
 * Override the output dir with VR_OUT=/path/to/dir.
 *
 * On surface failures the script keeps going so a partial capture
 * still lands; the exit code is 1 if any surface failed.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const VR_OUT =
  process.env.VR_OUT ??
  '/Users/develop/wfh/starui-platform/docs/visual-reference/v1';
const BASE = process.env.VR_BASE ?? 'http://localhost:5190';

const PANELS = [
  { id: 'general-settings', slug: 'grid-options' },
  { id: 'column-customization', slug: 'column-settings' },
  { id: 'calculated-columns', slug: 'calculated-columns' },
  { id: 'column-groups', slug: 'column-groups' },
  { id: 'conditional-styling', slug: 'conditional-styling' },
];

async function waitForServer(maxMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server at ${BASE} did not become ready in ${maxMs}ms`);
}

async function shot(page, theme, slug) {
  const dir = join(VR_OUT, theme);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${slug}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`[vr] ${theme}/${slug}.png`);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(250);
}

async function openSettingsSheet(page) {
  const btn = page.locator('[data-testid="v2-settings-open-btn"]').first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
  }
  // Sheet may not have a testid we can rely on; wait briefly.
  await page.waitForTimeout(400);
}

async function closeSheet(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

async function gotoCleanGrid(page) {
  await page.goto(BASE, { waitUntil: 'load', timeout: 20_000 });
  // Best-effort: wait for ag-grid rows to render.
  await page.waitForSelector('.ag-body-viewport .ag-row', {
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
}

async function capturePanel(page, theme, panelId, slug) {
  // Open the sheet, then navigate through the VISIBLE dropdown — the
  // path the smoke specs use. The hidden nav (`v2-settings-nav-<id>`)
  // is 1px×1px / opacity:0 and force-clicking it doesn't always
  // dispatch the React onClick (likely because cmdk filters interfere
  // with non-pointer-real clicks). Going through the dropdown menu
  // item ensures the panel actually switches.
  await openSettingsSheet(page);
  await page
    .locator('[data-testid="v2-settings-module-dropdown"]')
    .first()
    .click({ timeout: 5_000 });
  await page.waitForTimeout(200);
  await page
    .locator(`[data-testid="v2-settings-nav-menu-${panelId}"]`)
    .first()
    .click({ timeout: 5_000 });
  // Give the panel root time to mount + the dropdown to fully close.
  await page.waitForTimeout(500);
  await shot(page, theme, `panel-${slug}`);
  await closeSheet(page);
}

async function main() {
  console.log(`[vr] base=${BASE}  out=${VR_OUT}`);
  await waitForServer();
  console.log('[vr] dev server ready');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.warn('[vr] page error:', err.message));

  let failed = 0;
  for (const theme of ['dark', 'light']) {
    try {
      await gotoCleanGrid(page);
      await setTheme(page, theme);
      await shot(page, theme, 'grid-default');

      await openSettingsSheet(page);
      await shot(page, theme, 'settings-sheet-open');
      await closeSheet(page);

      for (const { id, slug } of PANELS) {
        try {
          await capturePanel(page, theme, id, slug);
        } catch (err) {
          failed += 1;
          console.warn(`[vr] FAILED ${theme}/${slug}: ${err.message}`);
          await closeSheet(page).catch(() => {});
        }
      }

      // Module dropdown open
      try {
        await openSettingsSheet(page);
        const dd = page.locator('[data-testid="v2-settings-module-dropdown"]').first();
        await dd.click({ timeout: 5_000 });
        await page.waitForTimeout(300);
        await shot(page, theme, 'module-dropdown-open');
        await page.keyboard.press('Escape');
        await closeSheet(page);
      } catch (err) {
        failed += 1;
        console.warn(`[vr] FAILED ${theme}/module-dropdown-open: ${err.message}`);
      }
    } catch (err) {
      failed += 1;
      console.warn(`[vr] theme=${theme} FATAL: ${err.message}`);
    }
  }

  await browser.close();
  if (failed) {
    console.error(`[vr] done with ${failed} failures`);
    process.exit(1);
  }
  console.log('[vr] done');
}

main().catch((err) => {
  console.error('[vr] FATAL', err);
  process.exit(2);
});

/**
 * Playwright fixture that spawns the OpenFin platform via
 * @openfin/node-adapter, waits for the runtime's CDP endpoint, then
 * attaches Playwright via chromium.connectOverCDP() and hands tests a
 * Page pointing at the blotter view.
 *
 * Reuses across the entire harness via Playwright's worker-scoped
 * fixtures so a single OpenFin runtime serves every test (workers
 * forced to 1 in playwright.config.ts because we share the CDP port).
 *
 * Manifest URL points at apps/tarball/e2e-openfin-workspace's e2e variant —
 * autoShow=false + CDP port 9191 so a dev session on 9190 can coexist.
 */
import { setDefaultResultOrder } from 'node:dns';
import { test as base, chromium, type Browser, type Page } from '@playwright/test';
import { waitForCdpEndpoint, waitForCdpPage } from './cdp.js';

try { setDefaultResultOrder('ipv4first'); } catch { /* old node */ }

const MANIFEST_URL =
  process.env.OPENFIN_MANIFEST_URL ??
  'http://localhost:5181/platform/manifest.e2e.fin.json';
const CDP_PORT = Number(process.env.OPENFIN_CDP_PORT ?? 9191);

interface PlatformHandle {
  browser: Browser;
  blotterPage: Page;
  cdpEndpoint: string;
  finPort: number;
  quit: () => Promise<void>;
}

async function launchPlatform(): Promise<PlatformHandle> {
  // Dynamic import — @openfin/node-adapter is a runtime dep but the
  // shape is opaque so we keep its type cast at the call boundary.
  const { launch } = (await import('@openfin/node-adapter')) as {
    launch: (opts: { manifestUrl: string }) => Promise<number>;
  };

  const finPort = await launch({ manifestUrl: MANIFEST_URL });

  // Wait for the runtime's CDP debugger endpoint to come up.
  await waitForCdpEndpoint(CDP_PORT, { timeoutMs: 60_000 });

  const cdpEndpoint = `http://127.0.0.1:${CDP_PORT}`;
  const browser = await chromium.connectOverCDP(cdpEndpoint);

  // Find the blotter view page.
  const target = await waitForCdpPage(
    CDP_PORT,
    (t) => t.type === 'page' && t.url.includes('view=blotter'),
    { timeoutMs: 60_000 },
  );

  // Match Playwright's Page list against the CDP target by URL.
  let blotterPage: Page | undefined;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url() === target.url) { blotterPage = p; break; }
    }
    if (blotterPage) break;
  }
  if (!blotterPage) {
    throw new Error(`[e2e-openfin] could not match Playwright page for CDP target ${target.url}`);
  }

  return {
    browser,
    blotterPage,
    cdpEndpoint,
    finPort,
    quit: async () => {
      try { await browser.close(); } catch { /* swallow */ }
      // Send Ctrl-C-style quit to the runtime via CDP.
      try {
        await fetch(`${cdpEndpoint}/json/close`, { method: 'POST' });
      } catch { /* runtime already gone */ }
    },
  };
}

interface TestFixtures {
  blotterPage: Page;
}

interface WorkerFixtures {
  platform: PlatformHandle;
}

/**
 * Use this in specs:
 *
 *   import { test, expect } from '../fixtures/launchOpenFin';
 *   test('something', async ({ blotterPage }) => { ... });
 *
 * `platform` is worker-scoped — one OpenFin runtime per worker.
 * Combined with workers=1 in playwright.config.ts that means one
 * runtime per entire test run, which is required because parallel
 * CDP attachments to one OpenFin runtime aren't supported.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  platform: [
    async ({}, use) => {
      const handle = await launchPlatform();
      await use(handle);
      await handle.quit();
    },
    { scope: 'worker' },
  ],
  blotterPage: async ({ platform }, use) => {
    await use(platform.blotterPage);
  },
});

export { expect } from '@playwright/test';

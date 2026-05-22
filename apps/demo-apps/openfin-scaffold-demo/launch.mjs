#!/usr/bin/env node
/**
 * OpenFin launcher for this scaffold app.
 *
 * Prerequisites: Vite dev server must be running on port 5180.
 *
 *   npm run openfin
 *   npm run openfin -- http://127.0.0.1:5180/platform/manifest.fin.json
 *
 * Or use the combined script (starts Vite + launches OpenFin):
 *
 *   npm run start:openfin
 */
import { connect, launch } from '@openfin/node-adapter';
import { setDefaultResultOrder } from 'node:dns';

const DEFAULT_MANIFEST = 'http://localhost:5180/platform/manifest.fin.json';

async function launchFromNode(manifestUrl) {
  console.log('[openfin-scaffold] launching manifest:', manifestUrl);
  const port = await launch({ manifestUrl });
  const fin = await connect({
    uuid: `openfin-scaffold-${Date.now()}`,
    address: `ws://127.0.0.1:${port}`,
    nonPersistent: true,
  });
  fin.once('disconnected', () => {
    console.log('[openfin-scaffold] platform disconnected — exiting');
    process.exit(0);
  });
  return { fin, manifestUrl };
}

async function run(manifestUrl) {
  let quitRequested = false;
  const { fin, manifestUrl: url } = await launchFromNode(manifestUrl);
  const manifest = await fin.System.fetchManifest(url);

  const quit = async () => {
    if (quitRequested) return;
    quitRequested = true;
    try {
      if (manifest.platform?.uuid) {
        await fin.Platform.wrapSync({ uuid: manifest.platform.uuid }).quit();
      } else {
        await fin.Application.wrapSync({ uuid: manifest.startup_app.uuid }).quit();
      }
    } catch (err) {
      if (!String(err).includes('no longer connected')) console.error(err);
      process.exit(0);
    }
  };

  process.on('SIGINT', () => { console.log('[openfin-scaffold] Ctrl+C'); void quit(); });
  process.on('SIGTERM', () => void quit());
  process.on('exit', () => void quit());

  console.log('[openfin-scaffold] connected — dock Tools menu opens admin surfaces');
  console.log('[openfin-scaffold] press Ctrl+C to quit');
}

try {
  setDefaultResultOrder('ipv4first');
} catch {
  /* older Node */
}

const manifestUrl = process.argv[2] ?? DEFAULT_MANIFEST;
run(manifestUrl).catch((err) => {
  console.error('[openfin-scaffold] launch failed:', err?.message ?? err);
  console.error('[openfin-scaffold] is Vite running? try: npm run start:openfin');
  process.exit(1);
});

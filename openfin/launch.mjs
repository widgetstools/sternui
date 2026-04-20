#!/usr/bin/env node
// @ts-check
/**
 * Launch the demo inside the OpenFin runtime via the official
 * `@openfin/node-adapter` API — which auto-provisions the RVM on
 * first run (no separate user install step), exposes a WebSocket
 * control port, and gives us a clean programmatic handle to the
 * running platform for graceful shutdown.
 *
 * Pattern lifted from the markets-ui reference apps: Node
 * launcher calls `launch({ manifestUrl })` to get a port, then
 * `connect({ address: ws://127.0.0.1:<port> })` to get a `fin`
 * object for out-of-process platform control (quit, fetchManifest,
 * etc.).
 *
 * Usage:
 *   node openfin/launch.mjs <manifest-url>
 *     e.g. node openfin/launch.mjs http://localhost:5190/openfin/manifest.json
 *
 * Contrast with a shell-out approach: no per-OS RVM path probing,
 * no crashes when the RVM is missing (node-adapter downloads +
 * caches it), and a real handle for clean teardown on Ctrl-C.
 */

import { connect, launch } from '@openfin/node-adapter';

const [, , manifestUrlArg] = process.argv;
const manifestUrl = manifestUrlArg ?? 'http://localhost:5190/openfin/manifest.json';

async function main() {
  console.log(`[openfin] launching ${manifestUrl}`);

  // `launch` hands back a control-plane port once the RVM has
  // booted the manifest. First run provisions the runtime from
  // openfin.co; subsequent runs hit the cache in ~/.openfin-cache.
  let port;
  try {
    port = await launch({ manifestUrl });
  } catch (err) {
    console.error('[openfin] failed to launch:');
    console.error(err instanceof Error ? err.message : err);
    if (err instanceof Error && err.message.includes('Could not locate')) {
      console.error('[openfin] hint: is your web server running and the manifest URL reachable?');
    }
    process.exit(1);
  }

  const fin = await connect({
    uuid: `aggrid-demo-launcher-${Date.now()}`,
    address: `ws://127.0.0.1:${port}`,
    nonPersistent: true,
  });

  console.log(`[openfin] connected on port ${port} — launcher uuid: aggrid-demo-launcher`);

  // Read the manifest back from the running platform so we can
  // look up the app's uuid and wrap it for lifecycle control —
  // needed if the manifest uses the newer `platform` block instead
  // of the legacy `startup_app` shape.
  const manifest = await fin.System.fetchManifest(manifestUrl);
  const platformUuid = manifest?.platform?.uuid;
  const appUuid = manifest?.startup_app?.uuid;

  const quit = async () => {
    try {
      if (platformUuid) {
        const platform = fin.Platform.wrapSync({ uuid: platformUuid });
        await platform.quit();
      } else if (appUuid) {
        const app = fin.Application.wrapSync({ uuid: appUuid });
        await app.quit(true);
      }
    } catch (err) {
      // "not connected" / "already terminated" are expected during
      // normal close — anything else logs so we don't swallow
      // genuine errors.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('no longer connected') && !msg.includes('not connected')) {
        console.warn('[openfin] quit error:', msg);
      }
    }
  };

  fin.once('disconnected', () => {
    console.log('[openfin] platform disconnected');
    process.exit(0);
  });

  // Forward Ctrl-C / kill so the RVM shuts down cleanly alongside
  // Vite when the user stops the `dev:openfin` npm script.
  const onSignal = async (sig) => {
    console.log(`[openfin] ${sig} — shutting down`);
    await quit();
    // Give the disconnect a beat to land before we exit.
    setTimeout(() => process.exit(0), 250);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  console.log(`[openfin] launched — ${platformUuid ?? appUuid ?? '(unknown)'}`);
}

main().catch((err) => {
  console.error('[openfin] unexpected error:', err);
  process.exit(1);
});

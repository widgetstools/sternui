/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenFin platform-launch helper for end-to-end tests.
 *
 * Wraps @openfin/node-adapter so specs can `await launchPlatform()` and get
 * back a connected `fin` proxy plus a `quit()` cleanup. Mirrors the pattern
 * already in `tools/scripts/launch-openfin.mjs` and the per-app launch.mjs
 * files but adds:
 *   - Test-bridge IAB channel client wired up automatically
 *   - Polling helpers for "wait until X is true" state assertions
 *   - Idempotent quit() that swallows already-disconnected errors
 */

import { connect, launch } from '@openfin/node-adapter';
import { setDefaultResultOrder } from 'node:dns';

const TEST_BRIDGE_CHANNEL = 'marketsui-test-bridge';

try { setDefaultResultOrder('ipv4first'); } catch { /* old node */ }

export interface BridgeReply<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface LaunchedPlatform {
  fin: any;
  manifest: any;
  bridge: BridgeClient;
  quit: () => Promise<void>;
}

export interface BridgeClient {
  ping(): Promise<BridgeReply<string>>;
  saveWorkspace(workspace: unknown): Promise<BridgeReply<null>>;
  getWorkspaces(): Promise<BridgeReply<any[]>>;
  getWorkspace(id: string): Promise<BridgeReply<any | undefined>>;
  deleteWorkspace(id: string): Promise<BridgeReply<null>>;
}

/**
 * Launch the OpenFin platform from a manifest URL, connect via node-adapter,
 * and return a handle including a ready-to-use test-bridge client.
 *
 * Waits for the bridge to be installable (the provider window must boot,
 * call `installTestBridge()`, and create the channel). Polls up to 30s.
 */
export async function launchPlatform(manifestUrl: string): Promise<LaunchedPlatform> {
  // 1. Boot OpenFin against the manifest
  console.log(`[e2e-openfin] launching ${manifestUrl}`);
  const port = await launch({ manifestUrl });
  const fin = await connect({
    uuid: `mui-e2e-${Date.now()}`,
    address: `ws://127.0.0.1:${port}`,
    nonPersistent: true,
  });

  const manifest = await fin.System.fetchManifest(manifestUrl);
  const platformUuid: string | undefined = manifest?.platform?.uuid;
  if (!platformUuid) {
    throw new Error(`[e2e-openfin] manifest at ${manifestUrl} has no platform.uuid`);
  }
  console.log(`[e2e-openfin] connected — platform uuid: ${platformUuid}`);

  // 2. Wait for the test bridge channel to come up. The provider window
  //    must finish initWorkspace() and load the dynamic import, which can
  //    take a beat on cold runtime starts.
  const bridgeRaw = await waitFor(
    () => fin.InterApplicationBus.Channel.connect(TEST_BRIDGE_CHANNEL).catch(() => null),
    { timeoutMs: 30_000, intervalMs: 250, label: 'test bridge channel' },
  );
  if (!bridgeRaw) {
    throw new Error('[e2e-openfin] test bridge channel never appeared');
  }
  console.log(`[e2e-openfin] connected to test bridge`);

  // 3. Wrap the channel in a typed dispatcher. Each method maps to a
  //    bridge action registered in apps/markets-ui-react-reference/src/
  //    test-bridge/install.ts.
  const bridge: BridgeClient = {
    ping: () => bridgeRaw.dispatch('ping') as Promise<BridgeReply<string>>,
    saveWorkspace: (ws) => bridgeRaw.dispatch('saveWorkspace', ws) as Promise<BridgeReply<null>>,
    getWorkspaces: () => bridgeRaw.dispatch('getWorkspaces') as Promise<BridgeReply<any[]>>,
    getWorkspace: (id) => bridgeRaw.dispatch('getWorkspace', { id }) as Promise<BridgeReply<any | undefined>>,
    deleteWorkspace: (id) => bridgeRaw.dispatch('deleteWorkspace', { id }) as Promise<BridgeReply<null>>,
  };

  // 4. Quit handler — wraps the platform once and idempotently quits it
  let quitting = false;
  const quit = async (): Promise<void> => {
    if (quitting) return;
    quitting = true;
    try {
      const platform = fin.Platform.wrapSync({ uuid: platformUuid });
      await platform.quit();
    } catch (err) {
      const msg = String((err as any)?.message ?? err);
      if (!msg.includes('no longer connected') && !msg.includes('already')) {
        console.warn('[e2e-openfin] quit error:', msg);
      }
    }
  };

  return { fin, manifest, bridge, quit };
}

interface WaitForOpts {
  timeoutMs: number;
  intervalMs: number;
  label: string;
}

/**
 * Poll an async predicate until it returns a truthy value or the timeout
 * expires. Returns the truthy value or null on timeout. Used to wait for
 * the OpenFin runtime to publish channels / ready signals.
 */
async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  opts: WaitForOpts,
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(opts.intervalMs);
  }
  console.warn(`[e2e-openfin] waitFor('${opts.label}') timed out after ${opts.timeoutMs}ms`);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Test bridge — exposes a small set of WorkspacePlatform.Storage operations
 * over an OpenFin Channel so that out-of-runtime test code (vitest specs in
 * `e2e-openfin/` driven via @openfin/node-adapter) can drive saved-workspace
 * lifecycle without needing direct access to the in-runtime
 * `@openfin/workspace-platform` module.
 *
 * Loaded lazily ONLY in dev mode (via `import.meta.env.DEV`). Code-split out
 * of any production bundle. The IAB channel name `marketsui-test-bridge` is
 * what the e2e-openfin specs connect to.
 *
 * Contract — every action returns `{ ok: true, data? }` on success or
 * `{ ok: false, error: string }` on failure. Errors are caught and turned
 * into structured responses so the test runner doesn't see opaque IAB
 * timeouts when the platform throws.
 */

const CHANNEL_NAME = 'marketsui-test-bridge';

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function safe<T>(fn: () => Promise<T>): Promise<Reply<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

let installed = false;

export async function installTestBridge(): Promise<void> {
  if (installed) return;
  if (typeof fin === 'undefined') return;

  // Dynamic import keeps @openfin/workspace-platform out of the test
  // bridge's static-analysis graph (so production code-splits don't drag
  // it into views that don't need it). Resolves at install time inside
  // the platform provider window which always has it available.
  const WP = await import('@openfin/workspace-platform');

  const provider = await fin.InterApplicationBus.Channel.create(CHANNEL_NAME);

  provider.register('saveWorkspace', async (workspace: unknown) =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      await platform.Storage.saveWorkspace(workspace as never);
      return null;
    }),
  );

  provider.register('getWorkspaces', async () =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      return await platform.Storage.getWorkspaces();
    }),
  );

  provider.register('getWorkspace', async (payload: { id: string }) =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      return await platform.Storage.getWorkspace(payload.id);
    }),
  );

  provider.register('deleteWorkspace', async (payload: { id: string }) =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      await platform.Storage.deleteWorkspace(payload.id);
      return null;
    }),
  );

  // Sentinel action so test code can verify the bridge is installed
  // without needing a full workspace round-trip.
  provider.register('ping', async () => ({ ok: true, data: 'pong' }));

  installed = true;
  console.log(`[test-bridge] installed channel '${CHANNEL_NAME}'`);
}

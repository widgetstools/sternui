/**
 * Shared boot for the shipped SharedWorker entries.
 *
 * `defaultEntry` and `perspectiveEntry` differ by exactly one hub option, so
 * the ConfigManager construction, the deliberate full `init()`, and the
 * bootstrap-payload reading live here rather than being copied. Two copies of
 * this would drift, and the comment about why `init()` must stay full is the
 * kind of thing that survives in one place and gets lost in two.
 */

import { installSharedWorkerHub } from './index.js';
import { createConfigManager } from '@starui/host-config';
import type { SharedWorkerDataServicesHubOpts } from './hubTypes.js';
import {
  appNameFromWorkerName,
  readWorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

interface WorkerBootstrapParams {
  configServiceRestUrl: string | undefined;
  appId: string | undefined;
  userId: string | undefined;
  seedConfigUrl: string | undefined;
  seedConfigReload: 'empty-only' | 'when-changed' | undefined;
}

const EMPTY_PARAMS: WorkerBootstrapParams = {
  configServiceRestUrl: undefined,
  appId: undefined,
  userId: undefined,
  seedConfigUrl: undefined,
  seedConfigReload: undefined,
};

/**
 * Bootstrap fields (`appId`, `userId`, seed URL, REST URL) come from
 * localStorage — written by `createDataServicesWorker` before spawn — not from
 * the script URL, so Vite dev `@fs/` worker URLs stay clean.
 */
function readWorkerBootstrapParams(): WorkerBootstrapParams {
  const workerName = typeof self.name === 'string' ? self.name : '';
  const appName = appNameFromWorkerName(workerName);
  if (!appName) return EMPTY_PARAMS;

  const payload = readWorkerBootstrapPayload(appName);
  if (!payload) return EMPTY_PARAMS;

  return {
    configServiceRestUrl: payload.configServiceRestUrl,
    appId: payload.appId,
    userId: payload.userId,
    seedConfigUrl: payload.seedConfigUrl,
    seedConfigReload: payload.seedConfigReload,
  };
}

export interface BootWorkerEntryOpts {
  /** Extra hub options — how `perspectiveEntry` adds its Perspective loader. */
  hub?: Partial<SharedWorkerDataServicesHubOpts>;
  /** Prefix for the boot log lines, so the two entries are told apart. */
  label?: string;
}

export async function bootWorkerEntry(opts: BootWorkerEntryOpts = {}): Promise<void> {
  const label = opts.label ?? '@starui/host-data worker';
  const { configServiceRestUrl, appId, userId, seedConfigUrl, seedConfigReload } =
    readWorkerBootstrapParams();

  const configManager = createConfigManager({
    configServiceRestUrl,
    appId,
    identity: userId ? { userId, displayName: userId } : undefined,
    seedConfigUrl,
    seedConfigReload,
  });

  // Full init (including seedIfEmpty) is intentional and must stay. The
  // worker is the deterministic seeder + the stale-warm safety net: a
  // SharedWorker has no localStorage/sessionStorage, so it cannot read the
  // cross-window "warm" marker and therefore cannot attach the way a warm
  // main-thread window does. seedIfEmpty's in-lock emptiness check makes this
  // a no-op (no fetch, no write) whenever the DB is already populated, so
  // there is no redundant work to "optimize away" here — converting this to
  // attach mode would silently break recovery after a wiped IndexedDB.
  // See docs/CONFIG_SERVICE_BASELINE.md §4.5.
  await configManager.init();
  await installSharedWorkerHub({ configManager, ...opts.hub });

  // eslint-disable-next-line no-console
  console.info(
    `[${label}] ConfigManager initialised (mode: ${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
  // eslint-disable-next-line no-console
  console.info(`[${label}] catalog + AppData hydrated; hub waiting for ports`);
}

/** Shared failure path — a worker that dies silently is unowned and invisible. */
export function reportBootFailure(label: string, err: unknown): never {
  // eslint-disable-next-line no-console
  console.error(`[${label}] boot failed`, err);
  throw err;
}

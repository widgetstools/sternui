import { writeCrossWindowItem, readCrossWindowItem } from './crossWindowStorage.js';

const WORKER_BOOTSTRAP_PREFIX = 'starui:worker-bootstrap:';

/** Deployment fields consumed by SharedWorker entries at boot. */
export interface WorkerBootstrapPayload {
  appId: string;
  userId: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
  configServiceRestUrl?: string;
  /**
   * Absolute URL of the AppData SharedWorker asset (ADR Phase 4d).
   * When set, provider workers prefetch `{{…}}` via `appdata-lookup`.
   */
  appDataWorkerScriptUrl?: string;
  /**
   * Absolute URL of the Config SharedWorker asset (ADR Phase 4d).
   * Reserved for cfg-free attach via Config SW (dual with local CM for now).
   */
  configWorkerScriptUrl?: string;
  /**
   * When true, the monolith hub rejects data/stats attach (ADR control-plane
   * split). Streaming lives on `starui-provider:*` workers instead.
   */
  hubStreamingDisabled?: boolean;
  /**
   * When true, the monolith hub skips AppData hydrate/serve (ADR).
   * Authority is `starui-appdata:{appId}`.
   */
  hubAppDataDisabled?: boolean;
}

function storageKey(appName: string): string {
  return `${WORKER_BOOTSTRAP_PREFIX}${appName}`;
}

/**
 * Persist bootstrap fields for worker entries to read on first boot.
 * Merges with any existing payload for the same `appName` so Config /
 * AppData / provider / hub writers do not wipe each other's fields.
 */
export function writeWorkerBootstrapPayload(
  appName: string,
  payload: WorkerBootstrapPayload,
): void {
  const prev = readWorkerBootstrapPayload(appName);
  const merged: WorkerBootstrapPayload = {
    appId: payload.appId || prev?.appId || '',
    userId: payload.userId || prev?.userId || '',
    seedConfigUrl: payload.seedConfigUrl ?? prev?.seedConfigUrl,
    seedConfigReload: payload.seedConfigReload ?? prev?.seedConfigReload,
    configServiceRestUrl: payload.configServiceRestUrl ?? prev?.configServiceRestUrl,
    appDataWorkerScriptUrl: payload.appDataWorkerScriptUrl ?? prev?.appDataWorkerScriptUrl,
    configWorkerScriptUrl: payload.configWorkerScriptUrl ?? prev?.configWorkerScriptUrl,
    hubStreamingDisabled: payload.hubStreamingDisabled ?? prev?.hubStreamingDisabled,
    hubAppDataDisabled: payload.hubAppDataDisabled ?? prev?.hubAppDataDisabled,
  };
  writeCrossWindowItem(storageKey(appName), JSON.stringify(merged));
}

/** Read bootstrap fields written by the main thread before worker spawn. */
export function readWorkerBootstrapPayload(
  appName: string,
): WorkerBootstrapPayload | null {
  try {
    const raw = readCrossWindowItem(storageKey(appName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkerBootstrapPayload>;
    if (
      typeof parsed.appId === 'string'
      && parsed.appId.trim().length > 0
      && typeof parsed.userId === 'string'
      && parsed.userId.trim().length > 0
    ) {
      return {
        appId: parsed.appId.trim(),
        userId: parsed.userId.trim(),
        seedConfigUrl: typeof parsed.seedConfigUrl === 'string'
          ? parsed.seedConfigUrl
          : undefined,
        seedConfigReload: parsed.seedConfigReload === 'when-changed'
          ? 'when-changed'
          : undefined,
        configServiceRestUrl: typeof parsed.configServiceRestUrl === 'string'
          ? parsed.configServiceRestUrl
          : undefined,
        appDataWorkerScriptUrl: typeof parsed.appDataWorkerScriptUrl === 'string'
          ? parsed.appDataWorkerScriptUrl
          : undefined,
        configWorkerScriptUrl: typeof parsed.configWorkerScriptUrl === 'string'
          ? parsed.configWorkerScriptUrl
          : undefined,
        hubStreamingDisabled: parsed.hubStreamingDisabled === true,
        hubAppDataDisabled: parsed.hubAppDataDisabled === true,
      };
    }
  } catch {
    /* corrupt payload */
  }
  return null;
}

/** Parse `appName` from SharedWorker `name` (`mkt-data-services:${appId}`). */
export function appNameFromWorkerName(workerName: string): string | null {
  const prefix = 'mkt-data-services:';
  if (!workerName.startsWith(prefix)) return null;
  const appName = workerName.slice(prefix.length).trim();
  return appName.length > 0 ? appName : null;
}

/** Parse `appId` from Config SharedWorker `name` (`starui-config:${appId}`). */
export function appIdFromConfigWorkerName(workerName: string): string | null {
  const prefix = 'starui-config:';
  if (!workerName.startsWith(prefix)) return null;
  const appId = workerName.slice(prefix.length).trim();
  return appId.length > 0 ? appId : null;
}

/** Stable SharedWorker name for the Config catalog service (ADR Phase 2). */
export function configSharedWorkerName(appId: string): string {
  return `starui-config:${appId}`;
}

/** Parse `appId` from AppData SharedWorker `name` (`starui-appdata:${appId}`). */
export function appIdFromAppDataWorkerName(workerName: string): string | null {
  const prefix = 'starui-appdata:';
  if (!workerName.startsWith(prefix)) return null;
  const appId = workerName.slice(prefix.length).trim();
  return appId.length > 0 ? appId : null;
}

/** Stable SharedWorker name for the AppData KV service (ADR Phase 3). */
export function appDataSharedWorkerName(appId: string): string {
  return `starui-appdata:${appId}`;
}

/**
 * Stable SharedWorker name for one streaming provider (ADR Phase 4).
 * `appId` must not contain `:`; `providerId` may.
 */
export function providerSharedWorkerName(appId: string, providerId: string): string {
  return `starui-provider:${appId}:${providerId}`;
}

/**
 * Parse `starui-provider:{appId}:{providerId}` — first `:` after the
 * prefix splits appId; the remainder is providerId (may contain `:`).
 */
export function parseProviderWorkerName(
  workerName: string,
): { appId: string; providerId: string } | null {
  const prefix = 'starui-provider:';
  if (!workerName.startsWith(prefix)) return null;
  const rest = workerName.slice(prefix.length);
  const i = rest.indexOf(':');
  if (i <= 0 || i >= rest.length - 1) return null;
  const appId = rest.slice(0, i).trim();
  const providerId = rest.slice(i + 1).trim();
  if (!appId || !providerId) return null;
  return { appId, providerId };
}

/** Test-only — clears all worker bootstrap payloads. */
export function _resetWorkerBootstrapPayloadForTests(): void {
  if (typeof localStorage === 'undefined' && typeof sessionStorage === 'undefined') {
    return;
  }
  for (const store of [localStorage, sessionStorage]) {
    if (typeof store === 'undefined') continue;
    try {
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const key = store.key(i);
        if (key?.startsWith(WORKER_BOOTSTRAP_PREFIX)) {
          store.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

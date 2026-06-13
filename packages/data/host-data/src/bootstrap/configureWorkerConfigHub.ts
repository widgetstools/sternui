/**
 * App-level registration of the SharedWorker script URL so library code
 * (e.g. `@starui/openfin-platform` `getConfigManager()` fallback) can
 * connect the worker ConfigManager without importing a Vite `?url` asset.
 */

export interface WorkerConfigHubOpts {
  workerScriptUrl: string;
}

let workerScriptUrl: string | undefined;

/** Call once at app entry (before any `getConfigManager()` hub fallback). */
export function configureWorkerConfigHub(opts: WorkerConfigHubOpts): void {
  workerScriptUrl = opts.workerScriptUrl;
}

/** @internal */
export function getWorkerConfigHubScriptUrl(): string | undefined {
  return workerScriptUrl;
}

/** Test-only — clears registered worker URL. */
export function _resetWorkerConfigHubForTests(): void {
  workerScriptUrl = undefined;
}

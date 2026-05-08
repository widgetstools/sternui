/**
 * Runtime public surface (in-package). The streaming, SharedWorker-
 * backed runtime that powers live data delivery. One-shot probes
 * (`StompProbe` etc.) live alongside in `../probes/` for editor /
 * field-inference flows that don't need the worker.
 *
 * Subpaths:
 *   `@starui/data-services/runtime`               — main thread (client + protocol types)
 *   `@starui/data-services/runtime/sharedWorker`  — SharedWorker entry + SharedWorkerDataServicesHub
 *   `@starui/data-services/runtime/client`        — SharedWorkerDataServicesClient
 */

export type {
  ProviderStats,
  ProviderStatus,
  AttachRequest,
  DetachRequest,
  StopRequest,
  Request,
  DeltaEvent,
  StatusEvent,
  StatsEvent,
  Event,
} from './protocol.js';
export { isRequest, isEvent } from './protocol.js';

// Template substitution (client-side, before attach).
export {
  resolveTemplate,
  resolveCfg,
  collectTemplateRefs,
  type AppDataLookup,
} from './template/resolver.js';

// Persistence helpers — main-thread, ConfigManager-backed.
export {
  DataProviderConfigStore,
  PUBLIC_USER_ID,
  COMPONENT_TYPE_DATA_PROVIDER,
  type ListOptions,
} from './config/store.js';
export {
  AppDataConfigStore,
  AppDataStore,
  COMPONENT_TYPE_APPDATA,
  type AppDataConfig,
} from './providers/appdata/index.js';

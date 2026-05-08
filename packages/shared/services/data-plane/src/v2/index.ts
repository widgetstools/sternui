/**
 * v2 public surface (in-package). Apps that want the new data plane
 * import from these subpath barrels — the v1 surface keeps working
 * until the cutover commit.
 *
 * Subpaths:
 *   `@starui/data-plane/v2`           — main thread (client + protocol types)
 *   `@starui/data-plane/v2/worker`    — SharedWorker entry + Hub
 *   `@starui/data-plane/v2/providers` — provider factories (registerProvider, startStomp, ...)
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

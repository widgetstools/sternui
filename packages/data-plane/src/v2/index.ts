/**
 * v2 public surface (in-package). Apps that want the new data plane
 * import from these subpath barrels — the v1 surface keeps working
 * until the cutover commit.
 *
 * Subpaths:
 *   `@marketsui/data-plane/v2`           — main thread (client + protocol types)
 *   `@marketsui/data-plane/v2/worker`    — SharedWorker entry + Hub
 *   `@marketsui/data-plane/v2/providers` — provider factories (registerProvider, startStomp, ...)
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
  AppDataConfigStore,
  PUBLIC_USER_ID,
  COMPONENT_TYPE_DATA_PROVIDER,
  COMPONENT_TYPE_APPDATA,
  type AppDataConfig,
  type ListOptions,
} from './config/store.js';
export { AppDataStore } from './config/AppDataStore.js';

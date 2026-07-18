/**
 * @starui/host-data — public entry.
 *
 * The runtime is the live surface. The root entry re-exports runtime
 * types so `@starui/host-data` continues to give consumers a
 * usable barrel. For specific entry points use the subpath exports:
 *
 *   `@starui/host-data/runtime`               — protocol types + main-thread helpers
 *   `@starui/host-data/runtime/client`        — the SharedWorkerDataServicesClient
 *   `@starui/host-data/runtime/sharedWorker`  — installSharedWorkerHub + SharedWorkerDataServicesHub
 *
 * `probeStomp` / `probeRest` / `inferFields` are pure main-thread
 * helpers (the design doc's `transport: 'main'` mode) consumed by
 * editors for "Test connection" and "Infer fields" flows.
 */

// Runtime surface — main-thread types + helpers.
export * from './runtime/index.js';

// IDataProvider contract (Phase 0 types; adapter in Phase 3).
export type {
  DataServicesHubBundle,
  IDataProvider,
  IDataProviderFactory,
  ProviderCapabilities,
  Unsubscribe,
  ProviderClientAdapterOpts,
  ProviderWorkerRoutingOpts,
} from './provider/index.js';
export {
  ProviderClientAdapter,
  resolveProviderCapabilities,
} from './provider/index.js';

// Platform bootstrap (Phase 0.5).
export type {
  PlatformBootstrapConfig,
  PlatformBootstrapValidationResult,
  AppDataBootstrapManifest,
} from './bootstrap/index.js';
export {
  DEV_PLATFORM_BOOTSTRAP,
  validatePlatformBootstrapConfig,
  PlatformBootstrapConfigError,
  resolvePlatformBootstrapFromJson,
  resolvePlatformBootstrapFromObject,
  ensureConfigReady,
  ensurePlatformReady,
  ensureDataServicesHub,
  SnapshotReassembler,
  runAppDataBootstrap,
  createAppDataBootstrapContext,
  markConfigReady,
  markHubConnected,
  markAppDataReady,
  markCatalogReady,
  markPlatformReady,
  markLoadMilestone,
  readLoadMilestone,
  readLoadTimings,
} from './bootstrap/index.js';
export type { LoadMilestone } from './bootstrap/index.js';
export type {
  FetchLike,
  ConfigReadyBundle,
  EnsurePlatformReadyOpts,
  EnsureConfigReadyOpts,
  EnsureHubOpts,
  ResolvedDataServicesHubBundle,
  SnapshotReassemblerCallbacks,
  AppDataBootstrapContext,
  AppDataBootstrapHook,
  AppDataBootstrapHookRegistry,
  AppDataUpsertInput,
  RunAppDataBootstrapOpts,
} from './bootstrap/index.js';

// One-shot probes — pure main-thread functions for editor flows
// (Test connection, Infer fields). Same vocabulary the streaming
// runtime uses; calling them in-process is the design doc's
// `transport: 'main'` mode.
export {
  probeStomp,
  connectStomp,
  probeRest,
  probeMock,
  startMock,
  createFiPositionsLargeConfig,
  createFiPositionsSmallConfig,
  inferFields,
  type StompProbeResult,
  type StompProbeOpts,
  type RestProbeResult,
  type InferOptions,
  type MockProviderOpts,
  type FiPositionsConfigOverrides,
} from './runtime/providers/index.js';

export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './services/index.js';

export { createDataPort } from './createDataPort.js';

// Config SharedWorker (ADR Phase 2) — P1 apps / catalog without data hub.
export {
  createConfigClient,
  createConfigWorker,
  CONFIG_WORKER_ASSET,
  ConfigClient,
  wireConfigWorkerCatalogSync,
  ConfigCatalogHub,
  installConfigCatalogHub,
  type CreateConfigClientOpts,
  type CreateConfigWorkerOpts,
  type ConfigCatalogHubOpts,
  type CatalogChangedHandler,
} from './runtime/configWorker/index.js';
export {
  configSharedWorkerName,
  appIdFromConfigWorkerName,
  appDataSharedWorkerName,
  appIdFromAppDataWorkerName,
  providerSharedWorkerName,
  parseProviderWorkerName,
} from './bootstrap/workerBootstrapPayload.js';

// AppData SharedWorker (ADR Phase 3) — KV / template lookup without data hub.
export {
  createAppDataClient,
  createAppDataWorker,
  APPDATA_WORKER_ASSET,
  AppDataClient,
  AppDataHub,
  installAppDataHub,
  type CreateAppDataClientOpts,
  type CreateAppDataWorkerOpts,
  type AppDataHubOpts,
} from './runtime/appDataWorker/index.js';

// Provider SharedWorker (ADR Phase 4a) — one upstream per named worker.
export {
  createProviderClient,
  createProviderWorker,
  PROVIDER_WORKER_ASSET,
  ProviderClient,
  ProviderHub,
  installProviderHub,
  ProviderAppDataLookupCache,
  createProviderAppDataLookupCache,
  resolveProviderConfigFromConfigClient,
  type CreateProviderClientOpts,
  type CreateProviderWorkerOpts,
  type ProviderHubOpts,
} from './runtime/providerWorker/index.js';

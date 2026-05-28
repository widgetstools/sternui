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
} from './provider/index.js';
export {
  ProviderClientAdapter,
  resolveProviderCapabilities,
} from './provider/index.js';

// Platform bootstrap (Phase 0.5).
export type {
  PlatformBootstrapConfig,
  PlatformBootstrapValidationResult,
} from './bootstrap/index.js';
export {
  DEV_PLATFORM_BOOTSTRAP,
  validatePlatformBootstrapConfig,
  PlatformBootstrapConfigError,
  resolvePlatformBootstrapFromJson,
  resolvePlatformBootstrapFromObject,
  ensurePlatformReady,
  ensureDataServicesHub,
  SnapshotReassembler,
} from './bootstrap/index.js';
export type {
  FetchLike,
  EnsurePlatformReadyOpts,
  EnsureHubOpts,
  ResolvedDataServicesHubBundle,
  SnapshotReassemblerCallbacks,
} from './bootstrap/index.js';

// One-shot probes — pure main-thread functions for editor flows
// (Test connection, Infer fields). Same vocabulary the streaming
// runtime uses; calling them in-process is the design doc's
// `transport: 'main'` mode.
export {
  probeStomp,
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

/**
 * @marketsui/data-plane — public entry.
 *
 * Week-1 surface: protocol types, cache primitives, provider base + built-in
 * providers (Mock, AppData). The SharedWorker entry and DataPlaneClient
 * land in Week 2 and will extend this barrel without breaking existing
 * consumers.
 */

// Wire protocol — safe for both client and worker sides to import.
export * from './protocol';

// Cache primitives — used by the worker-side router (Week 2) and by
// tests. Exposed so advanced consumers can instantiate their own
// router (e.g. in-page fallback mode from `fallbacks.ts`).
//
// Two cache shapes coexist:
//   • ProviderCache — generic per-key LRU + TTL (AppData, future
//     REST-per-endpoint, per-ticker price). Good when each key is
//     an independent resource.
//   • RowCache — row-upsert keyed by a single `keyColumn`. Good for
//     streaming row-sets (STOMP blotters, WebSocket stream of
//     tick rows). Direct port of stern-1's proven CacheManager.
export {
  ProviderCache,
  CacheState,
  isExpired,
  singleFlight,
  type CacheEntry,
  type ProviderCacheOpts,
} from './worker/cache';
export {
  RowCache,
  type RowCacheOpts,
  type UpsertResult,
} from './worker/rowCache';

// Built-in providers. Import from `@marketsui/data-plane/providers`
// for tree-shaking; this re-export is for ergonomics.
export {
  ProviderBase,
  MockProvider,
  AppDataProvider,
  StreamProviderBase,
  type Unsubscribe as ProviderUnsubscribe,
  type ProviderEmitter,
  type MockRow,
  type MockSnapshot,
  type StreamProviderListener,
  type StreamStatistics,
} from './providers';

// Main-thread SDK — the vast majority of app consumers only need this
// surface. Import from `@marketsui/data-plane/client` to avoid pulling
// the Router (and its provider factory) into the main bundle.
export {
  DataPlaneClient,
  DataPlaneClientError,
  connect,
  connectSharedWorker,
  connectDedicatedWorker,
  connectInPage,
  hasSharedWorker,
  hasDedicatedWorker,
  type KeyedUpdateEvent,
  type StreamListener,
  type Unsubscribe,
  type ConnectOpts,
  type ConnectedClient,
  type TransportMode,
} from './client';

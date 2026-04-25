/**
 * Worker-side barrel. Consumers who author a worker asset
 * (`new SharedWorker(new URL('./myWorker.ts', import.meta.url))`)
 * import from `@marketsui/data-plane/worker`; main-thread code
 * should NOT import this entry — it'd drag the router into the
 * main bundle.
 */
export { Router, type RouterOpts } from './router';
export { BroadcastManager } from './broadcastManager';
export {
  defaultProviderFactory,
  composeFactory,
  buildStompFactory,
  type ProviderFactory,
  type ProviderInstance,
  type KeyedProviderInstance,
  type StreamProviderInstance,
} from './providerFactory';
export { installWorker, type InstallOpts } from './entry';
export {
  ProviderCache,
  CacheState,
  isExpired,
  singleFlight,
  type CacheEntry,
  type ProviderCacheOpts,
} from './cache';
export {
  RowCache,
  type RowCacheOpts,
  type UpsertResult,
} from './rowCache';

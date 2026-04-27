/**
 * @marketsui/data-plane — public entry.
 *
 * The v2 data plane is the live surface. The root entry re-exports
 * v2 types so `@marketsui/data-plane` continues to give consumers a
 * usable barrel. For specific entry points use the subpath exports:
 *
 *   `@marketsui/data-plane/v2`           — protocol types + main-thread helpers
 *   `@marketsui/data-plane/v2/client`    — the `DataPlane` client class
 *   `@marketsui/data-plane/v2/worker`    — `installWorker` + Hub
 *
 * `StompDataProvider` and `DataProviderConfigService` survive at the
 * root for the @marketsui/angular package (which has its own data-
 * plane integration). They are scheduled for removal once Angular
 * gets its v2 cutover.
 */

// v2 surface — main-thread types + helpers.
export * from './v2/index.js';

// Surviving v1 modules — kept until Angular cuts over.
export {
  StompDataProvider,
  StreamProviderBase,
  ProviderBase,
  type StompConnectionConfig,
  type StompConnectionResult,
  type ProviderEmitter,
  type Unsubscribe as ProviderUnsubscribe,
  type StreamProviderListener,
  type StreamStatistics,
} from './providers/index.js';

export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './services/index.js';

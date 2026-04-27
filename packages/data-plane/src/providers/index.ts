/**
 * Providers barrel — v1-survival surface.
 *
 * Only modules still consumed by `@marketsui/angular` survive the v2
 * cutover. The worker-side router + factories are gone (replaced by
 * v2's Hub + provider registry). When Angular gets a v2 cutover this
 * barrel disappears.
 */

export { ProviderBase, type Unsubscribe, type ProviderEmitter } from './ProviderBase.js';
export {
  StreamProviderBase,
  type StreamProviderListener,
  type StreamStatistics,
} from './StreamProviderBase.js';
export {
  StompDataProvider,
  type StompConnectionConfig,
  type StompConnectionResult,
} from './StompDataProvider.js';

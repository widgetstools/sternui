/**
 * Probes barrel — one-shot, main-thread snapshot fetchers.
 *
 * Distinct from the streaming runtime in `../runtime/` which lives in
 * the SharedWorker. Probes power "Test connection", "Infer fields",
 * and other editor flows where a brief lifetime + single result is
 * the right shape. Currently consumed by `@starui/widgets-angular`.
 */

export { ProviderBase, type Unsubscribe, type ProviderEmitter } from './ProviderBase.js';
export {
  StreamProviderBase,
  type StreamProviderListener,
  type StreamStatistics,
} from './StreamProviderBase.js';
export {
  StompProbe,
  type StompConnectionConfig,
  type StompConnectionResult,
} from './StompProbe.js';

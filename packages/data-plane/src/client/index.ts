/**
 * Client-side barrel. Main-thread consumers (React / Angular apps,
 * tests) import from `@marketsui/data-plane/client`.
 */
export {
  DataPlaneClient,
  DataPlaneClientError,
  type KeyedUpdateEvent,
  type StreamListener,
  type Unsubscribe,
} from './DataPlaneClient';
export {
  connect,
  connectSharedWorker,
  connectDedicatedWorker,
  connectInPage,
  buildSharedWorkerName,
  type ConnectOpts,
  type ConnectSharedWorkerOpts,
  type ConnectDedicatedWorkerOpts,
  type ConnectedClient,
} from './connect';
export {
  hasSharedWorker,
  hasDedicatedWorker,
  type TransportMode,
  type TransportSelection,
} from './fallbacks';

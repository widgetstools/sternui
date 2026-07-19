/**
 * Pull data path — the provider writes its rows once into a Perspective table
 * hosted in a SharedWorker; windows read viewports instead of receiving the
 * whole dataset (docs/ADR-ssrm-worker-hosted-engine.md).
 */

export {
  ProviderTableBridge,
  type BridgeTable,
  type ProviderTableBridgeOpts,
} from './ProviderTableBridge.js';

export {
  PerspectiveAttachHandler,
  type AttachClient,
  type PerspectiveAttachHandlerOpts,
} from './PerspectiveAttachHandler.js';

export {
  connectPerspectivePort,
  PERSPECTIVE_HANDSHAKE_TIMEOUT_MS,
  type ConnectPerspectivePortOpts,
} from './connectPerspectivePort.js';

export {
  createProviderPerspectiveConnect,
  type CreateProviderPerspectiveConnectOpts,
} from './createProviderPerspectiveConnect.js';

export {
  linkProviderToPerspective,
  perspectiveSharedWorkerName,
  parsePerspectiveWorkerName,
  resolvePerspectiveWorkerUrl,
  isPerspectiveAttachRequest,
  isPerspectiveAttachAck,
  type PerspectiveAttachRequest,
  type PerspectiveAttachAck,
  type LinkProviderToPerspectiveOpts,
  type SharedWorkerLike,
} from './perspectiveWorkerLink.js';

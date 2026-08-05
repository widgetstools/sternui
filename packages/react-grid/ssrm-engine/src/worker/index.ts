/**
 * Worker hosting for `@starui/ssrm-engine` — the book leaves the window.
 *
 * The window held the book because the engine is synchronous and in-process,
 * which is the memory shape the Perspective pull path exists to avoid. This is
 * the seam that moves it:
 *
 * ```
 *   SharedWorker    serveSsrmEngineWorker({ openBook })   one SsrmEngine per book id
 *                   host.publish(bookId, patch)           a tick, pushed
 *
 *   Window          SsrmEngineClient.open(port, bookId)   async surface
 *                   createAsyncSsrmDatasource(client)     the AG boundary
 * ```
 *
 * A separate entry point from the package root deliberately: the root is
 * importable in a window, a worker and Node alike, and nothing there assumes a
 * `MessagePort` exists.
 */
export { createSsrmWorkerHost, serveSsrmEngineWorker } from './host.js';
export type { SsrmBook, SsrmWorkerHost, SsrmWorkerHostOptions } from './host.js';
export { SsrmEngineClient } from './SsrmEngineClient.js';
export type { SsrmDeltaPushListener, SsrmEngineClientOptions } from './SsrmEngineClient.js';
export {
  createSsrmRpcClient,
  serveSsrmRpc,
  describeError,
  SsrmRpcError,
  type SsrmRpcClient,
  type SsrmRpcClientOptions,
  type SsrmRpcErrorCode,
  type SsrmRpcHandler,
  type SsrmRpcStats,
} from './rpc.js';
export {
  isPushFrame,
  isRequestFrame,
  isResponseFrame,
  SSRM_HEARTBEAT_MS,
  SSRM_RPC_TIMEOUT_MS,
  SSRM_STALE_MS,
  SSRM_SWEEP_MS,
  type SsrmBookReport,
  type SsrmCalcColumnsParams,
  type SsrmCalcDiagnosticsResult,
  type SsrmDeltaPush,
  type SsrmFaultPush,
  type SsrmFrame,
  type SsrmIntrospectResult,
  type SsrmOpenResult,
  type SsrmPushFrame,
  type SsrmRequestFrame,
  type SsrmResponseFrame,
  type SsrmRpcMethod,
  type SsrmViewport,
  type SsrmViewportParams,
} from './protocol.js';

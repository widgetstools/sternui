/**
 * SSRM STOMP provider V2 — pull-plane runtime (main-thread-safe
 * surface). The SharedWorker side ships separately as the bundled
 * asset `@starui/host-data/assets/data-services-ssrm-worker.mjs`
 * (entry: `worker/ssrmWorkerEntry.ts`) — nothing here pulls worker
 * globals or the Perspective engine into a window bundle.
 *
 * See docs/SSRM_PROVIDER_V2_DESIGN.md.
 */

export type {
  DatasetPhase,
  DatasetStateSnapshot,
  SsrmDatasetConfig,
  SsrmControlRequest,
  SsrmConfigureRequest,
  SsrmRestartRequest,
  SsrmStateRequest,
  SsrmControlEvent,
  SsrmAckEvent,
  SsrmStateEvent,
} from './types.js';
export { isSsrmControlRequest, isSsrmControlEvent } from './types.js';

export { DatasetStateMachine, type DatasetStateListener } from './DatasetStateMachine.js';
export {
  TableWriter,
  type SsrmRow,
  type SsrmTableSurface,
  type TableWriterOpts,
} from './TableWriter.js';
export {
  schemaFromColumnDefinitions,
  refineSchemaFromRows,
  inferPerspectiveType,
  projectRowToSchema,
  type PerspectiveSchema,
  type PerspectiveColumnType,
  type RefineSchemaResult,
} from './tableSchema.js';
export { classifyFrame, matchesEndToken, type FrameClass } from './stompFrames.js';

// Catalog config (`providerType: 'stomp-ssrm'`) → worker config. The
// catalog type itself lives in @starui/types; re-exported here so pull
// consumers get the pair from one import.
export { toSsrmDatasetConfig, type StompSsrmProviderConfig } from './toSsrmDatasetConfig.js';

export {
  SsrmControlClient,
  type SsrmControlClientOpts,
  type SsrmStateListener,
} from './client/SsrmControlClient.js';

/** Stable worker asset subpath (mirror of DATA_SERVICES_WORKER_ASSET). */
export const SSRM_WORKER_ASSET = '@starui/host-data/assets/data-services-ssrm-worker.mjs';

/** SharedWorker name for one app+provider dataset — every window sharing it shares the book. */
export function ssrmWorkerName(appId: string, providerId: string): string {
  return `starui-ssrm:${appId}:${providerId}`;
}

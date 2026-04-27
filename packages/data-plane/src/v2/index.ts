/**
 * v2 public surface (in-package). Apps that want the new data plane
 * import from these subpath barrels — the v1 surface keeps working
 * until the cutover commit.
 *
 * Subpaths:
 *   `@marketsui/data-plane/v2`           — main thread (client + protocol types)
 *   `@marketsui/data-plane/v2/worker`    — SharedWorker entry + Hub
 *   `@marketsui/data-plane/v2/providers` — provider factories (registerProvider, startStomp, ...)
 */

export type {
  ProviderStats,
  ProviderStatus,
  AttachRequest,
  DetachRequest,
  StopRequest,
  Request,
  DeltaEvent,
  StatusEvent,
  StatsEvent,
  Event,
} from './protocol.js';
export { isRequest, isEvent } from './protocol.js';

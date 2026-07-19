/**
 * SSRM table provider — routes a streaming provider's emissions into a
 * Perspective table instead of the hub cache + fan-out
 * (docs/ADR-ssrm-worker-hosted-engine.md).
 *
 * ## Why this is an adapter, not a new transport
 *
 * `startStomp` already owns connection, reconnect, snapshot assembly, end-token
 * detection, `{{…}}` template resolution and field projection, and reports
 * everything through {@link ProviderEmit}. None of that is push-specific. The
 * only thing the pull path changes is **where rows land**, so forking the
 * transport would duplicate ~1,000 lines and guarantee drift.
 *
 * So: same transports, different sink.
 *
 * ```text
 *   push:  transport → emit → hub cache → fan-out → every window
 *   pull:  transport → emit → THIS → ProviderTableBridge → Perspective table
 * ```
 *
 * Status, byte counts and timing samples still surface to the caller, so the
 * Diagnostics pane keeps working on a pull-path provider.
 *
 * ## What the pull path makes redundant
 *
 * `conflateByKey` (the table's `index` conflates structurally), `thinDeltas`
 * (a keyed `update()` with partial columns leaves other fields untouched),
 * `delta-bin` / columnar encoding and the replay memo (nothing is fanned out).
 * `projectFields` still pays — a narrower table is cheaper everywhere.
 */

import type {
  ProviderEmit,
  ProviderEmitEvent,
  ProviderHandle,
} from './Provider.js';
import type { ProviderStatus } from '../protocol.js';
import type { ProviderTableBridge } from '../perspective/ProviderTableBridge.js';

/** Starts a transport with the given emit sink and returns its handle. */
export type TransportStarter = (emit: ProviderEmit) => ProviderHandle;

export interface SsrmTableProviderOpts {
  /** Sink for rows — one per (appId, providerId). */
  bridge: ProviderTableBridge;
  /** Transport to drive, e.g. `(emit) => startStomp(cfg, emit, …)`. */
  start: TransportStarter;
  /** Status changes, for diagnostics / UI. */
  onStatus?: (status: ProviderStatus, error?: string) => void;
  /** Upstream byte + row counters, for diagnostics. */
  onMetrics?: (metrics: { byteSize?: number; rowsReceived?: number }) => void;
  onError?: (err: unknown) => void;
}

export interface SsrmTableProvider extends ProviderHandle {
  /** Latest upstream status. */
  readonly status: ProviderStatus;
  /** True once a snapshot has been committed to the table. */
  readonly hasSnapshot: boolean;
}

/**
 * Drive a transport into a Perspective table.
 *
 * `replace: true` frames commit as a table `replace` — a new book, so any
 * rows the bridge had coalesced are dropped rather than resurrected. Live
 * frames are conflated by key and flushed on the bridge's window.
 */
export function createSsrmTableProvider(
  opts: SsrmTableProviderOpts,
): SsrmTableProvider {
  const { bridge, start } = opts;
  let status: ProviderStatus = 'loading';
  let hasSnapshot = false;
  let stopped = false;

  const emit: ProviderEmit = (event: ProviderEmitEvent) => {
    if (stopped) return;

    if ('rows' in event) {
      const rows = event.rows as Record<string, unknown>[];
      if (event.replace) {
        // Snapshot / restart: the previous book is gone.
        hasSnapshot = true;
        void bridge.snapshot(rows).catch((err: unknown) => opts.onError?.(err));
      } else {
        bridge.push(rows);
      }
      return;
    }

    if ('status' in event) {
      status = event.status;
      // A provider going back to `loading` is re-fetching; the next
      // `replace` frame will re-seed the table.
      if (event.status === 'loading') hasSnapshot = false;
      opts.onStatus?.(event.status, event.error);
      return;
    }

    if ('byteSize' in event) {
      opts.onMetrics?.({ byteSize: event.byteSize });
      return;
    }

    if ('rowsReceived' in event) {
      opts.onMetrics?.({ rowsReceived: event.rowsReceived });
      return;
    }

    // `timing` samples are push-path diagnostics (click → hub latency) and
    // have no analogue here; ignored rather than mis-reported.
  };

  const handle = start(emit);

  return {
    get status() {
      return status;
    },
    get hasSnapshot() {
      return hasSnapshot;
    },
    stop(): void | Promise<void> {
      if (stopped) return;
      stopped = true;
      // Drop anything coalesced but unflushed — it describes a feed we are
      // no longer serving. The table itself is shared and outlives us.
      bridge.dispose();
      return handle.stop();
    },
    restart(extra?: Record<string, unknown>): void | Promise<void> {
      if (stopped) return;
      hasSnapshot = false;
      return handle.restart(extra);
    },
  };
}

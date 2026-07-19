/**
 * Install {@link ProviderHub} on a SharedWorker / dedicated Worker global.
 *
 * AppData mirror requests are intentionally ignored — UI mirrors attach
 * to `starui-appdata`. In-process AppData inside the wrapped hub still
 * backs provider template lookup until Phase 4b bridge.
 *
 * ## Pull data path (ADR-ssrm-worker-hosted-engine)
 *
 * When `perspectiveConnect` is supplied, `psp-attach` messages (a window
 * transferring a MessagePort to the engine SharedWorker) are routed to a
 * {@link PerspectiveAttachHandler} instead of the hub protocol. On link:
 *
 *  1. the handler stands up a Perspective client over the port and opens
 *     or creates the provider's table;
 *  2. the table is seeded from the hub's row cache (everything received
 *     before the link came up);
 *  3. subsequent provider frames reach the table via the hub's
 *     `pullSinkFor` tee — no window is in the data path.
 */

import type { ConfigManager } from '@wellsfargo-starui/host-config';
import { isProviderHubRequest, ProviderHub, type ProviderHubOpts } from './ProviderHub.js';
import type { PortLike } from '../worker/hubTypes.js';
import {
  PerspectiveAttachHandler,
  type AttachClient,
} from '../perspective/PerspectiveAttachHandler.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

export interface InstallProviderHubOpts extends Omit<ProviderHubOpts, 'providerId'> {
  providerId: string;
  configManager?: ConfigManager;
  selfRef?: unknown;
  hydrateUserId?: string;
  /**
   * Stand up a Perspective client over a transferred `psp-attach` port
   * (see `connectPerspectivePort` / `createProviderPerspectiveConnect`).
   * Omit to disable the pull path for this worker.
   */
  perspectiveConnect?: (port: MessagePort) => Promise<AttachClient>;
  /** Bridge flush window for the pull path (default: bridge default). */
  perspectiveFlushMs?: number;
}

export interface InstalledProviderWorker {
  hub: ProviderHub;
  /** Pull-path link handler; null when `perspectiveConnect` was not given. */
  perspectiveAttach: PerspectiveAttachHandler | null;
  /** Stop accepting new ports, dispose the Hub. Used by tests. */
  stop(): Promise<void>;
}

/** How long a schema-less link waits for the provider's first rows. */
const SCHEMA_INFER_WAIT_MS = 30_000;
const SCHEMA_INFER_POLL_MS = 100;

/** Column → Perspective type from a sample row (flattened provider rows). */
export function inferPerspectiveSchema(
  row: Record<string, unknown>,
): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const [field, value] of Object.entries(row)) {
    schema[field] =
      typeof value === 'number'
        ? 'float'
        : typeof value === 'boolean'
          ? 'boolean'
          : 'string';
  }
  return schema;
}

export async function installProviderHub(
  opts: InstallProviderHubOpts,
): Promise<InstalledProviderWorker> {
  let perspectiveAttach: PerspectiveAttachHandler | null = null;

  const hub = new ProviderHub({
    ...opts,
    deferLiveFanOut: opts.deferLiveFanOut ?? true,
    pullSinkFor: (providerId) => perspectiveAttach?.bridgeFor(providerId),
  });

  if (opts.perspectiveConnect) {
    perspectiveAttach = new PerspectiveAttachHandler({
      connect: opts.perspectiveConnect,
      flushMs: opts.perspectiveFlushMs,
      // Attach carried no schema — infer from the provider's rows, waiting
      // for the snapshot when the link races it. Rows are the ground truth
      // (rowShape flattening can diverge from cfg columnDefinitions).
      schemaFor: async (req) => {
        const deadline = Date.now() + SCHEMA_INFER_WAIT_MS;
        for (;;) {
          const rows = hub.getInnerHub().getCachedRows(req.providerId);
          if (rows.length > 0) return inferPerspectiveSchema(rows[0]!);
          if (Date.now() >= deadline) return undefined;
          await new Promise((r) => setTimeout(r, SCHEMA_INFER_POLL_MS));
        }
      },
      onLinked: (providerId, bridge) => {
        const rows = hub.getInnerHub().getCachedRows(providerId);
        if (rows.length > 0) void bridge.snapshot(rows);
      },
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.warn(
          '[@wellsfargo-starui/host-data provider-worker] perspective link error',
          err,
        );
      },
    });
  }

  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const pendingPorts: MessagePort[] = [];
  let attachPort: ((port: MessagePort) => void) | null = null;

  const attach = (port: MessagePort) => {
    let portLike: PortLike;
    const onMessage = (ev: MessageEvent) => {
      if (
        perspectiveAttach?.handleMessage(ev.data, ev.ports ?? [], (ack) =>
          port.postMessage(ack),
        )
      ) {
        return;
      }
      if (!isProviderHubRequest(ev.data)) return;
      hub.handleRequest(portLike, ev.data);
    };
    const onError = () => hub.onPortClosed(portLike);
    portLike = {
      postMessage: (m) => port.postMessage(m),
      dispose: () => {
        try {
          port.removeEventListener('message', onMessage);
          port.removeEventListener('messageerror', onError);
        } catch {
          /* port may already be closed */
        }
      },
    };
    port.addEventListener('message', onMessage);
    port.addEventListener('messageerror', onError);
    port.start();
  };

  if ('onconnect' in globalRef) {
    (globalRef as SharedWorkerLike).onconnect = (ev) => {
      const port = ev.ports[0];
      if (!port) return;
      if (attachPort) attachPort(port);
      else pendingPorts.push(port);
    };
  }

  if (opts.configManager) {
    await hub.hydrate(opts.hydrateUserId ?? 'worker');
  }

  attachPort = attach;
  for (const port of pendingPorts) attach(port);
  pendingPorts.length = 0;

  if (!('onconnect' in globalRef) && 'onmessage' in globalRef && 'postMessage' in globalRef) {
    const dedicated = globalRef as DedicatedWorkerLike;
    const portLike: PortLike = {
      postMessage: (message) => dedicated.postMessage(message),
    };
    dedicated.onmessage = (ev: MessageEvent) => {
      if (
        perspectiveAttach?.handleMessage(ev.data, ev.ports ?? [], (ack) =>
          dedicated.postMessage(ack),
        )
      ) {
        return;
      }
      if (!isProviderHubRequest(ev.data)) return;
      hub.handleRequest(portLike, ev.data);
    };
  }

  return {
    hub,
    perspectiveAttach,
    stop: () => {
      perspectiveAttach?.dispose();
      return hub.dispose();
    },
  };
}

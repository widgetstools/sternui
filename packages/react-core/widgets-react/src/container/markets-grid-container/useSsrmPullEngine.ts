/**
 * Pull data path for `MarketsGridContainer` (ADR-ssrm-worker-hosted-engine,
 * Phase 4): build the window-side `SsrmEngine` over the provider's
 * worker-hosted Perspective table.
 *
 * Per (appId, providerId) the hook:
 *  1. posts the `psp-attach` port hand-off so the provider worker links to
 *     the engine worker (idempotent — the first window wins, later windows
 *     are acked `linked: false`);
 *  2. opens this window's own read connection (`createPerspectiveReadClient`)
 *     and wraps it in `createPerspectiveEngine` with `attachToHostedTable`.
 *
 * The returned engine is OWNED HERE (disposed when the inputs change or the
 * container unmounts) — `SsrmGrid` never disposes injected engines, so grid
 * remounts (profile switches) keep the engine and its view cache alive.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createPerspectiveReadClient,
  linkProviderToPerspective,
  type ProviderWorkerRoutingOpts,
} from '@wellsfargo-starui/host-data';
import {
  createPerspectiveEngine,
  type PerspectiveClient,
  type SsrmEngine,
} from '@wellsfargo-starui/grid';

/** Must match SsrmGrid's internal dataset id (`custom/useSsrmGridController`). */
const PULL_DATASET = 'main';

export interface UseSsrmPullEngineOpts {
  enabled: boolean;
  providerId: string | null | undefined;
  /** Provider key column — the table index and grid row id. */
  keyColumn: string | null | undefined;
  routing: ProviderWorkerRoutingOpts | undefined;
  onError?: (error: Error) => void;
}

export function useSsrmPullEngine(opts: UseSsrmPullEngineOpts): SsrmEngine | null {
  const { enabled, providerId, keyColumn, routing, onError } = opts;
  const [engine, setEngine] = useState<SsrmEngine | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const pspUrl = routing?.perspectiveWorkerScriptUrl;
  const providerUrl = routing?.workerScriptUrl;
  const appId = routing?.appId;

  useEffect(() => {
    if (!enabled || !providerId || !keyColumn || !appId || !providerUrl || !pspUrl) {
      setEngine(null);
      return;
    }
    let cancelled = false;
    let built: SsrmEngine | null = null;

    // 1. Hand-off. Every window may try; the provider worker dedupes. The
    //    attach handler infers the table schema from the provider's first
    //    cached rows, so this needs no data to have arrived yet.
    try {
      const providerSW = new SharedWorker(providerUrl, {
        type: 'module',
        name: `starui-provider:${appId}:${providerId}`,
      });
      providerSW.port.start();
      linkProviderToPerspective({
        appId,
        providerId,
        dataset: PULL_DATASET,
        keyColumn,
        workerScriptUrl: pspUrl,
        providerPort: providerSW.port,
      });
    } catch (err) {
      onErrorRef.current?.(
        err instanceof Error ? err : new Error(String(err)),
      );
    }

    // 2. Read side — this window's own client over the shared engine worker.
    void createPerspectiveReadClient({
      appId,
      providerId,
      workerScriptUrl: pspUrl,
    })
      .then((client) => {
        if (cancelled) return;
        built = createPerspectiveEngine({
          client: client as unknown as PerspectiveClient,
          attachToHostedTable: true,
        });
        setEngine(built);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onErrorRef.current?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      });

    return () => {
      cancelled = true;
      built?.dispose();
      setEngine(null);
    };
  }, [enabled, providerId, keyColumn, appId, providerUrl, pspUrl]);

  return engine;
}

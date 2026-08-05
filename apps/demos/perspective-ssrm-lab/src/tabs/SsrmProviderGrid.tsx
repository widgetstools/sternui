import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import { useDataServices, useUserIdFromContext } from '@starui/host-data-react/runtime';
import { SsrmEngineGrid } from './SsrmEngineGrid';
import {
  buildLabPerspectiveProvider,
  KEY_COLUMN,
  labProviderId,
  LAB_PROVIDER_CFG_VERSION,
} from '../data/perspectiveProvider';
import type { LabStreamOptions } from '../demo/types';

/**
 * The same engine, over a book fed by a REAL provider.
 *
 * Reached with `?engine=ssrm&book=provider`. The rows come from `host-data`:
 * the provider emits, `createSsrmBookFeed` decorates that emit and drives
 * `applySnapshot` / `applyUpdate`, and this window attaches to the resulting
 * book over a transferred port. Nothing about the grid changes — that is the
 * point of `SsrmEngineGrid` taking the client as a prop.
 *
 * ## The book is in the DATA-SERVICES worker, and it has to be
 *
 * The generated Stress book lives in the app's own `ssrmBookWorker` because it
 * has no provider and can live anywhere. This one cannot. Its rows arrive in
 * the data-services worker, and there is no route between two SharedWorkers
 * that does not pass through a window — so hosting it in the other worker would
 * mean forwarding every row window-by-window, which is a second copy of the
 * feed PER WINDOW. The book goes where the feed already is.
 *
 * ## The provider row is written before attaching
 *
 * Same idempotent, versioned seed as `useLabPerspectiveRows`, and for the same
 * reason: the hub resolves a provider config on demand, and a window that
 * writes its row and attaches immediately loses a race it cannot see.
 * Deliberately NOT reusing that hook — it also attaches a Perspective
 * ProxySession as a side effect of being called, and a hook cannot be called
 * conditionally, so using it here would build a Perspective Table beside this
 * book and make every figure taken on the surface a figure for two engines.
 */
export interface SsrmProviderGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Which tab's provider to feed from — the same id the Perspective path uses. */
  tabProviderId: string;
  stream?: LabStreamOptions;
}

export function SsrmProviderGrid({
  columnDefs,
  rowHeight = 28,
  tabProviderId,
  stream = {},
}: SsrmProviderGridProps) {
  const { client, configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const providerId = useMemo(() => labProviderId(tabProviderId), [tabProviderId]);
  const [seeded, setSeeded] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const versionKey = `perspective-ssrm-lab:cfgv:${providerId}`;
    void (async () => {
      try {
        const draft = buildLabPerspectiveProvider(tabProviderId, stream);
        const rows = await configStore.list(userId, { subtype: 'mock-perspective' });
        const exists = rows.some((p) => p.providerId === providerId);
        const stale = localStorage.getItem(versionKey) !== String(LAB_PROVIDER_CFG_VERSION);
        if (!exists || stale) {
          await configStore.save(draft, userId);
          localStorage.setItem(versionKey, String(LAB_PROVIDER_CFG_VERSION));
        }
      } catch {
        // Attaching reports the real reason; a failed seed must not throw out
        // of an effect and blank the tab.
      }
      if (!cancelled) setSeeded(true);
    })();
    return () => {
      cancelled = true;
    };
    // `stream` is captured on the first seed, exactly as the hub captures cfg
    // on first attach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, configStore, userId, tabProviderId]);

  const openClient = useCallback(async () => {
    const attached = await (
      client as unknown as {
        attachSsrm(id: string): Promise<
          { ok: true; port: MessagePort; bookId: string } | { ok: false; reason: string }
        >;
      }
    ).attachSsrm(providerId);
    if (!attached.ok) {
      // A VALUE, not a rejection, on the wire — turned into one here because
      // the grid's contract is a client or a stated failure, and a surface with
      // neither is a blank tab with nothing to read.
      setReason(attached.reason);
      throw new Error(attached.reason);
    }
    return SsrmEngineClient.open(attached.port, attached.bookId, {
      onFault: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine data-services worker]', error);
      },
    });
  }, [client, providerId]);

  if (!seeded) {
    return <div className="p-4 text-sm opacity-70">Writing the provider row…</div>;
  }

  return (
    <>
      {reason && (
        <div className="p-4 text-sm text-[var(--bn-status-negative,#b91c1c)]">
          No SSRM book for “{providerId}”: {reason}
        </div>
      )}
      <SsrmEngineGrid
        columnDefs={columnDefs}
        rowHeight={rowHeight}
        keyField={KEY_COLUMN}
        openClient={openClient}
      />
    </>
  );
}

/**
 * Status bar for the Perspective pull path.
 *
 * AG Grid's stock panels are written for a row model that HOLDS its rows.
 * `agTotalRowCountComponent` and `agAggregationComponent` count and sum what
 * the client has, which on this path is the ~100 rows of the loaded blocks —
 * so they render a plausible, confidently wrong number. That is why the older
 * SSRM surface simply passed `statusBar={undefined}`.
 *
 * Every figure here comes from the worker-held Table instead: the filtered
 * count from the View the grid is scrolling, the book total from the Table.
 * Selection is the one genuinely client-side number, so it is read from the
 * grid.
 */
import { useEffect, useState } from 'react';

import type {
  ServerEngineHolder,
  ServerGridStatus,
  ServerRowEngineLike,
} from './serverEngineHolder.js';

/** What AG passes a custom status panel. `context` is our own grid option. */
export interface ServerStatusPanelParams {
  api?: {
    getSelectedNodes?(): unknown[];
    addEventListener?(type: string, listener: () => void): void;
    removeEventListener?(type: string, listener: () => void): void;
  };
  context?: { serverEngineHolder?: ServerEngineHolder };
}

const count = (n: number) => n.toLocaleString();

export function ServerStatusPanel(params: ServerStatusPanelParams) {
  const holder = params.context?.serverEngineHolder;
  // Tracked as state, not read once: AG hands this panel the context object it
  // was created with, and the engine behind it is swapped on a provider
  // restart. Reading it once left the bar reporting a closed engine forever.
  const [engine, setEngine] = useState<ServerRowEngineLike | null>(
    holder?.get() ?? null,
  );
  const [status, setStatus] = useState<ServerGridStatus | null>(
    engine ? engine.status : null,
  );
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!holder) return;
    setEngine(holder.get());
    return holder.subscribe(setEngine);
  }, [holder]);

  useEffect(() => {
    if (!engine) return;
    setStatus(engine.status);
    return engine.subscribe(setStatus);
  }, [engine]);

  useEffect(() => {
    const api = params.api;
    if (!api?.addEventListener) return;
    const update = () => setSelected(api.getSelectedNodes?.().length ?? 0);
    api.addEventListener('selectionChanged', update);
    update();
    return () => api.removeEventListener?.('selectionChanged', update);
  }, [params.api]);

  // Belt to the holder's braces. AG constructs this panel once, during grid
  // creation, and that can land in the narrow window before the surface's
  // engine settles — React StrictMode builds one engine, closes it, and builds
  // another. `modelUpdated` fires whenever the store changes, which is exactly
  // when a bar reading a closed engine would be visibly wrong.
  useEffect(() => {
    const api = params.api;
    if (!api?.addEventListener || !holder) return;
    const resync = () => setEngine(holder.get());
    api.addEventListener('modelUpdated', resync);
    return () => api.removeEventListener?.('modelUpdated', resync);
  }, [params.api, holder]);

  if (!status) return null;

  const { bookRows, filteredRows, filtered, live, failedBlocks } = status;

  return (
    <div className="ag-status-panel ag-status-panel-total-row-count flex items-center gap-3 px-2">
      <span>
        {filteredRows === null ? (
          // Before the first View exists there is no honest count to give.
          <span className="opacity-60">counting…</span>
        ) : filtered && bookRows !== null ? (
          <>
            <strong>{count(filteredRows)}</strong> of {count(bookRows)} rows
          </>
        ) : (
          <>
            <strong>{count(filteredRows)}</strong> rows
          </>
        )}
      </span>

      {selected > 0 && <span>{count(selected)} selected</span>}

      {/* A stalled feed looks identical to a quiet one, so say which it is. */}
      <span className="opacity-70">{live ? 'live' : 'paused'}</span>

      {failedBlocks > 0 && (
        // AG never retries a failed block on its own; silence here would leave
        // a permanently empty patch of grid with no explanation.
        <span className="text-[var(--ds-text-primary)]">
          {count(failedBlocks)} failed {failedBlocks === 1 ? 'block' : 'blocks'}
        </span>
      )}
    </div>
  );
}

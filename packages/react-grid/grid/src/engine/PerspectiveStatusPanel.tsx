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
import type { PerspectiveGridStatus, PerspectiveRowEngine } from '@starui/perspective-grid';

/** What AG passes a custom status panel. `context` is our own grid option. */
export interface PerspectiveStatusPanelParams {
  api?: {
    getSelectedNodes?(): unknown[];
    addEventListener?(type: string, listener: () => void): void;
    removeEventListener?(type: string, listener: () => void): void;
  };
  context?: { perspectiveEngine?: PerspectiveRowEngine };
}

const count = (n: number) => n.toLocaleString();

export function PerspectiveStatusPanel(params: PerspectiveStatusPanelParams) {
  const engine = params.context?.perspectiveEngine;
  const [status, setStatus] = useState<PerspectiveGridStatus | null>(
    engine ? engine.status : null,
  );
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!engine) return;
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

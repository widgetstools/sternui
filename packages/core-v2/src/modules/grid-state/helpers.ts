/**
 * Pure helpers — capture/apply grid state against a live GridApi.
 *
 * Extracted from `agGridStateManager.ts` and kept framework-free so they can
 * be imported by the module's lifecycle hooks AND by the host (for the
 * "capture on explicit Save" wiring in MarketsGrid).
 */
import type { GridApi } from 'ag-grid-community';
import type { GridStore } from '../../store/createGridStore';
import {
  GRID_STATE_SCHEMA_VERSION,
  type GridStateState,
  type SavedGridState,
} from './state';

/**
 * Read the current grid state off a live api. Safe to call any time after
 * `onGridReady`. Never throws — on API shape drift returns a minimal
 * snapshot with empty gridState so the caller can still persist *something*.
 */
export function captureGridState(api: GridApi): SavedGridState {
  const gridState = (() => {
    try {
      return api.getState();
    } catch {
      return {} as ReturnType<GridApi['getState']>;
    }
  })();

  // Viewport anchor — persisted so the user returns to the row + column they
  // were looking at. Persisting a colId rather than raw pixels survives
  // column resize/reorder; we keep the raw pixel as a fallback.
  let firstRowIndex = 0;
  let leftColId: string | null = null;
  let horizontalPixel = 0;
  try {
    firstRowIndex = api.getFirstDisplayedRowIndex();
    const hRange = api.getHorizontalPixelRange?.();
    if (hRange) {
      horizontalPixel = hRange.left;
      const displayed = api.getAllDisplayedColumns();
      const hit = displayed.find((c) => {
        const left = c.getLeft();
        return left != null && left + c.getActualWidth() > hRange.left;
      });
      leftColId = hit?.getColId() ?? null;
    }
  } catch {
    /* best-effort — leave anchor at defaults */
  }

  let quickFilter: string | undefined;
  try {
    const q = api.getGridOption('quickFilterText');
    if (q) quickFilter = q;
  } catch {
    /* ignore */
  }

  return {
    schemaVersion: GRID_STATE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    gridState,
    viewportAnchor: { firstRowIndex, leftColId, horizontalPixel },
    quickFilter,
  };
}

/**
 * Apply a previously-captured snapshot to a live grid. `api.setState()`
 * handles columns/filters/sort/pagination/selection etc. natively; the
 * viewport anchor and quick-filter are replayed separately.
 */
export function applyGridState(api: GridApi, saved: SavedGridState): void {
  if (!api || !saved) return;
  if (saved.schemaVersion !== GRID_STATE_SCHEMA_VERSION) {
    console.warn(
      `[grid-state] schema mismatch (saved=${saved.schemaVersion}, ` +
        `current=${GRID_STATE_SCHEMA_VERSION}); attempting best-effort restore.`,
    );
  }

  try {
    api.setState(saved.gridState);
  } catch (err) {
    console.warn('[grid-state] api.setState failed:', err);
  }

  // Explicit column-order restore — AG-Grid's `setState` silently drops
  // the auto-generated selection column's position (colId
  // `ag-Grid-SelectionColumn`). It lands at its default index 0 slot in
  // the internal column model even when the saved `columnOrder` puts it
  // somewhere else, and `setState` makes no follow-up move call.
  //
  // Re-applying the order via `applyColumnState` with `applyOrder: true`
  // is the escape hatch that actually moves the column — this is the
  // same API the docs recommend for programmatic column-state updates.
  //
  // IMPORTANT — must run AFTER the grid's initial layout settles. Calling
  // `applyColumnState` inside `onGridReady` (synchronously with setState)
  // is a no-op for the selection column because AG-Grid hasn't finished
  // injecting + positioning auto-generated columns yet. Defer to the
  // next microtask AND bind a one-shot `firstDataRendered` listener as
  // a fallback for the "rows arrive later" case.
  const orderedColIds = (saved.gridState as { columnOrder?: { orderedColIds?: string[] } })
    .columnOrder?.orderedColIds;
  if (Array.isArray(orderedColIds) && orderedColIds.length > 0) {
    const reorder = () => {
      try {
        api.applyColumnState({
          state: orderedColIds.map((colId) => ({ colId })),
          applyOrder: true,
        });
      } catch (err) {
        console.warn('[grid-state] applyColumnState order restore failed:', err);
      }
    };
    // First attempt on the next microtask — enough for the common case
    // where the grid's first render has already settled by the time
    // `applyGridState` is called (profile:loaded after grid:ready).
    queueMicrotask(reorder);
    // Second attempt on `firstDataRendered` — covers cold-mount where
    // row data arrives after applyGridState. The handler is one-shot so
    // we don't reorder every time new data is paged in.
    try {
      const onFDR = () => {
        reorder();
        try {
          api.removeEventListener('firstDataRendered', onFDR);
        } catch {
          /* ignore */
        }
      };
      api.addEventListener('firstDataRendered', onFDR);
    } catch {
      /* ignore — non-blocking */
    }
  }

  if (saved.quickFilter !== undefined) {
    try {
      api.setGridOption('quickFilterText', saved.quickFilter);
    } catch {
      /* ignore */
    }
  }

  // Viewport — wait for rows to render so ensureIndexVisible has something
  // to scroll to.
  const restoreViewport = () => {
    try {
      const { firstRowIndex, leftColId, horizontalPixel } = saved.viewportAnchor;
      if (firstRowIndex >= 0 && firstRowIndex < api.getDisplayedRowCount()) {
        api.ensureIndexVisible(firstRowIndex, 'top');
      }
      if (leftColId && api.getColumn(leftColId)) {
        api.ensureColumnVisible(leftColId, 'start');
      } else if (horizontalPixel > 0) {
        const body = document.querySelector<HTMLElement>('.ag-body-viewport');
        if (body) body.scrollLeft = horizontalPixel;
      }
    } catch {
      /* best-effort */
    }
  };

  try {
    if (api.getDisplayedRowCount() > 0) {
      queueMicrotask(restoreViewport);
    } else {
      const handler = () => {
        restoreViewport();
        try {
          api.removeEventListener('firstDataRendered', handler);
        } catch {
          /* ignore */
        }
      };
      api.addEventListener('firstDataRendered', handler);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Host-facing helper. Captures the current grid state and writes it into the
 * grid-state module slice on the store. Called by MarketsGrid's Save button
 * handler immediately before `profiles.saveActiveProfile()` — the subsequent
 * `core.serializeAll()` that runs inside `persistSnapshot` then picks up the
 * just-captured state and persists it alongside every other module's state.
 */
export function captureGridStateInto(store: GridStore, api: GridApi): void {
  const saved = captureGridState(api);
  store.setModuleState<GridStateState>('grid-state', () => ({ saved }));
}

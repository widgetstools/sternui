/**
 * ssrmStatusBar — Server-Side Row Model status-bar adaptation.
 *
 * AG-Grid's built-in row-count status panels
 * (`agTotalAndFilteredRowCountComponent`, `agFilteredRowCountComponent`,
 * `agTotalRowCountComponent`) are CLIENT-SIDE only — under SSRM they emit
 * warning #224 and render nothing, so a status bar made only of them appears
 * empty / absent. {@link adaptStatusBarForServerSide} swaps them for a single
 * SSRM-compatible row-count panel ({@link SsrmRowCountStatusPanel}) that reads
 * the grid's displayed row count; the aggregation / selected-count panels are
 * left as-is (they work in any row model).
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { GridApi } from 'ag-grid-community';

/** Built-in count panels that only work with the Client-Side Row Model. */
const CSRM_ONLY_COUNT_PANELS = new Set([
  'agTotalAndFilteredRowCountComponent',
  'agFilteredRowCountComponent',
  'agTotalRowCountComponent',
]);

/** SSRM-compatible row-count panel — shows the grid's displayed row count. */
export function SsrmRowCountStatusPanel(props: { api: GridApi }): ReactNode {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(props.api.getDisplayedRowCount());
    update();
    props.api.addEventListener('modelUpdated', update);
    return () => {
      try { props.api.removeEventListener('modelUpdated', update); } catch { /* grid gone */ }
    };
  }, [props.api]);
  return (
    <div className="ag-status-name-value" style={{ paddingLeft: 12, paddingRight: 12 }}>
      <span>Rows:&nbsp;</span>
      <span className="ag-status-name-value-value">{count.toLocaleString()}</span>
    </div>
  );
}

/** Custom component to register on the grid when serverSide. */
export const SSRM_STATUS_BAR_COMPONENTS = { ssrmRowCount: SsrmRowCountStatusPanel };

interface StatusPanelDefLike { statusPanel?: string; align?: string }

/**
 * Replace CSRM-only count panels with the SSRM row-count panel (deduped — at
 * most one is injected). Returns the input unchanged when there's nothing to
 * swap, so CSRM is unaffected. `undefined`/non-object passes through.
 */
export function adaptStatusBarForServerSide(statusBar: unknown): unknown {
  if (!statusBar || typeof statusBar !== 'object') return statusBar;
  const sb = statusBar as { statusPanels?: StatusPanelDefLike[] };
  if (!Array.isArray(sb.statusPanels)) return statusBar;

  let injected = false;
  let changed = false;
  const panels: StatusPanelDefLike[] = [];
  for (const p of sb.statusPanels) {
    if (p.statusPanel && CSRM_ONLY_COUNT_PANELS.has(p.statusPanel)) {
      changed = true;
      if (!injected) { panels.push({ statusPanel: 'ssrmRowCount', align: 'left' }); injected = true; }
      continue;
    }
    panels.push(p);
  }
  return changed ? { ...sb, statusPanels: panels } : statusBar;
}

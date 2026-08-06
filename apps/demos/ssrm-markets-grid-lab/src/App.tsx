import { useState } from 'react';
import { SsrmMarketsGrid } from './grid/SsrmMarketsGrid';
import { STRESS_COL_COUNT, STRESS_ROW_COUNT } from './data/stressColumns';

/**
 * One app, one engine, one grid.
 *
 * There is no tab strip and no engine selector, and that is the entire point.
 * The bake-off lab has a PERFORMANCE section with three entries — "Stress Test"
 * (two engines behind `?engine=`), "SSRM Engine" (a bare `AgGridReact` control)
 * and "SSRM Engine · MarketsGrid" — and nothing on screen says which one a
 * reader should open or which engine they are looking at. Two of those three
 * exist to serve a comparison that was decided in session 8.
 *
 * This app is what the answer looks like: open it and you are on the product
 * path. The comparison stays where it belongs, in the lab built for it.
 */
export function App() {
  const [ready, setReady] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-[color:var(--ds-bg-primary)] text-[color:var(--ds-text-primary)]">
      <header className="flex shrink-0 items-baseline gap-3 border-b border-[color:var(--ds-border-subtle)] px-4 py-2">
        <h1 className="text-[15px] font-semibold tracking-tight">SSRM MarketsGrid</h1>
        <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
          {STRESS_ROW_COUNT.toLocaleString()} × {STRESS_COL_COUNT}, held once in a SharedWorker.
          This window reads only the blocks its viewport asks for.
        </p>
        <span
          className="ml-auto font-mono text-[11px] text-[color:var(--ds-text-secondary)]"
          data-testid="ssrm-lab-status"
        >
          {ready ? 'book open' : 'opening the book…'}
        </span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <SsrmMarketsGrid tickMs={200} onReady={() => setReady(true)} />
      </main>
    </div>
  );
}

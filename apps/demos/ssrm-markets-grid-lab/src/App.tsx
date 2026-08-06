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
/**
 * The two capabilities that are NEW MarketsGrid API rather than restored
 * parity, and the only reason this app has a control at all.
 *
 * Tree data and master/detail existed on the Perspective surface and on no
 * other — they were two of the three entries in the losing engine's column of
 * the session-8 decision. They are off by default here because a hierarchy and
 * an expandable child grid are not what a blotter opens on, and because the
 * flat view is what every measurement in this repo was taken against.
 */
type Mode = 'flat' | 'tree' | 'detail';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'flat', label: 'Flat', hint: 'the product path, and what every measurement was taken on' },
  { id: 'tree', label: 'Tree data', hint: 'desk → book, served a level at a time from the worker' },
  { id: 'detail', label: 'Master / detail', hint: 'expand a row onto its desk’s other positions' },
];

export function App() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('flat');

  return (
    <div className="flex h-screen flex-col bg-[color:var(--ds-bg-primary)] text-[color:var(--ds-text-primary)]">
      <header className="flex shrink-0 items-baseline gap-3 border-b border-[color:var(--ds-border-subtle)] px-4 py-2">
        <h1 className="text-[15px] font-semibold tracking-tight">SSRM MarketsGrid</h1>
        <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
          {STRESS_ROW_COUNT.toLocaleString()} × {STRESS_COL_COUNT}, held once in a SharedWorker.
          This window reads only the blocks its viewport asks for.
        </p>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex gap-1" role="radiogroup" aria-label="Row shape">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                title={m.hint}
                data-testid={`ssrm-lab-mode-${m.id}`}
                onClick={() => setMode(m.id)}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  mode === m.id
                    ? 'bg-[color:var(--ds-surface-selected)] text-[color:var(--ds-text-primary)]'
                    : 'text-[color:var(--ds-text-secondary)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span
            className="font-mono text-[11px] text-[color:var(--ds-text-secondary)]"
            data-testid="ssrm-lab-status"
          >
            {ready ? 'book open' : 'opening the book…'}
          </span>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        {/*
          Keyed by mode so a switch REMOUNTS the grid rather than mutating it.
          Exactly one grid may mount per `GridPlatform`, ever — and turning
          `treeData` on under a live grid changes what AG asks for at every
          level, which is a purge plus a re-read of a differently-shaped store.
          A remount is the honest version of that and costs a book that is
          already open in the worker nothing.
        */}
        <SsrmMarketsGrid
          key={mode}
          mode={mode}
          tickMs={200}
          onReady={() => setReady(true)}
        />
      </main>
    </div>
  );
}

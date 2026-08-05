import { useCallback } from 'react';
import type { ColDef } from 'ag-grid-community';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import { SsrmEngineGrid } from './SsrmEngineGrid';
import { STRESS_KEY_FIELD, STRESS_ROW_COUNT } from '../data/stressColumns';
import { STRESS_BOOK_ID } from '../data/stressBook';

/**
 * The GENERATED Stress book, in the app's own SharedWorker.
 *
 * Reached with `?engine=ssrm`. Same row count, same 120 columns, same types and
 * the same tick rate as the Perspective surface beside it, so the probes that
 * measure that path — `rendererProcessProbe.mjs`, `multiWindowProbe.mjs` —
 * apply here unchanged and the numbers line up.
 *
 * A generated book has no provider, so it can live anywhere and lives here: an
 * app-owned worker keeps `stressBook.ts` (which may not touch React, AG Grid or
 * the DOM) out of `@starui/host-data`'s worker asset entirely. The provider-fed
 * peer is `SsrmProviderGrid`, and it does NOT have that freedom — see its note.
 */
export interface SsrmEngineStressGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Live tick interval, applied in the worker. 0 disables ticking. */
  tickMs?: number;
}

export function SsrmEngineStressGrid({
  columnDefs,
  rowHeight = 28,
  tickMs = 200,
}: SsrmEngineStressGridProps) {
  /**
   * `new URL(..., import.meta.url)` is what makes Vite emit the worker as its
   * own chunk; a string path would be shipped verbatim and 404 in a production
   * build. `name` matters too — a SharedWorker is identified by script URL AND
   * name, so every window naming the same pair lands on ONE worker, which is
   * the entire point.
   */
  const openClient = useCallback(() => {
    const worker = new SharedWorker(new URL('../workers/ssrmBookWorker.ts', import.meta.url), {
      type: 'module',
      name: 'starui-ssrm-book',
    });
    return SsrmEngineClient.open(worker.port, STRESS_BOOK_ID, {
      bookOptions: { rows: STRESS_ROW_COUNT, tickMs },
      onFault: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine worker]', error);
      },
    });
  }, [tickMs]);

  return (
    <SsrmEngineGrid
      columnDefs={columnDefs}
      rowHeight={rowHeight}
      keyField={STRESS_KEY_FIELD}
      openClient={openClient}
    />
  );
}

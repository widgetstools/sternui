import { useEffect, useRef, useState } from 'react';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import { STRESS_BOOK_ID } from './stressBook';
import { STRESS_ROW_COUNT } from './stressColumns';

/**
 * Open the generated Stress book in the app's own SharedWorker.
 *
 * One copy, because two surfaces now want it — the SSRM Engine · MarketsGrid
 * tab and the Stress tab's `&surface=marketsgrid` branch — and the whole point
 * of that second one is that it differs from the Perspective branch in the row
 * supply and NOTHING else. A second copy of the open sequence is a second place
 * for the book id, the worker name or the tick rate to drift, and any of those
 * drifting turns the comparison into a comparison of two books.
 */
export interface StressSsrmClient {
  /** `null` while opening — the host reads that as "mount NO grid". */
  client: SsrmEngineClient | null;
  fault: string | null;
  /**
   * Cost of GETTING THE BOOK, apart from booting the app — a GETTER, because it
   * lands after the render that starts the open, and a value read at render
   * time would be null forever.
   */
  openCost(): { ms: number; clientsAtOpen: number } | null;
}

export function useStressSsrmClient(tickMs: number): StressSsrmClient {
  const [client, setClient] = useState<SsrmEngineClient | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const openRef = useRef<{ ms: number; clientsAtOpen: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: SsrmEngineClient | null = null;
    /**
     * `new URL(..., import.meta.url)` is what makes Vite emit the worker as its
     * own chunk; a string path would ship verbatim and 404 in a production
     * build. `name` matters too — a SharedWorker is identified by script URL
     * AND name, so every window naming the same pair lands on ONE worker.
     */
    const worker = new SharedWorker(new URL('../workers/ssrmBookWorker.ts', import.meta.url), {
      type: 'module',
      name: 'starui-ssrm-book',
    });
    const startedAt = performance.now();
    SsrmEngineClient.open(worker.port, STRESS_BOOK_ID, {
      bookOptions: { rows: STRESS_ROW_COUNT, tickMs },
      onFault: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine worker]', error);
      },
    }).then(
      (next) => {
        if (cancelled) {
          void next.close();
          return;
        }
        opened = next;
        openRef.current = {
          ms: performance.now() - startedAt,
          // 1 means this window is the one that BUILT the book.
          clientsAtOpen: next.clientsAtOpen,
        };
        setClient(next);
      },
      (error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine] could not open the book', error);
        if (!cancelled) setFault(String(error));
      },
    );
    return () => {
      cancelled = true;
      // The worker OUTLIVES this page. A book nobody detaches from survives a
      // reload, and the next load builds a second one beside it.
      void opened?.close();
    };
  }, [tickMs]);

  return { client, fault, openCost: () => openRef.current };
}

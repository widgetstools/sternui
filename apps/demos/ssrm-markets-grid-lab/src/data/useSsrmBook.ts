import { useEffect, useRef, useState } from 'react';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import { stressBookId } from './stressBook';

/**
 * Open the generated Stress book in the app's own SharedWorker.
 *
 * ONE book, ONE surface, ONE worker. This app exists so that sentence is true:
 * there is no engine switch, no query parameter and no second row supply, so a
 * probe or a person cannot end up measuring something other than the product
 * path. The bake-off lab keeps its comparison; this one keeps the product.
 */
export interface SsrmBookHandle {
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

export function useSsrmBook(tickMs: number, rows: number): SsrmBookHandle {
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
      // A DIFFERENT worker name from the bake-off lab's. A SharedWorker is keyed by
      // script URL AND name, so sharing the name across two apps would put two
      // different books in one worker and make 'which app am I measuring' a
      // question again.
      name: 'starui-ssrm-marketsgrid-lab',
    });
    const startedAt = performance.now();
    // The id carries the SIZE. The worker memoises a book per id and hands the
    // existing one to the next client that asks, ignoring its `bookOptions` —
    // so a fixed id would serve the previous size to a window that asked for
    // 500,000, silently, with a plausible row count on screen. A SharedWorker
    // outlives its pages, which makes that the normal case mid-measurement.
    SsrmEngineClient.open(worker.port, stressBookId(rows), {
      bookOptions: { rows, tickMs },
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
  }, [tickMs, rows]);

  return { client, fault, openCost: () => openRef.current };
}

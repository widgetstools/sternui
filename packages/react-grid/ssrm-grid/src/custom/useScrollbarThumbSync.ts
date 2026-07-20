import { useEffect, type RefObject } from "react";

/**
 * Middle ground between AG's two vertical-scrollbar modes.
 *
 * Per-event sync (`debounceVerticalScrollbar: false`) renders the full row
 * set on EVERY mouse move of a thumb drag — a viewport-sized jump per input
 * event, ~900 React cell mounts each (ag-grid-react renders every cell as a
 * React component; profiled at 53s of `React.createElement` in a 126s
 * drag) — which starves input dispatch and the thumb trails the cursor.
 * Debounced (`true`) keeps the thumb native and free but renders rows only
 * when motion STOPS — the grid looks frozen mid-drag.
 *
 * This hook keeps the debounced mode as the base (thumb glued to the
 * cursor, always) and adds THROTTLED intermediate syncs: while the
 * scrollbar position has diverged from the grid viewport by more than a
 * viewport-height (i.e. a genuine thumb drag — wheel deltas never qualify),
 * mirror it into the viewport at most once per `intervalMs`. Rows flow in
 * steps during the drag; AG's own debounce lands the final position, and
 * the stale-serving block cache fills each step with real data.
 *
 * DOM-coupled by necessity (AG exposes no throttle option): guarded
 * queries, passive listener, silent no-op if the structure changes.
 */
export function useScrollbarThumbSync(
  rootRef: RefObject<HTMLElement | null>,
  opts: { intervalMs?: number; enabled?: boolean } = {},
): void {
  const intervalMs = opts.intervalMs ?? 150;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    let disposed = false;
    let lastSync = 0;
    let scrollbar: HTMLElement | null = null;
    let viewport: HTMLElement | null = null;
    let findTimer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      if (disposed || !scrollbar || !viewport) return;
      const drift = scrollbar.scrollTop - viewport.scrollTop;
      // Only genuine thumb drags/jumps: wheel and keyboard scrolling keep
      // the two in lockstep (drift < one viewport) and must not be touched.
      if (Math.abs(drift) < viewport.clientHeight) return;
      const now = performance.now();
      if (now - lastSync < intervalMs) return;
      lastSync = now;
      viewport.scrollTop = scrollbar.scrollTop;
    };

    // AG mounts its scroller DOM after grid-ready — poll briefly.
    let tries = 0;
    const find = () => {
      if (disposed) return;
      scrollbar = root.querySelector<HTMLElement>(
        ".ag-body-vertical-scroll-viewport",
      );
      viewport = root.querySelector<HTMLElement>(".ag-grid-viewport");
      if (scrollbar && viewport) {
        scrollbar.addEventListener("scroll", onScroll, { passive: true });
      } else if (tries++ < 40) {
        findTimer = setTimeout(find, 250);
      }
    };
    find();

    return () => {
      disposed = true;
      if (findTimer !== null) clearTimeout(findTimer);
      scrollbar?.removeEventListener("scroll", onScroll);
    };
  }, [rootRef, intervalMs, enabled]);
}

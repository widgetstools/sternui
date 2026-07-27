/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';

declare const fin: any;

/**
 * useViewTabTitle — two-way binding between the grid caption and the
 * host OpenFin view's tab name.
 *
 * The tab name is the value the workspace tabstrip shows. It is driven
 * by `document.title` (default `titlePriority: 'document'`) and
 * persisted in the view's `customData.savedTitle` — the same key the
 * "Save Tab As…" rename popout writes (see `RenameViewTab.tsx` /
 * `viewTabRename.ts`). `OpenFinRuntime` reapplies `savedTitle` to
 * `document.title` on boot, so it survives workspace save/restore.
 *
 * Behaviour:
 *   - Seeds the caption from `customData.savedTitle`, falling back to
 *     `fallback` (the component name) when no tab name has been chosen.
 *   - Polls `savedTitle` so an external "Save Tab As…" rename flows back
 *     into the caption within ~1s.
 *   - `setTitle` writes BOTH `document.title` (drives the tabstrip
 *     immediately) and `customData.savedTitle` (persistence), mirroring
 *     the rename popout's own write — so a caption edit seeds the tab
 *     name.
 *
 * Outside an OpenFin runtime it returns `fallback` and `setTitle` only
 * updates local state (there is no tab to drive).
 */

const POLL_MS = 1000;

function isOpenFin(): boolean {
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}

function readSavedTitle(customData: unknown): string | null {
  if (!customData || typeof customData !== 'object') return null;
  const value = (customData as { savedTitle?: unknown }).savedTitle;
  return typeof value === 'string' && value.trim() ? value : null;
}

export interface ViewTabTitle {
  /** Current tab name — `savedTitle` when set, else `fallback`. */
  title: string;
  /** Persist a new tab name: drives `document.title` + `savedTitle`. */
  setTitle: (next: string) => void;
}

export function useViewTabTitle(fallback: string): ViewTabTitle {
  const [title, setTitleState] = useState(fallback);
  // Last value we observed or wrote — lets the poll react only to
  // genuine external changes and avoids fighting our own writes.
  const lastSeenRef = useRef<string>(fallback);

  useEffect(() => {
    if (!isOpenFin() || typeof fin?.me?.getOptions !== 'function') return;
    let cancelled = false;

    const sync = async (): Promise<void> => {
      try {
        const opts = await fin.me.getOptions();
        const saved = readSavedTitle(opts?.customData);
        if (cancelled || !saved || saved === lastSeenRef.current) return;
        lastSeenRef.current = saved;
        setTitleState(saved);
      } catch {
        /* view not reachable yet — the next tick retries */
      }
    };

    void sync();

    // Event-driven: an external "Save Tab As…" rename writes savedTitle via
    // updateOptions, which fires `options-changed` on this view (OpenFin
    // 43.101+). Subscribe so the caption catches up immediately, instead of
    // relying on a forever-poll. (Untyped on View — guarded.)
    let offOptionsChanged: (() => void) | null = null;
    try {
      if (typeof fin?.me?.on === 'function') {
        const handler = () => void sync();
        fin.me.on('options-changed', handler);
        offOptionsChanged = () => {
          try { fin.me.removeListener?.('options-changed', handler); } catch { /* swallow */ }
        };
      }
    } catch {
      /* options-changed unsupported — the visible-only interval covers it */
    }

    // Visible-only fallback: covers runtimes without options-changed and
    // self-heals on reconnect, but a hidden/background tab no longer polls
    // the broker every second.
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void sync();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      offOptionsChanged?.();
    };
  }, []);

  const setTitle = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === lastSeenRef.current) return;
    lastSeenRef.current = trimmed;
    setTitleState(trimmed);

    if (!isOpenFin() || typeof fin?.me?.updateOptions !== 'function') return;
    try {
      if (typeof document !== 'undefined') document.title = trimmed;
    } catch {
      /* best-effort */
    }
    void (async () => {
      try {
        const opts = await fin.me.getOptions();
        const cd = (opts?.customData ?? {}) as Record<string, unknown>;
        if (cd.savedTitle !== trimmed) {
          await fin.me.updateOptions({ customData: { ...cd, savedTitle: trimmed } });
        }
      } catch {
        /* best-effort — document.title already drives the tabstrip */
      }
    })();
  }, []);

  return { title, setTitle };
}

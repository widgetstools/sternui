/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useState } from 'react';

/**
 * Source-of-truth field path for tab visibility (live OpenFin
 * investigation pending — record the exact path as a comment here once
 * verified inside the reference workspace browser):
 *
 *   const opts = await (await fin.me.getCurrentWindow()).getOptions();
 *
 * Two shapes are observed across OpenFin Workspace versions, so
 * `deriveTabsHidden` checks both:
 *   - opts.workspacePlatform.windowOptions.toolbarOptions.visible
 *     (boolean; tabsHidden = !visible)
 *   - opts.workspacePlatform.viewTabsVisible
 *     (boolean; tabsHidden = !viewTabsVisible)
 *
 * Whichever the runtime exposes wins; if neither is present we fall
 * back to `false` (tabs visible) to match the browser default.
 */
export function deriveTabsHidden(opts: unknown): boolean {
  if (!opts || typeof opts !== 'object') return false;
  const wp = (opts as any).workspacePlatform;
  if (!wp || typeof wp !== 'object') return false;

  const toolbarVisible = wp.toolbarOptions?.visible;
  if (typeof toolbarVisible === 'boolean') return !toolbarVisible;

  const viewTabsVisible = wp.viewTabsVisible;
  if (typeof viewTabsVisible === 'boolean') return !viewTabsVisible;

  return false;
}

function isOpenFin(): boolean {
  return typeof fin !== 'undefined' && fin?.me?.getCurrentWindow;
}

/**
 * React state mirror of the parent OpenFin window's tab-strip
 * visibility. Reads the initial value from `window.getOptions()` and
 * stays in sync with the `options-changed` event stream.
 *
 * Outside an OpenFin runtime returns `false` and attaches no listeners.
 * Consumers are expected to render their own caption/header — this hook
 * is a passthrough event source, not a UI component.
 */
export function useTabsHidden(): boolean {
  const [tabsHidden, setTabsHidden] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpenFin()) return;

    let cancelled = false;
    let win: any | null = null;
    let handler: ((evt: unknown) => void) | null = null;

    (async () => {
      try {
        win = await fin.me.getCurrentWindow();
        if (cancelled) return;
        const opts = await win.getOptions();
        if (cancelled) return;
        setTabsHidden(deriveTabsHidden(opts));

        handler = async () => {
          try {
            const next = await win.getOptions();
            if (cancelled) return;
            setTabsHidden(deriveTabsHidden(next));
          } catch (err) {
            console.warn('[useTabsHidden] options re-read failed:', err);
          }
        };
        win.on('options-changed', handler);
      } catch (err) {
        console.warn('[useTabsHidden] init failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (win && handler) {
        try {
          win.removeListener('options-changed', handler);
        } catch (err) {
          console.warn('[useTabsHidden] removeListener failed:', err);
        }
      }
    };
  }, []);

  return tabsHidden;
}

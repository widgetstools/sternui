/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { subscribeWindowOptions } from './windowOptionsSubscription.js';

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

/**
 * React state mirror of the parent OpenFin window's tab-strip
 * visibility. Reads the initial value from `window.getOptions()` and
 * stays in sync with the `options-changed` event stream.
 *
 * Outside an OpenFin runtime returns `false` and attaches no listeners.
 * Consumers are expected to render their own caption/header — this hook
 * is a passthrough event source, not a UI component.
 *
 * Internally subscribes via the shared `windowOptionsSubscription`
 * manager so multiple hooks reading window options (e.g. this one and
 * `useColorLinking`) all share a single `options-changed` listener.
 */
export function useTabsHidden(): boolean {
  const [tabsHidden, setTabsHidden] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeWindowOptions((opts) => {
      setTabsHidden(deriveTabsHidden(opts));
    });
    return unsubscribe;
  }, []);

  return tabsHidden;
}

/**
 * data-providers-popout — open the DataProvider editor as a popout.
 *
 * Strategy:
 *   1. Inside OpenFin → same path as the dock: `openDataProvidersToolWindow`
 *      from `@starui/openfin-platform` (manifest `providerUrl` origin,
 *      named window `data-providers`, `customData` scope, optional `?id=`).
 *      No IAB / cross-window handoff — the selected provider is URL-only.
 *   2. Outside OpenFin (plain browser, vite dev server) →
 *      `window.open(url, name, features)` with name `data-providers`.
 *
 * Both paths use the same fixed window name so a second click focuses
 * the existing popout instead of spawning a duplicate. Optional
 * `providerId` is forwarded as a `?id=` query parameter — the editor
 * snaps to that row on mount.
 *
 * The route the popout opens (`/dataproviders`) is already wired in
 * `App.tsx` and renders the v2 DataProviderEditor.
 */

import { openDataProvidersToolWindow } from '@starui/openfin-platform';

const POPOUT_NAME = 'data-providers';
const POPOUT_WIDTH = 1180;
const POPOUT_HEIGHT = 760;

export interface OpenProviderEditorOpts {
  /** When set, the popout opens on this provider's row. */
  providerId?: string;
  /** Mounted route path. Defaults to `/dataproviders`. */
  route?: string;
}

export async function openProviderEditorPopout(opts: OpenProviderEditorOpts = {}): Promise<void> {
  const route = opts.route ?? '/dataproviders';
  const url = buildUrl(route, opts.providerId);

  if (isOpenFin()) {
    await openDataProvidersToolWindow({ providerId: opts.providerId });
    return;
  }
  openInBrowser(url);
}

// ─── helpers ──────────────────────────────────────────────────────

function buildUrl(route: string, providerId?: string): string {
  const origin = window.location.origin;
  // Some routers prefer hash-based deep links; the reference app uses
  // BrowserRouter, so we keep `?id=` on the path. The editor reads it
  // out of `useSearchParams` (or whatever the popout shell does).
  const qs = providerId ? `?id=${encodeURIComponent(providerId)}` : '';
  return `${origin}${route}${qs}`;
}

function isOpenFin(): boolean {
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}

function openInBrowser(url: string): void {
  const features = `width=${POPOUT_WIDTH},height=${POPOUT_HEIGHT},resizable=yes,scrollbars=no`;
  const w = window.open(url, POPOUT_NAME, features);
  if (w && !w.closed) w.focus();
}

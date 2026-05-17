/**
 * data-providers-popout — open the DataProvider editor as a popout.
 *
 * Single transport: delegates to `runtime.openSurface({ kind: 'popout' })`
 * regardless of host (OpenFin / browser). The runtime port owns the
 * named-window dedup, focus-on-reopen, and customData encoding.
 *
 * Optional `providerId` is forwarded on the URL (`?id=…`) so the
 * editor snaps to that row on mount.
 */

import type { RuntimePort } from "@starui/runtime-port";

const POPOUT_NAME = "data-providers";
const POPOUT_WIDTH = 1180;
const POPOUT_HEIGHT = 760;

export interface OpenProviderEditorOpts {
  /** When set, the popout opens on this provider's row. */
  providerId?: string;
  /** Mounted route path. Defaults to `/dataproviders`. */
  route?: string;
}

export async function openProviderEditorPopout(
  runtime: RuntimePort,
  opts: OpenProviderEditorOpts = {},
): Promise<void> {
  const route = opts.route ?? "/dataproviders";
  const url = buildUrl(route, opts.providerId);
  await runtime.openSurface({
    kind: "popout",
    url,
    windowName: POPOUT_NAME,
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
    customData: opts.providerId ? { providerId: opts.providerId } : undefined,
  });
}

function buildUrl(route: string, providerId?: string): string {
  const origin = window.location.origin;
  const qs = providerId ? `?id=${encodeURIComponent(providerId)}` : "";
  return `${origin}${route}${qs}`;
}

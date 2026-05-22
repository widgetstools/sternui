/**
 * Open the DataProvider editor in a named popout window.
 *
 * Works in OpenFin (fin.View) and plain browser (`window.open`) via `RuntimePort`.
 * The blotter view passes `onEditProvider` → this helper.
 */
import type { RuntimePort } from '@starui/host';

const POPOUT_NAME = 'data-providers';
const POPOUT_WIDTH = 1180;
const POPOUT_HEIGHT = 760;

export interface OpenProviderEditorOpts {
  providerId?: string;
  route?: string;
}

export async function openProviderEditorPopout(
  runtime: RuntimePort,
  opts: OpenProviderEditorOpts = {},
): Promise<void> {
  const route = opts.route ?? '/dataproviders';
  const qs = opts.providerId ? `?id=${encodeURIComponent(opts.providerId)}` : '';
  const url = `${window.location.origin}${route}${qs}`;

  await runtime.openSurface({
    kind: 'popout',
    url,
    windowName: POPOUT_NAME,
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
    customData: opts.providerId ? { providerId: opts.providerId } : undefined,
  });
}

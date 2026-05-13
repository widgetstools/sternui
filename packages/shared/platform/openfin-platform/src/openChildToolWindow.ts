/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { getPlatformDefaultScope } from './db.js';

function urlsSameDocument(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname && ua.search === ub.search;
  } catch {
    return false;
  }
}

/**
 * Resolve the web app origin for child tool windows (config browser,
 * data providers, etc.). Uses the manifest `platform.providerUrl` —
 * same as the workspace shell — so URLs stay correct when the current
 * script runs inside an OpenFin **View** whose `window.location` may
 * not match the Vite app origin.
 */
async function resolveProviderOrigin(): Promise<string | undefined> {
  try {
    const app = await fin.Application.getCurrent();
    const manifest: Record<string, unknown> = await app.getManifest();
    const platformConfig = manifest.platform as Record<string, string> | undefined;
    const providerUrl = platformConfig?.providerUrl ?? '';
    return new URL(providerUrl).origin;
  } catch {
    return undefined;
  }
}

/**
 * Open or focus a named OpenFin child window at `path` (may include
 * `?query`). Uses manifest-derived origin (not `window.location`).
 *
 * When the window already exists: foreground it and `navigate` to
 * the target URL when it differs — so e.g. `/dataproviders?id=…`
 * updates when opening from the grid toolbar.
 */
export async function openChildToolWindow(
  name: string,
  path: string,
  width: number,
  height: number,
  extraOptions?: Record<string, any>,
): Promise<void> {
  const origin = await resolveProviderOrigin();
  if (!origin) {
    console.error(`[openChildToolWindow] Could not determine origin for "${name}"`);
    return;
  }

  const url = `${origin}${path}`;
  console.log(`[openChildToolWindow] Opening "${name}" at "${path}"`);

  try {
    const existing = fin.Window.wrapSync({ uuid: fin.me.identity.uuid, name });
    const info = await existing.getInfo();
    await existing.setAsForeground();
    const currentUrl = typeof info?.url === 'string' ? info.url : '';
    if (!currentUrl || !urlsSameDocument(currentUrl, url)) {
      await existing.navigate(url);
    }
    console.log(`[openChildToolWindow] Brought existing "${name}" to front.`);
    return;
  } catch {
    console.debug(`[openChildToolWindow] "${name}" does not exist; will create.`);
  }

  try {
    await fin.Window.create({
      name,
      url,
      defaultWidth: width,
      defaultHeight: height,
      autoShow: true,
      frame: true,
      resizable: true,
      saveWindowState: true,
      contextMenu: true,
      ...extraOptions,
    });
    console.log(`[openChildToolWindow] Created window "${name}" at ${url}`);
  } catch (createErr) {
    console.error(`[openChildToolWindow] Failed to create "${name}"`, createErr);
  }
}

/**
 * Open the Data Providers editor the same way the dock does: manifest
 * origin, named window `data-providers`, and `customData` scope for
 * config rows. Optional `providerId` becomes `?id=` so the editor
 * selects that row (no cross-window messaging — URL only).
 */
export async function openDataProvidersToolWindow(opts?: {
  providerId?: string;
}): Promise<void> {
  const scope = getPlatformDefaultScope();
  const qs = opts?.providerId ? `?id=${encodeURIComponent(opts.providerId)}` : '';
  const path = `/dataproviders${qs}`;
  await openChildToolWindow('data-providers', path, 1180, 760, {
    customData: { appId: scope.appId, userId: scope.userId },
  });
}

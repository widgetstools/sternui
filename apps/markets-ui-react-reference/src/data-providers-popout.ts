/**
 * data-providers-popout — open the DataProvider editor as a popout.
 *
 * Strategy:
 *   1. Inside OpenFin → `fin.Window.create({...})`. Plain fin.Window
 *      (NOT a workspace platform window) so closing it does not trip
 *      the dock's auto-quit logic.
 *   2. Outside OpenFin (plain browser, vite dev server) →
 *      `window.open(url, name, features)`.
 *
 * Both paths use the same fixed window name so a second click focuses
 * the existing popout instead of spawning a duplicate. Optional
 * `providerId` is forwarded as a `?id=` query parameter — the editor
 * snaps to that row on mount.
 *
 * The route the popout opens (`/dataproviders`) is already wired in
 * `App.tsx` and renders the v2 DataProviderEditor.
 */

const POPOUT_NAME = 'marketsui-data-provider-editor';
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
    await openInOpenFin(url);
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

// Loose surface for the bits we touch on `fin`. The ambient `fin`
// global ships from `src/types/fin.d.ts` (typed via `@openfin/core`),
// but pinning to that type drags the whole OpenFin type surface
// across release boundaries — opt for a minimal hand-rolled subset
// instead so the helper stays version-tolerant.
interface FinWindowHandle {
  isShowing(): Promise<boolean>;
  bringToFront(): Promise<unknown>;
  focus(): Promise<unknown>;
  show(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
}
interface FinSurface {
  me: { identity: { uuid: string } };
  Window: {
    wrap(id: { uuid: string; name: string }): Promise<FinWindowHandle>;
    create(opts: Record<string, unknown>): Promise<unknown>;
  };
}

async function openInOpenFin(url: string): Promise<void> {
  // `fin` is a true global (declared as `const fin` in fin.d.ts —
  // not a property on `window`). Reach through `globalThis` so the
  // ambient declaration isn't strictly required at type-check time.
  const fin = (globalThis as unknown as { fin?: FinSurface }).fin;
  if (!fin) {
    openInBrowser(url);
    return;
  }
  try {
    const existing = await fin.Window.wrap({
      uuid: fin.me.identity.uuid,
      name: POPOUT_NAME,
    });
    // If the window exists, just focus it.
    if (await existing.isShowing()) {
      await existing.bringToFront();
      await existing.focus();
      // Reload to the requested URL so a subsequent open with a
      // different providerId re-targets the form.
      await existing.navigate(url);
      return;
    }
    await existing.show();
    await existing.bringToFront();
  } catch {
    try {
      await fin.Window.create({
        name: POPOUT_NAME,
        url,
        defaultWidth: POPOUT_WIDTH,
        defaultHeight: POPOUT_HEIGHT,
        defaultCentered: true,
        autoShow: true,
        frame: true,
        resizable: true,
        saveWindowState: false,
      });
    } catch (err) {
      // OpenFin failed → fall back to plain browser window so the
      // user still gets somewhere to author their providers.
      // eslint-disable-next-line no-console
      console.warn('[provider-editor-popout] fin.Window.create failed; falling back to window.open', err);
      openInBrowser(url);
    }
  }
}

function openInBrowser(url: string): void {
  const features = `width=${POPOUT_WIDTH},height=${POPOUT_HEIGHT},resizable=yes,scrollbars=no`;
  const w = window.open(url, POPOUT_NAME, features);
  if (w && !w.closed) w.focus();
}

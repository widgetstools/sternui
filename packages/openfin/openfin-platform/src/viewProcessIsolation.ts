/**
 * Per-view renderer process isolation.
 *
 * Chromium groups same-origin content into a shared renderer process,
 * and OpenFin's `processAffinity` makes the grouping explicit: views
 * with the SAME affinity string share one renderer. Every platform
 * view in this workspace is same-origin (one Vite app), so without
 * intervention ALL of them — ten 20k-row streaming blotters included —
 * land in ONE renderer process and contend for ONE main thread. That
 * is the "whole fleet sluggish at 30% total CPU" signature: a single
 * saturated core while the rest of the machine idles, every blotter
 * queuing decode/apply/render behind its siblings.
 *
 * The fix is a UNIQUE affinity per view, stamped centrally in the
 * platform's `createView` override so every creation path is covered —
 * seeded layout restore, workspace restore, page duplication, the
 * Browser "+" tab, dock component launches. A static
 * `defaultViewOptions.processAffinity` in the manifest cannot do this
 * (one static string = one shared group, the exact bug), which is why
 * this lives in code.
 *
 * The view's `name` is preferred as the affinity key: it is stable
 * across snapshot save/restore, so a restored view returns to its own
 * process rather than minting an unbounded set of affinity strings.
 * Nameless creations get a generated key (OpenFin assigns the name
 * after creation, too late to reuse here).
 *
 * Scope: VIEWS only. Child tool windows and popouts
 * (`fin.Window.create`) are deliberately untouched — the React-portal
 * popout pattern in `@starui/host-openfin` depends on default process
 * grouping (see popoutWindow.ts).
 */

export const VIEW_ISOLATION_AFFINITY_PREFIX = 'view-iso-';

interface ViewOptionsWithAffinity {
  name?: string;
  processAffinity?: string;
}

function generateAffinityKey(): string {
  try {
    return `${VIEW_ISOLATION_AFFINITY_PREFIX}${crypto.randomUUID()}`;
  } catch {
    // crypto.randomUUID needs a secure context; fall back to a
    // best-effort unique string (per-session counter + entropy).
    return `${VIEW_ISOLATION_AFFINITY_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Stamp a unique `processAffinity` onto a view's creation options,
 * REPLACING any caller-supplied value — a shared inbound affinity
 * (e.g. the legacy `"star-demo"` the seed used to carry, re-imported
 * through every page duplication) is precisely the bug this exists
 * to fix. Mutates and returns `opts` so callers can stamp in place on
 * platform payloads.
 */
export function ensureViewProcessIsolation<T extends ViewOptionsWithAffinity>(opts: T): T {
  opts.processAffinity = opts.name
    ? `${VIEW_ISOLATION_AFFINITY_PREFIX}${opts.name}`
    : generateAffinityKey();
  return opts;
}

/**
 * Walk a golden-layout window layout tree (snapshot restore path) and
 * stamp a unique affinity on every embedded view's componentState.
 * Snapshot windows carry their views INSIDE `windowOptions.layout`
 * rather than through per-view `createView` calls, so `createWindow`
 * must isolate them here. Unknown shapes are left untouched — the walk
 * only descends `content` arrays and only stamps objects that are
 * recognizably view componentState (componentName === 'view', or a
 * view `url`/`initialUrl` with a `processAffinity`/`name`).
 */
export function isolateLayoutViews(layout: unknown): void {
  if (!layout || typeof layout !== 'object') return;
  const node = layout as Record<string, unknown>;

  const looksLikeViewState =
    node.componentName === 'view'
    || (typeof node.initialUrl === 'string' && ('processAffinity' in node || 'name' in node));
  if (looksLikeViewState) {
    ensureViewProcessIsolation(node as ViewOptionsWithAffinity);
  }

  const componentState = node.componentState;
  if (componentState && typeof componentState === 'object') {
    isolateLayoutViews(componentState);
  }
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) isolateLayoutViews(child);
  }
}

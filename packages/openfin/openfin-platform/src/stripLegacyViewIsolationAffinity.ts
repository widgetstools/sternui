/**
 * Cleanup for the reverted per-view renderer isolation experiment.
 *
 * While isolation was active, every view creation was stamped with a
 * unique `processAffinity: "view-iso-…"` — and those values were then
 * PERSISTED into saved pages and workspace snapshots. Reverting the
 * stamping alone is not enough: contaminated layouts keep restoring
 * views into solo renderer processes, which Chromium throttles and
 * then freezes once the view is hidden, occluded, or on an inactive
 * tab — the "blotter goes blank until you switch tabs" symptom.
 *
 * These helpers run at restore time (platform `createView` /
 * `createWindow` overrides) and normalize any legacy `view-iso-*`
 * affinity back to the shared per-app group, so every contaminated
 * snapshot self-heals on its next restore. Non-legacy affinities
 * (e.g. an explicit seed value or a deliberate future grouping) are
 * left untouched.
 */

export const LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX = 'view-iso-';

interface AffinityCarrier {
  processAffinity?: string;
}

function isLegacy(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.startsWith(LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX)
  );
}

/**
 * Replace a legacy isolation affinity on one options object with the
 * shared group (or drop it entirely when no shared value is supplied —
 * OpenFin then applies its default same-app grouping). Mutates and
 * returns `opts`.
 *
 * `sharedAffinity` should be a single stable per-app value (the
 * platform uuid) so cleaned views land in the SAME renderer group as
 * seed-configured views — a cleaned view must never end up alone in a
 * fresh group, or the freeze this cleanup exists to cure comes back.
 */
export function stripLegacyViewIsolationAffinity<T extends AffinityCarrier>(
  opts: T,
  sharedAffinity?: string,
): T {
  if (isLegacy(opts.processAffinity)) {
    if (sharedAffinity) opts.processAffinity = sharedAffinity;
    else delete opts.processAffinity;
  }
  return opts;
}

/**
 * Walk a snapshot/seed window layout tree (same shape the old
 * isolation stamping walked) and clean every embedded view
 * componentState. Unknown shapes are left untouched.
 */
export function stripLegacyViewIsolationFromLayout(
  layout: unknown,
  sharedAffinity?: string,
): void {
  if (!layout || typeof layout !== 'object') return;
  const node = layout as Record<string, unknown>;

  if (isLegacy(node.processAffinity)) {
    stripLegacyViewIsolationAffinity(node as AffinityCarrier, sharedAffinity);
  }

  const componentState = node.componentState;
  if (componentState && typeof componentState === 'object') {
    stripLegacyViewIsolationFromLayout(componentState, sharedAffinity);
  }
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) stripLegacyViewIsolationFromLayout(child, sharedAffinity);
  }
}

/**
 * Registry bridging MarketsGrid SSRM leaf fetch ↔ alerts baseline seed.
 * Keyed by `gridId` so PlatformHandle (per-module) and GridPlatform (host)
 * share the same binding.
 */

import type { AlertRule, PlatformHandle } from '@starui/engine';
import type { PreviousValuesStore } from './previousValues.js';
import { seedAlertBaselinesFromRows } from './seedAlertBaselinesFromRows.js';

type LeafFetcher = () => Promise<readonly Record<string, unknown>[]>;

type SeedBinding = {
  prevValues: PreviousValuesStore;
  getRules: () => readonly AlertRule[];
};

type FetcherBinding = {
  fetch: LeafFetcher;
  rowIdField: string;
};

const leafFetchers = new Map<string, FetcherBinding>();
const seedBindings = new Map<string, SeedBinding>();

function gridIdOf(platform: { gridId?: string } | object): string | null {
  const id = (platform as { gridId?: string }).gridId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function registerAlertsSsrmLeafFetcher(
  platform: { gridId: string } | object,
  binding: FetcherBinding | null,
): void {
  const id = gridIdOf(platform);
  if (!id) return;
  if (!binding) {
    leafFetchers.delete(id);
    return;
  }
  leafFetchers.set(id, binding);
}

export function registerAlertsBaselineSeedBinding(
  platform: { gridId: string } | object,
  binding: SeedBinding | null,
): void {
  const id = gridIdOf(platform);
  if (!id) return;
  if (!binding) {
    seedBindings.delete(id);
    return;
  }
  seedBindings.set(id, binding);
}

/**
 * The registered whole-book fetcher for this grid, if any.
 *
 * Exposed because live evaluation needs it too, not just the on-demand seed.
 * Under a server-side row model this window holds only its viewport, so the
 * row-delta signal alerts normally evaluate from either never arrives or would
 * cover a few hundred rows of the book — see
 * `docs/perspective-grid-issuetobefixed.md`. The fetcher is the only handle on
 * the WHOLE book, which is the scope an alert is actually about.
 */
export function getAlertsLeafFetcher(
  platform: { gridId: string } | object,
): { fetch: LeafFetcher; rowIdField: string } | null {
  const id = gridIdOf(platform);
  if (!id) return null;
  return leafFetchers.get(id) ?? null;
}

/**
 * Fetch all filtered leaves via Perspective and seed alert baselines.
 * Day-to-day evaluation stays on publishExternalDelta — this is on-demand.
 */
export async function rescanAlertsFullBook(
  platform: PlatformHandle<unknown> | { gridId: string } | object,
): Promise<{ seededRows: number; seededCells: number } | null> {
  const id = gridIdOf(platform);
  if (!id) return null;
  const fetcher = leafFetchers.get(id);
  const binding = seedBindings.get(id);
  if (!fetcher || !binding) return null;
  const rows = await fetcher.fetch();
  return seedAlertBaselinesFromRows({
    rows,
    rowIdField: fetcher.rowIdField,
    rules: binding.getRules(),
    prevValues: binding.prevValues,
  });
}

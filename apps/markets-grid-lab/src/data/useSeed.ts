import { useCallback } from 'react';
import type { MarketsGridHandle } from '@starui/grid';
import type { TabSeed } from '../seeds';

const SEED_FLAG_PREFIX = 'lab-seeded:';

/**
 * Returns an `onReady` callback that seeds the platform's module state
 * the first time a given `gridId` mounts. Subsequent mounts skip the
 * seed so user edits aren't clobbered.
 *
 * The flag lives in `localStorage` under `lab-seeded:<gridId>`. Bump the
 * gridId (or remove the flag manually) to re-seed.
 *
 * Implementation:
 *   - Calls `platform.store.setModuleState(moduleId, () => state)` for
 *     each module in the seed payload. This is the same store the
 *     module's `activate()` hook subscribes to — writing here triggers
 *     `transformColumnDefs` to re-run, CSS rule classes to inject, and
 *     the conditional-styling header watcher to repaint.
 *   - Calls `handle.saveAll()` so the seeded state writes through to
 *     the active profile's storage row. Reload then restores the
 *     seeded state from disk — no re-seed needed.
 */
export function useSeed(gridId: string, seed: TabSeed) {
  return useCallback(
    (handle: MarketsGridHandle) => {
      // Dev-only: stash the handle on window so we can inspect from
      // devtools. Set BEFORE the early-bail so already-seeded grids
      // are still inspectable.
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }

      const flagKey = `${SEED_FLAG_PREFIX}${gridId}`;
      if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey)) {
        return;
      }

      const { store } = handle.platform;

      // Best-effort patch — for general-settings we MERGE (partial),
      // for everything else we REPLACE (full state).
      if (seed['conditional-styling']) {
        store.setModuleState('conditional-styling', () => seed['conditional-styling']!);
      }
      if (seed['column-customization']) {
        store.setModuleState('column-customization', () => seed['column-customization']!);
      }
      if (seed['column-groups']) {
        store.setModuleState('column-groups', () => seed['column-groups']!);
      }
      if (seed['calculated-columns']) {
        store.setModuleState('calculated-columns', () => seed['calculated-columns']!);
      }
      if (seed['saved-filters']) {
        store.setModuleState('saved-filters', () => seed['saved-filters']!);
      }
      if (seed['general-settings']) {
        store.setModuleState('general-settings', (current: object) => ({
          ...(current as object),
          ...seed['general-settings'],
        }));
      }

      handle
        .saveAll()
        .then(() => {
          try {
            localStorage.setItem(flagKey, '1');
          } catch {
            // ignore quota / privacy errors
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[lab] seed save failed', err);
        });

      // Dev-only: stash the handle on window so we can inspect from
      // devtools (Playwright too). Last grid to mount wins.
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }
    },
    [gridId, seed],
  );
}

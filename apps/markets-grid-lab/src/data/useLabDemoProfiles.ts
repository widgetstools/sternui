import { useCallback } from 'react';
import type { MarketsGridHandle } from '@starui/grid';
import {
  buildLabDemoBundle,
  type LabDemoProfileEntry,
} from '../profiles/labProfileKit';

/** Bump when catalog contents change so devs get a fresh install. */
export const LAB_DEMO_PROFILES_FLAG_VERSION = 'v2';

/**
 * Installs feature-scoped demo profiles into localStorage on first mount.
 * Replaces one-shot `useSeed` for tabs that ship a profile catalog.
 */
export function useLabDemoProfiles(
  gridId: string,
  profiles: LabDemoProfileEntry[],
  activeProfileId: string,
) {
  return useCallback(
    (handle: MarketsGridHandle) => {
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }

      const flagKey = `lab-demo-profiles-${LAB_DEMO_PROFILES_FLAG_VERSION}:${gridId}`;
      if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey)) {
        return;
      }

      if (!handle.setConfig) {
        // eslint-disable-next-line no-console
        console.warn(
          `[lab] setConfig unavailable for ${gridId} — demo profiles not installed.`,
        );
        return;
      }

      const bundle = buildLabDemoBundle(gridId, profiles, activeProfileId);
      void handle
        .setConfig(bundle)
        .then(() => {
          try {
            localStorage.setItem(flagKey, '1');
          } catch {
            /* quota */
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`[lab] demo profile install failed (${gridId})`, err);
        });
    },
    [gridId, profiles, activeProfileId],
  );
}

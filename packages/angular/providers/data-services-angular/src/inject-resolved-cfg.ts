import { computed, type Signal } from '@angular/core';
import { resolveCfg } from '@starui/data-services';
import type { ProviderConfig } from '@starui/shared-types';
import { injectAppDataStore } from './inject-app-data';

/**
 * Reactive template-substitution. Angular twin of React's
 * `useResolvedCfg(cfg)`.
 *
 * Walks any `{{name.key}}` tokens in the cfg's strings against the
 * current AppData snapshot. Returns a Signal that re-evaluates when:
 *   - the input cfg signal emits a different value, OR
 *   - any AppData mutation bumps the mirror's version.
 *
 * Pre-load (mirror's first snapshot hasn't arrived) returns the cfg
 * unresolved — callers that need real values should gate on
 * `loaded()` before subscribing live data.
 *
 *   const rawCfg$$ = signal<ProviderConfig | null>(null);
 *   const cfg$$ = injectResolvedCfg(rawCfg$$);
 *   effect(() => { console.log('resolved:', cfg$$()); });
 */
export function injectResolvedCfg(
  cfg$: Signal<ProviderConfig | null | undefined>,
): Signal<ProviderConfig | null> {
  const { store, version, loaded } = injectAppDataStore();

  return computed<ProviderConfig | null>(() => {
    // Subscribe to AppData mutations so the resolved cfg recomputes
    // when any referenced key changes.
    void version();

    const cfg = cfg$();
    if (!cfg) return null;
    if (!loaded()) return cfg; // pre-load: caller usually waits for `loaded`
    return resolveCfg(cfg, (name, key) => store.get(name, key));
  });
}

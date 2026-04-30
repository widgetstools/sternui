/**
 * Provider registry — maps `cfg.providerType` → factory function.
 *
 * Each entry is just a `(cfg, emit) => ProviderHandle`. Adding a new
 * transport is one file with one function plus one line here. No
 * abstract base class, no descriptor pattern (3 plugins doesn't earn
 * it — descriptors pay off at 8+).
 */

import type { ProviderConfig } from '@marketsui/shared-types';
import type { ProviderEmit, ProviderHandle } from './Provider.js';
import { resolveBracketCfg, type BracketCache } from '../template/bracket-resolver.js';
import { startMock } from './mock.js';
import { startStomp } from './stomp.js';
import { startRest } from './rest.js';

export type ProviderFactory<T extends ProviderConfig = ProviderConfig> = (
  cfg: T,
  emit: ProviderEmit,
) => ProviderHandle;

const factories: Partial<Record<ProviderConfig['providerType'], ProviderFactory>> = {
  mock: startMock as ProviderFactory,
  stomp: startStomp as ProviderFactory,
  rest: startRest as ProviderFactory,
};

/**
 * Resolve and start a provider for the given config. Throws if the
 * provider type isn't registered (rather than silently no-op).
 *
 * Mints a fresh per-attach `BracketCache` and resolves any
 * `[identifier]` tokens in the config before dispatch — two
 * occurrences of the same token name (e.g. `[clientTag]`) across
 * different config fields share the same session-unique value for
 * the lifetime of this provider attach. The cache is discarded once
 * dispatch completes; the factory only sees resolved strings.
 *
 * The existing `{{name.key}}` AppData substitution runs upstream in
 * the React hook (`useResolvedCfg`) before the cfg reaches the
 * worker, so by the time we get here only bracket tokens remain to
 * resolve.
 */
export function startProvider(cfg: ProviderConfig, emit: ProviderEmit): ProviderHandle {
  const factory = factories[cfg.providerType];
  if (!factory) {
    throw new Error(`[data-plane] No provider factory registered for type '${cfg.providerType}'`);
  }
  const bracketCache: BracketCache = new Map();
  const resolved = resolveBracketCfg(cfg, bracketCache);
  return factory(resolved, emit);
}

/**
 * Allow apps to register their own factories (or override the
 * defaults — useful for testing). Idempotent: last registration
 * wins.
 */
export function registerProvider<T extends ProviderConfig>(
  type: T['providerType'],
  factory: ProviderFactory<T>,
): void {
  factories[type] = factory as ProviderFactory;
}

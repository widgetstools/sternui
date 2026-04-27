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
import { startMock } from './mock.js';
import { startStomp } from './stomp.js';

export type ProviderFactory<T extends ProviderConfig = ProviderConfig> = (
  cfg: T,
  emit: ProviderEmit,
) => ProviderHandle;

const factories: Partial<Record<ProviderConfig['providerType'], ProviderFactory>> = {
  mock: startMock as ProviderFactory,
  stomp: startStomp as ProviderFactory,
  // rest lands in step 3.
};

/**
 * Resolve and start a provider for the given config. Throws if the
 * provider type isn't registered (rather than silently no-op).
 */
export function startProvider(cfg: ProviderConfig, emit: ProviderEmit): ProviderHandle {
  const factory = factories[cfg.providerType];
  if (!factory) {
    throw new Error(`[data-plane] No provider factory registered for type '${cfg.providerType}'`);
  }
  return factory(cfg, emit);
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

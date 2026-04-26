/**
 * providerFactory.ts — resolves a ProviderConfig into a running
 * provider instance.
 *
 * The router itself is provider-agnostic: it calls the factory on
 * first `configure` / `subscribe-stream` for a given providerId and
 * caches the result. Keeping construction out of the router means
 * consumers can plug in additional provider types (or stub them in
 * tests) without touching dispatch code.
 *
 * There are two provider SHAPES in the data-plane:
 *   • `ProviderBase` — keyed-resource (AppData, REST per endpoint,
 *     per-ticker price). Answers `fetch(key)` + optional
 *     `subscribe(key, emit)`.
 *   • `StreamProviderBase` — row-stream (STOMP, WebSocket, SocketIO
 *     blotters). Snapshots → complete → realtime updates, with a
 *     `RowCache` and late-joiner tracking.
 *
 * The factory returns a `ProviderInstance` discriminated union so the
 * router can branch on `.shape` and never has to guess which API
 * surface is present.
 */

import type {
  AppDataProviderConfig,
  MockProviderConfig,
  ProviderConfig,
  ProviderType,
  StompProviderConfig,
} from '@marketsui/shared-types';
import { AppDataProvider, type AppDataPersistenceHooks } from '../providers/AppDataProvider';
import { MockProvider } from '../providers/MockProvider';
import type { ProviderBase } from '../providers/ProviderBase';
import type { StreamProviderBase } from '../providers/StreamProviderBase';
import {
  StompStreamProvider,
  type StompClientFactory,
} from '../providers/StompStreamProvider';

export type KeyedProviderInstance =
  | { shape: 'keyed'; provider: ProviderBase };
export type StreamProviderInstance =
  | { shape: 'stream'; provider: StreamProviderBase };
export type ProviderInstance = KeyedProviderInstance | StreamProviderInstance;

export type ProviderFactory = (
  providerId: string,
  config: ProviderConfig,
) => Promise<ProviderInstance>;

/**
 * Default factory — knows only the built-in providers that ship in
 * the data-plane package. Consumers can wrap it to add their own
 * (STOMP / WebSocket / SocketIO land here in Week 3).
 *
 *   const factory: ProviderFactory = async (id, cfg) => {
 *     if (cfg.providerType === 'stomp') {
 *       const { StompStreamProvider } = await import('./providers/StompStreamProvider');
 *       const p = new StompStreamProvider(id);
 *       await p.configure(cfg);
 *       await p.start();
 *       return { shape: 'stream', provider: p };
 *     }
 *     return defaultProviderFactory(id, cfg);
 *   };
 */
/**
 * Build a default factory, optionally wired with AppData persistence
 * hooks. Worker shells that want write-through for `durability:
 * 'persisted'` AppData keys pass `{ appDataHooks }`; the rest of the
 * platform's defaults remain untouched.
 *
 * Equivalent to `defaultProviderFactory` (back-compat export below)
 * when called with no args.
 */
export function buildDefaultProviderFactory(opts?: {
  appDataHooks?: AppDataPersistenceHooks;
}): ProviderFactory {
  const appDataHooks = opts?.appDataHooks;
  return async (providerId, config) => {
    const type: ProviderType = config.providerType;
    switch (type) {
      case 'appdata': {
        const p = new AppDataProvider(providerId, appDataHooks);
        await p.configure(config as AppDataProviderConfig);
        return { shape: 'keyed', provider: p };
      }
      case 'mock': {
        const p = new MockProvider(providerId);
        await p.configure(config as MockProviderConfig);
        return { shape: 'keyed', provider: p };
      }
      case 'stomp': {
        const p = new StompStreamProvider(providerId);
        await p.configure(config as StompProviderConfig);
        return { shape: 'stream', provider: p };
      }
      case 'websocket':
      case 'socketio':
      case 'rest':
        throw new Error(
          `Provider type '${type}' is not implemented in the default factory. ` +
          'Wrap defaultProviderFactory to add it (see providerFactory.ts doc).',
        );
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown provider type: ${_exhaustive as string}`);
      }
    }
  };
}

export const defaultProviderFactory: ProviderFactory = async (providerId, config) => {
  const type: ProviderType = config.providerType;

  switch (type) {
    case 'appdata': {
      const p = new AppDataProvider(providerId);
      await p.configure(config as AppDataProviderConfig);
      return { shape: 'keyed', provider: p };
    }
    case 'mock': {
      const p = new MockProvider(providerId);
      await p.configure(config as MockProviderConfig);
      return { shape: 'keyed', provider: p };
    }
    case 'stomp': {
      const p = new StompStreamProvider(providerId);
      await p.configure(config as StompProviderConfig);
      return { shape: 'stream', provider: p };
    }
    case 'websocket':
    case 'socketio':
    case 'rest':
      throw new Error(
        `Provider type '${type}' is not implemented in the default factory. ` +
        'Wrap defaultProviderFactory to add it (see providerFactory.ts doc).',
      );
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown provider type: ${_exhaustive as string}`);
    }
  }
};

/**
 * Helper that composes factories — call chain: custom(...) → built-in(...).
 * Use to add your own provider without losing access to the defaults.
 *
 *   const factory = composeFactory(
 *     defaultProviderFactory,
 *     async (id, cfg) => {
 *       if (cfg.providerType === 'rest') return { shape: 'stream', provider: new MyRestProvider(id, cfg) };
 *       return null; // fall through
 *     },
 *   );
 */
export function composeFactory(
  base: ProviderFactory,
  ...overrides: Array<(providerId: string, config: ProviderConfig) => Promise<ProviderInstance | null>>
): ProviderFactory {
  return async (providerId, config) => {
    for (const fn of overrides) {
      const result = await fn(providerId, config);
      if (result) return result;
    }
    return base(providerId, config);
  };
}

/**
 * Build a factory that instantiates `StompStreamProvider` with an
 * injected `createClient`. Useful for consumers who want to pipe the
 * STOMP Client through auth middleware or telemetry — or for tests
 * that want to drive the STOMP protocol without opening a socket.
 */
export function buildStompFactory(createClient: StompClientFactory): ProviderFactory {
  return async (providerId, config) => {
    if (config.providerType !== 'stomp') {
      return defaultProviderFactory(providerId, config);
    }
    const p = new StompStreamProvider(providerId, { createClient });
    await p.configure(config as StompProviderConfig);
    return { shape: 'stream', provider: p };
  };
}

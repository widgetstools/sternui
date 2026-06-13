/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useMemo, useState } from 'react';
import { DEV_PLATFORM_BOOTSTRAP } from '@starui/host-data';
import { usePlatformIdentityOrNull } from '@starui/host-data-react/runtime';
import { createConfigServiceStorage } from '@starui/host-config';
import type {
  ConfigManager,
  HostedContext,
  RegisteredComponentMetadata,
  StorageAdapterFactory,
} from './types.js';

/**
 * Arguments for {@link useHostedIdentity}.
 */
export interface UseHostedIdentityArgs {
  /**
   * Default `instanceId` used when neither OpenFin customData nor the
   * URL `?instanceId=` query param resolves one. Required so first-run
   * / refresh scenarios converge on a stable id.
   */
  defaultInstanceId: string;
  /** Default `appId` when platform bootstrap context is unavailable. */
  defaultAppId?: string;
  /** Default `userId` when platform bootstrap context is unavailable. */
  defaultUserId?: string;
  /**
   * When true, build a ConfigService-backed StorageAdapterFactory and
   * expose it on `identity.storage`. The factory is wrapped so every
   * adapter call automatically carries the resolved
   * {@link RegisteredComponentMetadata}.
   */
  withStorage?: boolean;
  /**
   * Optional ConfigManager override. When omitted and `withStorage` is
   * true, the hook attempts to resolve the host singleton via the
   * `@starui/openfin-platform/config` entry point. Pass an explicit
   * ConfigManager in tests or in non-OpenFin runtimes.
   */
  configManager?: ConfigManager;
  /**
   * Logical component name — currently used in diagnostic logs only,
   * but reserved as a future hook into storage diagnostics.
   */
  componentName: string;
}

/**
 * Result of {@link useHostedIdentity}.
 */
export interface UseHostedIdentityResult {
  /** Resolved identity bundle. `instanceId` is seeded synchronously; the
   *  ConfigManager / storage fields may begin `null` and resolve shortly. */
  identity: HostedContext;
  /**
   * Always `true` — `instanceId` is seeded synchronously (URL/default), so
   * identity is ready on first render. Retained for API compatibility with
   * consumers that gate on it; it no longer reflects a pending OpenFin lookup.
   * Gate on `identity.configManager` / `identity.storage` for data-readiness.
   */
  ready: boolean;
}

// ─── Identity resolution helpers ─────────────────────────────────────

/**
 * Hard bound on the OpenFin `fin.me.getOptions()` round-trip. A wedged
 * runtime (the original "Connecting to ConfigService…" stall) must never
 * strand the window — after this we keep the synchronously-seeded id.
 */
const HOST_OPTIONS_TIMEOUT_MS = 3_000;

/**
 * Diagnostic bound on host ConfigManager resolution. We never *drop* the
 * manager (that would strand persistence); exceeding this only logs a warning
 * so a slow ConfigService backend is visible without breaking the gate.
 */
const CONFIG_MANAGER_SLOW_MS = 8_000;

/** Reject after `ms` so a hung host call can't block identity resolution. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

interface HostCustomData {
  instanceId?: string;
  componentType?: string;
  componentSubType?: string;
  isTemplate?: boolean;
  singleton?: boolean;
}

/** Synchronously derive `instanceId` from the URL `?instanceId=` query param. */
function readUrlInstanceId(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('instanceId');
    return fromUrl && fromUrl.length > 0 ? fromUrl : null;
  } catch {
    /* SSR / no window */
    return null;
  }
}

/**
 * The synchronous identity seed: URL `?instanceId=` wins, else the host
 * default. Used as the initial state so the grid mounts immediately — the
 * OpenFin `customData` refine (when present) overrides it on the next tick.
 */
function seedInstanceId(defaultId: string): string {
  return readUrlInstanceId() ?? defaultId;
}

/**
 * Read OpenFin `customData` with a hard timeout. Returns `null` outside
 * OpenFin, on error, or on timeout — callers then keep the synchronous seed.
 */
async function readHostCustomData(timeoutMs: number): Promise<HostCustomData | null> {
  if (typeof fin === 'undefined') return null;
  try {
    const options = await withTimeout(
      fin.me.getOptions() as Promise<{ customData?: HostCustomData }>,
      timeoutMs,
      'fin.me.getOptions()',
    );
    return options?.customData ?? null;
  } catch {
    return null;
  }
}

function toRegisteredIdentity(cd: HostCustomData | null): RegisteredComponentMetadata | null {
  if (!cd || typeof cd.componentType !== 'string' || cd.componentType.length === 0) return null;
  return {
    componentType: cd.componentType,
    componentSubType: cd.componentSubType ?? '',
    isTemplate: cd.isTemplate === true,
    singleton: cd.singleton === true,
  };
}

/**
 * Lazily import the host's ConfigManager singleton. Kept dynamic so
 * widgets-react does not pull `@starui/openfin-platform` (and its
 * `@openfin/core` dep) into browser-only consumer bundles. Returns
 * `null` when the entry point is unavailable — the caller will then
 * surface a `null` configManager and consumers can fall back to
 * passing their own.
 *
 * Resolution is **peek-first**: `peekConfigManager()` returns the
 * already-initialized singleton synchronously (Provider realm), avoiding the
 * async `getConfigManager()` fallback entirely. Only when no instance is set
 * (child windows, fresh realms) do we await `getConfigManager()`, which is
 * diagnostically bounded by {@link CONFIG_MANAGER_SLOW_MS}.
 */
async function loadHostConfigManager(componentName: string): Promise<ConfigManager | null> {
  try {
    // Dynamic specifier — the package is an optional runtime peer, not
    // a build-time dep.
    const mod = (await import(
      /* @vite-ignore */ '@starui/openfin-platform/config' as string
    )) as {
      getConfigManager?: () => Promise<ConfigManager>;
      peekConfigManager?: () => ConfigManager | undefined;
    };
    const peeked = mod.peekConfigManager?.();
    if (peeked) return peeked;
    if (typeof mod.getConfigManager !== 'function') return null;
    const pending = mod.getConfigManager();
    // Warn (don't drop) when the host CM is slow to resolve.
    void withTimeout(pending, CONFIG_MANAGER_SLOW_MS, 'getConfigManager()').catch((err) => {
      if (err instanceof Error && err.message.includes('timed out')) {
        console.warn(
          `[useHostedIdentity:${componentName}] host ConfigManager resolve exceeded ${CONFIG_MANAGER_SLOW_MS}ms; still awaiting`,
        );
      }
    });
    return await pending;
  } catch {
    return null;
  }
}

function readConfigManagerAppId(configManager: ConfigManager | null | undefined): string | undefined {
  if (!configManager || typeof configManager.getAppId !== 'function') return undefined;
  return configManager.getAppId();
}

function readConfigManagerUserId(configManager: ConfigManager | null | undefined): string | undefined {
  if (!configManager || typeof configManager.getIdentity !== 'function') return undefined;
  return configManager.getIdentity().userId;
}

/**
 * Resolve the per-instance identity, host ConfigManager, and (optional)
 * storage factory used by hosted features such as
 * `<HostedMarketsGrid>`. Mirrors the resolution rules previously
 * embedded in `apps/markets-ui-react-reference`'s `HostedComponent`.
 *
 *   1. **OpenFin path** — `fin.me.getOptions().customData` supplies
 *      `instanceId` plus the four registered-component fields
 *      (componentType, componentSubType, isTemplate, singleton).
 *   2. **Browser path** — `window.location.search`'s `?instanceId=`
 *      wins, otherwise the supplied defaults are used.
 *   3. **`appId` / `userId`** — from {@link DataHubProvider} bootstrap
 *      context when present; otherwise `defaultAppId` / `defaultUserId`
 *      args, then an explicit `configManager`, then
 *      {@link DEV_PLATFORM_BOOTSTRAP}.
 *
 * When `withStorage` is true and a ConfigManager is available, the
 * returned `identity.storage` is a wrapped `StorageAdapterFactory`
 * that injects the registered-component identity into every call.
 */
export function useHostedIdentity(args: UseHostedIdentityArgs): UseHostedIdentityResult {
  const {
    defaultInstanceId,
    defaultAppId = DEV_PLATFORM_BOOTSTRAP.appId,
    defaultUserId = DEV_PLATFORM_BOOTSTRAP.userId,
    withStorage = false,
    configManager: configManagerOverride,
    componentName,
  } = args;

  const platformIdentity = usePlatformIdentityOrNull();

  // Seed `instanceId` synchronously (URL ?instanceId= → default) so the grid
  // mounts on first paint instead of gating on the async OpenFin lookup. In
  // OpenFin the `customData` refine below overrides it on the next tick.
  const [instanceId, setInstanceId] = useState<string>(() => seedInstanceId(defaultInstanceId));
  const [resolvedConfigManager, setResolvedConfigManager] = useState<ConfigManager | null>(
    () => configManagerOverride ?? null,
  );
  const [registeredIdentity, setRegisteredIdentity] = useState<RegisteredComponentMetadata | null>(
    null,
  );

  const appId =
    platformIdentity?.appId
    ?? readConfigManagerAppId(configManagerOverride)
    ?? readConfigManagerAppId(resolvedConfigManager)
    ?? defaultAppId;

  const userId =
    platformIdentity?.userId
    ?? readConfigManagerUserId(configManagerOverride)
    ?? readConfigManagerUserId(resolvedConfigManager)
    ?? defaultUserId;

  // OpenFin refine — overrides the synchronous seed with `customData`
  // (instanceId + registered-component metadata) when running inside a view.
  // Bounded by HOST_OPTIONS_TIMEOUT_MS so a wedged runtime can't strand the
  // window: on timeout/error we simply keep the seed. No-op in the browser.
  useEffect(() => {
    if (typeof fin === 'undefined') return;
    let cancelled = false;
    readHostCustomData(HOST_OPTIONS_TIMEOUT_MS)
      .then((cd) => {
        if (cancelled || !cd) return;
        if (typeof cd.instanceId === 'string' && cd.instanceId.length > 0) {
          setInstanceId(cd.instanceId);
        }
        const reg = toRegisteredIdentity(cd);
        if (reg) setRegisteredIdentity(reg);
      })
      .catch((err) => {
        console.error(`[useHostedIdentity:${componentName}] identity resolution failed:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [componentName]);

  // ConfigManager — explicit override wins; otherwise resolve the host
  // singleton lazily (peek-first, then bounded getConfigManager fallback).
  useEffect(() => {
    if (configManagerOverride) {
      setResolvedConfigManager(configManagerOverride);
      return;
    }
    let cancelled = false;
    loadHostConfigManager(componentName)
      .then((cm) => {
        if (!cancelled) setResolvedConfigManager(cm);
      })
      .catch((err) => {
        console.error(`[useHostedIdentity:${componentName}] ConfigManager resolve failed:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [configManagerOverride, componentName]);

  // Storage factory wrap. Identical wrapping rules as the previous
  // HostedComponent: registeredIdentity is injected per-call when
  // present; otherwise the underlying factory's legacy hardcoded
  // discriminator is used.
  const storage = useMemo<StorageAdapterFactory | null>(() => {
    if (!withStorage || !resolvedConfigManager) return null;
    const innerFactory = createConfigServiceStorage({ configManager: resolvedConfigManager });
    if (!registeredIdentity) return innerFactory;
    return (opts) => innerFactory({ ...opts, registeredIdentity });
  }, [withStorage, resolvedConfigManager, registeredIdentity]);

  const identity = useMemo<HostedContext>(
    () => ({
      instanceId,
      appId,
      userId,
      configManager: resolvedConfigManager,
      storage,
    }),
    [instanceId, appId, userId, resolvedConfigManager, storage],
  );

  // `instanceId` is seeded synchronously, so identity is always ready on first
  // render. The flag is retained for API compatibility with consumers that
  // gate on it; it no longer reflects a pending OpenFin lookup.
  return { identity, ready: true };
}

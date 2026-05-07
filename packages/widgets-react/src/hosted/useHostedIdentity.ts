/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useMemo, useState } from 'react';
import { createConfigServiceStorage } from '@marketsui/config-service';
import { LOGGED_IN_USER_ID } from '@marketsui/runtime-port';
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
  /** Default `appId` when OpenFin customData doesn't supply one. */
  defaultAppId?: string;
  /** Default `userId` when OpenFin customData doesn't supply one. */
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
   * `@marketsui/openfin-platform/config` entry point. Pass an explicit
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
  /** Resolved identity bundle. Several fields begin `null`. */
  identity: HostedContext;
  /**
   * `true` once `instanceId` has resolved (OpenFin lookup or fallback).
   * Consumers should typically gate rendering on this flag rather than
   * inspecting individual fields.
   */
  ready: boolean;
}

/**
 * `appId` is single-app-pinned across the entire codebase — same
 * rationale as `userId` (see `LOGGED_IN_USER_ID`). The `defaultAppId`
 * arg below is retained on the public API for back-compat but is
 * ignored at runtime so persistence always lands under the same scope.
 * Cross-machine imports and legacy rows otherwise diverge the appId
 * between writers and readers, breaking the strict-equality ownership
 * check in `isProfileSetRow`. Replace this literal when real multi-app
 * support lands.
 */
const DEFAULT_APP_ID = 'TestApp';
/**
 * `userId` is single-user-pinned across the entire codebase — see
 * `LOGGED_IN_USER_ID` in `@marketsui/runtime-port`. The `defaultUserId`
 * arg below is retained on the public API for back-compat but is
 * ignored at runtime so persistence always lands under the same scope.
 */
const DEFAULT_USER_ID = LOGGED_IN_USER_ID;

// ─── Identity resolution helpers ─────────────────────────────────────

async function resolveHostInstanceId(defaultId: string): Promise<string> {
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { instanceId?: string } })?.customData?.instanceId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch {
      /* not in an OpenFin view, or getOptions failed — fall through */
    }
  }
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('instanceId');
    if (fromUrl && fromUrl.length > 0) return fromUrl;
  } catch {
    /* SSR / no window — fall through */
  }
  return defaultId;
}

async function resolveRegisteredIdentity(): Promise<RegisteredComponentMetadata | null> {
  if (typeof fin === 'undefined') return null;
  try {
    const options = await fin.me.getOptions();
    const cd = (options as { customData?: {
      componentType?: string;
      componentSubType?: string;
      isTemplate?: boolean;
      singleton?: boolean;
    } })?.customData;
    if (!cd?.componentType) return null;
    return {
      componentType: cd.componentType,
      componentSubType: cd.componentSubType ?? '',
      isTemplate: cd.isTemplate === true,
      singleton: cd.singleton === true,
    };
  } catch {
    return null;
  }
}

/**
 * Lazily import the host's ConfigManager singleton. Kept dynamic so
 * widgets-react does not pull `@marketsui/openfin-platform` (and its
 * `@openfin/core` dep) into browser-only consumer bundles. Returns
 * `null` when the entry point is unavailable — the caller will then
 * surface a `null` configManager and consumers can fall back to
 * passing their own.
 */
async function loadHostConfigManager(): Promise<ConfigManager | null> {
  try {
    // Dynamic specifier — the package is an optional runtime peer, not
    // a build-time dep.
    const mod = (await import(
      /* @vite-ignore */ '@marketsui/openfin-platform/config' as string
    )) as { getConfigManager?: () => Promise<ConfigManager> };
    if (typeof mod.getConfigManager !== 'function') return null;
    return await mod.getConfigManager();
  } catch {
    return null;
  }
}

/**
 * Resolve the per-instance identity, host ConfigManager, and (optional)
 * storage factory used by hosted features such as
 * `<HostedMarketsGrid>`. Mirrors the resolution rules previously
 * embedded in `apps/markets-ui-react-reference`'s `HostedComponent`.
 *
 *   1. **OpenFin path** — `fin.me.getOptions().customData` supplies
 *      `instanceId`, `appId`, `userId`, plus the four registered-
 *      component fields (componentType, componentSubType, isTemplate,
 *      singleton).
 *   2. **Browser path** — `window.location.search`'s `?instanceId=`
 *      wins, otherwise the supplied defaults are used.
 *
 * When `withStorage` is true and a ConfigManager is available, the
 * returned `identity.storage` is a wrapped `StorageAdapterFactory`
 * that injects the registered-component identity into every call.
 */
export function useHostedIdentity(args: UseHostedIdentityArgs): UseHostedIdentityResult {
  const {
    defaultInstanceId,
    defaultAppId = DEFAULT_APP_ID,
    defaultUserId = DEFAULT_USER_ID,
    withStorage = false,
    configManager: configManagerOverride,
    componentName,
  } = args;

  // appId / userId are pinned (see DEFAULT_APP_ID / DEFAULT_USER_ID
  // notes above) — the args only document the seams for future SSO /
  // multi-app work.
  void defaultAppId;
  void defaultUserId;

  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [appId] = useState<string>(DEFAULT_APP_ID);
  const [userId] = useState<string>(LOGGED_IN_USER_ID);
  const [resolvedConfigManager, setResolvedConfigManager] = useState<ConfigManager | null>(
    configManagerOverride ?? null,
  );
  const [registeredIdentity, setRegisteredIdentity] = useState<RegisteredComponentMetadata | null>(
    null,
  );

  // Identity resolution. appId is pinned — only instanceId and the
  // registered-component identity are resolved from customData.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveHostInstanceId(defaultInstanceId),
      resolveRegisteredIdentity(),
    ])
      .then(([id, reg]) => {
        if (cancelled) return;
        setInstanceId(id);
        setRegisteredIdentity(reg);
      })
      .catch((err) => {
        console.error(`[useHostedIdentity:${componentName}] identity resolution failed:`, err);
        if (!cancelled) setInstanceId(defaultInstanceId);
      });
    return () => {
      cancelled = true;
    };
  }, [defaultInstanceId, componentName]);

  // ConfigManager — explicit override wins; otherwise resolve the host
  // singleton lazily.
  useEffect(() => {
    if (configManagerOverride) {
      setResolvedConfigManager(configManagerOverride);
      return;
    }
    let cancelled = false;
    loadHostConfigManager()
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

  return { identity, ready: instanceId !== null };
}

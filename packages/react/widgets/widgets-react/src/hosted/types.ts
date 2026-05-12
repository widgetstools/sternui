/**
 * Public type contract for `@starui/widgets-react/hosted`.
 *
 * These types are consumed by `<HostedMarketsGrid>` and any future
 * hosted-feature wrapper that needs the same identity / storage shape.
 * They were lifted out of `apps/markets-ui-react-reference` so external
 * consumers (other OpenFin React apps) have a documented integration
 * contract instead of importing app-internal symbols.
 */

import type { ConfigManager } from '@starui/config-service';
import type { StorageAdapterFactory } from '@starui/markets-grid';

export type { ConfigManager, StorageAdapterFactory };

/**
 * Resolved per-instance identity and host-services bundle passed to
 * hosted features. Built by `useHostedIdentity` and consumed by
 * `<HostedMarketsGrid>`.
 *
 * Several fields start as `null` and resolve asynchronously on mount
 * (OpenFin lookups, ConfigManager singleton init). Consumers should
 * gate rendering on the values they need.
 */
export interface HostedContext {
  /**
   * Per-instance identifier — keys layout storage, view-state rows,
   * and any per-window persisted state.
   *
   * Resolution priority (handled by `useHostedIdentity`):
   *   1. OpenFin `fin.me.getOptions().customData.instanceId`
   *   2. URL `?instanceId=` query param
   *   3. The `defaultInstanceId` passed by the host
   *
   * `null` while the OpenFin lookup is in flight on first mount.
   */
  instanceId: string | null;

  /**
   * App identity — part of the ConfigService scope key. Resolved from
   * OpenFin customData when available, otherwise the host's configured
   * fallback (`defaultAppId`).
   */
  appId: string;

  /**
   * User identity — part of the ConfigService scope key. Resolved from
   * OpenFin customData when available, otherwise the host's configured
   * fallback (`defaultUserId`).
   */
  userId: string;

  /**
   * The host ConfigManager singleton. Shared across every hosted
   * feature in the same window so they reuse one Dexie connection.
   *
   * `null` until the singleton resolves on first mount.
   */
  configManager: ConfigManager | null;

  /**
   * ConfigService-backed StorageAdapterFactory, pre-wrapped so every
   * adapter call automatically carries the resolved
   * `RegisteredComponentMetadata` (componentType, componentSubType,
   * isTemplate, singleton).
   *
   * Only populated when the caller passes `withStorage`. `null`
   * otherwise — components managing their own storage can ignore it.
   */
  storage: StorageAdapterFactory | null;
}

/**
 * The four registered-component fields stamped onto every
 * AppConfigRow this view persists. Read from OpenFin customData by
 * `useHostedIdentity` and injected into the storage factory so rows
 * always reflect the Registry Editor entry that launched the view.
 *
 * Returned as `null` outside OpenFin or when launched without a
 * registered-component customData payload — in that case the storage
 * factory falls back to its hardcoded discriminator
 * (`"markets-grid-layout-set"`).
 */
export interface RegisteredComponentMetadata {
  /** Registry entry's primary type discriminator (e.g. "MarketsGrid"). */
  componentType: string;

  /**
   * Optional sub-type for registry entries that share a primary type
   * but render different variants (e.g. `"FX"`, `"Equities"`). Empty
   * string when the registry entry doesn't define one.
   */
  componentSubType: string;

  /** True when the launched view is a template (read-only base copy). */
  isTemplate: boolean;

  /** True when only one instance of this registered component may exist. */
  singleton: boolean;
}

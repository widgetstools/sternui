/**
 * data-providers-local — adapter that wires `dataProviderConfigService`
 * to the platform's `ConfigManager` (Dexie / IndexedDB) so DataProvider
 * authoring works without a config server running.
 *
 * Both views that touch DataProviders — `/dataproviders` (the editor)
 * and `/blotters/marketsgrid` (the picker) — call `ensureDataProvidersLocalBackend()`
 * before mounting React Query subscriptions. The function is idempotent
 * and memoised: the first caller wins, every subsequent caller awaits
 * the same promise. After it resolves, the service is in local mode
 * for the lifetime of the page.
 *
 * What "local" means concretely
 * -----------------------------
 *   • Reads / writes hit the same `appConfig` Dexie table the rest of
 *     the platform uses. DataProvider rows live alongside MarketsGrid
 *     profiles, dock configs, registry entries, etc., all keyed by
 *     `componentType: 'data-provider'` so they don't collide.
 *   • The `userId` field continues to carry visibility (`'system'` =
 *     public, anything else = that user's private rows). The picker's
 *     `listVisible(userId)` query returns the union seamlessly.
 *   • Switching back to the REST backend later is one call to
 *     `dataProviderConfigService.configureLocal(undefined)`.
 */

import {
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from '@marketsui/data-plane';
import {
  getConfigManager,
} from '@marketsui/openfin-platform/config';
import type { AppConfigRow, ConfigManager } from '@marketsui/config-service';
import type { UnifiedConfig } from '@marketsui/shared-types';

/**
 * `AppConfigRow` (Dexie schema) and `UnifiedConfig` (shared-types) are
 * structurally identical — the cast is a no-op at runtime, just a TS
 * acknowledgement that the two declarations describe the same shape.
 */
function toRow(c: UnifiedConfig): AppConfigRow {
  return c as unknown as AppConfigRow;
}
function toConfig(r: AppConfigRow): UnifiedConfig {
  return r as unknown as UnifiedConfig;
}

const APP_ID = 'TestApp'; // matches HostedComponent's DEFAULT_APP_ID seed
const COMPONENT_TYPE = 'data-provider';

function buildBackend(manager: ConfigManager): DataProviderLocalBackend {
  return {
    async upsert(row) {
      // Stamp creation/update times like a server would. ConfigManager's
      // `saveConfig` overwrites `updatedTime` itself, but `creationTime`
      // / `createdBy` need to be set on first write — preserve them on
      // updates (the service already merges existing fields in update()).
      const now = new Date().toISOString();
      const next: AppConfigRow = {
        ...toRow(row),
        appId: row.appId || APP_ID,
        componentType: row.componentType || COMPONENT_TYPE,
        componentSubType: row.componentSubType || '',
        configId: row.configId || `dp-${crypto.randomUUID()}`,
        isTemplate: Boolean(row.isTemplate),
        creationTime: row.creationTime || now,
        updatedTime: now,
        createdBy: row.createdBy || row.userId,
        updatedBy: row.updatedBy || row.userId,
      };
      await manager.saveConfig(next);
      return toConfig(next);
    },

    async delete(configId) {
      await manager.deleteConfig(configId);
    },

    async getById(configId) {
      const row = await manager.getConfig(configId);
      return row ? toConfig(row) : null;
    },

    async listByUser(userId) {
      const rows = await manager.getConfigsByUser(userId);
      // Pre-filter to data-provider rows so the service's downstream
      // filter only has to confirm spelling variants.
      return rows
        .filter((r) => (r.componentType || '').toLowerCase() === COMPONENT_TYPE)
        .map(toConfig);
    },
  };
}

let pending: Promise<void> | null = null;

/**
 * Idempotent bootstrap. Call once at app boot (before any view
 * mounts). Components don't need to know this exists — they just
 * call `dataProviderConfigService.<method>()` and the service
 * itself awaits the wiring internally via `expectLocalBackend()`.
 *
 * The synchronous portion runs first: `expectLocalBackend()` flips
 * the service into "hold pending CRUD" mode immediately. The async
 * portion resolves the ConfigManager + sets the backend; once that
 * settles, the gate releases and any waiting CRUD calls proceed.
 *
 * Apps that DON'T want local mode just don't call this — the service
 * stays in REST mode by default and CRUD calls dispatch immediately.
 */
export function ensureDataProvidersLocalBackend(): Promise<void> {
  if (pending) return pending;

  // Synchronous: tell the service to hold any CRUD calls that fire
  // before the async resolution lands. This eliminates the race
  // window where a view mounts, calls e.g. getById(), and the call
  // falls through to REST because configureLocal() hasn't been
  // invoked yet.
  dataProviderConfigService.expectLocalBackend();

  pending = (async () => {
    const manager = await getConfigManager();
    dataProviderConfigService.configureLocal(buildBackend(manager));
  })().catch((err) => {
    // Reset so a future caller can retry. Surface the error too —
    // callers can decide whether to render an error state. Also
    // release the gate so calls don't hang forever on a permanent
    // failure (better to fall through to REST than deadlock).
    pending = null;
    dataProviderConfigService.configureLocal(undefined);
    throw err;
  });
  return pending;
}

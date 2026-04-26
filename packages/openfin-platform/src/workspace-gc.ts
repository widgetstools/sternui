/**
 * Workspace-membership-driven GC for orphaned per-instance config rows.
 *
 * The "config rows are ephemeral until claimed by a workspace" rule (per
 * the design) is implemented as set-membership cleanup, not as a flag on
 * the row. A per-instance config row is preserved iff it's referenced by
 * at least one of the user's saved workspaces; otherwise it's reaped.
 *
 * Preservation rules (any one is enough to keep a row):
 *   1. componentType === 'workspace'      — workspace rows are not per-instance
 *   2. isTemplate === true                — shared seeds, not per-instance
 *   3. configId in WELL_KNOWN_SHARED_IDS  — admin/system rows (dock, registry)
 *   4. configId === '<componentType>_<componentSubType>' for some
 *      registered component                — singleton or template key
 *   5. configId referenced by some saved workspace's instanceIds
 *
 * GC is wired to:
 *   • createSavedWorkspace / updateSavedWorkspace / deleteSavedWorkspace
 *     (via onWorkspaceChange in workspace-persistence.ts)
 *   • app start (via initWorkspace bootstrap)
 */

import type { ConfigManager, AppConfigRow } from '@marketsui/config-service';
import { COMPONENT_TYPES } from '@marketsui/shared-types';

interface RegistryEntryLite {
  componentType?: string;
  componentSubType?: string;
}

/**
 * Config rows whose configId is fixed and globally meaningful (not a
 * per-instance UUID). Never reap these even if no workspace references
 * them. Extend as new well-known rows are added.
 */
const WELL_KNOWN_SHARED_CONFIG_IDS: ReadonlySet<string> = new Set<string>([
  'dock-config',
  'component-registry',
  'workspace-setup',
]);

function singletonKeysFromRegistry(reg: AppConfigRow | undefined): Set<string> {
  const keys = new Set<string>();
  if (!reg) return keys;
  const entries = (reg.payload as { entries?: RegistryEntryLite[] } | undefined)?.entries ?? [];
  for (const e of entries) {
    const t = e?.componentType ?? '';
    if (!t) continue;
    keys.add(`${t}_${e?.componentSubType ?? ''}`);
  }
  return keys;
}

function instanceIdsFromWorkspaces(workspaces: AppConfigRow[]): Set<string> {
  const ids = new Set<string>();
  for (const ws of workspaces) {
    const payload = ws.payload as { instanceIds?: string[] } | undefined;
    for (const id of (payload?.instanceIds ?? [])) ids.add(id);
  }
  return ids;
}

export interface GcOptions {
  cm: ConfigManager;
  appId: string;
  userId: string;
  /** Default false. If true, log per-row decisions to console.debug. */
  verbose?: boolean;
}

export interface GcResult {
  scanned: number;
  deleted: number;
  preservedTemplate: number;
  preservedKnown: number;
  preservedSingleton: number;
  preservedReferenced: number;
}

/**
 * Sweep the (appId, userId) appConfig rows. Returns a count breakdown so
 * callers can log telemetry or surface results in admin tooling.
 *
 * Errors deleting individual rows are logged and counted as "kept" — the
 * sweep continues so a single broken row never blocks the rest.
 */
export async function gcOrphanedConfigs(opts: GcOptions): Promise<GcResult> {
  const { cm, appId, userId, verbose = false } = opts;

  const allByUser = await cm.getConfigsByUser(userId);
  const inScope = allByUser.filter((r) => r.appId === appId);
  const workspaces = inScope.filter((r) => r.componentType === COMPONENT_TYPES.WORKSPACE);
  const referenced = instanceIdsFromWorkspaces(workspaces);

  // Registry can live at a different scope (Phase 4 promotes it to global
  // (appId, userId='system')), so we look it up by canonical configId.
  const registry = await cm.getConfig('component-registry');
  const singletonKeys = singletonKeysFromRegistry(registry);

  const result: GcResult = {
    scanned: 0,
    deleted: 0,
    preservedTemplate: 0,
    preservedKnown: 0,
    preservedSingleton: 0,
    preservedReferenced: 0,
  };

  for (const row of inScope) {
    // Workspace rows are not per-instance — never GC them here
    if (row.componentType === COMPONENT_TYPES.WORKSPACE) continue;

    result.scanned++;

    if (row.isTemplate) {
      result.preservedTemplate++;
      if (verbose) console.debug(`[workspace-gc] keep (template): ${row.configId}`);
      continue;
    }
    if (WELL_KNOWN_SHARED_CONFIG_IDS.has(row.configId)) {
      result.preservedKnown++;
      if (verbose) console.debug(`[workspace-gc] keep (well-known): ${row.configId}`);
      continue;
    }
    if (singletonKeys.has(row.configId)) {
      result.preservedSingleton++;
      if (verbose) console.debug(`[workspace-gc] keep (singleton): ${row.configId}`);
      continue;
    }
    if (referenced.has(row.configId)) {
      result.preservedReferenced++;
      if (verbose) console.debug(`[workspace-gc] keep (referenced): ${row.configId}`);
      continue;
    }

    try {
      await cm.deleteConfig(row.configId);
      result.deleted++;
      if (verbose) console.debug(`[workspace-gc] DELETE: ${row.configId}`);
    } catch (err) {
      console.warn(`[workspace-gc] failed to delete configId='${row.configId}':`, err);
    }
  }

  return result;
}

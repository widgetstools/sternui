/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConfigManager,
  readHostEnv,
  type HostEnv,
} from "@starui/openfin-platform/config";
import {
  buildDeployExport,
  normalizeImportedAppConfigRow,
  type AppRegistryRow,
  type DeployExportResult,
  type PermissionRow,
  type RoleRow,
  type UserProfileRow,
} from "@starui/host-config";
import {
  LocalConfigBrowserAccess,
  type ConfigBrowserAccess,
} from "@starui/host-data";
import { TABLES, type TableKey, type TableMeta } from "../types";

interface Counts {
  appConfig: number;
  appRegistry: number;
  userProfile: number;
  roles: number;
  permissions: number;
  pendingSync: number;
}

export type ImportMode = 'overwrite' | 'skip-existing';

export interface ImportPreview {
  /** All parsed rows, in file order. */
  rows: any[];
  /** Rows whose primary key already exists in the local table. */
  conflicts: any[];
  /** Rows whose primary key does NOT yet exist in the local table. */
  fresh: any[];
  /** Rows that fail validation (missing PK, wrong shape). Reported but
   *  excluded from import regardless of mode. */
  invalid: { row: any; reason: string }[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * The full export bundle shape produced by `exportAll`. Keys match the
 * `SeedData` shape (and the server's `data/seed-config.json`), so a single
 * file round-trips three ways without per-table juggling: seed an empty
 * REST server, restore via the Config Browser / Import Config dialogs, or
 * drop in as the client `seedConfigUrl` `seed.json` — the seed loader reads
 * `appConfig` too (see `ConfigManager.seedIfEmpty`), so a same-deployment
 * export restores the app's FULL state (data providers, component registry,
 * dock, workspaces, profile-sets), not just the auth/registry shell.
 *
 * `userProfiles` is plural to match the canonical bundle shape even
 * though the Dexie table key is `userProfile` (singular).
 *
 * `pendingSync` is intentionally excluded — it is a write-retry queue,
 * not config data.
 */
export interface ExportBundle {
  appConfig: any[];
  appRegistry: any[];
  userProfiles: any[];
  roles: any[];
  permissions: any[];
}

export interface UseConfigBrowserReturn {
  hostEnv: HostEnv;
  /**
   * The REST URL the ConfigManager is *actually* running against, or
   * `undefined` in local-only mode. Source-of-truth for the header
   * "connected" chip — `hostEnv.configServiceUrl` only carries a value
   * when the window was launched with registry-driven customData,
   * which dock-spawned ConfigBrowser windows aren't.
   */
  restUrl: string | undefined;
  selected: TableMeta;
  setSelected: (key: TableKey) => void;
  rows: any[];
  counts: Counts;
  isLoading: boolean;
  refresh: () => Promise<void>;
  saveRow: (row: any) => Promise<void>;
  deleteRow: (id: string | number) => Promise<void>;
  previewImport: (rows: any[]) => ImportPreview;
  importRows: (rows: any[], mode: ImportMode) => Promise<ImportResult>;
  /** Delete every row currently visible in the selected table. For
   *  scopable tables this respects the active appId scope. */
  deleteAllRows: () => Promise<{ deleted: number; failed: number; errors: string[] }>;
  /** Read every config table from Dexie and return a single bundle.
   *  Scopable tables are filtered to the active `hostEnv.appId` when
   *  set, matching the per-table export's behavior. */
  exportAll: () => Promise<ExportBundle>;
  /** Scoped deploy bundle with validation warnings (seed-ready). */
  exportDeploy: () => Promise<DeployExportResult>;
}

const ZERO_COUNTS: Counts = {
  appConfig: 0,
  appRegistry: 0,
  userProfile: 0,
  roles: 0,
  permissions: 0,
  pendingSync: 0,
};

export interface UseConfigBrowserOptions {
  /**
   * Supply worker-backed config access from a data-hub window.
   * Defaults to OpenFin `getConfigManager()` wrapped in
   * {@link LocalConfigBrowserAccess} for config-only popouts.
   */
  resolveConfigAccess?: () => Promise<ConfigBrowserAccess>;
}

async function defaultResolveConfigAccess(): Promise<ConfigBrowserAccess> {
  const cm = await getConfigManager();
  return new LocalConfigBrowserAccess(cm);
}

async function readRestUrl(access: ConfigBrowserAccess): Promise<string | undefined> {
  if (access.fetchRestUrl) return access.fetchRestUrl();
  return access.getRestUrl?.();
}

export function useConfigBrowser(
  opts: UseConfigBrowserOptions = {},
): UseConfigBrowserReturn {
  const [hostEnv, setHostEnv] = useState<HostEnv>({ appId: "", configServiceUrl: "" });
  const [restUrl, setRestUrl] = useState<string | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<TableKey>("appConfig");
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Counts>(ZERO_COUNTS);
  const [isLoading, setIsLoading] = useState(true);
  const accessRef = useRef<ConfigBrowserAccess | null>(null);
  const resolveAccess = opts.resolveConfigAccess ?? defaultResolveConfigAccess;

  const selected = TABLES.find((t) => t.key === selectedKey)!;

  const loadCounts = useCallback(async (access: ConfigBrowserAccess, appId: string) => {
    const counts = await access.getCounts(appId);
    setCounts(counts);
  }, []);

  const loadRows = useCallback(
    async (access: ConfigBrowserAccess, key: TableKey, appId: string) => {
      setIsLoading(true);
      const data = await access.listTable(key, appId);
      setRows(data);
      setIsLoading(false);
    },
    [],
  );

  // Boot: host env + config access + initial counts/rows
  useEffect(() => {
    (async () => {
      try {
        const [env, access] = await Promise.all([
          readHostEnv(),
          resolveAccess(),
        ]);
        setHostEnv(env);
        setRestUrl(await readRestUrl(access));
        accessRef.current = access;
        await loadCounts(access, env.appId);
        await loadRows(access, selectedKey, env.appId);
      } catch (err) {
        console.error("Config Browser boot failed:", err);
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload rows when the selected table changes
  useEffect(() => {
    const access = accessRef.current;
    if (!access) return;
    loadRows(access, selectedKey, hostEnv.appId);
  }, [selectedKey, hostEnv.appId, loadRows]);

  const refresh = useCallback(async () => {
    const access = accessRef.current;
    if (!access) return;
    await Promise.all([
      loadCounts(access, hostEnv.appId),
      loadRows(access, selectedKey, hostEnv.appId),
    ]);
  }, [hostEnv.appId, selectedKey, loadRows, loadCounts]);

  /**
   * Post-mutation reconcile WITHOUT re-reading the whole table. A single
   * save/delete changes one row, but the old path called `refresh()` →
   * `loadRows()` → `table.toArray()` + a full grid re-render of EVERY row
   * (measured ~120–200ms of main-thread blocking at 300 rows, O(rows), so a
   * few-thousand-row config DB stalls ~1–2s on every save). Instead we splice
   * the one row in/out of the existing `rows` state (re-reading just that row by
   * key so server-set fields like `updatedAt` are reflected) and refresh the
   * cheap count() queries — which also catch side-effects like a new
   * `pendingSync` entry. The grid then diffs a single changed row, not 300.
   */
  const upsertRowLocal = useCallback(
    async (access: ConfigBrowserAccess, key: TableKey, keyValue: string | number) => {
      const meta = TABLES.find((t) => t.key === key)!;
      const pk = meta.primaryKey;
      const saved = await access.getTableRow(key, keyValue);
      const inScope =
        saved != null &&
        (!meta.scopable || !hostEnv.appId || (saved as any).appId === hostEnv.appId);
      setRows((prev) => {
        const idx = prev.findIndex((r) => r[pk] === keyValue);
        if (!inScope) return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
    },
    [hostEnv.appId],
  );

  const removeRowLocal = useCallback((key: TableKey, id: string | number) => {
    const pk = TABLES.find((t) => t.key === key)!.primaryKey;
    setRows((prev) => prev.filter((r) => String(r[pk]) !== String(id)));
  }, []);

  const saveRow = useCallback(
    async (row: any) => {
      const access = accessRef.current;
      if (!access) return;
      switch (selectedKey) {
        case "appConfig":
          await access.saveConfig(row);
          break;
        case "appRegistry":
          await access.saveAppRegistry(row);
          break;
        case "userProfile":
          await access.saveUserProfile(row);
          break;
        case "roles":
          await access.saveRole(row);
          break;
        case "permissions":
          await access.savePermission(row);
          break;
        case "pendingSync":
          await access.putPendingSync(row);
          break;
      }
      const pk = TABLES.find((t) => t.key === selectedKey)!.primaryKey;
      await upsertRowLocal(access, selectedKey, row[pk]);
      await loadCounts(access, hostEnv.appId);
    },
    [selectedKey, upsertRowLocal, loadCounts, hostEnv.appId],
  );

  const deleteRow = useCallback(
    async (id: string | number) => {
      const access = accessRef.current;
      if (!access) return;
      switch (selectedKey) {
        case "appConfig":
          await access.deleteConfig(String(id));
          break;
        case "appRegistry":
          await access.deleteAppRegistry(String(id));
          break;
        case "userProfile":
          await access.deleteUserProfile(String(id));
          break;
        case "roles":
          await access.deleteRole(String(id));
          break;
        case "permissions":
          await access.deletePermission(String(id));
          break;
        case "pendingSync":
          await access.deletePendingSync(id);
          break;
      }
      removeRowLocal(selectedKey, id);
      await loadCounts(access, hostEnv.appId);
    },
    [selectedKey, removeRowLocal, loadCounts, hostEnv.appId],
  );

  /**
   * Classify an incoming array of rows against the current table
   * snapshot so the user can see — before committing — how many
   * rows are new vs. would overwrite existing ones. Pure / synchronous;
   * driven off `rows`, the table currently in view.
   */
  const previewImport = useCallback(
    (incoming: any[]): ImportPreview => {
      const pk = selected.primaryKey;
      const existingKeys = new Set(rows.map((r) => r?.[pk]).filter((v) => v !== undefined && v !== null));
      const out: ImportPreview = { rows: incoming, conflicts: [], fresh: [], invalid: [] };
      for (const row of incoming) {
        if (!row || typeof row !== 'object') {
          out.invalid.push({ row, reason: 'not an object' });
          continue;
        }
        const key = row[pk];
        if (key === undefined || key === null || key === '') {
          out.invalid.push({ row, reason: `missing primary key '${pk}'` });
          continue;
        }
        if (existingKeys.has(key)) out.conflicts.push(row);
        else out.fresh.push(row);
      }
      return out;
    },
    [rows, selected.primaryKey],
  );

  /**
   * Bulk import rows into the currently-selected table. Each row is
   * routed through the same save method as a single-row save so that
   * REST sync, timestamp stamping, and any per-table validation logic
   * inside ConfigManager kicks in identically.
   *
   * Format expectations: `incoming` MUST be an array of full row
   * objects matching the export shape (export writes `JSON.stringify(rows)`,
   * so a freshly-exported file round-trips with no transformation).
   *
   * Mode:
   *   - `'overwrite'`     — every valid row is upserted by primary key.
   *   - `'skip-existing'` — only rows whose PK is NOT in the table are
   *                         inserted; conflicting rows are reported as
   *                         skipped and left untouched.
   *
   * Rows missing a primary key are always counted as `failed` regardless
   * of mode.
   */
  /**
   * Re-stamp imported rows to the deployment's `activeAppId` /
   * `activeUserId` (from `seed.json` via ConfigManager) so imports
   * from other machines match local scope before `saveConfig`.
   */
  const reownForImport = useCallback((row: any): any => {
    if (!row || typeof row !== 'object') return row;
    const access = accessRef.current;
    if (!access) return row;
    const activeAppId = access.getAppId();
    const activeUserId = access.getIdentity().userId;
    if (selectedKey === 'appConfig') {
      const next = { ...row };
      if (next.config && !next.payload) next.payload = next.config;
      return normalizeImportedAppConfigRow(next, { activeAppId, activeUserId });
    }
    if (selectedKey === 'userProfile') {
      return { ...row, appId: activeAppId };
    }
    return row;
  }, [selectedKey]);

  const importRows = useCallback(
    async (incoming: any[], mode: ImportMode): Promise<ImportResult> => {
      const access = accessRef.current;
      if (!access) {
        return { imported: 0, skipped: 0, failed: incoming.length, errors: ['Config access not ready'] };
      }
      const preview = previewImport(incoming);
      const toImport =
        mode === 'overwrite'
          ? [...preview.fresh, ...preview.conflicts]
          : preview.fresh;

      let imported = 0;
      const errors: string[] = [];
      for (let i = 0; i < toImport.length; i++) {
        const row = reownForImport(toImport[i]);
        try {
          switch (selectedKey) {
            case 'appConfig':   await access.saveConfig(row); break;
            case 'appRegistry': await access.saveAppRegistry(row); break;
            case 'userProfile': await access.saveUserProfile(row); break;
            case 'roles':       await access.saveRole(row); break;
            case 'permissions': await access.savePermission(row); break;
            case 'pendingSync': await access.putPendingSync(row); break;
          }
          imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Row ${i}: ${msg}`);
        }
      }
      const skipped = mode === 'skip-existing' ? preview.conflicts.length : 0;
      const failedFromInvalid = preview.invalid.length;
      const failedFromSave = toImport.length - imported;
      for (const inv of preview.invalid) errors.push(`Invalid row: ${inv.reason}`);
      await refresh();
      return {
        imported,
        skipped,
        failed: failedFromInvalid + failedFromSave,
        errors,
      };
    },
    [selectedKey, refresh, previewImport, reownForImport],
  );

  const exportAll = useCallback(async (): Promise<ExportBundle> => {
    const access = accessRef.current;
    if (!access) {
      return { appConfig: [], appRegistry: [], userProfiles: [], roles: [], permissions: [] };
    }
    const bundle = await access.exportBundle(hostEnv.appId);
    return {
      appConfig: bundle.appConfig,
      appRegistry: bundle.appRegistry,
      userProfiles: bundle.userProfiles,
      roles: bundle.roles,
      permissions: bundle.permissions,
    };
  }, [hostEnv.appId]);

  const exportDeploy = useCallback(async (): Promise<DeployExportResult> => {
    const access = accessRef.current;
    if (!access) {
      return buildDeployExport({
        appConfig: [],
        appRegistry: [],
        userProfiles: [],
        roles: [],
        permissions: [],
      });
    }
    const tables = await access.exportDeployTables();
    return buildDeployExport({
      activeAppId: access.getAppId(),
      activeUserId: access.getIdentity().userId,
      appConfig: tables.appConfig,
      appRegistry: tables.appRegistry as AppRegistryRow[],
      userProfiles: tables.userProfiles as UserProfileRow[],
      roles: tables.roles as RoleRow[],
      permissions: tables.permissions as PermissionRow[],
    });
  }, []);

  /**
   * Delete every row currently in view. For scopable tables (appConfig,
   * userProfile) only rows inside the active appId scope are affected
   * because `rows` was already filtered when loaded. Each row is routed
   * through the same per-table delete method as a single-row delete so
   * REST sync stays consistent.
   */
  const deleteAllRows = useCallback(async () => {
    const access = accessRef.current;
    if (!access) {
      return { deleted: 0, failed: rows.length, errors: ['Config access not ready'] };
    }
    const pk = selected.primaryKey;
    let deleted = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const id = row?.[pk];
      if (id === undefined || id === null) {
        errors.push(`Row missing primary key '${pk}'`);
        continue;
      }
      try {
        switch (selectedKey) {
          case 'appConfig':   await access.deleteConfig(String(id)); break;
          case 'appRegistry': await access.deleteAppRegistry(String(id)); break;
          case 'userProfile': await access.deleteUserProfile(String(id)); break;
          case 'roles':       await access.deleteRole(String(id)); break;
          case 'permissions': await access.deletePermission(String(id)); break;
          case 'pendingSync': await access.deletePendingSync(id); break;
        }
        deleted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${pk}=${id}: ${msg}`);
      }
    }
    await refresh();
    return { deleted, failed: errors.length, errors };
  }, [rows, selected.primaryKey, selectedKey, refresh]);

  return {
    hostEnv,
    restUrl,
    selected,
    setSelected: setSelectedKey,
    rows,
    counts,
    isLoading,
    refresh,
    saveRow,
    deleteRow,
    previewImport,
    importRows,
    deleteAllRows,
    exportAll,
    exportDeploy,
  };
}

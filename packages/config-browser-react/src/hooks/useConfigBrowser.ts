/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
// Import from the /config subpath so we don't drag @openfin/workspace-platform
// into consumers running outside an OpenFin window (plain browser dev
// harness, overlay mounts in non-OpenFin demo apps, etc.).
import {
  getConfigManager,
  readHostEnv,
  type HostEnv,
} from "@marketsui/openfin-platform/config";
import type { ConfigManager } from "@marketsui/config-service";
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

export interface UseConfigBrowserReturn {
  hostEnv: HostEnv;
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
}

const ZERO_COUNTS: Counts = {
  appConfig: 0,
  appRegistry: 0,
  userProfile: 0,
  roles: 0,
  permissions: 0,
  pendingSync: 0,
};

function tableOf(manager: ConfigManager, key: TableKey) {
  const db = (manager as unknown as { db: any }).db;
  switch (key) {
    case "appConfig":   return db.appConfig;
    case "appRegistry": return db.appRegistry;
    case "userProfile": return db.userProfile;
    case "roles":       return db.roles;
    case "permissions": return db.permissions;
    case "pendingSync": return db.pendingSync;
  }
}

export function useConfigBrowser(): UseConfigBrowserReturn {
  const [hostEnv, setHostEnv] = useState<HostEnv>({ appId: "", configServiceUrl: "" });
  const [selectedKey, setSelectedKey] = useState<TableKey>("appConfig");
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Counts>(ZERO_COUNTS);
  const [isLoading, setIsLoading] = useState(true);
  const managerRef = useRef<ConfigManager | null>(null);

  const selected = TABLES.find((t) => t.key === selectedKey)!;

  const loadCounts = useCallback(async (manager: ConfigManager, appId: string) => {
    const [a, r, u, ro, p, ps] = await Promise.all([
      appId
        ? (manager as any).db.appConfig.where("appId").equals(appId).count()
        : (manager as any).db.appConfig.count(),
      (manager as any).db.appRegistry.count(),
      appId
        ? (manager as any).db.userProfile.where("appId").equals(appId).count()
        : (manager as any).db.userProfile.count(),
      (manager as any).db.roles.count(),
      (manager as any).db.permissions.count(),
      (manager as any).db.pendingSync.count(),
    ]);
    setCounts({
      appConfig: a, appRegistry: r, userProfile: u,
      roles: ro, permissions: p, pendingSync: ps,
    });
  }, []);

  const loadRows = useCallback(
    async (manager: ConfigManager, key: TableKey, appId: string) => {
      setIsLoading(true);
      const table = tableOf(manager, key);
      const meta = TABLES.find((t) => t.key === key)!;
      const collection = meta.scopable && appId
        ? table.where("appId").equals(appId)
        : table;
      const data = await collection.toArray();
      setRows(data);
      setIsLoading(false);
    },
    [],
  );

  // Boot: host env + manager + initial counts/rows
  useEffect(() => {
    (async () => {
      try {
        const [env, manager] = await Promise.all([
          readHostEnv(),
          getConfigManager(),
        ]);
        setHostEnv(env);
        managerRef.current = manager;
        await loadCounts(manager, env.appId);
        await loadRows(manager, selectedKey, env.appId);
      } catch (err) {
        console.error("Config Browser boot failed:", err);
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload rows when the selected table changes
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    loadRows(manager, selectedKey, hostEnv.appId);
  }, [selectedKey, hostEnv.appId, loadRows]);

  const refresh = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    await Promise.all([
      loadCounts(manager, hostEnv.appId),
      loadRows(manager, selectedKey, hostEnv.appId),
    ]);
  }, [hostEnv.appId, selectedKey, loadRows, loadCounts]);

  const saveRow = useCallback(
    async (row: any) => {
      const manager = managerRef.current;
      if (!manager) return;
      switch (selectedKey) {
        case "appConfig":
          await manager.saveConfig(row);
          break;
        case "appRegistry":
          await manager.saveAppRegistry(row);
          break;
        case "userProfile":
          await manager.saveUserProfile(row);
          break;
        case "roles":
          await manager.saveRole(row);
          break;
        case "permissions":
          await manager.savePermission(row);
          break;
        case "pendingSync":
          // No public write API — bypass via raw table.
          await (manager as any).db.pendingSync.put(row);
          break;
      }
      await refresh();
    },
    [selectedKey, refresh],
  );

  const deleteRow = useCallback(
    async (id: string | number) => {
      const manager = managerRef.current;
      if (!manager) return;
      switch (selectedKey) {
        case "appConfig":
          await manager.deleteConfig(String(id));
          break;
        case "appRegistry":
          await manager.deleteAppRegistry(String(id));
          break;
        case "userProfile":
          await manager.deleteUserProfile(String(id));
          break;
        case "roles":
          await manager.deleteRole(String(id));
          break;
        case "permissions":
          await manager.deletePermission(String(id));
          break;
        case "pendingSync":
          await (manager as any).db.pendingSync.delete(id);
          break;
      }
      await refresh();
    },
    [selectedKey, refresh],
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
  const importRows = useCallback(
    async (incoming: any[], mode: ImportMode): Promise<ImportResult> => {
      const manager = managerRef.current;
      if (!manager) {
        return { imported: 0, skipped: 0, failed: incoming.length, errors: ['ConfigManager not ready'] };
      }
      const preview = previewImport(incoming);
      const toImport =
        mode === 'overwrite'
          ? [...preview.fresh, ...preview.conflicts]
          : preview.fresh;

      let imported = 0;
      const errors: string[] = [];
      for (let i = 0; i < toImport.length; i++) {
        const row = toImport[i];
        try {
          switch (selectedKey) {
            case 'appConfig':   await manager.saveConfig(row); break;
            case 'appRegistry': await manager.saveAppRegistry(row); break;
            case 'userProfile': await manager.saveUserProfile(row); break;
            case 'roles':       await manager.saveRole(row); break;
            case 'permissions': await manager.savePermission(row); break;
            case 'pendingSync': await (manager as any).db.pendingSync.put(row); break;
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
    [selectedKey, refresh, previewImport],
  );

  /**
   * Delete every row currently in view. For scopable tables (appConfig,
   * userProfile) only rows inside the active appId scope are affected
   * because `rows` was already filtered when loaded. Each row is routed
   * through the same per-table delete method as a single-row delete so
   * REST sync stays consistent.
   */
  const deleteAllRows = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      return { deleted: 0, failed: rows.length, errors: ['ConfigManager not ready'] };
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
          case 'appConfig':   await manager.deleteConfig(String(id)); break;
          case 'appRegistry': await manager.deleteAppRegistry(String(id)); break;
          case 'userProfile': await manager.deleteUserProfile(String(id)); break;
          case 'roles':       await manager.deleteRole(String(id)); break;
          case 'permissions': await manager.deletePermission(String(id)); break;
          case 'pendingSync': await (manager as any).db.pendingSync.delete(id); break;
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
  };
}

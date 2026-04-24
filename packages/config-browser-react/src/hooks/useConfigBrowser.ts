/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConfigManager,
  readHostEnv,
  type HostEnv,
} from "@marketsui/openfin-platform";
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
  };
}

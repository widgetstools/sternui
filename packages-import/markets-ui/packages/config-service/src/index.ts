// ─── @marketsui/config-service ───────────────────────────────────────
//
// A dual-mode configuration service for MarketsUI applications.
//
// In dev mode (default), all data is stored in Dexie/IndexedDB — no
// backend required. When a REST URL is provided, writes sync to a
// remote backend with Dexie as a local cache.
//
// Usage:
//
//   import { createConfigManager } from "@marketsui/config-service";
//
//   const configManager = createConfigManager({
//     seedConfigUrl: "http://localhost:5174/seed-config.json",
//   });
//   await configManager.init();
//
//   const config = await configManager.getConfig("my-component-1");

// ─── Factory function ───────────────────────────────────────────────
export { createConfigManager, ConfigManager } from './config-manager';

// ─── Database (for advanced use cases only) ──────────────────────────
export { ConfigDatabase } from './db';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  AppConfigRow,
  AppRegistryRow,
  ConfigManagerOptions,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  SeedData,
  UserProfileRow,
} from './types';

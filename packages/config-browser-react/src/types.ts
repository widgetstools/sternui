/**
 * The Dexie tables the Config Browser knows how to display.
 * Order defines the left-sidebar order.
 */
export type TableKey =
  | "appConfig"
  | "appRegistry"
  | "userProfile"
  | "roles"
  | "permissions"
  | "pendingSync";

export interface TableMeta {
  key: TableKey;
  label: string;
  /** Primary key field (used to identify rows for edit/delete). */
  primaryKey: string;
  /** When true, rows carry an `appId` column that can be scoped to the host app. */
  scopable: boolean;
  description: string;
}

export const TABLES: readonly TableMeta[] = [
  {
    key: "appConfig",
    label: "App Config",
    primaryKey: "configId",
    scopable: true,
    description: "Component configurations (templates + instances).",
  },
  {
    key: "appRegistry",
    label: "App Registry",
    primaryKey: "appId",
    scopable: false,
    description: "Registered apps. Always global.",
  },
  {
    key: "userProfile",
    label: "User Profiles",
    primaryKey: "userId",
    scopable: true,
    description: "User ↔ app ↔ role mappings.",
  },
  {
    key: "roles",
    label: "Roles",
    primaryKey: "roleId",
    scopable: false,
    description: "Role definitions. Always global.",
  },
  {
    key: "permissions",
    label: "Permissions",
    primaryKey: "permissionId",
    scopable: false,
    description: "Permission definitions. Always global.",
  },
  {
    key: "pendingSync",
    label: "Pending Sync",
    primaryKey: "id",
    scopable: false,
    description: "Queued REST writes waiting to be retried.",
  },
] as const;

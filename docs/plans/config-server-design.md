---
title: "StarUI Config Server — design"
subtitle: "Repurposing configservice-old into the platform's single config backend"
date: "2026-05-19"
status: "Decision document — supersedes the prior dual ConfigClient design"
---

# Goals

Three orthogonal goals:

1. **One backend, one wire protocol.** The browser is always a thin
   REST client. The server is always the source of truth. Dev and
   prod exercise the same code paths.
2. **Pluggable storage.** SQLite for local dev and single-node
   deployments; MongoDB for production at scale. Adding a third
   backend is one new file implementing the `Storage` interface.
3. **Server-side identity-trust boundary.** The dev/prod mode is a
   server-startup flag. The browser bundle is dev/prod-agnostic.
   See `PUBLIC_API_SPEC.md` §15 #13 and `UX_NUANCES.md` N34 for the
   non-negotiable.

# Starting point — `configservice-old`

`/Users/develop/wfh/configservice-old` is the foundation. Honest read:

- **Stack**: Node 20 + Express 5 + TypeScript. Frontend (admin UI)
  is React; not shipped as part of the production server.
- **Storage**: `sql.js` (in-memory SQLite, persisted to disk after
  each mutation).
- **Routes**: hierarchical (`/nodes`) + flat (`/configurations`)
  CRUD, plus batch update, clone, and create-with-refs. ~15 source
  files total.
- **Auth**: None. CORS-open. Suitable for dev only.
- **DB abstraction**: None. Routes call `sql.js` directly via
  `.prepare()`, `.step()`, `.getAsObject()`.
- **Schema**:
  - `nodes` (`id`, `name`, `type`, `parent_id`, `create_time`,
    `update_time`) — tree of arbitrary app groupings.
  - `configurations` (`id`, `parent_id`, `component_type`,
    `component_sub_type`, `label`, `setting_json`,
    `active_setting_json`, `created_by`, `updated_by`,
    `can_override`, `source_node`).

# Schema migration — flatten to `AppConfigRow`

Per the user's direction, align with StarUI's `AppConfigRow`
(`PUBLIC_API_SPEC.md` §4.2). The hierarchy / override model is
dropped; rows are flat, scoped by `(appId, userId)`.

Mapping from configservice-old → AppConfigRow:

| configservice-old | AppConfigRow | Notes |
|---|---|---|
| `configurations.id` | `configId` | Stable identifier. |
| `configurations.component_type` | `componentType` | Already kebab-case in v1. |
| `configurations.component_sub_type` | `componentSubType` | Direct. |
| `configurations.label` | `displayText` | Direct. |
| `configurations.setting_json` | `payload` | JSON-serialised. |
| `configurations.active_setting_json` | (dropped) | Active/inactive duality not in StarUI's model. |
| `configurations.created_by` | `createdBy` | Direct. |
| `configurations.updated_by` | `updatedBy` | Direct. |
| `configurations.can_override` | (dropped) | Hierarchical override model gone. |
| `configurations.source_node` | (dropped) | Hierarchical inheritance model gone. |
| `nodes.*` | (dropped) | Hierarchy gone. |
| (new) | `appId` | Scope; from JWT in prod, request in dev. |
| (new) | `userId` | Scope; from JWT.sub in prod, request in dev. |
| (new) | `isTemplate` | Boolean flag. |
| (new) | `isPublic` | Boolean flag (basic visibility). |
| (new) | `__v` | Optimistic-lock version. |
| (new) | `lastAliveAt` | Orphan reclamation (§4.6). |
| (new) | `creationTime` | Epoch ms; server-stamped. |
| (new) | `updatedTime` | Epoch ms; server-stamped. |

The drop of `can_override` / `source_node` is significant — anyone
relying on the hierarchy/override model loses that capability. The
user's direction is to drop it; if richer visibility/inheritance is
needed later, it lands as a separate spec extension on top of the
flat row.

# `Storage` interface

The route handlers MUST NOT touch the database directly. All
persistence goes through:

```ts
interface Storage {
  // Generic CRUD
  getRow(filter: ConfigFilter, scope: ServerScope): Promise<AppConfigRow | null>;
  saveRow(row: AppConfigRow, scope: ServerScope): Promise<AppConfigRow>;
  listRows(filter: ConfigFilter, page: PageOptions, scope: ServerScope): Promise<PaginatedResult<AppConfigRow>>;
  deleteRow(filter: ConfigFilter, scope: ServerScope): Promise<void>;
  bulkUpdate(updates: ReadonlyArray<BulkUpdateEntry>, scope: ServerScope): Promise<BulkUpdateResult>;
  bulkDelete(filters: ReadonlyArray<ConfigFilter>, scope: ServerScope): Promise<BulkDeleteResult>;

  // Identity tables
  getUserProfile(userId: string, scope: ServerScope): Promise<UserProfile | null>;
  getUserRoles(userId: string, scope: ServerScope): Promise<readonly Role[]>;
  getUserPermissions(userId: string, scope: ServerScope): Promise<readonly Permission[]>;
  upsertUserProfile(profile: UserProfile, scope: ServerScope): Promise<UserProfile>;
  assignRole(userId: string, roleId: string, scope: ServerScope): Promise<void>;
  unassignRole(userId: string, roleId: string, scope: ServerScope): Promise<void>;
  upsertRole(role: Role, scope: ServerScope): Promise<Role>;
  upsertPermission(permission: Permission, scope: ServerScope): Promise<Permission>;

  // Orphan reclamation
  markAlive(args: MarkAliveArgs, scope: ServerScope): Promise<void>;
  listOrphans(args: OrphanQuery, scope: ServerScope): Promise<OrphanReport>;
  purgeOrphans(args: OrphanQuery & { dryRun?: boolean }, scope: ServerScope): Promise<PurgeReport>;

  health(): Promise<HealthStatus>;
}
```

Two implementations ship initially:

- **`SqliteStorage`** — refactored from configservice-old's existing
  sql.js usage. Same on-disk file format; new schema migrations
  ship as numbered SQL files.
- **`MongoStorage`** — fresh implementation. One collection per
  logical row type. Indexes on `(appId, userId, componentType)`,
  `(userId)`, etc.

Adding **`PostgresStorage`** later is one new file. Routes don't
change.

# Mode flag — server startup

```bash
# Dev
STARUI_CONFIG_MODE=dev npx @starui/config-server

# Prod
STARUI_CONFIG_MODE=prod STARUI_CONFIG_JWT_PUBLIC_KEY=/etc/starui/jwt.pub \
  STARUI_CONFIG_STORAGE=mongo STARUI_CONFIG_MONGO_URL=mongodb://... \
  @starui/config-server
```

Constraints (also documented in `PUBLIC_API_SPEC.md` §15 #13):

- The mode is read **once** at server boot and cached in
  module-scope state. No request handler may re-read it.
- The prod binary refuses to start in `dev` mode without
  `--i-know-this-is-dev`.
- The middleware stack branches on the cached mode at request
  time, not by re-reading the env var.

# Wire protocol — REST endpoints

See `PUBLIC_API_SPEC.md` §4.7 for the canonical table. Brief
summary:

| Method | Path |
|---|---|
| GET / POST / PUT / DELETE | `/configs[/:id]` |
| POST | `/configs/bulk-update` |
| POST | `/configs/bulk-delete` |
| POST | `/configs/mark-alive` |
| GET | `/configs/orphans` |
| POST | `/configs/orphans/purge` |
| GET | `/users/:userId/profile` |
| GET | `/users/:userId/roles` |
| GET | `/users/:userId/permissions` |
| GET / POST / PUT / DELETE | `/roles[/:id]` |
| GET / POST / PUT / DELETE | `/permissions[/:id]` |
| GET | `/health` |

In prod mode, every request runs through:

1. **JWT-validate middleware.** Reads `Authorization: Bearer …`,
   verifies signature against `STARUI_CONFIG_JWT_PUBLIC_KEY`, places
   the validated claims on `req.starui.token`.
2. **Identity-scope middleware.** Constructs `ServerScope` with
   `userId = token.sub`, `appId = token.appId || header['X-App-Id']`.
   Overwrites any client-supplied userId in path / query / body.
3. **Route handler.** Calls `Storage.*` methods with the scope.

In dev mode:

1. **Permissive middleware.** No JWT required. Constructs
   `ServerScope` from `header['X-User-Id'] || query.userId || 'dev1'`
   and `header['X-App-Id'] || query.appId`.
2. **Route handler.** Same as prod.

The route handlers themselves are mode-agnostic.

# Migration plan — configservice-old → @starui/config-server

Phased refactor of the existing repo:

## Phase 1 — Extract `Storage` interface

- Move all `sql.js` calls into a single `SqliteStorage` class.
- Routes call `Storage.*` instead of directly hitting sql.js.
- No behaviour change; commit-able as a refactor.

## Phase 2 — Schema migration

- Rewrite `configurations` table to mirror `AppConfigRow`. Drop
  `nodes`. Add `users`, `roles`, `permissions`,
  `user_roles`, `role_permissions`, `user_profiles`.
- Provide a one-off migration script for any existing dev data
  (likely nothing important to migrate; configservice-old hasn't
  been a prod target).

## Phase 3 — Auth + mode flag

- Add JWT validation middleware (jose or jsonwebtoken).
- Add mode-flag boot guard with the `--i-know-this-is-dev` opt-in.
- Add identity-scope middleware that overwrites client-supplied
  userId in prod.

## Phase 4 — `MongoStorage`

- New file implementing `Storage`. Indexes per the schema above.
- Switch via `STARUI_CONFIG_STORAGE=mongo`.

## Phase 5 — Package as `@starui/config-server`

- Move into `packages/shared/services/config-server/` (or a new
  bucket; TBD). Add `bin/starui-config-server` so `npx
  @starui/config-server` works.
- Strip the React admin UI to a separate package
  (`@starui/config-server-admin`) or drop it entirely (the
  `<ConfigBrowserPanel>` in `@starui/widgets` covers the same
  surface).
- Add unit tests for both `Storage` impls.

Each phase is one PR. Phases 1–3 land before any production traffic;
phase 4 is the prod-readiness gate; phase 5 is packaging polish.

# What's NOT in scope here

- **The browser-side `ConfigClient`.** Already documented in
  `PUBLIC_API_SPEC.md` §4.1; single REST implementation; no
  client-side dev/prod awareness.
- **Adding new row types beyond `AppConfigRow`.** The flat-row
  model handles every existing v1 use case. New row types
  (workspaces, presets, etc.) get their own spec extensions.
- **Auth server / IdP integration.** The config server consumes
  JWTs; it does not issue them. Operators wire their IdP of
  choice (Okta, Auth0, Keycloak, internal SSO).
- **Caching, indexing strategies, CDC streams.** Server-side
  implementation latitude (§16 #11).

# Open questions

1. **Multi-tenancy.** A tenant-scope above `appId` (for SaaS-style
   deployments where one server hosts multiple customer
   organisations). Not in scope now; would land as
   `ServerScope.tenantId` later.
2. **Hierarchical configs via JSON Pointer / Path inheritance.**
   The configservice-old `can_override` + `source_node` model is
   dropped, but if richer inheritance is needed later, a separate
   spec extension can layer it on the flat row (e.g. a
   `parentConfigId` field).
3. **Soft-delete with retention window.** Today the spec says
   delete is hard. Soft-delete with a 30-day window would
   complicate the schema but enable undo. Latitude per §16.

---

*Authored 2026-05-19. Changes to mappings or phases require a docs
PR that also updates `PUBLIC_API_SPEC.md` §4.7.*

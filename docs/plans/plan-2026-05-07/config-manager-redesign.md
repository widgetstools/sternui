# Config Manager Redesign — Design Discussion

**Date:** 2026-05-07
**Status:** Design / brainstorm. No code changes yet.
**Participants:** Anand, Claude
**Companion doc:** [`data-services-redesign.md`](./data-services-redesign.md) — referenced
where ConfigService boundaries meet the new SharedWorker data-services world.

---

## What this is

A working session to bring clarity to `@starui/config-service` for the
people who actually use it — framework consumers wiring a new app.
Specifically:

1. **Developer experience** — what does dev mode vs production mode look
   like end-to-end?
2. **Mode switching** — where the Dexie ↔ REST flag lives and who
   controls it.
3. **Seed configuration** — when it runs, who owns it, dev-only or also
   used in prod.
4. **Visibility & entitlement** — which configs a given user can see
   within an app, and where authn/authz comes from in production.
5. **Robustness at scale** — making the REST tier production-grade.
6. **Storage backend** — backing the REST service with Apache Ignite.

---

## Context — what exists today

- [`packages/shared/config-service/`](../../packages/shared/config-service/)
  — Dexie/IndexedDB-backed store with optional REST sync to
  [`apps/config-service-server/`](../../apps/config-service-server/).
- Five tables: `appConfig`, `appRegistry`, `userProfile`, `roles`,
  `permissions`, plus `pendingSync` for failed-write retry.
- Two parallel surfaces: low-level `ConfigManager` (CRUD per table +
  workspace-snapshot helpers) and newer REST-shaped `ConfigClient`
  (`LocalConfigClient` / `RestConfigClient`).
- Mode is selected at construction:
  ```ts
  createConfigManager({
    seedConfigUrl: "http://localhost:5174/seed-config.json",
    configServiceRestUrl: undefined, // present → REST mode, absent → local
  });
  ```
- React + Angular `config-browser` packages on top.
- Used as the seed source for the AppData store in the data-services
  redesign.

---

## Decisions so far

### 1. The "user" of the config service is the framework consumer

The flag that picks Dexie vs REST is set by the **developer integrating
the framework into their app** — not by a logged-in trader through a UI
toggle. A runtime user-facing switch is explicitly **out of scope**:
in-flight writes, partial sync, and per-window divergence make it more
trouble than it's worth.

**One source of truth, no second layer.** The mode is decided by the
presence (or absence) of `configServiceRestUrl` at construction:

```ts
createConfigManager({
  seedConfigUrl:        '/seed-config.json',
  configServiceRestUrl: import.meta.env.VITE_CONFIG_SERVICE_URL, // empty → local
});
```

Dev builds leave the env var empty → local Dexie. UAT / prod builds
set it → REST mode. That's the whole story. No registry-driven
override, no two-stage "construct local then maybe switch" bootstrap;
those add moving parts the framework doesn't need today.

`AppRegistryRow.configServiceEnabled` stays in the schema as
**descriptive metadata** for operators ("does this app use REST in
this deployment?"), but it does **not** drive runtime behavior.
End users never see any of this — it's purely a dev-side knob.

---

### 2. Authentication is the app's responsibility — not the framework's

Hard boundary: `@starui/config-service` does **no authentication**. No
OIDC client, no token refresh, no IDP coupling, no login UI.

The app it's wired into is responsible for getting the user logged in.
The config service only enters the picture **after** that's done. At
that point the app hands the framework an authenticated identity
through a small, narrowly-defined contract:

```ts
interface AppIdentity {
  /** Stable user id used for createdBy/updatedBy and visibility filters. */
  userId: string;

  /** Optional display name for audit / UI labels. */
  displayName?: string;

  /**
   * Returns a fresh access token on demand. Only consulted in REST mode.
   * The app owns refresh; the framework just calls this before each
   * outbound HTTP request and attaches `Authorization: Bearer <token>`.
   */
  getAccessToken?: () => Promise<string>;
}
```

Why this shape:

- **Synchronous `userId`.** Most reads/writes need the current userId
  immediately (createdBy, visibility filter). A Promise here would
  poison every call site.
- **Async `getAccessToken()`.** Tokens expire and refresh; that's the
  app's problem, but the framework needs a way to get a current one
  per request without caching staleness.
- **No `roles` here.** Roles live in the framework's own `userProfile`
  / `roles` / `permissions` tables — see Q3. Mixing IDP claims with
  framework-internal entitlement creates a two-source-of-truth bug
  waiting to happen.

Wiring is one call at app boot, after auth completes:

```ts
// 1. App does its own auth — OIDC, SSO, OpenFin platform, whatever.
const session = await myAuth.signIn();

// 2. App hands the framework a ready-to-use identity.
const configManager = createConfigManager({
  identity: {
    userId: session.user.sub,
    displayName: session.user.name,
    getAccessToken: () => myAuth.getAccessToken(),
  },
  configServiceRestUrl: env.CONFIG_SERVICE_URL, // present → REST mode
});

await configManager.init();
```

**Dev mode falls out for free.** The dev `AppIdentity` is a literal
object: `{ userId: "dev-user", displayName: "Dev User" }`. No
`getAccessToken` because dev mode doesn't talk to a backend. The seed
file declares `dev-user` in `userProfiles` and `roles`.

**Identity is set once, at construction.** No `setIdentity()` after the
fact — switching user mid-session is out of scope. If the app supports
"switch user" it tears down the ConfigManager and creates a new one.

### 3. Bootstrap flow — first-run dev

The first time a developer runs an app wired with our framework, this
is what happens end-to-end:

```
                      ┌──────────────────────────────────┐
                      │ developer runs `npm run dev`     │
                      └────────────┬─────────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────────────┐
                      │ App boots, calls                 │
                      │ createConfigManager({...})       │
                      │ + configManager.init()           │
                      └────────────┬─────────────────────┘
                                   │
                       Dexie empty?│ yes
                                   ▼
                      ┌──────────────────────────────────┐
                      │ fetch seed-config.json from      │
                      │   apps/config-service-server/    │
                      │     data/seed-config.json        │
                      │                                  │
                      │ bulk-insert into Dexie:          │
                      │   • permissions                  │
                      │   • roles                        │
                      │   • appRegistry  (e.g. TestApp)  │
                      │   • userProfiles (e.g. dev1)     │
                      └────────────┬─────────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────────────┐
                      │ ConfigManager creates an         │
                      │ AppData provider in the          │
                      │ SharedWorker, named              │
                      │   "ApplicationContext"           │
                      │ scoped by (origin, appId)        │
                      └────────────┬─────────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────────────┐
                      │ Populates ApplicationContext     │
                      │ keys from seed + AppIdentity:    │
                      │   • AppId                        │
                      │   • LoggedInUser                 │
                      │   • ImpersonatedUser  (null)     │
                      │   • LoggedInUserProfile          │
                      │       { roles, permissions }     │
                      └────────────┬─────────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────────────┐
                      │ Components in any window read    │
                      │ identity synchronously from the  │
                      │ AppData mirror — no prop         │
                      │ drilling, no context plumbing.   │
                      └──────────────────────────────────┘
```

This is what makes the framework *feel* identity-aware without
*doing* auth. The app handed us an `AppIdentity` post-login;
ConfigManager publishes it into `ApplicationContext`; every
component reads it through the AppData mirror.

### 4. ApplicationContext — the framework-owned AppData provider

Yesterday's data-services design moved AppData state into the
SharedWorker so multi-window apps see the same values. ConfigManager
is the **first writer** of one specific AppData provider —
`ApplicationContext` — and that provider is **owned by the
framework**, not the app.

```ts
// What every component in every window can read synchronously:
appData.get('AppId')                  // → "TestApp"
appData.get('LoggedInUser')           // → { userId: "dev1", displayName: "Developer" }
appData.get('ImpersonatedUser')       // → null in normal mode
appData.get('LoggedInUserProfile')    // → { roles: [...], permissions: [...] }
```

Properties to lock in:

- **Provider name is fixed:** `"ApplicationContext"`. App-defined
  AppData providers (`positions`, `orders`, etc.) live alongside it
  but never collide.
- **Scope:** SharedWorker AppData is keyed by `(origin, appId)`.
  Two different apps loaded from the same origin get two distinct
  `ApplicationContext` instances — one each.
- **Writers:** ConfigManager is the **sole writer** of
  `AppId`, `LoggedInUser`, and `LoggedInUserProfile`. Anyone (admin
  UI, impersonation menu) can write `ImpersonatedUser`, because
  that's the one runtime-mutable bit.
- **Sync read everywhere:** because reads come from the main-thread
  mirror, components never need `await`. A re-render fires when the
  mirror receives a delta broadcast.

### 5. Effective user, audit, and impersonation

Two named slots, one derived:

- `LoggedInUser` — who the app told us logged in. Never changes during
  a session. Used for **audit fields** (`createdBy`, `updatedBy` on
  every config row).
- `ImpersonatedUser` — optional override. When set, the framework
  treats this user as the **effective user** for visibility and
  entitlement (which configs you see, what permissions you have).
  When null, the effective user is `LoggedInUser`.

Helper that every consumer should use rather than reading the slots
directly:

```ts
function getEffectiveUser(ctx: ApplicationContext): UserId {
  return ctx.ImpersonatedUser?.userId ?? ctx.LoggedInUser.userId;
}
```

This lets us answer the audit question cleanly: **`createdBy` always
captures the real `LoggedInUser.userId`**, never the impersonated one.
Impersonation gives you their *view*, not their *identity in the audit
trail*. (Seasoned support engineers will recognize this — it's the
same model Stripe uses for "view as user".)

### 6. Visibility — app-scoped, with a public/private switch

Within a given `appId`, every config is visible to every authenticated
user of that app **by default**. To narrow that, every `AppConfigRow`
gets a new field:

```ts
interface AppConfigRow {
  // ...existing fields...
  isPublic: boolean;   // default: true
}
```

The visibility rule resolves to one expression every read path uses:

```
visible(row, ctx) =
  row.appId == ctx.AppId
  AND (
    row.isPublic                       // public — anyone in this app
    OR row.userId == effectiveUser(ctx) // private — only the owner
  )
```

This applies uniformly to:

- `getAllConfigs()` / `getConfigsByApp()` / `queryConfigs()`
- The REST list endpoints (server enforces it; never trust the client)
- The Dexie list paths (mirror enforcement so dev mode behaves the
  same as prod)

Roles answer (Q3a) is locked: roles drive **what you can do**
(`config:write`, `config:delete`, `admin:users`, …), the `userId` +
`isPublic` pair drives **what you can see**. Two orthogonal axes,
one entitlement layer each.

### 7. Schema cleanup — `userId` and `createdBy` collapse, mostly

Today `AppConfigRow` carries three user fields:

| Field       | Today's meaning                               |
|-------------|-----------------------------------------------|
| `userId`    | Owner of the config row                       |
| `createdBy` | Who created it                                |
| `updatedBy` | Who last modified it                          |

In 99% of cases, `userId === createdBy === updatedBy` — they're
redundant. **However**, impersonation forces us to keep two distinct
roles, even if only conceptually:

- **Owner** — drives **visibility** (the right side of the
  `isPublic OR userId == effectiveUser` rule). When Bob impersonates
  Alice and saves a private config, Alice should own it (so she can
  see it after Bob logs out). Owner = effective user at write time.
- **Audit** — drives the **paper trail** (`createdBy`, `updatedBy`).
  Writes the **real** `LoggedInUser`, never the impersonated one,
  so SecOps can answer "who actually clicked save?"

Resolution:

| Field       | Renamed / role                                                         |
|-------------|------------------------------------------------------------------------|
| `userId`    | **Owner.** Set to `effectiveUser(ctx)` on every write. Drives visibility. |
| `createdBy` | **Audit.** Set to `LoggedInUser.userId` on insert. Never updated.       |
| `updatedBy` | **Audit.** Set to `LoggedInUser.userId` on every update.                |

If the deployment doesn't use impersonation, `userId === createdBy`
on every row and the distinction is invisible. The cost of keeping
both is one extra column. The cost of collapsing them and later
adding impersonation is a schema migration. Keep both.

---

### 8. Production population — three paths, deployment chooses

In prod REST mode, the framework's `userProfile` / `roles` /
`permissions` tables are populated through any combination of:

- **a. Server-side seed at deploy.** The REST service ships a copy of
  the seed JSON; on first launch (empty DB) it bulk-inserts. Same
  contract as the dev-mode Dexie seed — same file format, same
  idempotent "skip if non-empty" guard.
- **b. Admin UI in the framework.** Extend `config-browser-react` /
  `-angular` with role/permission/userProfile CRUD. Operator path
  for day-2 changes (new hire, role rename, permission added).
- **c. JIT-from-IDP-claims.** When a request lands with a `userId`
  that doesn't exist in `userProfile`, the server creates a row using
  a deployment-supplied default policy (e.g. "every new user gets the
  `viewer` role"). Off by default — opt-in per deployment, because
  some shops require explicit provisioning.

A given deployment picks the mix:

| Deployment style                | a   | b   | c   |
|---------------------------------|-----|-----|-----|
| Locked-down enterprise (banking)| ✓   | ✓   | ✗   |
| Self-service team app           | ✓   | ✓   | ✓   |
| Dev / sandbox                   | ✓ (Dexie) | — | — |

All three sit behind the same `IAuthStorage` interface that
[`apps/config-service-server/src/storage/`](../../apps/config-service-server/src/storage/)
already exposes — so adding **c** is just another writer, not an
architectural change.

---

### 9. Storage backend — stay on SQLite (`sql.js`)

The REST service keeps its existing SQLite-via-`sql.js` implementation.
Apache Ignite is **out of scope for now** — explicitly deferred, not
chosen against. Reasoning:

- The `IConfigurationStorage` / `IAuthStorage` interface already
  abstracts the engine. Swapping in Ignite (or anything else) later is
  a new file under [`apps/config-service-server/src/storage/`](../../apps/config-service-server/src/storage/),
  not a redesign.
- SQLite + `sql.js` is single-process and embedded, but config writes
  are **rare** (a user saves a dashboard config maybe once a minute),
  reads are dominated by the **Dexie mirror on the client**, and the
  framework's hot path is "boot → fetch userProfile + roles +
  visible configs → done." A single-node SQLite handles that
  comfortably for the deployments we'll see in the next year.
- We get robust storage hardening for free instead of spending
  the energy on a second engine.

When we do revisit Ignite (or Postgres, or anything horizontal),
the open sub-questions to settle are: persistence model, KV-vs-SQL
shape per access pattern, and whether to layer continuous-query push
for live config propagation across users / machines.

---

### 10. Admin UI lives inside `apps/config-service-server`. React-only.

The multi-app admin console is **bundled into the existing REST
server**, not a separate workspace:

- One process, one port, one deployment artifact. The Express server
  serves `/api/v1/...` and the admin SPA at `/`.
- Build is a small Vite step inside `apps/config-service-server` that
  emits to `dist/admin-web/`, served by `app.use(express.static(...))`.
- Operator goes to one URL. No reverse-proxy gymnastics, no CORS
  configuration between admin app and API.

**React only.** The admin UI deliberately **does not** ship an Angular
twin — explicit exception to the project-wide React/Angular parity
rule. This is operator tooling, not a customer-facing widget; one
maintained codebase is the right cost. The parity rule still applies
everywhere else (data-services, MarketsGrid, in-app config-browser).

**Stack:** React + `@starui/design-system` tokens + shadcn primitives
+ `MarketsGrid` as the table component (Decision 12.6). All theming
is dark/light via `data-theme`, all colors resolve from `--bn-*` /
`--fi-*` tokens — same UI rules as every other React surface in the
repo.

### 11. Editor surfaces — shared UI lib + two thin wrappers

Two distinct UIs, sharing one set of screens. Three packages:

```
                    ┌────────────────────────────────────┐
                    │ @starui/config-editor-ui           │  ← dumb React
                    │ • RolesEditor                      │     components
                    │ • PermissionsEditor                │  ← consumes
                    │ • UserProfileEditor                │     ConfigClient
                    │ • AppRegistryEditor                │     interface
                    │ • RoleAssignmentMatrix             │
                    │ • PermissionMatrix (roles × perms) │
                    └────────────┬───────────────────────┘
                                 │
                ┌────────────────┴─────────────────┐
                │                                  │
   ┌────────────▼──────────────┐    ┌─────────────▼──────────────┐
   │ @starui/config-browser-    │    │ apps/config-admin-web      │
   │   react                    │    │                            │
   │ • locked to current appId  │    │ • app-selector at top      │
   │   from ApplicationContext  │    │ • served by / alongside    │
   │ • mounted inside the app   │    │   apps/config-service-     │
   │   (settings panel etc.)    │    │   server                   │
   │ • same screens, scoped     │    │ • operator-only auth gate  │
   └────────────────────────────┘    └────────────────────────────┘
```

Properties to lock in:

- **`config-editor-ui` is engine-agnostic.** Components consume the
  framework-agnostic `ConfigClient` interface — no direct Dexie
  imports, no direct REST imports. The wrapper packages decide which
  client to inject. Same screens, two backends.
- **In-app wrapper stays thin.** [`packages/react/config-browser-react/`](../../packages/react/config-browser-react/)
  becomes routing, auth-gate (`config:write`/`admin:roles`/`admin:users`
  permissions from `LoggedInUserProfile`), and "we're scoped to
  `ctx.AppId`." Nothing more.
- **Admin app is the only place `appId` is selectable.** The
  in-app wrapper hard-codes it from `ApplicationContext`. The admin
  wrapper has the dropdown.
- **Angular parity stays open.** `config-editor-ui` ships React; an
  Angular twin is a follow-up package that re-implements the same
  screens against the same `ConfigClient`. Component-level reuse is
  out of scope (different rendering models); contract-level reuse is
  not — same data, same flows, idiomatic per framework. (Matches the
  React/Angular parity rule from the data-services design.)

### 12. Editor feature scope (initial release)

**Shipped in the initial release:**

1. **Permission matrix** — roles × permissions checkbox grid. Click a
   cell to grant / revoke. Categories grouped, search across permission
   names. The centerpiece of the RBAC UX.
2. **User → role assignment** — multi-select chips on each user row
   plus a "by role" view (pick a role, see / edit who has it).
3. **Filter / sort / paginate on every list** — type-ahead search,
   column sort, paged loading. Required as soon as a real customer
   has > 50 users.
4. **Validation + referential integrity** — block saving a role with
   zero permissions; block deleting a permission still referenced by
   any role; warn when a user's roles are removed; enforce unique
   IDs across each table.
5. **Optimistic-locking on save** (#12.5) — read row at edit-start,
   send `If-Match: <updatedTime>`, server rejects if changed since.
   Prevents two operators clobbering each other.
6. **Use `MarketsGrid` as the table component everywhere** (#12.6) —
   eat our own dog food. The editors get filter / sort / paginate /
   column-config / column-resize / saved profiles for free; and the
   editors become a live demo of the grid. `config-editor-ui` takes
   a peer dependency on `@starui/widgets-react`.

**Deferred to a later pass** (decision intentional, not implicit):
audit log, diff-before-save, bulk operations, CSV/JSON
import-export, undo. Revisit after operators have used the initial
release in anger.

### 13. Existing server — keep, extend, trim. No rebuild.

`apps/config-service-server/` is already real ([app.ts](../../apps/config-service-server/src/app.ts),
~2,455 LOC across routes / services / storage). The bones are right:
Express + Helmet + CORS + compression + winston + (prod-only)
rate-limit, layered storage behind `IConfigurationStorage` /
`IAuthStorage`, full CRUD routes for all five tables, server-side seed
on first boot, graceful SIGTERM/SIGINT shutdown.

**No server UI exists today.** All editing happens through the REST
API. The multi-app admin console is the net-new app from Decision 10
(`apps/config-admin-web`).

#### Deltas to add to the server

The existing server doesn't need a redesign — it needs the
design-driven additions from earlier sections, plus a small cleanup pass:

1. **Add `isPublic` column to `appConfig`** (Decision 6). One ALTER,
   default `true`. Update `findByAppId` / `findByMultipleCriteria` to
   apply the visibility filter:
   `WHERE appId = ? AND (isPublic = 1 OR userId = ?)`.
2. **Add optimistic locking** (Decision 12.5). Update endpoints accept
   `If-Match: <updatedTime>`; reject with 412 Precondition Failed if the
   row's stored `updatedTime` doesn't match. One conditional in
   `update()`.
3. **Auth on endpoints** (deferred; see Decision 16). Verify the
   `Authorization: Bearer` token the framework sends from
   `AppIdentity.getAccessToken()`. The boundary itself is
   straightforward (middleware reads the token, attaches `req.userId`,
   downstream handlers use it). IDP wiring is a follow-up decision.

#### Trim pass — make it simple, drop dead weight

- **Remove the MongoDB stub.** [`StorageFactory.ts:20`](../../apps/config-service-server/src/storage/StorageFactory.ts#L20)
  throws "MongoDB storage not yet implemented" and `mongodb` is in
  `package.json` as a dep but never imported. Drop the dep, drop the
  stub, drop the env-var branching. If we revisit horizontal storage
  later (Q5), it's a clean addition behind the same interface, not a
  half-finished branch in `master`.
- **Pick one canonical row type.** Server uses `UnifiedConfig` from
  `@starui/shared-types`; client uses `AppConfigRow` from
  `@starui/config-service`. They describe the same row. Settle on
  `AppConfigRow` everywhere (or rename both to one new name — the
  point is *one* name) so cross-stack diff reads cleanly.
- **Type-only re-exports.** Once the row type is unified, `client.ts`
  in `@starui/config-service` already proxies the interface — keep
  doing that. No duplicate definitions.

That's the entire server-side scope for this work. Auth-on-endpoints
and any backup / migration / observability hardening (see Decision 16)
come in a follow-up pass.

### 14. Public surface — host wiring fits in ≤10 lines

The single hardest constraint on this design: a developer integrating
config-service into a new app writes **at most ~10 lines** of bootstrap.
Everything beyond that goes inside the framework. Two adapter packages
ship alongside `@starui/config-service` to make this true:

```
                 ┌────────────────────────────────────────┐
                 │ @starui/config-service                 │
                 │ • createConfigManager()                │  ← framework-agnostic
                 │ • createConfigServiceStorage()          │     core (vanilla TS)
                 │ • ConfigClient interface               │
                 └────────────┬───────────────────────────┘
                              │
            ┌─────────────────┴────────────────┐
            │                                  │
   ┌────────▼─────────────────┐    ┌──────────▼──────────────────┐
   │ @starui/config-service-   │    │ @starui/config-service-      │
   │   react                   │    │   angular                    │
   │ • <ConfigServiceProvider>│    │ • provideConfigService()     │
   │ • useConfigService()      │    │ • inject(ConfigService)      │
   └───────────────────────────┘    └──────────────────────────────┘
```

#### React — target wiring (8 lines)

```tsx
import { ConfigServiceProvider, useConfigService } from '@starui/config-service-react';

<ConfigServiceProvider
  identity={{ userId: session.user.sub, getAccessToken: () => session.token }}
  seedUrl="/seed-config.json"
  restUrl={import.meta.env.VITE_CONFIG_SERVICE_URL}>
  <App />
</ConfigServiceProvider>

// Inside any component:
const { storage, appId, userId } = useConfigService();
```

#### Angular — target wiring (10 lines)

```ts
import { provideConfigService } from '@starui/config-service-angular';

bootstrapApplication(App, {
  providers: [provideConfigService({
    identity: { userId: session.user.sub, getAccessToken: () => session.token },
    seedUrl: '/seed-config.json',
    restUrl: env.CONFIG_SERVICE_URL,
  })],
});

// Inside any component:
const cs = inject(ConfigServiceClient);
```

What the Provider hides for the consumer (this is the entire reason
the package exists):

- Constructing `ConfigManager`, calling `init()`, and disposing on
  unmount.
- Awaiting the seed-from-empty-Dexie pass before children render.
- Publishing `AppId` / `LoggedInUser` / `LoggedInUserProfile` into
  `ApplicationContext` AppData.
- Creating the `StorageAdapterFactory` and memoising it on
  `configManager`.
- Surfacing init errors as a documented Suspense / error boundary
  signal so hosts don't roll their own loading UI.

The hook returns one object: `{ configManager, storage, appId,
userId, applicationContext }`. The host destructures whatever it
needs; nothing else is exposed.

This is the same pattern as `<DataServicesProvider>` /
`provideDataServices()` from yesterday's data-services design —
parallel React/Angular adapters over a vanilla-TS core, identical
contract, idiomatic per framework.

### 15. How config-service plugs into `<MarketsGrid>`

The grid is intentionally storage-agnostic — it talks to a
`StorageAdapter` interface (in
[`packages/shared/core/src/persistence/StorageAdapter.ts`](../../packages/shared/core/src/persistence/StorageAdapter.ts)),
and config-service ships a *factory* that produces an adapter wired to
itself. There are three ways the grid can end up with an adapter, and a
clear precedence between them.

#### The wiring path (the path real apps use)

```ts
// 1. Boot ConfigManager once, app-wide.
const configManager = createConfigManager({
  seedConfigUrl: '/seed-config.json',
  configServiceRestUrl: import.meta.env.VITE_CONFIG_SERVICE_URL,
});
await configManager.init();

// 2. Build a storage factory closed over the manager.
const storage = createConfigServiceStorage({ configManager });

// 3. Hand it to every MarketsGrid in the app.
<MarketsGrid
  storage={storage}     // the factory — closed over configManager
  appId="TestApp"        // required when storage is set
  userId="dev1"          // required when storage is set
  gridId="demo-blotter"
  ...
/>
```

The `storage` prop is a **factory**, not an adapter, so the same
`storage` value is reused across many grids without `useMemo` churn.
The grid internally calls
`storage({ instanceId: gridId, appId, userId })` and gets a per-instance
adapter. Each grid's profiles (and `gridLevelData` blob) live in one
`AppConfigRow` keyed by that `(appId, userId, instanceId)` triple — see
[`profileStorage.ts`](../../packages/shared/config-service/src/profileStorage.ts)
for the row layout.

#### Precedence — three sources, one resolved adapter

[`packages/react/markets-grid/src/MarketsGrid.tsx`](../../packages/react/markets-grid/src/MarketsGrid.tsx#L218)
makes the resolution explicit:

```ts
// Storage precedence: factory > direct adapter > MemoryAdapter default.
const resolvedAdapter = useMemo(() => {
  if (storage)        return storage({ instanceId, appId, userId });
  return storageAdapter as StorageAdapter | undefined;
}, ...);
// later:
adapterRef.current = storageAdapter ?? new MemoryAdapter();
```

| Source                | Use case                                       |
|-----------------------|------------------------------------------------|
| `storage` factory     | Real apps. Wired through ConfigService.        |
| `storageAdapter` prop | Tests / legacy hosts holding a single adapter. |
| `MemoryAdapter`       | Silent fallback. **Lost on reload.**           |

#### When storage is set, appId + userId are mandatory

[`MarketsGrid.tsx`](../../packages/react/markets-grid/src/MarketsGrid.tsx#L209)
enforces this with a startup invariant:

```ts
if (storage && (!appId || !userId)) {
  throw new Error(
    '<MarketsGrid storage={...}> requires `appId` and `userId` props. ' +
    'without both identities the factory cannot produce a correctly-scoped adapter.'
  );
}
```

The factory needs all three (`instanceId`, `appId`, `userId`) to
build a row-key. Forgetting one is a hard error, not a silent
fall-through — different users would otherwise share rows.

#### What happens **without** config-service

If a developer wires `<MarketsGrid>` and **omits** the `storage` prop
entirely (no factory, no direct `storageAdapter`):

1. **No startup error.** The grid silently falls through to
   `new MemoryAdapter()` — see
   [`MarketsGrid.tsx:371`](../../packages/react/markets-grid/src/MarketsGrid.tsx#L371) and
   [`MemoryAdapter`](../../packages/shared/core/src/persistence/MemoryAdapter.ts).
2. **Profiles work for the session.** Save / switch / delete profiles,
   change column layout, edit the caption — all in-memory. The grid
   feels normal.
3. **Nothing persists.** Reload the page = back to defaults. No
   IndexedDB row, no REST call, no `AppConfigRow`. ConfigBrowser
   sees nothing because nothing was written.
4. **No `ApplicationContext`.** Without a ConfigManager, there's no
   `LoggedInUser` / `LoggedInUserProfile` AppData published. Components
   that read from `ApplicationContext` get empty mirrors.

This is the **right** default for prototypes, demos, and tests — the
grid never blocks on persistence configuration. But it's a footgun in
production: a developer who forgets to wire ConfigService gets a grid
that *appears* to work for one session and quietly forgets everything
on reload. We should make this discoverable, not silent — see follow-up.

#### Follow-up — make "no persistence" loud in dev

Recommend adding a one-time `console.warn` from `MarketsGrid` when it
falls back to `MemoryAdapter` *and* `process.env.NODE_ENV !==
'production'`:

> `[MarketsGrid] No storage prop provided. Using in-memory storage —
> profiles, layouts and grid-level-data WILL be lost on reload. Wire
> @starui/config-service via createConfigServiceStorage(...) to
> persist.`

Production builds stay quiet (the fallback is a legitimate choice for
embedded uses). The dev warning saves the half-day of "why aren't my
profiles saving" debugging that every new framework consumer hits
exactly once.

### 16. Robustness & scale on the SQLite tier — deferred

The server already has the cheap robustness wins:

- Graceful shutdown via SIGTERM/SIGINT ([app.ts:154](../../apps/config-service-server/src/app.ts#L154))
- Structured request logging via winston
- Production rate-limit (100 req / 15 min / IP) via `express-rate-limit`
- Health check at `/health`

What's **not** in the initial release and is consciously deferred:

- Multi-process write contention (today's deployment is single-process)
- Backup / restore strategy (the `.sqlite` file *is* the artifact today)
- Migration framework (`isPublic` will be the first migration; we'll
  do it as a one-off ALTER and revisit a real migration tool the next
  time we add a column)
- Slow-query trace / metrics
- Token auth on REST endpoints (Decision 13 delta #3)
- Apache Ignite as a horizontal storage backend (engine swap behind
  the existing `IConfigurationStorage` interface; not a redesign)

These get a follow-up pass once we ship and have telemetry on what
actually hurts. "Simple and nimble" overrides "complete."

---

## Naming / structure work to fold in later

- The dual `ConfigManager` / `ConfigClient` surface is a smell — pick
  one canonical API. (Same pattern that yesterday's data-services
  redesign applied to `data-plane`.)
- The `isTemplate` + `isRegisteredComponent` legacy split should be
  collapsed once we re-examine the schema.

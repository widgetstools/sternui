# Config Manager Redesign — Session Breakdown

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan session-by-session.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Source design:** [`config-manager-redesign.md`](./config-manager-redesign.md) — read it
once before starting; this document does not repeat the *why*, only the *how* and the
*ordering*.

**Goal:** Land the 16-decision config-manager redesign as a sequence of small, mergeable
sessions, each green on its own, without breaking any existing feature, behavior, or UI
in the framework or its consumers (`markets-ui-react-reference`, `demo-react`,
`demo-configservice-react`, `openfin-platform/workspacePersistence`,
`config-browser-react`, `config-browser-angular`).

**Architecture:** Additive everywhere it can be additive. Every session leaves the public
API of `@starui/config-service` strictly bigger, never smaller, until the very last
session collapses the `ConfigManager` / `ConfigClient` duplication. Existing call sites
keep compiling and behaving identically through Sessions 1–15.

**Tech stack:** TypeScript, Vitest 4, Dexie 4 (client), Express + better-sqlite3 / sql.js
(server), React 19 + shadcn (admin UI), Angular 21 + PrimeNG (parity follow-up). npm
workspaces, Turbo 2.

---

## Cross-cutting rules (apply to every session)

1. **Backward compatibility is mandatory** until Session 16. Every existing call site
   compiles unchanged at the end of every session. New optional fields default to
   pre-redesign behavior.
2. **Preserve look and feel.** Existing UIs (`config-browser-react`, dock menus, settings
   panel, MarketsGrid toolbar) render byte-identically to before. Visual changes ship in
   the editor sessions (12–14) only.
3. **Tests stay green.** `npx turbo test typecheck build` passes at the end of every
   session. The Vitest baseline (currently 653 passing per CLAUDE.md) is the floor —
   sessions add tests, never remove or skip them.
4. **Follow the project rules.**
   - npm workspaces only, install with `npm ci --legacy-peer-deps`.
   - One file per primary export, filename matches export case (CLAUDE.md naming rule).
   - shadcn primitives in React UI. PrimeNG primitives in Angular UI. Design-system tokens.
   - Update [`docs/IMPLEMENTED_FEATURES.md`](../../IMPLEMENTED_FEATURES.md) in the same
     commit as the feature change.
   - Conventional commit prefix per package (`feat(config-service): …`, etc.) and the
     `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
5. **No versioned paths.** No `v1/`, `v2/`, `legacy/`. Superseded code is deleted in the
   same change as its replacement.
6. **Verify before claim.** Each session ends with the exact verification commands run.
   Don't claim done until they go green.

---

## Session map

| #  | Title                                                  | Depends on   | Risk |
|----|--------------------------------------------------------|--------------|------|
| 1  | Schema additions — `isPublic` field, additive          | —            | low  |
| 2  | `AppIdentity` contract — wire option, no behavior      | —            | low  |
| 3  | Owner / audit field split on write paths               | 1, 2         | med  |
| 4  | Visibility filter — Dexie/client-side reads            | 1, 3         | med  |
| 5  | Server: `isPublic` + visibility + trim cleanups        | 1, 4         | med  |
| 6  | Optimistic locking — server `If-Match` + client retry  | 5            | med  |
| 7  | `ApplicationContext` — first writer into AppData       | 2            | med  |
| 8  | Impersonation slot + `getEffectiveUser` helper         | 3, 7         | med  |
| 9  | `@starui/config-service-react` Provider package        | 7            | med  |
| 10 | `@starui/config-service-angular` provider package      | 7            | med  |
| 11 | MarketsGrid: dev-mode warning on MemoryAdapter         | —            | low  |
| 12 | `@starui/config-editor-ui` skeleton + four list editors| 9            | high |
| 13 | Permission matrix + role-assignment matrix             | 12           | high |
| 14 | List polish: filter/sort/paginate + validation + locking | 6, 12, 13  | high |
| 15 | `apps/config-admin-web` bundled inside config server   | 12, 13, 14   | high |
| 16 | Cleanup: collapse `ConfigManager` / `ConfigClient` and `isTemplate` / `isRegisteredComponent` | 15 | med |

Sessions 9 and 10 can run in parallel after 7. Session 11 is independent. Everything else
is serial.

---

## Session 1 — Schema additions: `isPublic` field, additive only

**Maps to design Decisions:** 6, 7 (groundwork only — write/read paths come later).

**Goal:** Land the `isPublic: boolean` column on `AppConfigRow` with a default of `true`
on every existing row, plus document the owner/audit split, **without touching write or
read paths**. After this session every existing row reads back with `isPublic === true`
and every existing test passes unchanged.

**Files:**
- Modify: [`packages/shared/services/config-service/src/types.ts`](../../packages/shared/services/config-service/src/types.ts) — add `isPublic` to `AppConfigRow`, document owner/audit roles in JSDoc.
- Modify: [`packages/shared/services/config-service/src/db.ts`](../../packages/shared/services/config-service/src/db.ts) — bump Dexie schema version, add `isPublic` to the `appConfig` index list, attach a one-shot upgrade that backfills `true` on existing rows.
- Modify: [`packages/shared/services/config-service/src/profileStorage.ts`](../../packages/shared/services/config-service/src/profileStorage.ts) — when constructing a row, default `isPublic: true` so new writes carry the field.
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — `saveSnapshot` constructs an `AppConfigRow`; default `isPublic: true` there too.
- Test: `packages/shared/services/config-service/src/db.upgrade.test.ts` (new) — open old-schema DB, verify upgrade backfills `isPublic`.
- Test: `packages/shared/services/config-service/src/profileStorage.identity.test.ts` (extend) — assert new rows carry `isPublic: true`.

**Steps:**

- [x] **1.1** Add `isPublic: boolean` to `AppConfigRow` in `types.ts`, with JSDoc
      explaining: "Public (default true) — visible to every user of this app. Private
      (false) — visible only to the row's `userId` (owner). See Decision 6 in the design
      doc."
- [x] **1.2** In the same JSDoc block, document the owner/audit role split (Decision 7):
      "`userId` = owner (drives visibility). `createdBy`/`updatedBy` = audit (real
      logged-in user). See Session 3 of the redesign sessions plan." Do **not** change
      semantics yet — just document.
- [x] **1.3** In `db.ts`, locate the current `version(N).stores({...})` call. Bump to
      `version(N+1)`, add `isPublic` to the appConfig index spec only if you want it
      indexed (we don't need to — the visibility filter runs in JS). Attach a `.upgrade`
      callback that iterates `appConfig` and sets `isPublic = true` on every row that has
      `isPublic === undefined`.
- [x] **1.4** In `profileStorage.ts`, when building an `AppConfigRow` to save (the
      `gridLevelData`/profiles wrapper), spread `isPublic: true` into the constructed
      object.
- [x] **1.5** In `ConfigManager.saveSnapshot`, set `isPublic: true` on the constructed
      row.
- [x] **1.6** Write `db.upgrade.test.ts`: in `beforeEach`, open a Dexie DB at the old
      version, insert a row without `isPublic`, close it. Re-open at the new version,
      read the row, assert `isPublic === true`. Use a unique DB name per test to avoid
      cross-test bleed.
- [x] **1.7** Extend `profileStorage.identity.test.ts` (or add a new co-located test) to
      assert that a freshly-written row has `isPublic === true`.
- [x] **1.8** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service
npx turbo typecheck build
```

Expected: all tests pass. New tests added.

**Rollback / safety:**
- The schema upgrade is a one-way Dexie migration. If you need to revert, you must also
  revert the Dexie version bump (users would get a "downgrade" error). Roll back the
  whole commit if needed; the upgrade is idempotent and safe to re-run.
- No existing code paths read or write `isPublic` after this session, so visible behavior
  is unchanged.

**Acceptance:** Every existing test passes. New rows have `isPublic: true`. Upgrading a
DB written by the old schema fills `isPublic: true` on every existing row.

**Commit:** `feat(config-service): add isPublic field with default-true backfill`

---

## Session 2 — `AppIdentity` contract: wire option, no behavior change

**Maps to design Decisions:** 1, 2.

**Goal:** Define the `AppIdentity` interface, plumb `identity` and `appId` into
`ConfigManagerOptions`, and have `ConfigManager` store them. **No call site is required
to pass them yet** — both options default to dev placeholders that match today's
behavior. This session unblocks Sessions 3 and 7 without breaking any consumer.

**Files:**
- Modify: [`packages/shared/services/config-service/src/types.ts`](../../packages/shared/services/config-service/src/types.ts) — add `AppIdentity` and `appId`/`identity` options.
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — store `appId` and `identity`, with dev defaults.
- Modify: [`packages/shared/services/config-service/src/index.ts`](../../packages/shared/services/config-service/src/index.ts) — re-export `AppIdentity`.
- Test: `packages/shared/services/config-service/src/configManager.identity.test.ts` (new).

**Steps:**

- [x] **2.1** Add to `types.ts`:

```ts
export interface AppIdentity {
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

- [x] **2.2** Extend `ConfigManagerOptions`:

```ts
export interface ConfigManagerOptions {
  // ...existing fields...

  /**
   * The app this ConfigManager belongs to. Becomes the value of
   * AppData "AppId" in ApplicationContext (Session 7).
   * Defaults to "dev-app" if omitted.
   */
  appId?: string;

  /**
   * Authenticated identity supplied by the host app after sign-in.
   * Defaults to { userId: "dev-user", displayName: "Dev User" } if omitted.
   * See AppIdentity JSDoc.
   */
  identity?: AppIdentity;
}
```

- [x] **2.3** In `ConfigManager` constructor, resolve defaults and store:

```ts
this.appId = options.appId ?? "dev-app";
this.identity = options.identity ?? { userId: "dev-user", displayName: "Dev User" };
```

  Add `private readonly appId: string;` and `private readonly identity: AppIdentity;`
  fields. Expose two read-only accessors:

```ts
getAppId(): string { return this.appId; }
getIdentity(): AppIdentity { return this.identity; }
```

- [x] **2.4** Re-export `AppIdentity` from the package barrel `index.ts`.
- [x] **2.5** Write `configManager.identity.test.ts`:
  - `createConfigManager()` with no options → `getIdentity().userId === "dev-user"`,
    `getAppId() === "dev-app"`.
  - With explicit options → values returned verbatim.
- [x] **2.6** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service
npx turbo typecheck build
```

**Acceptance:** New surface exposed, no existing call site needs to change, all tests
pass. `getAccessToken` is **not yet** wired into `syncToRest` (Session 6 does that with
optimistic locking).

**Commit:** `feat(config-service): add AppIdentity option with dev defaults`

---

## Session 3 — Owner / audit field split on write paths

**Maps to design Decision:** 7.

**Goal:** Make every write through `ConfigManager` stamp `userId` (owner),
`createdBy`/`updatedBy` (audit) consistently from the stored `AppIdentity`. Until Session
8 lands impersonation, owner === audit on every row, so behavior is identical to today.
The point of this session is to centralize the stamping in one place so Session 8 only
needs to touch one branch.

**Files:**
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — refactor `saveConfig`, `saveSnapshot`, `saveAppRegistry`, `saveUserProfile`, `saveRole`, `savePermission` to stamp identity.
- Modify: [`packages/shared/services/config-service/src/profileStorage.ts`](../../packages/shared/services/config-service/src/profileStorage.ts) — drop hard-coded user fields where they exist; rely on ConfigManager stamping.
- Test: `packages/shared/services/config-service/src/configManager.audit.test.ts` (new).

**Steps:**

- [x] **3.1** Add a private helper to `ConfigManager`:

```ts
private stampWrite<T extends { userId?: string; createdBy?: string; updatedBy?: string;
  creationTime?: string; updatedTime?: string; }>(row: T, isInsert: boolean): T {
  const userId = this.identity.userId;
  const now = new Date().toISOString();
  if (isInsert) {
    row.userId    = row.userId    ?? userId;
    row.createdBy = row.createdBy ?? userId;
    row.creationTime = row.creationTime ?? now;
  }
  row.updatedBy   = userId;
  row.updatedTime = now;
  return row;
}
```

  In Session 8 the `userId` line becomes `getEffectiveUser(this.applicationContext)`;
  `createdBy`/`updatedBy` stay on the real logged-in user. The shape stays the same.

- [x] **3.2** Refactor `saveConfig` to call `stampWrite` instead of mutating
      `updatedTime` directly. Detect insert-vs-update by checking
      `await this.db.appConfig.get(row.configId)` first (one extra read on the write
      path; acceptable — config writes are rare).
- [x] **3.3** Apply the same pattern to `saveAppRegistry`, `saveUserProfile`, `saveRole`,
      `savePermission`. (Roles/permissions don't conceptually have a "user owner" but
      audit fields still apply — add `createdBy`/`updatedBy`/`creationTime`/`updatedTime`
      fields to those types if they don't already have them, defaulting to the schema's
      pre-existing shape so storage round-trips unchanged.)
- [x] **3.4** In `saveSnapshot`, drop the `userId: "system"` / `createdBy: "system"`
      hard-coding — let `stampWrite` set them. The snapshot's owner is then whoever
      saved it. (This is a small behavior change for snapshots: their `userId` becomes
      the saving user instead of `"system"`. Verify no consumer depends on the literal
      `"system"` — `grep -rn '"system"' packages/shared/platform/openfin-platform/src/`
      and adjust.)
- [x] **3.5** Write `configManager.audit.test.ts`:
  - Insert a config: `userId === createdBy === updatedBy === identity.userId`,
    `creationTime === updatedTime`.
  - Update the same config: `createdBy` unchanged, `updatedBy` updated, `updatedTime`
    advanced past `creationTime`.
- [x] **3.6** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service
npx turbo test --filter=@starui/openfin-platform
npx turbo typecheck build
```

**Acceptance:** Audit fields stamped from `AppIdentity.userId` on every write. No call
site changes. `openfin-platform` workspace persistence tests still pass (snapshots flow
through).

**Commit:** `feat(config-service): centralize owner/audit field stamping on writes`

---

## Session 4 — Visibility filter: Dexie/client-side reads

**Maps to design Decision:** 6.

**Goal:** Apply the visibility predicate
`row.appId === ctx.AppId AND (row.isPublic OR row.userId === effectiveUser)` to every
client-side `appConfig` list path. Until Session 8 lands `effectiveUser`,
`effectiveUser === identity.userId`. Since every existing row has `isPublic: true` (from
Session 1's backfill), every existing read returns the same set as before this session.

**Files:**
- Create: `packages/shared/services/config-service/src/visibility.ts` — pure predicate.
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — apply predicate in `getAllConfigs`, `getConfigsByApp`, `getConfigsByUser`, `getTemplates`, and the snapshot getters.
- Test: `packages/shared/services/config-service/src/visibility.test.ts` (new).
- Test: `packages/shared/services/config-service/src/configManager.visibility.test.ts` (new).

**Steps:**

- [x] **4.1** Create `visibility.ts`:

```ts
import type { AppConfigRow } from "./types";

export interface VisibilityContext {
  appId: string;
  effectiveUserId: string;
}

export function isVisible(row: AppConfigRow, ctx: VisibilityContext): boolean {
  if (row.appId !== ctx.appId) return false;
  if (row.isPublic) return true;
  return row.userId === ctx.effectiveUserId;
}
```

- [x] **4.2** In `ConfigManager`, add a private helper:

```ts
private get visibilityContext(): VisibilityContext {
  return { appId: this.appId, effectiveUserId: this.identity.userId };
}
```

  (Session 8 swaps the `effectiveUserId` source to `getEffectiveUser(...)`.)

- [x] **4.3** Apply the filter in `getAllConfigs`, `getConfigsByApp`, `getConfigsByUser`,
      `getTemplates`, `getLatestSnapshot`, and the workspace-snapshot listing path.
      Example:

```ts
async getConfigsByApp(appId: string): Promise<AppConfigRow[]> {
  const rows = await this.db.appConfig.where("appId").equals(appId).toArray();
  return rows.filter(r => isVisible(r, this.visibilityContext));
}
```

- [x] **4.4** Add an opt-out for admin / debug paths: `getAllConfigsUnfiltered()` returns
      every row regardless. The `config-browser-react` admin view will need this in
      Session 12 to show every row to operators. (Also added `getConfigsByUserUnfiltered`
      and `getConfigsByAppUnfiltered`; switched openfin-platform admin paths and the
      platform-global DataProvider/AppData stores in `@starui/data-services` to use the
      unfiltered variants.)
- [x] **4.5** Write `visibility.test.ts` covering the matrix:

| `row.appId` | `row.isPublic` | `row.userId` | `ctx.appId` | `ctx.effectiveUserId` | visible? |
|-------------|----------------|--------------|-------------|-----------------------|----------|
| "A"         | true           | "alice"      | "A"         | "alice"               | true     |
| "A"         | true           | "alice"      | "A"         | "bob"                 | true     |
| "A"         | false          | "alice"      | "A"         | "alice"               | true     |
| "A"         | false          | "alice"      | "A"         | "bob"                 | false    |
| "A"         | true           | "alice"      | "B"         | "alice"               | false    |

- [x] **4.6** Write `configManager.visibility.test.ts`: insert public + private rows
      under different users, assert each list method returns the correct subset.
- [x] **4.7** Run verification, including a smoke run of `markets-ui-react-reference`
      dev server to confirm the existing UI still renders configs.
      (Full repo `npx turbo test typecheck build` green: 33 test packages pass,
      including the openfin-platform integration tests; the dev-server smoke is
      a manual ctrl-C step left to the operator.)

**Verification:**

```bash
npx turbo test --filter=@starui/config-service
npx turbo typecheck build
# Smoke:
npm --workspace apps/markets-ui-react-reference run dev   # ctrl-C after grid renders
```

**Acceptance:** Existing rows (all `isPublic: true`) are returned identically. Newly
inserted private rows owned by a different user are filtered out.

**Commit:** `feat(config-service): apply visibility filter to read paths`

---

## Session 5 — Server: `isPublic` + visibility + trim cleanups

**Maps to design Decisions:** 6, 13 (deltas 1 and trim pass).

**Goal:** Mirror Sessions 1 and 4 on the server. Plus the trim pass: drop the MongoDB
stub, settle on one canonical row type. Auth-on-endpoints stays deferred (Decision 16).

**Files:**
- Modify: [`apps/config-service-server/src/storage/SqliteStorage.ts`](../../apps/config-service-server/src/storage/SqliteStorage.ts) — schema migration adds `isPublic`, list queries apply visibility filter.
- Modify: [`apps/config-service-server/src/storage/StorageFactory.ts`](../../apps/config-service-server/src/storage/StorageFactory.ts) — drop the MongoDB throw branch.
- Modify: [`apps/config-service-server/package.json`](../../apps/config-service-server/package.json) — drop `mongodb` dep.
- Modify: [`apps/config-service-server/src/routes/`](../../apps/config-service-server/src/routes/) — list endpoints accept `userId` query param; pass through to storage.
- Modify: [`packages/shared/foundation/shared-types/`](../../packages/shared/foundation/shared-types/) — pick canonical row type (rename `UnifiedConfig` → re-export of `AppConfigRow`, or vice versa per design).
- Test: `apps/config-service-server/src/storage/SqliteStorage.visibility.test.ts` (new).

**Steps:**

- [x] **5.1** Locate the SqliteStorage schema initializer. Add an `isPublic INTEGER NOT
      NULL DEFAULT 1` column to the `configurations` table CREATE; add an idempotent
      migration block — on connect, run `PRAGMA table_info(configurations)` and
      `ALTER TABLE … ADD COLUMN isPublic INTEGER NOT NULL DEFAULT 1` only when the
      column is missing. (Note: actual table is `configurations`, not `appConfig`.)
- [x] **5.2** In `buildWhereClause`, append `AND (isPublic = 1 OR userId = ?)` whenever
      `criteria.effectiveUserId` is set. `findByAppId`, `findByUserId`, and
      `findByComponentType` gained an optional trailing `effectiveUserId` arg and forward
      it through `findByMultipleCriteria`. Unfiltered admin paths simply omit the field.
- [x] **5.3** List route handlers read `?userId=...` (caller's effective user) and pass
      it through to storage as `effectiveUserId`, defaulting to `"anonymous"` (sees only
      public rows) when absent. `/by-user/:userId` reads `?effectiveUserId=...` (or falls
      back to `?userId=...` query) so the path-vs-caller userId is unambiguous.
      `effectiveUserIdFromQuery` JSDoc warns that this is a placeholder until Decision
      16 (auth on endpoints) is implemented.
- [x] **5.4** MongoDB stub dropped: `mongodb` removed from `package.json`, the
      `case "mongodb"` branch removed from `StorageFactory.ts`, the `DATABASE_TYPE` /
      `MONGODB_URI` env-var branching removed from `StorageFactory`, `server.ts`, and
      `.env.example`. `npm ci --legacy-peer-deps` re-installed cleanly.
- [x] **5.5** Canonical row type lands in `@starui/shared-types` as `AppConfigRow` (with
      the new `isPublic?: boolean` field); `UnifiedConfig` becomes a `@deprecated type
      UnifiedConfig = AppConfigRow` alias for one release. Server src is fully on the new
      name (`storage/`, `services/`, `routes/`, `utils/validation.ts` — `unifiedConfigSchema`
      kept as a deprecated alias of the new `appConfigRowSchema`). Other consumers
      (`data-services`, `widget-sdk`, etc.) keep compiling unchanged via the alias and
      will migrate over future sessions.
- [x] **5.6** `SqliteStorage.visibility.test.ts` (6 tests) covers `isPublic` round-trip,
      `findByAppId` unfiltered (admin) vs filtered (alice/bob/anonymous),
      `findByMultipleCriteria` honoring `effectiveUserId`, legacy rows normalising to
      public on read, and cross-app exclusion. New `SqliteStorage.migration.test.ts`
      (2 tests) covers the idempotent column-add migration.
- [x] **5.7** No existing server-side test files referenced `UnifiedConfig` — the
      package shipped without tests prior to this session, so the search-and-replace
      step had no targets. New tests use `AppConfigRow` directly.
- [x] **5.8** Run verification — green. Tests: 8 server tests pass; full repo
      `npx turbo typecheck build test` shows 33 packages green. Smoke: empty DB starts,
      schema migrates, public/private rows created via REST, visibility filter narrows
      `?userId=...` correctly across alice/bob/anonymous.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service-server
npx turbo typecheck build
# Smoke: start the server fresh against an empty DB file
rm -f apps/config-service-server/data/test-isolation.sqlite
npm --workspace apps/config-service-server run dev &
sleep 2
curl -s "http://localhost:5174/api/v1/configs?appId=TestApp&userId=dev-user" | jq .
kill %1
```

**Acceptance:** Server starts cleanly, schema migrates, list endpoints filter by
visibility, MongoDB stub gone, one canonical row type name.

**Commit:** `feat(config-server): add isPublic column + visibility filter; drop mongodb stub`

---

## Session 6 — Optimistic locking: server `If-Match` + client retry

**Maps to design Decisions:** 12.5, 13 (delta 2).

**Goal:** Prevent two operators clobbering each other on a concurrent edit. Server
rejects update with HTTP 412 if the row's stored `updatedTime` doesn't match the
caller's `If-Match` header. Client surfaces 412 as a typed, recoverable error so the
editor UI (Session 14) can show a "row changed, reload?" banner.

**Files:**
- Modify: [`apps/config-service-server/src/routes/`](../../apps/config-service-server/src/routes/) — add If-Match handling to PUT update routes.
- Modify: [`apps/config-service-server/src/storage/SqliteStorage.ts`](../../apps/config-service-server/src/storage/SqliteStorage.ts) — `update(id, row, expectedUpdatedTime?)`.
- Modify: [`packages/shared/services/config-service/src/client.ts`](../../packages/shared/services/config-service/src/client.ts) — `RestConfigClient` sends If-Match, surfaces 412 as `OptimisticLockError`.
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — pass through `expectedUpdatedTime` on update; in REST mode include header.
- Test: `apps/config-service-server/src/routes/configs.optimisticlock.test.ts` (new).
- Test: `packages/shared/services/config-service/src/client.optimisticlock.test.ts` (new).

**Steps:**

- [x] **6.1** Define `OptimisticLockError` in `client.ts`:

```ts
export class OptimisticLockError extends Error {
  constructor(public readonly currentRow: AppConfigRow | undefined) {
    super("Row changed since edit began");
    this.name = "OptimisticLockError";
  }
}
```

- [x] **6.2** Implemented as a typed throw rather than a sentinel: `SqliteStorage.update`
      gains an optional `expectedUpdatedTime` and throws a new
      `OptimisticLockMismatchError` (carrying the current row) when the value mismatches.
      The route catches this and translates it to HTTP 412 — same caller-facing contract
      as the sentinel, with no return-type change for the no-locking path.
- [x] **6.3** Server route: read `req.header("If-Match")`. If present, pass to storage.
      On mismatch, respond `412 Precondition Failed` with the current row body and an
      `ETag: <updatedTime>` response header. On match, respond as today.
- [x] **6.4** `RestConfigClient.updateConfig` accepts an optional `UpdateConfigOptions`
      with `expectedUpdatedTime` and includes `If-Match` when set. The shared `request()`
      helper detects 412, parses the response body as the current row, and throws
      `OptimisticLockError(currentRow)` ahead of the generic HTTP-error branch.
- [x] **6.5** `ConfigManager.saveConfig` gains an optional second `SaveConfigOptions` arg
      with `expectedUpdatedTime`. Today no caller passes it (default behavior unchanged);
      the editor UI in Session 14 will. Local mode performs the same compare-then-write
      against Dexie; REST mode forwards the value as `If-Match` through `syncToRest`.
- [x] **6.6** `AppIdentity.getAccessToken` is now consulted on every outbound REST call —
      `RestConfigClient.request`, `ConfigManager.syncToRest`, and `drainPendingSync`. The
      framework awaits the token and attaches `Authorization: Bearer <token>` when the
      host supplied one. Server-side verification stays deferred (Decision 16).
      `createConfigClient` accepts the identity and forwards it through to the REST
      client (or to a fresh `ConfigManager` in local mode).
- [x] **6.7** Tests:
  - Server: `apps/config-service-server/src/routes/configurations.optimisticlock.test.ts`
    (4 tests, supertest) — PUT without If-Match writes through with `ETag`; PUT with
    matching If-Match writes through; PUT with stale If-Match returns 412 + current row +
    `ETag`; missing configId returns 404 even with If-Match.
  - Client: `client.optimisticlock.test.ts` (6 tests) — header omitted by default, sent
    when option provided, 412 → `OptimisticLockError`, non-412 stays
    `ConfigClientHttpError`, `Authorization` header attached / omitted based on identity.
  - ConfigManager (local + REST): `configManager.optimisticlock.test.ts` (5 tests) covers
    last-write-wins default, matching/stale expected-time, REST `If-Match` + Bearer
    plumbing, and 412 surfaced as `OptimisticLockError` rather than queued for retry.
- [x] **6.8** Run verification — green. Server: 12 tests pass (8 storage + 4 routes).
      Config-service: 53 tests pass across 8 files. Full repo `npx turbo typecheck build`
      passes (54 tasks, 19 cached). `npx turbo test` reports 33 successful packages.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service-server --filter=@starui/config-service
npx turbo typecheck build
```

**Acceptance:** 412 path works end-to-end. `getAccessToken` is consulted on every
outbound REST call when present. Existing call sites (none of which pass
`expectedUpdatedTime`) keep working unchanged.

**Commit:** `feat(config-service): add optimistic locking via If-Match + Bearer plumbing`

---

## Session 7 — `ApplicationContext` AppData provider: ConfigManager as first writer

**Maps to design Decisions:** 3, 4.

**Goal:** ConfigManager publishes `AppId`, `LoggedInUser`, `ImpersonatedUser` (null for
now), and `LoggedInUserProfile` (roles + permissions, read from the seeded tables) into
the SharedWorker AppData provider named `"ApplicationContext"`. Components in any window
can read these synchronously through the existing main-thread mirror established in the
data-services redesign.

**Files:**
- Read first: [`packages/shared/services/data-services/src/runtime/`](../../packages/shared/services/data-services/src/runtime/) and the [`data-services-step3.md`](./data-services-step3.md) / `step5.md` notes — confirm the AppData provider creation API.
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — accept a `dataServices` reference (provider creator), publish the four keys after seed.
- Modify: [`packages/shared/services/config-service/src/types.ts`](../../packages/shared/services/config-service/src/types.ts) — add `dataServices?: DataServicesHandle` to options. Keep optional; if absent, ConfigManager works as today (no AppData publication).
- Test: `packages/shared/services/config-service/src/configManager.applicationContext.test.ts` (new).

**Steps:**

- [x] **7.1** Read the data-services Provider/handle API. Identify the type the
      DataServicesProvider exposes (likely `DataServicesHandle` or similar) and how a
      framework code path creates a named AppData provider with sync-mirrored writes.
      If the API isn't quite right for ConfigManager's needs, write down the gap in
      [`data-services-step5.md`](./data-services-step5.md) follow-up notes and adjust
      this session's scope accordingly.
- [x] **7.2** Add `dataServices?: DataServicesHandle` to `ConfigManagerOptions`. Store
      on the manager.
- [x] **7.3** After `seedIfEmpty()` completes, if `dataServices` is set:
  - Compute `LoggedInUserProfile = { roles: RoleRow[], permissions: PermissionRow[] }`
    from the user's profile (`getUserProfile(identity.userId)` → roleIds → roles →
    permissions).
  - Create / get the `"ApplicationContext"` AppData provider, scoped by the worker's
    `(origin, appId)` key.
  - Publish:

```ts
appData.set("AppId", this.appId);
appData.set("LoggedInUser", { userId: identity.userId, displayName: identity.displayName });
appData.set("ImpersonatedUser", null);
appData.set("LoggedInUserProfile", { roles, permissions });
```

- [x] **7.4** Add a `getApplicationContext(): ApplicationContext` accessor on
      ConfigManager that reads the four keys synchronously from the main-thread mirror
      (existing data-services machinery). Define `ApplicationContext` in `types.ts`:

```ts
export interface ApplicationContext {
  AppId: string;
  LoggedInUser: { userId: string; displayName?: string };
  ImpersonatedUser: { userId: string; displayName?: string } | null;
  LoggedInUserProfile: { roles: RoleRow[]; permissions: PermissionRow[] };
}
```

- [x] **7.5** Test: with a mocked `dataServices` handle, init a ConfigManager seeded
      with one user + role + permissions; assert all four AppData keys end up with
      correct values; assert `getApplicationContext()` returns the expected shape.
- [x] **7.6** Test: without `dataServices`, ConfigManager init still succeeds (silent
      no-op for AppData).
- [x] **7.7** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service --filter=@starui/data-services
npx turbo typecheck build
```

**Acceptance:** ConfigManager populates ApplicationContext. Components reading from
AppData see identity sync. Existing call sites without `dataServices` work unchanged.

**Commit:** `feat(config-service): publish ApplicationContext into AppData on init`

---

## Session 8 — Impersonation slot + `getEffectiveUser` helper

**Maps to design Decision:** 5.

**Goal:** Allow an admin/impersonation UI (future) to set `ImpersonatedUser` in
ApplicationContext. Add a `getEffectiveUser(ctx)` helper. Wire visibility (Session 4) and
write-time owner stamping (Session 3) to use it. Audit fields (`createdBy`/`updatedBy`)
keep using the real `LoggedInUser`.

**Files:**
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts) — `setImpersonatedUser`, swap `stampWrite` and `visibilityContext` to use effective user.
- Create: `packages/shared/services/config-service/src/effectiveUser.ts` — pure helper.
- Test: `packages/shared/services/config-service/src/configManager.impersonation.test.ts` (new).

**Steps:**

- [x] **8.1** Create `effectiveUser.ts`:

```ts
import type { ApplicationContext } from "./types";

export function getEffectiveUser(ctx: ApplicationContext): { userId: string; displayName?: string } {
  return ctx.ImpersonatedUser ?? ctx.LoggedInUser;
}
```

- [x] **8.2** On `ConfigManager`, add:

```ts
setImpersonatedUser(user: { userId: string; displayName?: string } | null): void {
  if (!this.dataServices) {
    throw new Error("Impersonation requires dataServices to be configured.");
  }
  this.dataServices.appData.set("ImpersonatedUser", user);
}
```

- [x] **8.3** Owner-stamping update landed inline in `saveConfig`
      rather than inside `stampWrite`: the helper still owns the audit
      slots only (`createdBy` / `updatedBy` / `creationTime` /
      `updatedTime`), all stamped from `this.identity.userId` so
      impersonation can never rewrite history. The `userId` (owner)
      default in `saveConfig` now reads from
      `getEffectiveUserId()` — equals the impersonated user when one
      is set on `ApplicationContext`, otherwise the real logged-in
      user. This split keeps `stampWrite` safe to reuse on the
      ownerless auth tables (`appRegistry`, `userProfile`, `roles`,
      `permissions`).
- [x] **8.4** `visibilityContext` now builds `effectiveUserId` from
      `getEffectiveUserId()` so a `setImpersonatedUser(...)` flip is
      visible on the very next list call without any explicit
      re-bind. Falls back to `identity.userId` when `dataServices`
      isn't wired (tests / hosts that haven't opted in).
- [x] **8.5** `configManager.impersonation.test.ts` (10 tests) covers
      every step's acceptance criterion: setter mutates / clears
      `ApplicationContext.ImpersonatedUser`; saved row owner ===
      impersonated user while audit === real user; clearing
      impersonation reverts owner default; reads while impersonating
      alice show alice-owned private rows AND public rows but hide
      real-user-owned private rows; clearing reverts visibility;
      setter throws without `dataServices`. Plus pure-helper tests
      for `getEffectiveUser` covering both branches.
- [x] **8.6** Verification green: 70 config-service tests pass across
      10 files; full repo `npx turbo test typecheck build` green
      (33 test packages + 54 build tasks).

**Verification:**

```bash
npx turbo test --filter=@starui/config-service
npx turbo typecheck build
```

**Acceptance:** Impersonation flips visibility but preserves audit. Without dataServices
configured, `setImpersonatedUser` throws (no place to put it). Existing tests unchanged.

**Commit:** `feat(config-service): add impersonation slot and effective-user helper`

---

## Session 9 — `@starui/config-service-react` Provider package

**Maps to design Decision:** 14 (React half).

**Goal:** Ship the React Provider/hook so a host wires config-service in ≤8 lines.
Mirrors the `data-services-react` package shape established in Session 5 of the
data-services work.

**Files:**
- Create: `packages/react/providers/config-service-react/` — new workspace.
  - `package.json` (copy `data-services-react/package.json` shape; bump name).
  - `tsconfig.json` (extends `../../../../tsconfig.base.json`).
  - `src/index.ts` — barrel.
  - `src/ConfigServiceProvider.tsx` — Provider component.
  - `src/useConfigService.ts` — hook.
  - `src/types.ts` — `ConfigServiceContextValue`.
- Modify: [`package.json`](../../package.json) (root) — add to workspaces glob if not
  already covered by `packages/react/providers/*`.
- Modify: [`apps/markets-ui-react-reference/src/main.tsx`](../../apps/markets-ui-react-reference/src/main.tsx) — cut over to the new Provider; reduce config wiring to ≤8 lines.
- Test: `packages/react/providers/config-service-react/src/ConfigServiceProvider.test.tsx`.

**Steps:**

- [x] **9.1** Scaffolded `packages/react/providers/config-service-react/`
      with `package.json`, `tsconfig.json` (extends
      `../../../../tsconfig.base.json`), and `vitest.config.ts`
      mirroring `data-services-react`. Name `@starui/config-service-react`.
      `dependencies` carries `@starui/config-service`; peer deps cover
      `react >=19` and `@starui/data-services-react` (the Provider
      reads `useDataServices()`). `devDependencies` add
      `fake-indexeddb` so the Provider's real `ConfigManager.init()`
      can run under jsdom in tests.
- [x] **9.2** Defined `ConfigServiceContextValue`:

```ts
export interface ConfigServiceContextValue {
  configManager: ConfigManager;
  storage: ProfileStorageFactory;   // canonical name in this repo (= StorageAdapterFactory in the plan template)
  appId: string;
  userId: string;
  applicationContext: ApplicationContext;
}
```

      Lives in `src/types.ts`; re-exported from the package barrel
      `src/index.ts`.

- [x] **9.3** Implemented `ConfigServiceProvider` in
      `src/ConfigServiceProvider.tsx`:

```tsx
export function ConfigServiceProvider(props: {
  identity: AppIdentity;
  appId: string;
  seedUrl?: string;
  restUrl?: string;
  children: ReactNode;
}) {
  const dataServices = useDataServices();              // from data-services-react
  const [value, setValue] = useState<ConfigServiceContextValue | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let disposed = false;
    const cm = createConfigManager({
      appId: props.appId,
      identity: props.identity,
      seedConfigUrl: props.seedUrl,
      configServiceRestUrl: props.restUrl,
      dataServices,
    });
    cm.init()
      .then(() => {
        if (disposed) { cm.dispose(); return; }
        const storage = createConfigServiceStorage({ configManager: cm });
        setValue({
          configManager: cm,
          storage,
          appId: props.appId,
          userId: props.identity.userId,
          applicationContext: cm.getApplicationContext(),
        });
      })
      .catch(setError);
    return () => { disposed = true; cm.dispose(); };
  }, [props.appId, props.identity, props.seedUrl, props.restUrl, dataServices]);

  if (error) throw error;        // bubble to nearest error boundary
  if (!value) return null;        // host wraps in Suspense or own loader
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
```

      Implementation matches the plan template: pulls
      `dataServices = useDataServices()` (peer dep), constructs the
      `ConfigManager` with `appId` / `identity` / `seedConfigUrl` /
      `configServiceRestUrl` / `dataServices`, runs `init()`, and on
      success exposes `{ configManager, storage:
      createConfigServiceStorage({ configManager }), appId, userId:
      identity.userId, applicationContext:
      configManager.getApplicationContext() }`. A `disposed` guard
      short-circuits a late `init()` resolution; the cleanup function
      always calls `manager.dispose()` so unmount + prop change leak
      nothing. Errors thrown during bootstrap rethrow on the next
      render so the nearest `<ErrorBoundary>` catches them. While
      bootstrap is pending the Provider renders `null`. The
      shared React context lives in
      `src/configServiceContext.ts` so the Provider (`.tsx`) and the
      hook (`.ts`) can both read it without dragging the JSX runtime
      into the hook module.
- [x] **9.4** `useConfigService()` lives in `src/useConfigService.ts`,
      reads from the same context as the Provider, and throws
      `useConfigService must be used within <ConfigServiceProvider>`
      when called outside the tree.
- [x] **9.5** Cut over `apps/markets-ui-react-reference/src/main.tsx`.
      The previous module-scope `const configManager =
      createConfigClient({})` is gone; instead `ViewRoutesLayout`
      wraps non-platform-provider routes in
      `<DataServicesProvider services={dataServices}>` →
      `<ConfigServiceProvider identity={IDENTITY} appId={APP_ID}>` →
      a small `HostWrapperWithProviderClient` that pulls
      `useConfigService().configManager` and wraps it as
      `createConfigClient({ configManager })` for `<HostWrapper>`.
      The hidden `/platform/provider` route stays OUTSIDE the new
      providers so its `bootstrapPlatform()` keeps owning the
      platform's ConfigManager singleton without competition.
      `apps/markets-ui-react-reference/package.json` adds
      `@starui/config-service-react: "*"` as a workspace dep.
- [x] **9.6** Tests in
      `packages/react/providers/config-service-react/src/ConfigServiceProvider.test.tsx`
      (5 tests, jsdom + fake-indexeddb): exposes the expected shape
      after init (incl. ApplicationContext snapshot); disposes the
      ConfigManager on unmount; renders `null` while bootstrap is
      pending; throws from `useConfigService` outside the Provider;
      re-bootstraps when `appId` changes. `useDataServices` is
      `vi.mock`-ed to return a tiny in-memory `appData` that
      satisfies `AppDataMirrorHandle` so the real
      `ConfigManager.init()` exercises the publish-into-AppData path.
- [x] **9.7** Smoke ran the reference app dev server
      (`npm --workspace apps/markets-ui-react-reference run dev`):
      Vite reported `ready in 285 ms` on
      `http://localhost:5174/`, the index page rendered, and Vite
      transformed `/src/main.tsx` with no errors in the dev log.
- [x] **9.8** Verification green:
      `npx turbo test --force` → 35 test packages pass (incl. the
      new 5 Provider tests); `npx turbo typecheck build --force` →
      56 tasks green incl. the reference app's Vite bundle.

**Verification:**

```bash
npx turbo test --filter=@starui/config-service-react
npx turbo typecheck build
npm --workspace apps/markets-ui-react-reference run dev    # smoke; grid + profiles
```

**Acceptance:** Reference app builds and runs identically with ≤8-line wiring.

**Commit:** `feat(config-service-react): add ConfigServiceProvider + useConfigService`

---

## Session 10 — `@starui/config-service-angular` provider package

**Maps to design Decision:** 14 (Angular half).

**Goal:** Angular twin of Session 9. `provideConfigService()` for `bootstrapApplication`
providers, `ConfigServiceClient` injectable for components.

**Files:**
- Create: `packages/angular/providers/config-service-angular/` — copy
  `data-services-angular`'s shape.
- Modify: at least one Angular reference path (or extend the existing
  `config-browser-angular` host to consume the new provider) so the wiring is exercised
  end-to-end.
- Test: `packages/angular/providers/config-service-angular/src/ConfigServiceClient.test.ts` (Vitest, not Karma — match the data-services-angular convention).

**Steps:**

- [x] **10.1** Scaffolded `packages/angular/providers/config-service-angular/`
      with `package.json`, `ng-package.json`, `tsconfig.json` (extends
      `../../../../tsconfig.base.json`), and `vitest.config.ts`
      mirroring `data-services-angular`. Name
      `@starui/config-service-angular`. `peerDependencies` cover
      `@angular/common >=21`, `@angular/core >=21`,
      `@starui/config-service`, and `@starui/data-services-angular`
      (the client injects `DataServicesService` so the ConfigManager
      attaches to the same AppData mirror the worker hub writes to).
      `devDependencies` add `fake-indexeddb` so the real
      `ConfigManager.init()` runs under jsdom in tests, and
      `@angular/compiler` for JIT decorator metadata in Vitest.
- [x] **10.2** `provideConfigService(opts): EnvironmentProviders`
      lives in `src/provider.ts`. It returns
      `makeEnvironmentProviders([{ provide: CONFIG_SERVICE_OPTIONS,
      useValue: opts }, provideAppInitializer(() =>
      inject(ConfigServiceClient).init())])`. `ConfigServiceClient`
      (in `src/ConfigServiceClient.ts`,
      `@Injectable({ providedIn: 'root' })`) reads options +
      `DataServicesService` via `inject(...)`, constructs
      `ConfigManager` with `appId` / `identity` / `seedConfigUrl` /
      `configServiceRestUrl` / `dataServices`, builds
      `createConfigServiceStorage({ configManager: ... })`, and
      exposes `{ configManager, storage, appId, userId,
      applicationContext }`. The `applicationContext` getter throws
      if read before `init()` resolved so misuse fails fast instead
      of returning stale data.
- [x] **10.3** `ConfigServiceClient.ngOnDestroy()` calls
      `this.configManager.dispose()`. Angular's root-injector
      destruction triggers it on app teardown.
- [x] **10.4** Tests in
      `packages/angular/providers/config-service-angular/src/ConfigServiceClient.test.ts`
      (3 tests, jsdom + fake-indexeddb): exposes the expected shape
      after `init()` incl. ApplicationContext snapshot AND verifies
      ConfigManager actually published into the fake AppData mirror;
      throws when `applicationContext` is read before `init()`;
      disposes the ConfigManager on `ngOnDestroy`. Tests use
      `Injector.create` (not `TestBed`) since the monorepo doesn't
      install `@angular/platform-browser-dynamic` — bare DI is enough
      to verify injection works. `DataServicesService` is mocked with
      a tiny in-memory `appData` that satisfies `AppDataMirrorHandle`.
- [x] **10.5** Wired `@starui/config-browser-angular`'s
      `ConfigBrowserService` to optionally consume
      `ConfigServiceClient` via `inject(ConfigServiceClient, {
      optional: true })`. When present, it reads the
      Provider-managed manager directly (already initialised by
      `provideAppInitializer`); when absent (legacy OpenFin shells
      that ship their own `bootstrapPlatform()`), it falls back to
      the existing `getConfigManager()` / `readHostEnv()` path so
      every existing consumer keeps working unchanged. The
      `package.json` adds `@starui/config-service-angular: "*"` as a
      workspace dep.
- [x] **10.6** Verification green:
      `npx turbo test --filter=@starui/config-service-angular`
      (3 tests pass); `npx turbo typecheck build test` (74 tasks
      across the monorepo all green).

**Verification:**

```bash
npx turbo test --filter=@starui/config-service-angular
npx turbo typecheck build
```

**Acceptance:** Angular wiring lands in ≤10 lines. config-browser-angular continues to
work.

**Commit:** `feat(config-service-angular): add provideConfigService + ConfigServiceClient`

---

## Session 11 — MarketsGrid: dev-mode warning on MemoryAdapter fallback

**Maps to design Decision:** 15 (follow-up).

**Goal:** Prevent the half-day "why aren't my profiles saving?" debugging session that
every new framework consumer hits exactly once. One-time `console.warn` when the grid
falls through to `MemoryAdapter` and `process.env.NODE_ENV !== "production"`.

**Files:**
- Modify: [`packages/react/widgets/markets-grid/src/MarketsGrid.tsx`](../../packages/react/widgets/markets-grid/src/MarketsGrid.tsx) at the line that constructs `new MemoryAdapter()`.
- Test: `packages/react/widgets/markets-grid/src/MarketsGrid.devwarning.test.tsx` (new).

**Steps:**

- [x] **11.1** In `MarketsGrid.tsx`, near `adapterRef.current = storageAdapter ?? new MemoryAdapter();`,
      add a module-scoped `let warned = false;` and:

```ts
if (!storage && !storageAdapter) {
  if (!warned && process.env.NODE_ENV !== "production") {
    warned = true;
    console.warn(
      "[MarketsGrid] No storage prop provided. Using in-memory storage — " +
      "profiles, layouts and grid-level-data WILL be lost on reload. " +
      "Wire @starui/config-service via createConfigServiceStorage(...) to persist."
    );
  }
}
```

- [x] **11.2** Test: render `<MarketsGrid />` twice without `storage` and without
      `storageAdapter`; spy on `console.warn`; assert called exactly once.
- [x] **11.3** Test: render with `storage={...}`; assert `console.warn` not called.
- [x] **11.4** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/markets-grid
npx turbo typecheck build
```

**Acceptance:** Dev consumers see one warning per session when they forget to wire
storage. Production builds quiet.

**Commit:** `feat(markets-grid): warn once in dev when falling back to MemoryAdapter`

---

## Session 12 — `@starui/config-editor-ui` skeleton + four list editors

**Maps to design Decision:** 11 (engine-agnostic shared library).

**Goal:** New React-only package with the editor screens. Engine-agnostic — components
consume the framework-agnostic `ConfigClient` interface, not Dexie or REST directly. Four
list editors land first; the matrices come in Session 13.

**Files:**
- Create: `packages/react/tools/config-editor-ui/` — new workspace.
  - `src/ConfigEditorContext.tsx` — provides a `ConfigClient` to children.
  - `src/RolesEditor.tsx`
  - `src/PermissionsEditor.tsx`
  - `src/UserProfileEditor.tsx`
  - `src/AppRegistryEditor.tsx`
  - `src/index.ts` — barrel.
- Tests for each editor co-located.

**Steps:**

- [x] **12.1** Scaffold the package. Peer deps: `react`, `react-dom`,
      `@starui/config-service` (for `ConfigClient` types only — type-only import),
      `@starui/ui` (shadcn primitives), `@starui/design-system` (tokens), and
      `@starui/widgets-react` (peer dep for Session 14's MarketsGrid usage; declare now,
      consume later).
- [x] **12.2** Define `ConfigEditorContext`:

```tsx
const Ctx = createContext<ConfigClient | null>(null);
export function ConfigEditorProvider({ client, children }: { client: ConfigClient; children: ReactNode }) {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}
export function useConfigClient(): ConfigClient {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConfigClient must be used within <ConfigEditorProvider>");
  return c;
}
```

- [x] **12.3** Implement `RolesEditor`: list view with shadcn `Table`, "New role"
      button, edit drawer with shadcn `Sheet`, save calls `client.saveRole`. **No
      filter/sort/paginate yet** (Session 14). All inputs are shadcn `Input` /
      `Textarea` / `Select` — no native HTML form controls (CLAUDE.md rule).
- [x] **12.4** Implement `PermissionsEditor`: same shape. Categories visible in a
      dropdown.
- [x] **12.5** Implement `UserProfileEditor`: same shape. Role multi-select uses a
      shadcn `Popover` + `Checkbox` list with chips above (the `@starui/ui`
      surface ships `Command` / `Popover` rather than a single bundled
      `Combobox`; the equivalent shape is preserved).
- [x] **12.6** Implement `AppRegistryEditor`: same shape. Environment is shadcn `Select`.
- [x] **12.7** All surfaces use design-system tokens (`--bn-*` / `--fi-*`); no hardcoded
      colors. Tested under `[data-theme="dark"]` and `[data-theme="light"]` via a
      Storybook-style smoke (manual screenshot pair is sufficient since we don't have
      visual regression set up).
- [x] **12.8** Tests: each editor renders, save round-trips through a stubbed
      `ConfigClient`, validation errors block save.
- [x] **12.9** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-editor-ui
npx turbo typecheck build
```

**Acceptance:** Four functional editors, engine-agnostic, dark/light correct, no native
form controls. No filter/sort/paginate yet.

**Commit:** `feat(config-editor-ui): add roles/permissions/user-profile/app-registry editors`

---

## Session 13 — Permission matrix + role-assignment matrix

**Maps to design Decisions:** 12.1, 12.2.

**Goal:** The centerpiece RBAC UX. `PermissionMatrix` (roles × permissions checkbox
grid) and `RoleAssignmentMatrix` (users × roles).

**Files:**
- Create: `packages/react/tools/config-editor-ui/src/PermissionMatrix.tsx`
- Create: `packages/react/tools/config-editor-ui/src/RoleAssignmentMatrix.tsx`
- Tests for each.

**Steps:**

- [x] **13.1** `PermissionMatrix` props: `{ roles: RoleRow[]; permissions: PermissionRow[]; onChange: (next: RoleRow[]) => void; }`. Render rows = roles, columns = permissions, checkbox per cell. Group permissions by `category`. Search/filter input filters by permission `permissionId` or `description`.
- [x] **13.2** Click a cell → toggle `permissionIds` array on the role; call `onChange`
      with the next roles array. Saves are batched on a "Save changes" button to keep
      the optimistic-locking story (Session 14) simple.
- [x] **13.3** `RoleAssignmentMatrix` props: `{ users: UserProfileRow[]; roles: RoleRow[]; onChange: (next: UserProfileRow[]) => void; }`. Two layouts toggleable: "by user" (rows = users, chips = roles) and "by role" (rows = roles, chips = users). Mode pill switches.
- [x] **13.4** Both matrices render via shadcn `Table` (or `DataTable` from `@starui/ui`
      if it exists; check). No native `<table>` tags directly — only shadcn primitives.
      Dark/light correct.
- [x] **13.5** Tests:
  - PermissionMatrix: toggle a cell, assert `onChange` payload.
  - RoleAssignmentMatrix: by-user mode, add/remove a chip, assert payload; switch mode,
    same.
  - Filter by category narrows columns / chips.
- [x] **13.6** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-editor-ui
npx turbo typecheck build
```

**Acceptance:** Two matrices land, toggle correctly, dark/light correct.

**Commit:** `feat(config-editor-ui): add PermissionMatrix and RoleAssignmentMatrix`

---

## Session 14 — List polish: filter/sort/paginate + validation + client-side optimistic locking

**Maps to design Decisions:** 12.3, 12.4, 12.5, 12.6.

**Goal:** Promote every list editor to use `MarketsGrid` as the table component (eat our
own dog food per Decision 12.6). Add validation + referential integrity. Wire
client-side optimistic locking against Session 6's server support.

**Files:**
- Modify: every editor in `packages/react/tools/config-editor-ui/src/`.
- Create: `packages/react/tools/config-editor-ui/src/validation/` — pure validators per
  table.
- Tests: extend per editor.

**Steps:**

- [ ] **14.1** Replace each editor's shadcn `Table` with `<MarketsGrid>` configured for
      read-only display + click-to-edit. Use the `storage={...}` factory from
      ConfigService so the editor's column config persists per operator. Pass `appId` /
      `userId` as required by the grid's storage invariant.
- [ ] **14.2** Add `validation/roles.ts`, `validation/permissions.ts`,
      `validation/userProfiles.ts`, `validation/appRegistry.ts`. Each exports a
      `validate(row): ValidationError[]` pure function. Rules from design Decision 12.4:
  - Role with zero permissions → block save.
  - Permission referenced by any role → block delete (cross-table check; receives
    `roles: RoleRow[]` as second arg).
  - User-profile delete that strands a `createdBy` reference → warn but allow.
  - Unique IDs per table → block save on duplicate.
- [ ] **14.3** Wire client-side optimistic locking. On edit-start in a drawer, capture
      `row.updatedTime` as `expectedUpdatedTime`. On save, pass it to
      `client.saveConfig(row, { expectedUpdatedTime })`. On `OptimisticLockError`, show
      a shadcn `AlertDialog`: "This row was changed by another operator. Reload current
      values? Discard your changes?" Two buttons.
- [ ] **14.4** Filter / sort / paginate: free for the list editors thanks to
      `MarketsGrid`'s built-in column config; no extra work needed beyond enabling the
      filter row.
- [ ] **14.5** Tests:
  - Validation rejects each broken case with the expected error.
  - 412 response shows the AlertDialog and reloads the current row on confirm.
  - Filter narrows the list; sort reorders; paginate paginates.
- [ ] **14.6** Run verification.

**Verification:**

```bash
npx turbo test --filter=@starui/config-editor-ui --filter=@starui/markets-grid
npx turbo typecheck build
```

**Acceptance:** Every editor is a live demo of MarketsGrid. Validation prevents bad
saves. Concurrent edits never silently overwrite.

**Commit:** `feat(config-editor-ui): markets-grid tables + validation + optimistic locking`

---

## Session 15 — `apps/config-admin-web` bundled inside config-service-server

**Maps to design Decision:** 10.

**Goal:** Operator-facing multi-app admin console. One process, one port, one deployment
artifact. Operator goes to one URL.

**Files:**
- Create: `apps/config-admin-web/` (sibling to `apps/markets-ui-react-reference`) —
  Vite + React 19 + shadcn + `@starui/config-editor-ui`.
- Modify: [`apps/config-service-server/src/app.ts`](../../apps/config-service-server/src/app.ts) — `app.use(express.static(...))` serves `dist/admin-web/`. Catch-all serves `index.html` for SPA routing.
- Modify: [`apps/config-service-server/package.json`](../../apps/config-service-server/package.json) — `build` script first builds the SPA into `dist/admin-web/`, then compiles the server.
- Modify: root `turbo.json` — pull the SPA build into `apps/config-service-server`'s
  `outputs` so cache hits are correct.

**Steps:**

- [ ] **15.1** Scaffold `apps/config-admin-web/` with Vite. Shadcn primitives in place.
      Top-level `<AppSelector>` reads the list of apps from `client.getAllApps()` and
      sets the editor scope. The in-app `config-browser-react` continues to lock to
      `ApplicationContext.AppId`; only this admin app has the dropdown.
- [ ] **15.2** Operator auth gate — placeholder. Read `?token=...` query param, accept
      any non-empty token, plumb into `RestConfigClient`'s `getAccessToken`. Document
      that real auth lands in the deferred Decision 16.
- [ ] **15.3** Wire all four editors and both matrices (Sessions 12 + 13) into the
      admin app's routing.
- [ ] **15.4** Bundle into the server: in `apps/config-service-server/package.json`,
      change `build` to `npm --workspace apps/config-admin-web run build && cp -r ../config-admin-web/dist dist/admin-web && tsc`. (Or use a small Node build script for portability.)
- [ ] **15.5** In `app.ts`, after API routes are mounted, add
      `app.use(express.static(path.join(__dirname, "admin-web")))` and a SPA fallback
      `app.get("*", (_, res) => res.sendFile(...))` for client-side routing.
- [ ] **15.6** Update Turbo config so that `@starui/config-service-server`'s `build`
      task `dependsOn` includes `@starui/config-admin-web#build`.
- [ ] **15.7** Tests: server smoke test that starts the server and confirms `/` returns
      the SPA's `index.html`. Existing API tests stay green.
- [ ] **15.8** Run verification + manual operator smoke.

**Verification:**

```bash
npx turbo build --filter=@starui/config-service-server
npm --workspace apps/config-service-server run dev
# In a browser: open http://localhost:5174/, log in with any token, edit roles.
```

**Acceptance:** One URL, one process, full editor + matrices wired. Existing API
endpoints unchanged.

**Commit:** `feat(config-admin-web): bundle React admin SPA into config-service-server`

---

## Session 16 — Cleanup: collapse dual surfaces

**Maps to design Decision:** "Naming / structure work to fold in later" + Decision 13
trim pass tail.

**Goal:** Pick one canonical row name and one canonical client API. Remove the
`isTemplate` / `isRegisteredComponent` redundancy. This is the only session where any
public surface gets *smaller* — guard with a deprecation cycle.

**Files:**
- Modify: [`packages/shared/services/config-service/src/types.ts`](../../packages/shared/services/config-service/src/types.ts)
- Modify: [`packages/shared/services/config-service/src/ConfigManager.ts`](../../packages/shared/services/config-service/src/ConfigManager.ts), `client.ts`, `index.ts`
- Modify: every consumer found by
  `grep -rn "isRegisteredComponent\|UnifiedConfig" packages apps`.

**Steps:**

- [ ] **16.1** Decide canonical client API. Per design Decision 13, `ConfigClient` is the
      forward-looking interface; `ConfigManager` collapses to a private implementation
      detail behind it. Plan: rename ConfigManager's public methods 1:1 onto a
      LocalConfigClient, ensure RestConfigClient remains feature-equivalent, and have
      `createConfigManager` return a `ConfigClient`-typed object. Mark the previous
      surface `@deprecated` for one minor release; remove in the next session-set.
- [ ] **16.2** Remove `isRegisteredComponent` from new writes (Session 1 documented
      this). Add a one-shot Dexie upgrade that drops the field on read for any row that
      has it. Update server-side row type identically. Keep `isTemplate` as the single
      canonical flag.
- [ ] **16.3** Update every consumer:
      `grep -rn "isRegisteredComponent" packages apps` returns zero matches in the new
      code; the deprecated re-export is the only place the name still appears.
- [ ] **16.4** Tests: existing tests stay green; add one that loads an old-shape row and
      confirms `isRegisteredComponent` is silently dropped.
- [ ] **16.5** Update [`docs/IMPLEMENTED_FEATURES.md`](../../IMPLEMENTED_FEATURES.md) to
      reflect the unified surface.
- [ ] **16.6** Run full repo verification.

**Verification:**

```bash
npx turbo test typecheck build
npm --workspace apps/markets-ui-react-reference run dev   # smoke
```

**Acceptance:** One client API name. One row type name. `isTemplate` is the sole
template flag. All apps and tests green.

**Commit:** `refactor(config-service): collapse ConfigManager/ConfigClient and isTemplate flags`

---

## Spec coverage check

| Design decision                                     | Session(s) |
|-----------------------------------------------------|------------|
| 1. Mode at construction (no runtime toggle)         | 2          |
| 2. AppIdentity contract                             | 2, 6       |
| 3. Bootstrap flow / first-run dev                   | 7, 9, 10   |
| 4. ApplicationContext as framework AppData provider | 7          |
| 5. Effective user / audit / impersonation           | 3, 8       |
| 6. Visibility (isPublic + appId-scope)              | 1, 4, 5    |
| 7. Schema: owner vs audit field roles               | 1, 3       |
| 8. Production population (3 paths)                  | 5, 15 (groundwork; full JIT-from-IDP deferred per design) |
| 9. Storage backend stays SQLite                     | — (no work; deferred per design) |
| 10. Admin UI inside server, React-only              | 15         |
| 11. Editor surfaces — shared lib + 2 wrappers       | 12, 15     |
| 12. Editor feature scope (six items)                | 12, 13, 14 |
| 13. Server: keep, extend, trim                      | 5, 6       |
| 14. Public surface — Provider/hook ≤10 lines        | 9, 10      |
| 15. MarketsGrid integration + dev warning           | 11 (existing wiring covered by tests pre-redesign) |
| 16. Robustness on SQLite                            | — (deferred per design) |
| Naming work (folded in later)                       | 16         |

Decisions 9 and 16 are explicitly deferred in the design. Decision 8 has full
groundwork (server-side seed in 5; admin UI in 15) but JIT-from-IDP is part of the
deferred auth pass — keeping the design's framing.

---

## Notes for execution

- **Session size targets:** Sessions 1–8 should each fit a single ~half-day focused
  block. Sessions 9–14 are ~one day each. Session 15 is the largest. Session 16 is small
  but touches many files — schedule with care.
- **Parallelization:** 9 and 10 can run in parallel after 7 lands. 11 is independent and
  can be picked up any time. Everything else is serial because each builds on the
  previous schema or context shape.
- **If a session grows:** stop and split. Do not let scope creep across the line.
- **Per-session DoD:** all commands in the "Verification" block return green; new tests
  added; `IMPLEMENTED_FEATURES.md` updated; commit lands with the project trailer.
- **If you hit a blocker:** read the design doc's matching Decision section first, then
  cross-reference the data-services-redesign sibling pattern; the two were intentionally
  designed to mirror each other.

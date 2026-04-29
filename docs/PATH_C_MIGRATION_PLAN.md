# Path C — Full migration to docs/ARCHITECTURE.md

**Status:** planned, not executed.
**Prerequisite:** Path B complete (commits `28ee052`..`31536d5` on branch
`chore/audit-cleanup-architectural-alignment`). Path B added the
**seams** (RuntimePort, HostWrapper-react). Path C uses those seams to
**migrate** the codebase onto the new architecture.

This document is the explicit plan. It is comprehensive enough to drive
real work and conservative enough that each phase is independently
revertable.

---

## 1. Why this exists

`docs/ARCHITECTURE.md` describes the **target state** — a 5-layer model
with two thin seams (`RuntimePort`, `HostWrapper`), four persistence
backends, a classical `DataProvider<T>` interface with five
implementations, a modular component shape (`@<ns>/<thing>` agnostic
logic + `@<ns>/<thing>-react` shell), an opinionated `/c/...` route
table, and single canonical reference apps per framework.

Today (Path B done):
- ~15% implemented — the seams (`@marketsui/runtime-port`,
  `runtime-browser`, `runtime-openfin`, `host-wrapper-react`).
- Nothing in the existing codebase consumes the seams yet.
- Existing components, data-plane, persistence, apps, and routing are
  unchanged.

The remaining 85% is what Path C delivers. Doing it incrementally
matters: Phase C-3 (a single Host split) caused 16 e2e regressions even
though unit tests passed. Path C touches far more surface, so each
phase ships with its own verification gates and can stand alone.

---

## 2. Guiding principles

These bind every phase.

1. **Additive first, destructive last.** Every new shape gets added
   alongside the old one. Migration happens in small, reviewable
   commits. Removal of legacy code is the last step of each phase, only
   after all consumers are migrated.

2. **Verification gate is e2e, not just unit.** Path B taught us:
   `npx turbo typecheck test` is necessary but not sufficient. Every
   phase that touches a hot-path component (Host, data-plane,
   persistence, routing) MUST run the full Playwright suite and confirm
   pass-count is at parity with the prior baseline before merging.

3. **One blast-radius increase per phase.** Don't combine
   "introduce new pattern" with "migrate consumers" with "delete
   legacy" in one commit. Each gets its own commit with its own
   verification.

4. **Behavior preservation is non-negotiable** during the migration
   itself. Refactoring may not change UI, persistence shapes,
   identity resolution, or async ordering. Behavior changes get a
   separate commit clearly labelled.

5. **Stern flavor is reference-only and going away.** Per user
   directive (2026-04-29). Don't invest in `@marketsui/openfin-platform-stern`
   or `apps/stern-reference-*`. Path C effort targets the markets-ui
   flavor (`@marketsui/openfin-platform`, `apps/markets-ui-{react,angular}-reference`,
   `apps/fi-trading-reference{,-angular}`).

6. **Demo apps stay** (per user directive 2026-04-28). Don't delete
   `demo-react`, `demo-configservice-react`, `demo-angular` even when
   their content overlaps with `fi-trading-reference{,-angular}`.

---

## 3. The phase plan

10 phases. Each has goal, scope, acceptance, risk, and est-effort.
Phases are sequenced; numbered dependencies are noted.

> Notation: ⚠ med risk, 🔴 high risk, 🟢 low risk, ⏱ rough effort,
> ✅ when done, 🔓 unblocks.

### Phase X-0 — Path B safety gaps (close before anything else)

**Goal:** clear the small loose ends from Path B that block downstream
phases.

**Scope:**
- **X-0a** Hoist `widgets-react/src/types/openfin.d.ts` into
  `@marketsui/shared-types/src/openfin.d.ts`. Remove the type-only
  `@openfin/core` import from `widgets-react`. Re-export from
  `widgets-react/src/types/openfin.d.ts` if any internal file still
  references it; preferably delete that file outright once no
  consumer remains.
- **X-0b** Re-attempt the safer parts of the reverted C-3 split:
  individually extract `useUnsavedChangesGuard` and
  `useGridLevelDataPersistence` ONLY (the two simplest, most
  cohesive concerns). Run the full Playwright suite after each
  extraction. Stop if any new e2e failure appears.

**Acceptance:**
- `npx turbo typecheck test` 62/62 pass.
- Playwright suite shows ≤ main's failure count + 1 (flake budget).
- `widgets-react` no longer imports `@openfin/core` per
  `git grep '@openfin/core' packages/widgets-react`.

**Risk:** 🟢 low (X-0a is a type-file move) / ⚠ med (X-0b touched the
hot-path component that broke last time).

**Effort:** ⏱ 1-2 hours.

**Unblocks:** none directly, but shows we can do hot-path extraction
without regressions.

---

### Phase X-1 — `ConfigManager` redesign

**Goal:** rename + slim the persistence interface, add the two missing
backends (LocalStorage, Memory), make `HostWrapper` accept the new
type.

**Scope:**
- **X-1a** Define a smaller `ConfigManager` interface in
  `@marketsui/shared-types`. The minimum surface every component
  consumes: `getConfig(id)`, `upsertConfig(row)`, `deleteConfig(id)`,
  `queryConfigs(filter)`, `init()`, `dispose()`. (~7 methods vs the
  current 30.)
- **X-1b** Make the existing `ConfigClient` interface in
  `@marketsui/config-service` extend the new `ConfigManager`. No
  consumer change yet.
- **X-1c** Add `MemoryConfigManager` (test-only). In-memory `Map<id, row>`,
  no persistence, dispose clears the map.
- **X-1d** Add `LocalStorageConfigManager`. Same in-memory state but
  reads + writes a single localStorage key on each mutation
  (debounced). Useful for zero-backend standalone apps.
- **X-1e** Wire `HostWrapper`'s `configManager` prop to the new smaller
  type. Existing `LocalConfigClient` + `RestConfigClient` continue to
  work because they extend `ConfigManager`.
- **X-1f** Add unit tests per backend (~30 tests target).
- **X-1g** Decommission decision: do we rename `ConfigClient` →
  `ConfigManager` everywhere, or keep `ConfigClient` as the "wide"
  interface and `ConfigManager` as the "narrow" one? Open question
  flagged below.

**Acceptance:**
- 4 backends exist. All pass their own unit tests.
- `HostWrapper` typechecks with each.
- No behavior change in any existing app.

**Risk:** 🟢 low (additive interfaces, no consumer migration yet).

**Effort:** ⏱ 1-2 days.

**Unblocks:** Phase X-3 (HostWrapper consumption — needs the
ConfigManager type to be settled).

---

### Phase X-2 — Angular `HostService`

**Goal:** Path B done both seams in React; do the Angular equivalent so
both framework-adapter slots are filled.

**Scope:**
- New package `@marketsui/host-wrapper-angular` (sibling of
  `host-wrapper-react`).
- Implements an Angular `HostService` injectable that resolves
  `IdentitySnapshot` from the `RuntimePort` and exposes the same
  `HostContextValue` shape via `inject(HostService)`.
- ng-packagr config (model from `packages/angular/`).
- Tests via `@angular/testing` (~5 tests target).

**Acceptance:**
- Both `useHost()` (React) and `inject(HostService)` (Angular) deliver
  the same `HostContextValue`.
- Both pass their own unit tests.

**Risk:** 🟢 low (new package, no consumer migration).

**Effort:** ⏱ 1 day.

**Unblocks:** Phase X-3 Angular wiring.

---

### Phase X-3 — Wire `HostWrapper` into ONE app (canonical example)

**Goal:** prove the seam works end-to-end. Pick the lowest-risk app and
make it use `<HostWrapper runtime={...} configManager={...}>` at the
root. The seam stops being theoretical here.

**Scope:**
- Pick `apps/demo-react` (lowest external dependency, primary e2e
  target).
- At app root: instantiate `BrowserRuntime` + an existing
  `LocalConfigClient`. Wrap the route tree with `<HostWrapper>`.
- Pick ONE leaf component that currently reads identity (e.g.
  `MarketsGrid` instance with hard-coded `appId`/`userId`/`instanceId`).
  Migrate it to read `useHost()` instead.
- DON'T migrate the rest yet. We're proving the wiring works.
- Run full Playwright suite. Commit.
- Then migrate ALL identity reads in `demo-react` to `useHost()`. Run
  e2e again. Commit.
- Then repeat for `apps/markets-ui-react-reference` (OpenFin-hosted —
  uses `OpenFinRuntime` instead of `BrowserRuntime`).
- Then `apps/fi-trading-reference`.
- Then Angular apps using `HostService`.

**Acceptance:**
- Each app renders identical UI before/after migration.
- e2e pass-count ≥ pre-migration count.
- `useHost()` is the only path identity flows through; no
  `instanceId={...}` props remain at the leaf level.

**Risk:** 🔴 HIGH per app. Each app's migration is its own commit with
its own e2e gate. Don't batch.

**Effort:** ⏱ ~1 day per app × 6 apps = 1 week.

**Unblocks:** Phase X-7 (reference app collapse — only meaningful once
all apps share the HostWrapper plumbing).

---

### Phase X-4 — `DataProvider<T>` interface (Sweep #4)

**Goal:** the data-plane redesign described in ARCHITECTURE.md.
Replace the v1+v2 data-plane with a single classical interface and
five implementations.

**Scope:**
- **X-4a** Define `DataProvider<T>` interface in a new
  `@marketsui/data-provider` foundation package:
  ```typescript
  interface DataProvider<TRow = unknown> {
    setConfig(cfg: ProviderConfig): void;
    getColumnDefs(): ColumnDefinition[];
    start(): void; stop(): void; restart(): void;
    getSnapshot(): Promise<readonly TRow[]>;
    getStats(): ProviderStats;
    onSnapshot(fn): Unsubscribe;
    onUpdate(fn): Unsubscribe;
    onStats(fn): Unsubscribe;
    onStatus(fn): Unsubscribe;
  }
  ```
- **X-4b** `MockDataProvider` implementation (simplest first; useful
  for tests + dev). Generates synthetic rows on a configurable
  cadence.
- **X-4c** `InProcessStompDataProvider` — wraps the existing v2 STOMP
  worker code into the new interface. Same wire protocol; new
  consumer-facing shape.
- **X-4d** `RestDataProvider` — pulls a paginated REST endpoint, polls
  on a configurable interval.
- **X-4e** `AppDataProvider` — reads from the existing `AppDataStore`,
  emits as if it were a live feed. Useful for static seed data.
- **X-4f** `SharedDataProvider` — proxy to a `SharedWorker` running
  the same Hub. Multi-window socket sharing.
- **X-4g** Migrate ONE widget (`apps/demo-react/src/MarketDepth.tsx`
  is the simplest non-grid example) to consume `DataProvider<T>`
  instead of the v2 client API. Verify e2e.
- **X-4h** Migrate `MarketsGrid`'s data-plane container
  (`packages/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx`)
  to consume `DataProvider<T>`. This replaces the current `useDataPlane`
  + manual snapshot+update plumbing. Hot path — verify e2e + perf.
- **X-4i** Migrate any other consumers.
- **X-4j** Delete v1 data-plane (`packages/data-plane/src/providers/*`,
  `packages/data-plane/src/services/*` — the "kept until Angular cuts
  over" surface).

**Acceptance:**
- 5 implementations exist; each has its own unit tests.
- All consumers migrated.
- `git grep "from '@marketsui/data-plane'"` returns only the new
  interface imports.
- e2e suite at parity with pre-migration baseline.

**Risk:** 🔴 HIGH. Touches the realtime hot path. Per-implementation
commits, per-consumer commits.

**Effort:** ⏱ 1 week.

**Unblocks:** Phase X-9 (decommissioning).

---

### Phase X-5 — Modular component shape

**Goal:** every major component package follows the same shape:
`@<ns>/<thing>` (agnostic logic) + `@<ns>/<thing>-react` (panels) +
`@<ns>/<thing>-angular` (panels). Subpath exports per module.

**Scope:**
- **X-5a** Decision point: rename namespace `@marketsui/*` →
  `@starui/*`? ARCHITECTURE.md uses `@starui` consistently.
  Recommend: **stay on `@marketsui/*`** unless there's a branding
  driver. Rename later if needed; the architectural shape works
  with either namespace. Document the decision.
- **X-5b** Pick the best-shaped component as the template:
  `@marketsui/dock-editor-{react,angular}` already follows the
  framework-pair pattern. Extract its agnostic logic (state,
  reducers, models) into `@marketsui/dock-editor-core`. The
  `-react` and `-angular` packages depend on `-core`.
- **X-5c** Repeat for `@marketsui/registry-editor-{react,angular}` →
  `@marketsui/registry-editor-core`.
- **X-5d** Repeat for `@marketsui/config-browser-{react,angular}` →
  `@marketsui/config-browser-core`.
- **X-5e** `@marketsui/markets-grid` is the heaviest: extract the
  module-pipeline + ProfileManager + ExpressionEngine + StyleEditor
  state into `@marketsui/markets-grid-core` (mostly already there as
  `@marketsui/core`). The `-react` shell becomes the panels +
  toolbars. (`@marketsui/markets-grid-angular` would be a future
  port; not in scope here unless the Angular reference apps need it.)
- **X-5f** Subpath exports per module: `@marketsui/markets-grid/modules/conditional-styling`,
  `@marketsui/markets-grid/modules/column-customization`, etc. Adjust
  TS `exports` map and update imports.

**Acceptance:**
- Each component pair has the agnostic-core + framework-shell shape.
- Subpath imports work in both consumer apps and tests.
- Existing imports continue to work (subpath is additive).

**Risk:** ⚠ med. Mostly mechanical but with many imports to update.
Use codemods (e.g., `jscodeshift`).

**Effort:** ⏱ 1-2 weeks.

**Unblocks:** Phase X-8 (ESLint enforcement of the new layered shape).

---

### Phase X-6 — Opinionated route table `/c/<componentType>[/<subType>]`

**Goal:** every app's route table reduces to one canonical pattern.
Routes derive from the component-registry (no second source of
truth).

**Scope:**
- **X-6a** Build the route resolver: given a request for
  `/c/MarketsGrid/positions`, look up the registry, find the
  registration entry, render `<HostWrapper><MarketsGrid /></HostWrapper>`
  with the right launch context.
- **X-6b** Wire the resolver into one app (`demo-react`) alongside
  the existing routes. Verify both work.
- **X-6c** Migrate that app's routes to the new scheme one-by-one.
  Run e2e between each.
- **X-6d** Repeat per app.

**Acceptance:**
- Every app has a single 5-line route table file.
- Component-registry is the only source of truth for routing.
- Existing route paths remain valid (redirect or alias) so
  bookmarked URLs still work.

**Risk:** ⚠ med (routing is user-facing).

**Effort:** ⏱ 3-5 days.

**Unblocks:** Phase X-7.

---

### Phase X-7 — Reference apps: `apps/reference-react` + `apps/reference-angular`

**Goal:** ARCHITECTURE.md says "each [reference app] has exactly one
HostWrapper, one route table at `/c/...`, one runtime adapter
selection, one persistence selection." Build those.

**Scope:**
- **X-7a** New `apps/reference-react`. Imports `BrowserRuntime` from
  `@marketsui/runtime-browser`. ConfigManager defaults to
  `IndexedDbConfigManager` (current `LocalConfigClient`). Route
  table at `/c/...`. HostWrapper at the root. ~5 files total.
- **X-7b** New `apps/reference-angular`. Same shape using
  `HostService`.
- **X-7c** Smoke-test by launching all components from the registry.
  Should match the existing reference apps' UI exactly.
- **X-7d** Write `docs/REFERENCE_APP_LAYOUT.md` (referenced by
  ARCHITECTURE.md line 217).

**Acceptance:**
- Both reference apps render every registered component.
- e2e suite ported to run against `reference-react` instead of
  `demo-react` (or in addition).

**Risk:** 🟢 low (new apps, additive).

**Effort:** ⏱ 2-3 days.

**Unblocks:** Phase X-9 (legacy app decommission).

---

### Phase X-8 — ESLint enforcement of import boundary rules

**Goal:** the architecture's import rules become machine-enforced,
not convention.

**Scope:**
- Add `eslint-plugin-import` (already a transitive dep usually).
- Encode rules in `.eslintrc`:
  - Foundation packages (`shared-types`, `design-system`, `ui`,
    `icons`, `tokens-primeng`, `widget-sdk`, `runtime-port`) may
    only import from each other.
  - `runtime-openfin`, `runtime-browser` may import `runtime-port` +
    their respective platforms.
  - Only `runtime-openfin` and `apps/*` may import `@openfin/core`.
  - `*-core` packages don't import their `-react` or `-angular`
    siblings.
  - `*-react` packages only import their own `-core` + foundations +
    helpers (no other `-react`).
- Start with `warn` level. Once violations are zero, flip to `error`.

**Acceptance:**
- ESLint passes on every package.
- A test PR that violates a rule fails CI.

**Risk:** 🟢 low.

**Effort:** ⏱ 1 day to write rules + 1-3 days to fix existing
violations the rules catch.

**Unblocks:** confidence in subsequent refactors.

---

### Phase X-9 — Decommission legacy

**Goal:** delete what the new architecture replaced.

**Scope:**
- **X-9a** Delete `@marketsui/openfin-platform-stern` and
  `apps/stern-reference-{react,angular}` (per user "stern is
  reference only, will be removed").
- **X-9b** Delete `data-plane/src/providers/*` and
  `data-plane/src/services/*` v1 surface (only after Phase X-4
  consumers migrated).
- **X-9c** Decide per app: do `apps/demo-angular`,
  `apps/demo-configservice-react`, etc. stay as standalone scenarios,
  or are they retired now that `apps/reference-{react,angular}` host
  the same functionality? Per "demo apps stay" directive, default to
  KEEPING them; revisit only if the user asks.

**Acceptance:**
- `git grep '@marketsui/openfin-platform-stern'` returns 0.
- `apps/stern-reference-*` directories don't exist.
- `data-plane/src/providers/dataProviderConfigService.ts` and
  surrounding v1 surface gone.
- All e2e + unit tests still pass.

**Risk:** 🔴 HIGH for any deletion of code that consumers may still
depend on. Per-deletion verification.

**Effort:** ⏱ 2-3 days.

---

### Phase X-10 — Documentation alignment

**Goal:** every doc references the new architecture, not legacy.

**Scope:**
- Update `docs/ARCHITECTURE.md` once the migration is done — strip
  any "aspirational" wording, replace with "current state."
- Catalogue the 22+ packages in the table at the bottom of
  ARCHITECTURE.md (currently lists 18, missing `data-plane`,
  `data-plane-react`, `config-browser-{react,angular}`,
  `host-wrapper-react`, `runtime-port`, `runtime-browser`,
  `runtime-openfin`).
- Write or update:
  - `docs/REFERENCE_APP_LAYOUT.md` (Phase X-7d delivers this).
  - `docs/MIGRATION.md` — guide for downstream consumers if any
    exist outside this monorepo.
  - `docs/IMPLEMENTED_FEATURES.md` — bring it in sync per CLAUDE.md
    requirements.
- Delete superseded docs: `V3_ARCHITECTURE.md`, `V4_REBUILD_PLAN.md`
  (CLAUDE.md says these are superseded by the consolidation work).

**Acceptance:**
- Every doc reflects current code state.
- `IMPLEMENTED_FEATURES.md` has no stale entries.

**Risk:** 🟢 low.

**Effort:** ⏱ 1 day.

---

## 4. Cross-cutting concerns

### Testing strategy

Every phase concludes with **all three** before merging:
1. `npx turbo typecheck test` — must be at the same task count and
   green as before the phase started.
2. `npx playwright test` — pass count must be ≥ `main` baseline +
   1 flake budget. Profile-stress and popout tests are known
   timing-sensitive on Windows; document any new flakes vs prior
   pass.
3. Manual smoke for any UI surface the phase touched.

If a phase causes regressions: revert that phase's commits and
investigate. Don't carry regressions forward.

### Performance regression guard

Touching hot paths (data-plane, MarketsGrid Host, AG-Grid options) is
the highest-risk class of change. Path B's Phase C-3 caused user-visible
slowness even with all unit tests passing. Mitigations:
- Chrome DevTools profile before + after for any commit that touches
  Host, the data-plane subscribe path, or the active-profile flow.
- Keep the existing `DEBUG = false` log gates from Phase 2D;
  reactivate them locally for traces, leave off in committed code.
- Avoid adding component layers without first proving the existing
  inline layout is the actual bottleneck.

### Reverting

Every phase is structured so `git revert <phase-head-commit>` (or its
range) cleanly undoes the phase. Don't mix scopes within a commit.
Don't add phase X+1 work in phase X commits.

### Branch strategy

Recommend one long-lived branch per phase: `path-c/x-N-<short-name>`,
merged to `main` only after the verification gate passes. Within a
phase, work in feature commits but rebase before merge so the history
is linear.

### Parallel execution

Phases roughly:
- X-0, X-1, X-2 — independent, can parallelize.
- X-3 depends on X-1 (ConfigManager) and X-2 (Angular HostService).
- X-4 — independent until X-4i (consumer migration), which requires
  X-3 done for the same app.
- X-5 — independent of all the above; touches packaging, not runtime.
- X-6 — depends on X-3 (HostWrapper wired in apps).
- X-7 — depends on X-3, X-5, X-6.
- X-8 — independent; lint rules can be added at any point.
- X-9, X-10 — last; depend on all of the above.

A 2-engineer team could do X-1+X-2 in parallel, then X-3 in series, then
fan out X-4 + X-5 + X-8.

---

## 5. Open decisions

These need explicit answers before/during the relevant phase. Default
position offered when one exists.

1. **Namespace rename `@marketsui/*` → `@starui/*`?**
   ARCHITECTURE.md uses `@starui`. Default: **keep `@marketsui/*`** —
   the architectural shape works with either, and a rename is a
   massive churn event with no functional benefit. Adopt only if there
   is a branding/marketing driver.

2. **Slim `ConfigManager` vs current `ConfigClient`?**
   ARCHITECTURE.md says `ConfigManager` is "what every component
   consumes" — implying it's the narrow interface. Current
   `ConfigClient` has 30 methods. Default: **introduce a narrow
   `ConfigManager` and make `ConfigClient extends ConfigManager`.**
   `HostContext.configManager` is typed as the narrow one; consumers
   that need wide access can downcast or accept the wider type.

3. **Stern flavor — delete now or wait?**
   Per user, stern is reference-only and going away. Path B's commit
   `7fcb24f` (openfinDock into stern shell) is correct for the lifetime
   of the shell. Default: **delete in Phase X-9**, no earlier.

4. **Demo-app consolidation.**
   Per user "demo apps stay" — default is keep them. Revisit only
   if the user asks during Phase X-9.

5. **Subpath exports vs separate packages per module.**
   ARCHITECTURE.md explicitly says "subpath exports per module mean a
   panel imports its own logic from `@starui/markets-grid/modules/conditional-styling`
   — *not* a separate package per module. Discipline via convention;
   less ceremony." Default: follow the doc — subpath exports.

6. **DataProvider<T> column-defs source.**
   The interface has `getColumnDefs(): ColumnDefinition[]`. Should
   this be a synchronous getter (forcing column defs to be resolved
   at start-up) or async/observable (allowing late-arrival)? Default:
   **synchronous getter, resolved during `start()`** — matches how
   AG-Grid expects column defs.

7. **SharedWorker — single-page or per-origin?**
   `SharedDataProvider` proxies to a SharedWorker. Default:
   **per-origin SharedWorker** so multiple OpenFin views in the same
   workspace share one socket per provider id. Document the lifecycle
   (worker stays up across windows; closes when last window closes).

---

## 6. Definition of done for Path C

Path C is complete when:
1. Every entry in the "What's NOT done" table from the
   user-facing summary (the response that produced this doc) is
   ticked off.
2. e2e suite shows pass-count parity with `main` (or higher).
3. Performance smoke shows no regression on profile-switch,
   live-tick throughput, settings panel open, or initial mount time
   (use Chrome DevTools profile before+after for each phase that
   touches a hot path).
4. ESLint import rules ship at `error` level.
5. Documentation updated; `IMPLEMENTED_FEATURES.md` reflects current
   state.
6. PR-by-phase merged to `main`; legacy code deleted.

---

## 7. Estimated total effort

Sequential: ~4-6 weeks for one engineer.
Parallel (2 engineers): ~3-4 weeks.

Largest individual phases:
- X-3 (wire HostWrapper into apps): 1 week
- X-4 (DataProvider<T> rewrite): 1 week
- X-5 (modular component shape): 1-2 weeks

This is a real migration, not a tidy-up pass. Each step warrants its
own design discussion and can be paused/resumed independently.

---

## 8. Resumption notes (future Claude / future you)

If picking this up after a context loss:

1. **Read this doc plus** `docs/REFACTOR_WORKLOG.md` (Path B done log)
   for the current branch state.
2. **Run** `git log main..HEAD --oneline` on the work branch to see
   what's already landed.
3. **Pick the next unfinished phase** — work in dependency order
   (Section 4 "Parallel execution") unless a specific phase is
   explicitly prioritized.
4. **Follow the per-phase recipe**: scope → acceptance → risk →
   effort. Run the verification gate before merging.
5. **Update this doc** as work progresses — strike through completed
   acceptance criteria, add lessons-learned notes inline.

For any phase that touches `MarketsGrid.tsx`, the data-plane subscribe
path, the active-profile flow, or routing — **run the full Playwright
suite as part of the verification, not just unit tests**. Path B's
Phase C-3 taught us this the hard way.

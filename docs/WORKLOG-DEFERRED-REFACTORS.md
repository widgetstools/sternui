# Deferred Refactors — Session Worklog

> Three large refactors from the 12-item architectural audit. Five PRs
> already landed (vite alias hoist, data-services factory, demo-react
> shadcn buttons, popout transport, AppShell, theme reducer). The
> three remaining items are large enough to warrant dedicated sessions
> with their own test scaffolding.

**Each session is self-contained.** A fresh agent should be able to
read its section, open the cited files, and complete the work without
prior conversation context. File paths are absolute-relative from the
repo root (the worktree at `/Users/develop/wfh/sternui/.claude/worktrees/kind-bardeen-8191bb`).

**Required reading before any session:**
- [`CLAUDE.md`](../CLAUDE.md) — repo rules (package manager, naming, dep boundaries, commit trailer)
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — layer + import diagram
- The PR descriptions on the five merged PRs (#7–#9 and `feat/popout-transport-unified`, `feat/theme-reducer`) — context on what already changed

**Verification baseline every session must hit:**
- `npm run typecheck -w <affected-app>` clean
- Unit tests on every touched package — at minimum the existing baselines (see "Test baselines" below)
- `npx playwright test e2e/v2-two-grid-isolation.spec.ts e2e/design-system-smoke.spec.ts` — 5/5 pass
- The dev server for the affected app boots HTTP 200

**Test baselines (as of theme-reducer PR):**
- `runtime-port` 7/7
- `runtime-browser` 22/22
- `runtime-openfin` 18/18
- `host-wrapper-react` 5/5
- `app-shell-react` 5/5
- `data-services` 117/117
- `core` (ProfileManager) — run `npm test -w @starui/core` to capture current pass count before any session touches it
- Demo-react e2e: 5/5 in `v2-two-grid-isolation` + `design-system-smoke`

---

## Refactor 1: Split `MarketsGrid.tsx` (1376 LOC)

**Goal:** Break the god-component into a controller hook + several view-only sub-components. Behaviour must be **byte-for-byte identical** as measured by e2e.

**File:** [`packages/react/widgets/markets-grid/src/MarketsGrid.tsx`](../packages/react/widgets/markets-grid/src/MarketsGrid.tsx)

**Why it's hard:**
- Currently the file owns AG-Grid wrapping, profile state, toolbar logic, filter state, formatting toolbar, module state, admin actions, grid-level data persistence, profile clone/rename/export/import, and 25+ `console.log` traces.
- There are existing unit tests but they cover narrow paths (`marketsGrid.caption.test.tsx`, `MarketsGrid.devwarning.test.tsx`) — no characterisation tests for the full controller flow.
- The component takes ~30 props and forwards many to children. The split must preserve every prop and every observable side effect.

**Split into 3 sessions.** Do them in order.

---

### Session 1.1 — Write characterisation tests for `MarketsGrid`

**Before any code refactor**, lock down current behaviour with tests we can re-run after each split step.

**What to do:**

1. Read `MarketsGrid.tsx` end-to-end. Note every:
   - **Public prop** (the component's external API)
   - **`useEffect` / `useMemo` / `useCallback`** — these are the seams between state and view
   - **External call** — `console.log/warn` (treat as side effects, not signal), `localStorage`, `profileManager.*`, `gridApi.*`, `dataServices.*`, `runtime.*`
   - **Imperative ref handles** exposed via `onReady`, `gridRef`, etc.
2. Create `packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx`. Use Testing Library + jsdom. Mock AG-Grid via the existing `mock-ag-grid.ts` patterns in sibling tests (check `marketsGrid.caption.test.tsx` for the established mocking style).
3. Test cases to write (at minimum — add more if you spot ambiguous paths):
   - **Mount with no profile** → renders empty toolbar + grid, profileManager initialised with `gridId`
   - **Mount with active profile** → captureGridStateInto / restore called in the right order, no flicker
   - **`onReady` callback** — fires after grid is alive, payload shape `{ gridApi, profileManager }` matches today
   - **Profile switch via `<ProfileSelector>` change event** — saveActiveProfile, then switchProfile, then captureGridStateInto reload
   - **`saveActiveProfile` failure** → fires `console.warn` with `'[markets-grid] saveActiveProfile failed:'` (existing line 663)
   - **Clone / rename / export / import handlers** — match existing `console.warn` strings at lines 845, 853, 878, 888
   - **`onEditProvider` prop** — fires when the user clicks the edit-provider button on the toolbar
   - **`gridLevelData` save and load** — calls `adapter.loadGridLevelData(gridId)` once on mount, fires `console.log` at line 489/495/502
   - **`storageAdapter` swap mid-flight** — the component must rebuild ProfileManager and reload (this is a fragile path; pin it)
   - **Theme prop changes** — AG-Grid theme variant updates without grid remount
4. Each test asserts via:
   - Rendered DOM (selectors that match the existing component's `data-testid` attributes — DON'T invent new IDs the production code doesn't have)
   - Mock call sequences (vi.spyOn on the relevant adapter methods)
   - Console output captured with `vi.spyOn(console, 'warn')`
5. **Don't refactor anything.** This session is read-only on production code; only test files are added.

**Verify:**
- `npm test -w @starui/markets-grid` — all new tests pass on the unmodified code
- Run twice in a row to ensure no flakiness (Dexie / jsdom occasionally races)
- Open the failing assertions deliberately by hand-mutating one production line and confirming the test catches it; then revert

**Commit:** `test(markets-grid): characterisation tests for MarketsGrid controller surface`. Push as `feat/marketsgrid-split-tests`. Open PR. Land before Session 1.2.

**Out of scope:** Splitting code. Removing `console.log` traces. Renaming anything in `MarketsGrid.tsx`. Adding new behaviour. New test IDs (use existing).

---

### Session 1.2 — Extract `useMarketsGridController` hook

Start with the merged characterisation tests as the safety net.

**What to do:**

1. Create `packages/react/widgets/markets-grid/src/useMarketsGridController.ts` — a hook that takes the same prop set `MarketsGrid` receives today (or a subset — gridId, storageAdapter, profileManager, dataServices, onEditProvider, etc.) and returns:
   ```ts
   interface MarketsGridControllerHandle {
     readonly profileManager: ProfileManager;
     readonly gridApi: GridApi | null;
     readonly activeProfileId: string | null;
     readonly gridLevelData: GridLevelData | null;
     onGridReady(ev: GridReadyEvent): void;
     onCellValueChanged(ev: CellValueChangedEvent): void;
     onProfileSwitch(profileId: string): Promise<void>;
     onProfileClone(): Promise<void>;
     onProfileRename(newName: string): Promise<void>;
     onProfileExport(): Promise<void>;
     onProfileImport(payload: string): Promise<void>;
     onSaveAndSwitch(profileId: string): Promise<void>;
     onDiscardAndSwitch(profileId: string): Promise<void>;
     onSaveGridLevelData(data: GridLevelData): Promise<void>;
     // Plus whatever else the characterisation tests pinned down
   }
   ```
2. Move all `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo` blocks related to profiles, grid-level data, and lifecycle from `MarketsGrid.tsx` into this hook. The view component should be left with only:
   - Rendering JSX
   - Passing through callbacks from the hook
   - Forwarding props to AG-Grid and child components
3. Preserve every `console.log` / `console.warn` string verbatim (the characterisation tests assert on these strings).
4. The hook is **internal-only for now** — don't export it from the package barrel. Keep the public surface unchanged.
5. Update `MarketsGrid.tsx` to use the hook. The file should drop to ~400–500 LOC (the JSX + AG-Grid wiring).

**Verify:**
- `npm test -w @starui/markets-grid` — every characterisation test from Session 1.1 still passes
- `npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference` — clean
- E2E: `npx playwright test e2e/v2-two-grid-isolation.spec.ts e2e/design-system-smoke.spec.ts` — 5/5

**Commit:** `refactor(markets-grid): extract useMarketsGridController hook`. Push as `feat/marketsgrid-controller-hook`. PR.

**Out of scope:** Extracting view sub-components (that's Session 1.3). Renaming public props. Removing `console.log` traces. Changing the prop signature of `MarketsGrid`.

---

### Session 1.3 — Extract view sub-components

Final cleanup pass.

**What to do:**

1. Identify view-only chunks in the slimmed-down `MarketsGrid.tsx`:
   - **`<ProfileBar/>`** — the profile selector + save/clone/rename/export/import button group. Today this is inline JSX.
   - **`<AdminActions/>`** — the admin button row (edit provider, edit columns, etc.).
   - Anything else over ~100 LOC of JSX that has a clear name.
2. Each sub-component lives next to `MarketsGrid.tsx` (sibling files, not a new directory). Names match exports per [`CLAUDE.md` naming rules](../CLAUDE.md):
   - `ProfileBar.tsx` (component file)
   - `AdminActions.tsx`
3. Sub-components receive:
   - The controller handle from the hook (or specific callbacks destructured from it)
   - Plain props for static data (active profile id, profile list)
   - **No** direct access to ProfileManager / ConfigManager — that's Session 3's job. For now they call the controller callbacks.
4. After extraction, `MarketsGrid.tsx` should be **under 400 LOC** and read like a layout document — header + grid + footer, no logic.
5. **Do NOT** touch `HelpPanel.tsx`, `FiltersToolbar.tsx`, or `FormatterPicker.tsx` — those are Refactor 2.

**Verify:**
- `npm test -w @starui/markets-grid` — all green
- `npm run typecheck` on all three apps — clean
- E2E full regression suite — `npx playwright test` (NOT just the smoke spec — this is the last MarketsGrid step so run the full e2e once)
- File sizes: `wc -l packages/react/widgets/markets-grid/src/MarketsGrid.tsx` should report under 400
- Run a dev server for `markets-ui-react-reference` and click through manually: open a profile, edit it, save, clone, rename, export, import. Each interaction should behave identically to before.

**Commit:** `refactor(markets-grid): extract ProfileBar + AdminActions view components`. PR.

**Out of scope:** Profile state consolidation (Refactor 3). Changing public API. Removing `console.log` traces (a separate cleanup PR after Refactor 3 lands).

---

## Refactor 2: Split `HelpPanel` / `FiltersToolbar` / `FormatterPicker`

Three large files, each in a different package. They're independent — can be done in any order across **3 separate sessions**.

| File | LOC | Package |
|---|---|---|
| [`HelpPanel.tsx`](../packages/react/widgets/markets-grid/src/HelpPanel.tsx) | 1174 | `@starui/markets-grid` |
| [`FiltersToolbar.tsx`](../packages/react/widgets/markets-grid/src/FiltersToolbar.tsx) | 795 | `@starui/markets-grid` |
| [`FormatterPicker.tsx`](../packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.tsx) | 1002 | `@starui/grid-react` |

---

### Session 2.1 — Split `HelpPanel.tsx` (content → JSON)

**Pattern:** Most of the file's bulk is hardcoded help content (markdown-ish strings, code samples, keyboard shortcut tables). Move data out to JSON, leave the modal shell.

**What to do:**

1. Read [`HelpPanel.tsx`](../packages/react/widgets/markets-grid/src/HelpPanel.tsx). Identify the content structure — typically arrays of `{ title, body, examples? }` blocks.
2. Define a TypeScript type for the content shape: `interface HelpSection { id: string; title: string; body: string; examples?: { lang: string; code: string }[] }`. Put it in `src/help/types.ts`.
3. Move the content data into `src/help/sections.ts` as an exported `const SECTIONS: HelpSection[] = [...]`. **No JSX in this file** — only data.
4. The modal shell stays in `HelpPanel.tsx` but should drop to ~150 LOC: panel chrome, search input, section navigation, body renderer (Markdown? syntax highlight?). The renderer consumes `SECTIONS`.
5. If there's a Markdown renderer in the codebase, reuse it. If sections are pre-rendered HTML strings (which would be a code smell), flag in the PR description but don't fix in this session — that's a follow-up.
6. **No new dependencies.** If you want a Markdown renderer and one isn't already in the workspace, write a plan as a follow-up issue instead of adding it here.

**Tests:**
- Add a quick unit test that asserts:
  - The modal renders with a known number of sections
  - Clicking section navigation switches the displayed body
  - Search input filters sections by `title` (if search exists today — check by reading the current code)

**Verify:**
- `npm test -w @starui/markets-grid`
- `npm run typecheck` on all three apps
- Dev-server smoke: open the HelpPanel manually (find the trigger in `MarketsGrid.tsx` — look for `<HelpPanel>` references). Every section renders, the right body shows when navigated.

**Commit:** `refactor(markets-grid): split HelpPanel — content to data, JSX to shell`. PR.

**Out of scope:** Adding a Markdown renderer. Rewriting any section's content. Changing the trigger UI.

---

### Session 2.2 — Split `FiltersToolbar.tsx` (extract `useFilterModel` hook)

**Pattern:** The file mixes filter state management (AG-Grid's `filterModel`, user-pinned quick filters, filter chips) with toolbar JSX. Extract a hook.

**What to do:**

1. Read [`FiltersToolbar.tsx`](../packages/react/widgets/markets-grid/src/FiltersToolbar.tsx). Identify:
   - State pieces (active filter set, pinned columns, filter chip data)
   - Side effects (subscribing to `gridApi.addEventListener('filterChanged', …)`)
   - Pure rendering chunks (chip row, filter dropdown, clear button)
2. Create `src/useFilterModel.ts` — a hook that:
   - Takes the `gridApi` ref or the controller from Refactor 1
   - Returns the live filter state + handlers (`setFilter`, `clearFilter`, `pinColumn`, etc.)
   - Subscribes to AG-Grid's `filterChanged` event with proper cleanup
3. `FiltersToolbar.tsx` becomes a dumb component that consumes the hook and renders JSX. Should drop to under 250 LOC.
4. **No public API change.** The component's prop signature stays the same.
5. Subscription cleanup: confirm that `useEffect` returns a function that removes the AG-Grid listener (Refactor 1's hook may have already handled this — verify).

**Tests:**
- Unit test for `useFilterModel`:
  - Mount with a stub `gridApi`. The hook should subscribe to `filterChanged` on mount and unsubscribe on unmount.
  - Calling the returned `setFilter` should call `gridApi.setFilterModel` (or whatever the production code does today — read first).
  - Filter chips reflect the current filter state.

**Verify:**
- `npm test -w @starui/markets-grid`
- E2E full regression
- Dev server smoke: open a grid, apply a filter, clear it, pin a column. Behaviour identical.

**Commit:** `refactor(markets-grid): extract useFilterModel from FiltersToolbar`. PR.

**Out of scope:** Touching AG-Grid's filter API. Changing the filter chip visual. Persistence layer changes (Refactor 3).

---

### Session 2.3 — Split `FormatterPicker.tsx` (column-type adapters → table-driven config)

**Pattern:** The file has a large switch/match on column data type (`'number' | 'string' | 'date' | 'currency' | …`) where each branch builds a different set of formatter options. Move per-type config to a table.

**What to do:**

1. Read [`FormatterPicker.tsx`](../packages/react/widgets/grid-react/src/ui/FormatterPicker/FormatterPicker.tsx).
2. Identify the column-type branches. Each typically defines:
   - A list of available formatters (e.g. `'comma' | 'percent' | 'currency'`)
   - Their UI labels
   - Their default options
   - Their preview value
3. Build a `FormatterTypeConfig` table:
   ```ts
   interface FormatterTypeConfig {
     types: readonly Formatter[];
     defaults: Record<Formatter, FormatterOptions>;
     preview: (formatter: Formatter, options: FormatterOptions) => string;
   }
   const FORMATTERS_BY_COLUMN_TYPE: Record<ColumnType, FormatterTypeConfig> = { … };
   ```
4. Put the table in `src/ui/FormatterPicker/formattersByType.ts`. The picker consumes it; no more `switch (colType)` in JSX.
5. Picker JSX drops to ~200–300 LOC; the rest is the data table.

**Tests:**
- Unit test that asserts:
  - For each column type, the picker offers the expected formatter set (drives directly from the table)
  - Selecting a formatter calls the consumer's `onChange` with the right payload
  - Preview text matches the table's `preview` function

**Verify:**
- `npm test -w @starui/grid-react`
- E2E full regression
- Dev server smoke: open the formatter picker on a number column, a date column, a string column. Each should offer the same options as before.

**Commit:** `refactor(grid-react): table-driven FormatterPicker — column-type adapters`. PR.

**Out of scope:** Adding new formatter types. Changing the formatter's runtime application (that's AG-Grid value-formatter territory, separate concern). The picker's positioning / popup behaviour.

---

## Refactor 3: Consolidate profile state (single source of truth)

**Goal:** Profile state today lives in three places — `ProfileManager` (`@starui/core/profiles/`, IndexedDB via Dexie), `ConfigManager` (`@starui/config-service`, REST mirror + Dexie), and component-local `useState`. Migrate to `ConfigManager` as the single owner; `ProfileManager` becomes a thin façade.

**Depends on:** Refactor 1 must land first. Refactor 2 doesn't matter.

**Files:**
- [`packages/shared/core/src/profiles/ProfileManager.ts`](../packages/shared/core/src/profiles/ProfileManager.ts) — 851 LOC
- [`packages/shared/core/src/profiles/types.ts`](../packages/shared/core/src/profiles/types.ts)
- [`packages/shared/services/config-service/src/ConfigManager.ts`](../packages/shared/services/config-service/src/ConfigManager.ts)
- Consumers in `@starui/grid-react`, `@starui/markets-grid`, three apps

**Why it's the largest:**
- Two storage backends (Dexie via ProfileManager, Dexie + REST via ConfigManager) currently mirror each other unevenly. Profile rows can land in one but not the other if a save is interrupted.
- ProfileManager has its own subscriber pattern; ConfigManager has its own. Migrating consumers means converging on one event surface.
- The audit symptom: "ProfileManager state invisible to ConfigManager auditing; theme stored twice (AppData + localStorage)". Theme is fixed by Refactor 1 (theme reducer); this refactor finishes the profile half.

**Split into 3 sessions.**

---

### Session 3.1 — Audit + design

**No code changes.** This session produces a written design doc that becomes the PR description for Sessions 3.2–3.3.

**What to do:**

1. Map every read site of ProfileManager:
   ```bash
   grep -rln "ProfileManager\|profileManager" packages apps \
     --include="*.ts" --include="*.tsx" \
     | grep -v node_modules | grep -v dist
   ```
   For each file, note: read method called, write method called, subscription pattern.
2. Map every read site of ConfigManager (`@starui/config-service`):
   ```bash
   grep -rln "configManager\|ConfigManager\." packages apps \
     --include="*.ts" --include="*.tsx" \
     | grep -v node_modules | grep -v dist
   ```
   Same fields.
3. Identify the data shapes:
   - `ProfileSnapshot` from `@starui/core/profiles/types.ts`
   - `AppConfigRow` from `@starui/config-service` (or whatever the equivalent type is — read first)
   - Where they overlap, where they diverge
4. Identify storage paths:
   - ProfileManager → Dexie database name? table name? key shape?
   - ConfigManager → Dexie database name? REST endpoint when in REST mode?
   - Are they the SAME Dexie database or different? (If different, migration needs a one-shot copy)
5. Identify the failure modes the consolidation must preserve or fix:
   - REST-mode write failures queue in `PENDING_SYNC` — does ProfileManager have an equivalent? If not, profiles silently lost?
   - ProfileManager has a clone/rename API — does ConfigManager?
6. Write the design as `docs/PROFILE-STATE-CONSOLIDATION.md`. Include:
   - **Current state** table (rows: feature; columns: ProfileManager, ConfigManager, ✓/✗)
   - **Target state** — what API `useProfiles()` looks like, where data lives
   - **Migration path** — Dexie copy script, or runtime fallback that reads both? Pick one with justification
   - **Risk list** — concrete e2e scenarios that could regress
   - **Out of scope** — what stays unchanged (e.g., the audit log via `AppData` rows)

**Verify:**
- The design doc compiles in someone's head: the next agent can read it and start Session 3.2 without re-doing the audit.
- The doc explicitly states the storage choice and the migration script's shape (even if not yet written).

**Commit:** `docs: profile state consolidation design`. PR. Land before Session 3.2.

**Out of scope:** Writing any TypeScript. Modifying any production file.

---

### Session 3.2 — Migrate ProfileManager to a ConfigManager-backed façade

**Prerequisite:** Session 3.1's design doc is merged. Read it before starting.

**What to do:**

1. Add new ConfigManager methods (or wrapper) that cover the ProfileManager API surface:
   - `listProfiles(gridId): Promise<ProfileSnapshot[]>`
   - `saveProfile(snap): Promise<void>`
   - `deleteProfile(gridId, profileId): Promise<void>`
   - `subscribeProfiles(gridId, fn): Unsubscribe`
   - Anything else the design doc identifies
2. Write a Dexie migration: on first boot after this session's PR lands, copy any ProfileManager-owned rows from its Dexie table into the ConfigManager Dexie tables. Idempotent — keyed on a stored `profile-migration-v1: 'done'` flag.
3. Rewrite `ProfileManager` as a thin façade. The internal methods call the new ConfigManager API. Public signature **unchanged** — all consumers continue to compile.
4. Move the existing `ProfileManager.test.ts` test cases over. They should pass against the new implementation. If any break, that's a behaviour regression — fix the façade.
5. Add new unit tests in `@starui/config-service`:
   - `listProfiles` returns rows the migration copied
   - `saveProfile` round-trips
   - `subscribeProfiles` fires on save
   - Migration is idempotent (run twice, no duplicates)

**Verify:**
- `npm test -w @starui/core` — ProfileManager tests pass
- `npm test -w @starui/config-service` — new tests pass + existing don't regress
- `npm test -w @starui/markets-grid` — all green (façade preserves behaviour)
- E2E full regression
- Dev server smoke for `demo-configservice-react`:
  - Boot once — migration should run silently
  - Save a profile, reload, profile still there
  - Open the ConfigBrowser popout, the profile rows are visible (they weren't before — that's the audit symptom this PR closes)

**Commit:** `refactor(core): ProfileManager backed by ConfigManager — single source of truth`. PR.

**Out of scope:** Removing the `ProfileManager` façade (consumers still import it). Changing public types. Dropping any ProfileManager method.

---

### Session 3.3 — Migrate consumers off the façade + delete ProfileManager

**Prerequisite:** Session 3.2 merged. Migration has run in any user environment that booted in between.

**What to do:**

1. Find every `import { ProfileManager } from '@starui/core'` (or similar):
   ```bash
   grep -rln "from '@starui/core'.*ProfileManager\|ProfileManager.*from '@starui/core'" packages apps \
     --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v dist
   ```
2. Replace with direct `configManager.profiles.*` calls (or whatever API name 3.1 settled on). The hook surface in `@starui/grid-react`'s `useProfileManager` becomes a thin wrapper over the new API.
3. Delete `packages/shared/core/src/profiles/ProfileManager.ts` and the façade. Keep `types.ts` (the `ProfileSnapshot` type is still useful).
4. Update the `@starui/core` barrel to stop exporting `ProfileManager`.
5. Update consumer docstrings to reference the new API.

**Migration concern:** Sessions 3.2 and 3.3 must be merged separately — never combine them in one PR. The reason: if 3.3 ships before the migration in 3.2 has run on user devices, users lose their profiles. The two-step merge ensures every user boots once on the façade (which triggers migration) before the façade is removed.

**Verify:**
- `npm test` (every package) — green
- `npm run typecheck` (every app) — clean
- E2E full regression
- Dev server smoke on **every** app: demo-react, demo-configservice-react, markets-ui-react-reference. Open a profile, edit, save, switch profile, clone, rename, export, import. Every interaction must behave identically to before.
- Check `wc -l` for the deleted files. The PR should remove > 850 LOC net.

**Commit:** `refactor(core): remove ProfileManager — consumers use ConfigManager directly`. PR.

**Out of scope:** Removing other modules from `@starui/core`. Renaming `ProfileSnapshot`. Touching the AppData mirror.

---

## Cross-cutting cleanup (do AFTER all three refactors land)

These are tail items that depend on the refactors above being complete. Bundle them into one final PR.

1. **Strip the remaining `console.log` traces** in production paths. After Refactor 1, the controller hook is the natural home for any debug logging. Gate all of it behind `import.meta.env.DEV`.
2. **Update `docs/IMPLEMENTED_FEATURES.md`** — that file is referenced from CLAUDE.md but doesn't exist. Either create it with a summary of all 12 audit items, or remove the reference from CLAUDE.md.
3. **Add docs to `docs/ARCHITECTURE.md`** describing the new seams: `useMarketsGridController`, the runtime theme reducer, the popout transport on `RuntimePort`.

**Commit:** `chore: post-refactor cleanup — strip dev logs, update docs`. PR.

---

## Session sequencing summary

```
Refactor 1: Split MarketsGrid
  ↓ Session 1.1 — characterisation tests
  ↓ Session 1.2 — useMarketsGridController hook
  ↓ Session 1.3 — extract view sub-components

Refactor 2: Split toolbars (any order, parallel to anything)
  ↓ Session 2.1 — HelpPanel
  ↓ Session 2.2 — FiltersToolbar
  ↓ Session 2.3 — FormatterPicker

Refactor 3: Consolidate profile state (DEPENDS ON Refactor 1)
  ↓ Session 3.1 — audit + design doc
  ↓ Session 3.2 — ProfileManager → ConfigManager façade
  ↓ Session 3.3 — remove façade, migrate consumers

Final: cross-cutting cleanup
```

**Total: 9 sessions across ~3 calendar weeks** at typical agent-session pacing. Each session ends with a green CI + a merged PR; nothing in this worklog ships without verification at the session boundary.

## What NOT to do in any session

- Don't combine sessions. Each is sized to fit one focused agent run.
- Don't skip the characterisation tests in Session 1.1. The whole refactor sequence depends on them.
- Don't refactor public prop signatures. Every change must be drop-in for existing consumers.
- Don't add new dependencies. If you find you need one, flag it in the PR and add it in a follow-up.
- Don't rename `ProfileSnapshot`, `AppConfigRow`, or any other widely-imported type.
- Don't bypass `npm ci --legacy-peer-deps` — the flag is permanent (see CLAUDE.md).
- Don't `git push --no-verify` or `git commit --amend` on shipped commits.

## When the user's review is needed

- **Before Session 1.1 starts** — confirm the proposed test list captures the right behaviour.
- **Before Session 3.1 starts** — the design doc is the most consequential decision in the whole worklog. Get explicit approval on the API shape.
- **After Session 3.2 PR is open** — the migration runs on user devices; review the migration logic carefully.
- **Any session that takes more than 3 hours** — stop, summarise progress, ask whether to continue or split further.

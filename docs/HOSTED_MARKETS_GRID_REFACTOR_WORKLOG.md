# HostedMarketsGrid Refactor — Worklog

**One-line goal:** consolidate the 6-deep `BlottersMarketsGrid → HostedFeatureView → HostedComponent → BlotterGrid → MarketsGridContainer → MarketsGrid` stack into a single `<HostedMarketsGrid>` exported from `@marketsui/widgets-react`, with zero behavior loss.

**Branch:** `refactor/hosted-markets-grid-unify` (forked from `main` at `516ba7a`).
**Plan file:** `C:/Users/develop/.claude/plans/after-nalyzing-the-react-shimmering-sprout.md` — read for full context if anything below is unclear.

---

## Read me first (unchanging context for every session)

### Decisions already made

| # | Decision | Rationale |
|---|---|---|
| D1 | OpenFin **and** browser, single component, auto-detect via `fin.me` | Mirrors existing `isOpenFin()` in `apps/markets-ui-react-reference/src/main.tsx:81-90` |
| D2 | Drop the auto-hide hover debug header | Already moved into `MarketsGrid`'s toolbar ⓘ popover by commit `1fc5a01` on main |
| D3 | Provider picker baked in (always wires `MarketsGridContainer`) | Matches every current usage |
| D4 | Delete old layers when wrapper lands | `HostedComponent`, `HostedFeatureView`, app-inline `BlotterGrid`, and unused package-level `SimpleBlotter` + `BlotterGrid` |
| D5 | Theme = `agGridBlotter{Light,Dark}Params` from design-system adapter | Single source — preset added in commit `e0040b2` |
| D6 | Identity / registry types **become public API** of `@marketsui/widgets-react` | User decision — explicit contract for consumers |
| D7 | Flat props (no `gridProps` escape-hatch nesting) | Recommended React-composition practice; explicit > namespaced |

### Parity matrix (every row must survive — except row 21 which D2 already relocated)

| # | Feature | New home |
|---|---|---|
| 1 | OpenFin identity via `fin.me.getOptions()` | `useHostedIdentity` |
| 2 | Browser fallback (URL param + props) | `useHostedIdentity` |
| 3 | `componentType` / `componentSubType` / `isTemplate` / `singleton` from registry | `useHostedIdentity` |
| 4 | Storage factory auto-injects registered metadata | `useHostedIdentity` |
| 5 | ConfigManager singleton resolution + memoization | `HostedMarketsGrid` |
| 6 | `withStorage` opt-in to ConfigService adapter | `HostedMarketsGrid` prop |
| 7 | Document title set on mount, restored on unmount | `HostedMarketsGrid` effect |
| 8 | Full-bleed fixed layout (padding reset, flex column) | `HostedMarketsGrid` JSX |
| 9 | DataPlane provider mount | `HostedMarketsGrid` wraps `<DataPlaneProvider>` |
|10 | ConfigManager loading-state guard | `HostedMarketsGrid` |
|11 | AG-Grid blotter theme (teal selection, mono, etc.) | `useAgGridTheme` → `agGridBlotter*` |
|12 | Theme switching driven by `useTheme()` | `useAgGridTheme` |
|13 | `showFiltersToolbar` / `showFormattingToolbar` flags | `HostedMarketsGrid` props |
|14 | `openProviderEditorPopout` callback | `HostedMarketsGrid.onEditProvider` |
|15 | Legacy `marketsgrid-view-state::*` cleanup | One-shot effect inside wrapper |
|16 | Provider picker (Alt+Shift+P, ProviderToolbar) | Inherited via `MarketsGridContainer` |
|17 | Snapshot + live-update subscription lifecycle | Inherited |
|18 | Grid-level provider persistence | Inherited |
|19 | Profile manager / settings sheet / dirty dot | Inherited |
|20 | Admin actions, headerExtras, gridLevelData passthrough | `HostedMarketsGrid` flat props |
|21 | Debug header chips | **Already relocated** in commit `1fc5a01` (toolbar ⓘ popover) |

### Reference files (current implementations being collapsed)

- `apps/markets-ui-react-reference/src/components/HostedComponent.tsx` — identity + storage wrap (~315 LOC, post-commit `1fc5a01`)
- `apps/markets-ui-react-reference/src/components/HostedFeatureView.tsx` — DataPlane mount
- `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx` — current call site + inline `BlotterGrid`
- `packages/widgets-react/src/v2/markets-grid-container/` — provider picker (kept; composed in)
- `packages/markets-grid/src/MarketsGrid.tsx` — core grid (kept)
- `packages/design-system/src/adapters/ag-grid.ts` — `agGridBlotter{Light,Dark}Params` (use these)

### Conventions

- **Branch**: stay on `refactor/hosted-markets-grid-unify`. Don't merge to main without sign-off.
- **Commits**: conventional prefixes per `CLAUDE.md`. End every commit with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Per-session commit cadence**: each session lands ≥1 commit. Update the **Session log** at the bottom of this file with `<commit-sha> | session N | one-line summary`.
- **Tests**: each new module ships with the Vitest specs called out in its session. No code without tests for that session's parity rows.
- **Stop conditions**: if a session's acceptance criteria can't be met, do **not** proceed to the next session. Document the blocker in the Session log and ask.

---

## Sessions

Each session is sized to ~30–90 minutes of focused work. Sessions are sequential — later sessions assume earlier ones landed. Resume by saying `read worklog, implement session N`.

---

### Session 1 — Promote identity / registry types to public API

**Goal:** Move `HostedContext` and the registered-component metadata shape out of `apps/markets-ui-react-reference` and into a new public module of `@marketsui/widgets-react`. No behavior change yet — just type relocation, with the app re-importing from the new location.

**Preconditions**
- On branch `refactor/hosted-markets-grid-unify`
- HEAD = `e0040b2` or any later refactor-branch commit
- `npx turbo typecheck` is green

**Steps**
1. Create `packages/widgets-react/src/hosted/types.ts` exporting:
   - `HostedContext` (lifted from `apps/markets-ui-react-reference/src/components/HostedComponent.tsx` — `instanceId`, `appId`, `userId`, `configManager`, `storage`)
   - `RegisteredComponentMetadata` (`componentType`, `componentSubType`, `isTemplate`, `singleton` — read those four field names off the existing `fin.me.getOptions()` parsing in `HostedComponent.tsx`; check the `useEffect` that calls `getOptions()` for the exact shape)
   - `StorageAdapterFactory` re-export from wherever it currently lives in core (grep first; do not duplicate)
   - JSDoc on every member explaining what it represents and when it is `undefined`
2. Create `packages/widgets-react/src/hosted/index.ts` re-exporting the types.
3. Add a barrel entry to `packages/widgets-react/src/index.ts` for `./hosted` so consumers can import from `@marketsui/widgets-react/hosted`.
4. Update `apps/markets-ui-react-reference/src/components/HostedComponent.tsx` to **import** `HostedContext` from `@marketsui/widgets-react/hosted` instead of redeclaring it (delete the local declaration).
5. Update every other app file that imports `HostedContext` from `'../components/HostedComponent'` to import from `@marketsui/widgets-react/hosted`. Use Grep to find them all.

**Acceptance criteria**
- `npx turbo typecheck` green
- `npx turbo build --filter=@marketsui/widgets-react` green
- `git grep "HostedContext" apps/markets-ui-react-reference/src` shows only imports, no declarations
- The app behavior is unchanged (no runtime test needed yet — pure type move)

**Commit message template**
```
refactor(widgets-react): promote HostedContext and RegisteredComponentMetadata to public types

Lifts the identity context shape out of the reference app into
@marketsui/widgets-react/hosted so external consumers of the
upcoming HostedMarketsGrid have a documented contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 1 | public types in widgets-react/hosted`.

---

### Session 2 — Build `useHostedIdentity` hook

**Goal:** Extract the identity resolution + storage factory wrapping (parity rows 1–4) from `HostedComponent.tsx` into a generic, tested hook in `@marketsui/widgets-react/hosted`.

**Preconditions**
- Session 1 committed
- `HostedContext` importable from `@marketsui/widgets-react/hosted`

**Steps**
1. Create `packages/widgets-react/src/hosted/useHostedIdentity.ts` with the signature:
   ```ts
   export function useHostedIdentity(args: {
     defaultInstanceId: string;
     defaultAppId?: string;        // default 'markets-ui-reference'
     defaultUserId?: string;       // default 'dev1'
     withStorage?: boolean;        // default false
     configManager?: ConfigManager;// optional override; otherwise singleton
     componentName: string;        // used by storage factory for diagnostics
   }): { identity: HostedContext; ready: boolean }
   ```
2. Internal flow (lifted from `HostedComponent.tsx`):
   - **OpenFin path**: try `fin.me.getOptions()` (typeof `fin !== 'undefined'`). Read `instanceId`, `appId`, `userId`, `componentType`, `componentSubType`, `isTemplate`, `singleton` from `customData`. Wrap in try/catch — any throw means browser path.
   - **Browser path**: read `?instanceId=` from `window.location.search`; fall back to `defaultInstanceId`. Same for appId/userId via props.
   - ConfigManager singleton: import from core (grep `getConfigManager` or similar in `packages/core`), memoize for the lifetime of the hook.
   - Storage factory wrap: when `withStorage=true`, build a `StorageAdapterFactory` that auto-injects the four registered-component fields into every adapter call (copy verbatim from `HostedComponent.tsx`'s `wrappedStorage` factory).
   - Return `ready=false` while the OpenFin async resolution is in flight; flip to `true` once `instanceId` is populated.
3. Create `packages/widgets-react/src/hosted/__tests__/useHostedIdentity.openfin.test.tsx`:
   - Mock `globalThis.fin = { me: { getOptions: vi.fn().mockResolvedValue({ customData: { instanceId: 'X', appId: 'A', userId: 'U', componentType: 'CT', componentSubType: 'CST', isTemplate: false, singleton: true } } } }`
   - Render a probe child via `renderHook`
   - Assert resolved identity matches and storage factory injects metadata
4. Create `useHostedIdentity.browser.test.tsx`:
   - Leave `fin` undefined; set `window.location` search to `?instanceId=B`
   - Assert fallback behavior
5. Create `useHostedIdentity.storage-wrap.test.tsx`:
   - Mock the underlying `ConfigService` adapter; assert the wrapper passes `componentType` etc. on every `getConfig`/`saveConfig`/`deleteConfig` call

**Acceptance criteria**
- All three Vitest files pass
- `npx turbo typecheck build` green
- The hook is exported from `@marketsui/widgets-react/hosted`

**Commit message template**
```
feat(widgets-react): add useHostedIdentity hook with OpenFin/browser dual path

Generic identity-resolution hook for hosted features. OpenFin path
reads fin.me.getOptions(); browser path falls back to URL param +
defaults. When withStorage is true, returns a StorageAdapterFactory
that auto-injects registered-component metadata (componentType,
componentSubType, isTemplate, singleton) into every adapter call.

Covers parity rows 1-4. Tests mock both runtime paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 2 | useHostedIdentity + tests`.

---

### Session 3 — Build `useAgGridTheme` helper

**Goal:** Single tiny helper that returns the AG-Grid theme object for a blotter, reactive to `ThemeContext`. Consumes the design-system blotter preset only (no local color/font definitions).

**Preconditions**
- Session 2 committed
- `agGridBlotter{Light,Dark}Params` exported from `@marketsui/design-system` (commit `e0040b2`)

**Steps**
1. Identify the project's React ThemeContext source. The reference app uses `useTheme()` from `apps/markets-ui-react-reference/src/context/ThemeContext.tsx`. **Do not** import the app's context inside a package. Two options — pick whichever already exists:
   - If `@marketsui/widgets-react` (or `core`) already exports a theme hook (`useTheme`, `useResolvedTheme`, etc.) — use it. Grep first.
   - Otherwise, the helper takes a `theme: 'auto' | 'dark' | 'light'` prop and resolves `'auto'` by reading `document.documentElement.dataset.theme` with a `MutationObserver` fallback for live switching.
2. Create `packages/widgets-react/src/hosted/useAgGridTheme.ts`:
   ```ts
   export function useAgGridTheme(mode: 'auto' | 'dark' | 'light' = 'auto'): Theme
   ```
   Internally: `themeQuartz.withParams(isDark ? agGridBlotterDarkParams : agGridBlotterLightParams)`. Memoize per `isDark`.
3. Tests in `__tests__/useAgGridTheme.test.tsx`:
   - **theme-source.test**: assert the params object passed to `withParams` deep-equals `agGridBlotterLightParams` / `agGridBlotterDarkParams`. Spy on `themeQuartz.withParams` (vi.spyOn) and read its first call arg. Guards against drift.
   - **theme-context.test**: render with mode `'auto'`, flip `data-theme` on `<html>`, assert returned theme switches. Use `act(() => document.documentElement.setAttribute('data-theme', 'light'))` and re-render assertion.

**Acceptance criteria**
- Both tests pass
- `npx turbo typecheck build` green
- No hex colors or font names appear in `useAgGridTheme.ts` (grep `#[0-9a-fA-F]` and `JetBrains` to verify)

**Commit message template**
```
feat(widgets-react): add useAgGridTheme helper consuming blotter preset

Single-source theme helper for HostedMarketsGrid. Consumes
agGridBlotter{Light,Dark}Params from @marketsui/design-system and
reacts to ThemeContext / data-theme attribute. No local color or
font definitions; updating the design-system preset re-themes every
blotter at once.

Covers parity rows 11-12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 3 | useAgGridTheme + tests`.

---

### Session 4 — Assemble `HostedMarketsGrid` wrapper

**Goal:** Compose the wrapper using session 1–3 building blocks plus `MarketsGridContainer`. Flat props (no `gridProps` nesting per D7).

**Preconditions**
- Sessions 1–3 committed
- `useHostedIdentity` and `useAgGridTheme` in `@marketsui/widgets-react/hosted`

**Steps**
1. Create `packages/widgets-react/src/hosted/HostedMarketsGrid.tsx`. Final prop shape (all flat; merge identity, theme, container, and grid passthrough props at top level):
   ```ts
   export interface HostedMarketsGridProps {
     // Identity
     componentName: string;
     defaultInstanceId: string;
     defaultAppId?: string;
     defaultUserId?: string;
     documentTitle?: string;
     // Storage / config
     withStorage?: boolean;
     configManager?: ConfigManager;
     // Theme
     theme?: 'auto' | 'dark' | 'light';
     // Data-plane / provider picker
     dataPlaneClient?: DataPlaneClient;
     historicalDateAppDataRef?: string;
     onEditProvider?: (providerId: string) => void;
     onError?: (error: Error) => void;
     // Toolbar visibility
     showFiltersToolbar?: boolean;
     showFormattingToolbar?: boolean;
     // Grid passthrough (flat — pick the ones blotters actually use)
     gridId: string;
     defaultColDef?: ColDef;
     modules?: CockpitModule[];
     adminActions?: AdminAction[];
     headerExtras?: ReactNode;
     // ... add any remaining MarketsGridProps that current BlottersMarketsGrid passes
   }
   ```
2. Internal composition (top-down, no render props):
   ```tsx
   <DataPlaneProvider client={resolvedClient}>
     <FullBleedLayout>                        {/* parity row 8 */}
       <ConfigManagerLoadingGuard>            {/* parity row 10 */}
         <MarketsGridContainer
           {...identity}
           theme={agTheme}
           {...containerProps}
         />
       </ConfigManagerLoadingGuard>
     </FullBleedLayout>
   </DataPlaneProvider>
   ```
3. Add `useDocumentTitle(documentTitle)` effect (parity row 7).
4. Add the legacy `marketsgrid-view-state::*` cleanup effect (parity row 15) — gated by a sentinel (`localStorage.getItem('hosted-mg.legacy-cleanup') !== '1'`) so it only runs once ever per browser.
5. Re-export `HostedMarketsGrid` from `@marketsui/widgets-react/hosted` and from the package root index.
6. Smoke test only this session — full parity matrix tests are session 5. One render test: mount `<HostedMarketsGrid gridId="t1" defaultInstanceId="t1" componentName="Test"/>` with mocked DataPlane + ConfigManager and assert it renders without throwing.

**Acceptance criteria**
- `npx turbo typecheck build` green
- Smoke test passes
- Wrapper exported from package root

**Commit message template**
```
feat(widgets-react): add HostedMarketsGrid wrapper

Single component that composes useHostedIdentity, useAgGridTheme,
DataPlaneProvider, full-bleed layout, ConfigManager loading guard,
and MarketsGridContainer. Flat prop API (no nesting). Replaces the
six-deep BlottersMarketsGrid stack from the reference app.

Covers parity rows 5-10, 13-15. Provider-picker and grid features
inherited from the composed container.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 4 | HostedMarketsGrid wrapper + smoke test`.

---

### Session 5 — Vitest parity coverage

**Goal:** Land one passing test per parity-matrix row that is observable from the wrapper boundary. Sessions 2 and 3 already covered rows 1–4 and 11–12; this session covers the rest at the integration boundary.

**Preconditions**
- Sessions 1–4 committed
- Wrapper renders in the smoke test

**Steps**
1. Create files under `packages/widgets-react/src/hosted/__tests__/`:
   - `config-manager.test.tsx` — singleton reused across mounts; loading guard renders fallback (rows 5, 10)
   - `with-storage.test.tsx` — toggling `withStorage` swaps adapter (row 6)
   - `document-title.test.tsx` — title set on mount, restored on unmount (row 7)
   - `full-bleed.test.tsx` — DOM snapshot of layout (row 8)
   - `data-plane-mount.test.tsx` — child sees `useDataPlane()` context (row 9)
   - `toolbar-flags.test.tsx` — `showFiltersToolbar` / `showFormattingToolbar` reach `MarketsGridContainer` (row 13)
   - `on-edit-provider.test.tsx` — callback wired (row 14)
   - `legacy-cleanup.test.tsx` — `marketsgrid-view-state::*` deleted exactly once, sentinel set (row 15)
   - `provider-picker.test.tsx` — fire `keydown` Alt+Shift+P, assert picker visible (row 16)
   - `grid-info-popover.test.tsx` — assert `componentName` reaches the toolbar ⓘ popover (row 21 / D2 verification)
2. For inherited rows (17–20) add a single `inherited-features.test.tsx` that asserts `MarketsGridContainer` receives the expected props — full behavior is already covered by `markets-grid-container`'s own tests.
3. Update parity matrix in this worklog: add a "Test" column with the spec name for each row.

**Acceptance criteria**
- All new specs pass
- `npx turbo test --filter=@marketsui/widgets-react` green
- Vitest baseline (was 298 pre-refactor) plus all new specs pass

**Commit message template**
```
test(widgets-react): cover HostedMarketsGrid parity matrix

One spec per observable parity row from the wrapper boundary.
Inherited features (rows 17-20) covered by a single props-forwarding
spec; their behavior lives in markets-grid-container's own tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 5 | parity tests`.

---

### Session 6 — Playwright e2e

**Goal:** One e2e spec that exercises the full wrapper end-to-end against the reference app (still using the OLD wrapper at this point — the spec must remain green after session 7's migration too).

**Preconditions**
- Sessions 1–5 committed
- Reference app's MarketsGrid view still renders normally

**Steps**
1. Add `e2e/hosted-markets-grid.spec.ts`. Cover:
   - Page loads, grid renders ≥ 1 row
   - Profile selector is visible; create a new profile, save, switch back, dirty-dot resets
   - Provider picker opens via Alt+Shift+P
   - Toolbar ⓘ popover surfaces `path` / `instanceId` / `gridId`
   - Theme flip dark↔light: `data-theme` attribute changes and grid background changes (use `page.evaluate` to read computed style)
2. Run against the reference app pre-migration; spec must pass.

**Acceptance criteria**
- New spec passes against the unmigrated reference app
- Existing Playwright baseline (195/214) holds

**Commit message template**
```
test(e2e): add hosted-markets-grid integration spec

Covers grid render, profile lifecycle, provider picker hotkey,
toolbar info popover, and theme switch. Runs against the reference
app and must remain green through the wrapper migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 6 | e2e spec`.

---

### Session 7 — Migrate reference app

**Goal:** Replace the reference app's `BlottersMarketsGrid.tsx` body with a single `<HostedMarketsGrid>` invocation. Old layers stay on disk; deletions are session 8.

**Preconditions**
- Sessions 1–6 committed
- `<HostedMarketsGrid>` and Playwright spec both green

**Steps**
1. Rewrite `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx` to:
   ```tsx
   import { HostedMarketsGrid } from '@marketsui/widgets-react/hosted';
   import { openProviderEditorPopout } from '../data-providers-popout';

   export default function BlottersMarketsGrid() {
     return (
       <HostedMarketsGrid
         componentName="MarketsGrid"
         defaultInstanceId="markets-ui-reference-blotter"
         documentTitle="MarketsGrid · Blotter"
         withStorage
         theme="auto"
         gridId="markets-ui-reference-blotter"
         historicalDateAppDataRef="positions.asOfDate"
         onEditProvider={(id) => openProviderEditorPopout({ providerId: id })}
         showFiltersToolbar
         showFormattingToolbar
         defaultColDef={{ floatingFilter: true, filter: true, sortable: true, resizable: true }}
       />
     );
   }
   ```
2. Run the reference app in OpenFin and the browser; walk the parity matrix manually. Tick each row in the worklog with a `✓ verified` note and the date.
3. Re-run the Playwright spec from session 6 — must still be green.

**Acceptance criteria**
- File line count drops from ~163 to ≤ 25
- `npx turbo typecheck build test e2e` all green
- Manual parity walkthrough complete and recorded in this worklog

**Commit message template**
```
refactor(markets-ui-react-reference): migrate BlottersMarketsGrid to HostedMarketsGrid

Collapses the route view from 163 lines to a single wrapper call.
All theme, identity, storage, data-plane, and provider-picker
wiring is now owned by @marketsui/widgets-react/hosted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 7 | reference-app migrated`.

---

### Session 8 — Delete obsolete layers

**Goal:** Remove the four files the wrapper now replaces. Strict guard: zero references must remain anywhere in the repo before deletion.

**Preconditions**
- Session 7 committed and verified
- Reference app green

**Steps**
1. For each of the following symbols, run `git grep "<symbol>"` across the whole repo. Proceed only if every remaining hit is in a comment, in this worklog, or in `docs/IMPLEMENTED_FEATURES.md`:
   - `HostedComponent`
   - `HostedFeatureView`
   - `SimpleBlotter`
   - The package-level (not app-inline) `BlotterGrid` in `packages/widgets-react/src/blotter/`
2. Delete:
   - `apps/markets-ui-react-reference/src/components/HostedComponent.tsx`
   - `apps/markets-ui-react-reference/src/components/HostedFeatureView.tsx`
   - `packages/widgets-react/src/blotter/SimpleBlotter.tsx`
   - `packages/widgets-react/src/blotter/BlotterGrid.tsx`
   - The `blotter/` directory if it becomes empty
3. Update `packages/widgets-react/src/index.ts` to drop `SimpleBlotter` / `BlotterGrid` exports.
4. Update import map in any `tsconfig` paths or aliases if either component was referenced.

**Acceptance criteria**
- `git grep` for each symbol returns only doc / comment hits
- `npx turbo typecheck build test e2e` green

**Commit message template**
```
refactor(repo): remove obsolete hosted-grid layers

Deletes HostedComponent, HostedFeatureView, SimpleBlotter, and the
package-level BlotterGrid. All replaced by HostedMarketsGrid in
@marketsui/widgets-react/hosted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 8 | obsolete layers deleted`.

---

### Session 9 — Documentation

**Goal:** Update `docs/IMPLEMENTED_FEATURES.md` and add a README at the new module's root.

**Preconditions**
- Session 8 committed

**Steps**
1. Create `packages/widgets-react/src/hosted/README.md` with:
   - One-paragraph overview
   - Props table (one row per `HostedMarketsGridProps` field, type + default + purpose)
   - "OpenFin vs browser" section explaining auto-detection
   - "Theming" section linking to `packages/design-system/src/adapters/ag-grid.ts` and stating that updating `agGridBlotter{Light,Dark}Params` re-themes every blotter
   - "Persistence model" — grid-level provider selection vs profile-scoped state
   - Reproduction of the parity matrix with test references
   - Minimum-viable usage example (5–10 lines)
2. Append a new section to `docs/IMPLEMENTED_FEATURES.md` titled "HostedMarketsGrid (consolidated hosting wrapper)" describing what was added and what was removed. Cross-link the new README.
3. Add a bullet to `MEMORY.md` index pointing at this worklog.

**Acceptance criteria**
- Both docs render correctly (Markdown lint, links resolve)
- The README is self-sufficient — a new dev can integrate `<HostedMarketsGrid>` from it alone

**Commit message template**
```
docs: document HostedMarketsGrid wrapper and update implemented-features index

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Exit → log**: append `<sha> | session 9 | docs`.

---

### Session 10 — Final verification + branch handoff

**Goal:** Full green build + decision to merge.

**Preconditions**
- Sessions 1–9 committed

**Steps**
1. Run from repo root, in order, capturing output for the worklog:
   - `npx turbo typecheck`
   - `npx turbo build`
   - `npx turbo test`
   - `npx turbo e2e`
2. Theme-source verification: temporarily change `headerBackgroundColor` in `agGridBlotterDarkParams`, rebuild, observe in running app, revert. Record outcome in worklog.
3. Multi-window storage isolation: launch reference app in OpenFin, open two MarketsGrid windows, change profile in one, confirm the other is unaffected. Record outcome.
4. Append a final "Refactor complete" section to this worklog with: branch HEAD sha, lines added/removed (`git diff main..HEAD --shortstat`), final parity matrix tick-list.
5. Surface a PR draft (`gh pr create --draft`) — title `refactor: unify MarketsGrid hosting into HostedMarketsGrid`, body = link to this worklog + summary. Do **not** merge.

**Acceptance criteria**
- Every command in step 1 exits 0
- Steps 2–3 succeed
- PR draft exists; URL recorded in worklog

**Commit message template** (only if step 2 needs a follow-up commit, otherwise no commit)

**Exit → log**: append `<sha or 'no-commit'> | session 10 | refactor complete; PR <url>`.

---

## Session log

Append one line per completed session: `<sha> | session N | one-line summary`.

- `e0040b2` | session 0 | theme-drift audit + agGridBlotter{Light,Dark}Params preset (preparatory; before session structure)
- `ccfd95a` | session 1 | public types in widgets-react/hosted (HostedContext, RegisteredComponentMetadata, ConfigManager + StorageAdapterFactory re-exports)
- `9289fe3` | session 2 | useHostedIdentity + tests (OpenFin/browser dual path, storage-factory metadata wrap; vitest scaffolding added to @marketsui/widgets-react)

# Implemented Features

AG-Grid Customization Platform — an AdapTable alternative for the MarketsUI
FI Trading Terminal.

## 2026-05-12 — Rename: Profile → Layout (grid layout management)

Repository-wide rename of the grid layout / profile-management domain from
`Profile*` to `Layout*` to disambiguate from the auth-identity domain
(`UserProfile`, `userProfiles` — left entirely untouched). Touches every
package that produced or consumed the old vocabulary plus the e2e specs and
demo apps.

**Code symbol renames:**

- `ProfileManager` / `ProfileManagerState` / `ProfileManagerOptions` →
  `LayoutManager` / `LayoutManagerState` / `LayoutManagerOptions`
- `ProfileMeta` / `ProfileSnapshot` / `ExportedProfilePayload` →
  `LayoutMeta` / `LayoutSnapshot` / `ExportedLayoutPayload`
- `useProfileManager` / `UseProfileManagerResult` →
  `useLayoutManager` / `UseLayoutManagerResult`
- `ProfileSelector` (and `ProfileSelectorProps`) →
  `LayoutSelector` / `LayoutSelectorProps`
- `RESERVED_DEFAULT_PROFILE_ID` → `RESERVED_DEFAULT_LAYOUT_ID`
- `activeProfileKey()` → `activeLayoutKey()` (function name; localStorage
  key string `gc-active-profile:` deliberately unchanged for back-compat)
- `MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE` →
  `MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE`
  (constant name; underlying string `'markets-grid-profile-set'` kept as the
  on-the-wire ConfigService component type)
- `MARKETS_GRID_PROFILE_SET` (enum constant) → `MARKETS_GRID_LAYOUT_SET`
- `StorageAdapter` method renames: `loadProfile` → `loadLayout`,
  `saveProfile` → `saveLayout`, `deleteProfile` → `deleteLayout`,
  `listProfiles` → `listLayouts`; matching parameter rename
  `profileId` → `layoutId`
- `MarketsGridHandle.profiles` → `MarketsGridHandle.layouts` (consumers
  call `layouts.saveActiveLayout()` etc.)
- `ProfileStorageFactory` → `LayoutStorageFactory`
- `ProfileSetVersionConflictError` → `LayoutSetVersionConflictError`
- `createOpenFinViewProfileSource()` → `createOpenFinViewLayoutSource()`
- `clearAllStylesInProfileReducer` → `clearAllStylesInLayoutReducer`
- Event names: `profile:loaded` / `profile:saved` / `profile:deleted` →
  `layout:loaded` / `layout:saved` / `layout:deleted`

**File renames (already staged via `git mv`):**

- `packages/shared/core/src/profiles/` → `packages/shared/core/src/layouts/`
  (with `ProfileManager.ts` → `LayoutManager.ts`, ditto tests)
- `packages/shared/core/src/security/profileImportGate.test.ts` →
  `layoutImportGate.test.ts`
- `packages/react/widgets/grid-react/src/hooks/useProfileManager.ts` →
  `useLayoutManager.ts`
- `packages/react/widgets/markets-grid/src/ProfileSelector.*` →
  `LayoutSelector.*`; `openfinViewProfile.ts` → `openfinViewLayout.ts`
- `packages/shared/services/config-service/src/profileStorage.ts` →
  `layoutStorage.ts` (with `profileStorage.identity.test.ts` →
  `layoutStorage.identity.test.ts`)
- `apps/demo-react/src/showcaseProfile.ts` /
  `apps/demo-configservice-react/src/showcaseProfile.ts` →
  `showcaseLayout.ts`
- `e2e/v2-profile-{lifecycle,stress,isolation-structure,isolation-styling}.spec.ts`
  → `v2-layout-…spec.ts`; `e2e/helpers/profileHelpers.ts` →
  `layoutHelpers.ts`

**Wire values deliberately preserved** (the dual-read shim layer lands in a
follow-up commit and depends on these staying byte-identical):

- `'markets-grid-profile-set'` — ConfigService `componentType` discriminator
- `'gc-active-profile:'` — localStorage active-pointer prefix
- `'gc-profile'` — exported JSON `kind` field value
- `profiles: LayoutSnapshot[]` — persisted bundle field name inside the
  ConfigService `markets-grid-profile-set` payload
- OpenFin `customData.activeProfileId` — workspace-snapshot pointer
- IndexedDB `profiles` object-store name in Dexie

**UI strings:** every visible "Profile" / "Profiles" string in the grid
toolbar, popover, alert dialogs, tooltips, `aria-label`s, `title`s,
`placeholder`s, and `data-testid`s flipped to "Layout" / "Layouts"
(`layout-selector-trigger`, `layout-row-…`, `layout-name-input`,
`layout-create-btn`, `layout-switch-confirm`, etc.). The user-identity
"User Profiles" tab in the Config Browser remains unchanged.

**Untouched (auth-identity domain):**

`UserProfile` / `UserProfileRow` / `LoggedInUserProfile`, the `userProfiles`
table and validation in `@starui/config-editor-ui` and
`@starui/config-service-server`, `IAuthStorage` / `SqliteAuthStorage`
methods, `AuthService`, `RoleAssignmentMatrix`, and the related app-context
/ impersonation tests.

`npx turbo typecheck` clean across every workspace after the rename. The
dual-read back-compat shim for legacy on-disk artefacts (Dexie rows written
under the old `componentType`/`kind` strings, OpenFin snapshots written by
older builds) is a separate follow-up.

## 2026-05-11 — Light-mode toolbar and page-header chrome polish

`@starui/markets-grid` light-mode header/toolbars now use the cool-clinical
primary brand treatment for active controls, focus-like borders, and filter
pills use bright cyan/violet accents instead of earthy warning tones. The
primary toolbar row and formatter toolbar get a subtle elevated white surface,
calmer borders, centered icon-button spacing, reduced light-mode glow, and
cleaner hover/active states. Demo React page headers and dashboard panel
headers now use concrete `--ds-*` color variables instead of raw shadcn HSL
channels, so their light-mode chrome matches the grid. Green/red/orange remain
reserved for trading and semantic states.

The save icon no longer overlays the legacy dirty LED/bar when settings are
unsaved; the dirty state remains represented by the save button state/title
without adding a stray vertical mark beside the icon.

The formatter-toolbar visibility toggle now uses a sliders icon instead of the
brush glyph, making the action read as “show formatting controls” rather than
paint/apply styling.

Formatter toolbar and popout icons now use brighter cyan/violet icon tokens
with subtle glow and stronger hover/active treatment, so glyphs read clearly
against the cool-clinical light chrome and the darker terminal theme.

The filter-pill deactivate/create controls now use slightly larger, bolder
funnel icons and roomier hit targets so those actions stand out in the filter
toolbar.

AG Grid header column separators are now disabled through the design-system AG
Grid theme params (`headerColumnBorder: false`) instead of CSS overrides. Header
resize handles remain enabled through `headerColumnResizeHandle*` theme params as
a subtle 1px resize affordance, keeping the change aligned with AG Grid's v33+
theme-object API.

## 2026-05-11 — Primary button label ink on dark (unified `theme.css`)

`generateUnifiedCSS()` previously emitted `--primary-foreground: 0 0% 100%` for
both themes, so shadcn default buttons (`bg-primary text-primary-foreground`)
showed white on signature cyan despite **fi-dark.css** using dark ink (`201 74% 9%`).
The adapter now sets dark-theme `--primary-foreground`, `--destructive-foreground`,
`--info-foreground`, `--success-foreground`, `--warning-foreground`, and
`--p-primary-color-text` per Chroma Desk (vivid fills → dark labels; light theme
unchanged for blue primary). `componentTokens().button.primary.color` matches for
the dark brand cyan. **`@starui/grid-react`** `AlertDialogAction` now uses
`bg-primary text-primary-foreground` / `bg-destructive text-destructive-foreground`
instead of raw `--ds-accent-*` + `text-white` / `--ds-surface-ground`.
**`@starui/markets-grid`** `LayoutSelector` (then named `ProfileSelector`) “Save” pill uses
`hsl(var(--primary-foreground))` on `var(--ds-accent-info)`. **`@starui/config-browser`**
inline chrome (`Toolbar`, `RowDrawer`, `ImportPreviewDialog`, `DeleteAllDialog`,
`TableSidebar`) stopped using **`var(--ds-text-primary)`** on **`var(--de-accent)`**
/ destructive fills (that painted light body text on vivid cyan/red); labels now use
**`hsl(var(--primary-foreground))`** / **`hsl(var(--destructive-foreground))`**.
**`apps/markets-ui-react-reference`** Tailwind **`content`** includes
**`packages/react/tools/config-browser-react/src`** so JIT keeps **`bg-primary`** /
**`text-primary-foreground`** on **`ConfigBrowserPanel`**; local **`button.tsx`**
destructive variant uses **`text-destructive-foreground`**. Verification:
`npm run build && npm test --workspace=@starui/design-system`,
`npm run test --workspace=@starui/grid-react --workspace=@starui/markets-grid`,
`npm run build -w @starui/markets-ui-react-reference`.

## 2026-05-11 — Design-system dependency contract (`check-design-system-deps`)

Any workspace package whose `src/` references unified tokens (`--ds-*`) or
imports `@starui/design-system` must declare `@starui/design-system` in
`dependencies`, `peerDependencies`, or `devDependencies`. **`@starui/grid-react`**
and **`@starui/markets-grid`** now list it as **peer** (+ **dev** for tests).
**`packages/angular/**`** is excluded until Angular DS work lands. Root
**`npm run check-ds`** runs **`tools/scripts/check-design-system-deps.ts`**
after **`check-ds-tokens`**. Verification: `npm run check-ds`.

## 2026-05-11 — Modal scrims + elevation: `@starui/ui` + grid-react primitives

**`@starui/ui`** `Dialog` / `Sheet` / `Drawer` / `AlertDialog` overlays use **`bg-background/80`**
instead of **`bg-black/80`**; sheet + dialog + alert content use **`shadow-overlay`**
(`--ds-elevation-overlay`) instead of **`shadow-lg`**.

**`@starui/grid-react`** `AlertDialog` overlay **`bg-background/60`**; content **`shadow-overlay`**.
**`Popover`**, **`FormatDropdown`**, **`FormatPopover`** use **`shadow-card`**;
**`ToggleGroup`** active item uses **`shadow-sm`** instead of arbitrary RGBA.

Verification: `npm run test --workspace=@starui/grid-react`, `npm run typecheck -w @starui/ui`.

## 2026-05-11 — Config Browser modals: token backdrop + elevation

**`ImportPreviewDialog`** / **`DeleteAllDialog`** replace **`bg-black/55`** with
**`bg-background/55`** (semantic scrim via shadcn **`--background`**) and
**`shadow-[0_20px_60px_rgba(0,0,0,0.45)]`** with **`shadow-[var(--ds-elevation-overlay)]`**.
Verification: `npm run typecheck -w @starui/config-browser`.

## 2026-05-11 — Remove legacy `@starui/ui` Stern / Coinbase CSS theme

Deleted **`packages/react/ui/src/styles/stern-theme.css`** (duplicate Tailwind +
Coinbase-style `:root` vars). Apps already import **`@starui/design-system/css`**;
**`@starui/ui`** no longer exports **`./styles`**. **`ThemeProvider`** default
**`storageKey`** is **`marketsui-theme`** (was **`stern-theme`**). Package metadata
and **`check-ds-tokens`** allowlist updated. Verification:
`npx turbo typecheck build --filter=@starui/ui`.

## 2026-05-11 — Typography: IBM Plex Sans + JetBrains Mono (canonical)

`typography.fontFamily` in `@starui/design-system` primitives: **sans** =
IBM Plex Sans stack, **mono** = JetBrains Mono with **IBM Plex Mono** fallback,
**serif** = system Georgia stack. Legacy `--fi-sans` / `--fi-mono` in `fi-dark.css`
/ `fi-light.css` aligned. Apps import Google Fonts for Plex Sans + Plex Mono +
JetBrains; demo `index.html` drops Geist CDN. Demo chrome uses `var(--ds-font-sans)`;
`markets-grid` formatter aliases `--fx-font-*` to `--ds-font-*`; grid-react
expression palette/help overlays use `var(--ds-font-sans)`. Verification:
`npm run build && npm test --workspace=@starui/design-system`,
`npm test --workspace=@starui/markets-grid`.

## 2026-05-11 — AG Grid adapter: JetBrains Mono (replace IBM Plex Mono)

`@starui/design-system/adapters/ag-grid` `fontFamily.googleFont` now matches
the Chroma Desk voice in `typography.fontFamily.mono` (JetBrains Mono) for both
dark and light Quartz params; `agGridLightParams` gains the same `fontFamily`
so Stern / config-browser light grids are not silent-default to a different face.
`MarketsGrid` mono inline stack, `formatter.css` `--fx-font-mono`, and the
demo-react fixture banner align with the mono stack (IBM Plex Mono as secondary
fallback). Verification: `npm test --workspace=@starui/design-system`,
`npm test --workspace=@starui/markets-grid` (if touched tests).

## 2026-05-11 — Body font-size: `--ds-font-size-body` (fix invalid `font-size: var(--ds-font-sans)`)

`--ds-font-sans` is the sans **font-family** stack; several app `body` rules
mistakenly used it for `font-size`, which is not a valid length and produced
weak/inconsistent root typography next to dense AG Grid chrome. `@starui/design-system`
now emits `--ds-font-size-2xs` … `--ds-font-size-4xl` plus `--ds-font-size-body`
(12px, aligned with `typography.fontSize.sm`); unified `base.css` sets
`font-size: var(--ds-font-size-body)` on `html, body`. Updated:
`apps/demo-react`, `apps/demo-configservice-react`, `apps/markets-ui-react-reference`,
`apps/config-admin-web`, `apps/demo-angular` global styles; Angular
`design-system.widget` embedded CSS examples use `--ds-font-size-xs` /
`--ds-font-size-2xl`. Verification: `npm run build && npm test --workspace=@starui/design-system`.

## 2026-05-11 — Expression editor thin Monaco shell (modular)

The expression editor is a thin wrapper around stock Monaco: navigation,
selection, Backspace/Delete, and Enter stay on Monaco defaults. Tab, Shift+Tab, Control/Cmd+Space, arrows (with Shift), Home/End (with Shift
when the suggest list is open), and Backspace/Delete are re-bound through
`editor.addCommand` in `expressionEditorKeyBridges.ts` plus model edits in
`expressionEditorDeletion.ts`, so popped-out settings shells still route keys to
Monaco (suggest navigation, caret moves, deletion) instead of losing them to the
host; DSL registration covers language, completions, diagnostics, per-document overflow
widget host + token-aligned CSS, optional empty-model placeholder decoration,
and palette chords (Ctrl/Cmd+Shift+C/F, F1).

Implementation is split into small modules (`monacoEnvironment.ts`,
`expressionEditorKeyBridges.ts`, `expressionEditorPlaceholder.ts`,
`expressionEditorPaletteCommands.ts`) so the React inner stays mount/dispose +
theme observer + palettes. The public props
gain optional `className` and `style` on the Monaco host (and fallback input) so
callers can use `width: 100%`, flex, or `min-h-0` without forking the component.

Completion auto-triggering does not fire on plain spaces (no `[positionId]` Tab
artifacts at line end unless IntelliSense is open). Whitespace rendering stays
off for the compact surface; Monaco `guides` (indent + bracket pair guides) are
disabled so leading spaces never paint guide columns. Injected document styles
keep a single visible caret in popouts.

Playwright `e2e/v2-expression-editor.spec.ts` asserts the same keyboard and
suggest flows in both inline and popped-out windows, plus focused-row index
(`.monaco-list-row.focused`) after ↑/↓ and Home, and ←/→ caret moves without
length drift. Auxiliary `window.open` popouts register an Escape →
`hideSuggestWidget` bridge so the suggest list can be dismissed reliably.

Verification: `npm run typecheck -w @starui/grid-react`, `npm test -w
@starui/grid-react -- monacoEnvironment`, and `npx playwright test
e2e/v2-expression-editor.spec.ts`.

## 2026-05-11 — Expression engine nested dotted field refs

Square-bracket column references now handle nested dot paths whose segments
start with numbers, such as `[analytics.keyRateDuration.3Y]`. The parser keeps
the canonical bracket syntax while preserving array-literal parsing for
expressions like `[1, 2, 3]`; evaluation already uses `getValueByPath`, so the
resolved path still prefers flat literal keys before walking nested row
objects. Aggregation functions that consume direct column refs, for example
`SUM([analytics.keyRateDuration.3Y])`, use the same nested path resolution
across `ctx.allRows`.

Verification: `npm run test -w @starui/core --
src/expression/expressionEngine.test.ts`.

## 2026-05-11 — Expression editor popout regression E2E coverage

Added Playwright regression coverage for the conditional-styling expression
editor in both inline Grid Customizer dialogs and popped-out browser windows.
The spec verifies the Monaco caret remains visible/blinking, Space inserts at
the visible cursor without whitespace glyph artifacts, arrow keys keep moving
the caret, Tab/Enter accept column completions without focus escaping,
Option+Esc/Alt+Esc opens the suggestion list, and suggestion-list arrows stay
routed to Monaco while suggestions are open.

The new popped-out coverage exposed one remaining cross-document styling gap:
Monaco's lazy-loaded CSS can land in the opener document instead of the popout
document. `editorDom` now installs the critical expression-editor Monaco styles
into the editor's owning document, preserving the existing CSS import while
making cursor and suggestion styling deterministic in real popouts.

Verification: `npm run test -w @starui/grid-react --
ExpressionEditor/editorDom.test.ts` and `npx playwright test
e2e/v2-expression-editor.spec.ts --project=chromium`.

## 2026-05-08 — Config-manager redesign Session 17: ConfigBrowser "Export all" → admin one-shot bundle import

One-step Dexie → REST seeding path. The in-app `ConfigBrowser` already
exported the currently-selected table; now it also has an "Export all"
toolbar button that reads every config table from Dexie and writes a
single bundled JSON file shaped like the server's `seed-config.json`
(plus `appConfig`). Drop that one file into `apps/config-admin-web`'s
"Import from JSON" screen and every table populates in one shot — no
per-table juggling.

What landed:

- `useConfigBrowser` exports a new `exportAll()` that reads `appConfig`,
  `appRegistry`, `userProfile`, `roles`, `permissions` from Dexie and
  returns an `ExportBundle`. Scopable tables (`appConfig`,
  `userProfile`) are filtered to the active `hostEnv.appId` when set,
  matching the per-table export's existing behavior. `pendingSync` is
  excluded — it is a write-retry queue, not config data.
- New "Export all" toolbar button (`lucide:package`) in
  `packages/react/tools/config-browser-react/src/components/Toolbar.tsx`,
  wired to `handleExportAll` in `ConfigBrowser.tsx` which downloads
  `config-bundle-<appId>.json`.
- Bundle key is `userProfiles` (plural) to match the canonical
  `seed-config.json` shape used by the server and the admin importer,
  even though the Dexie table key is `userProfile` (singular). The
  admin's `parseBundle` was updated to accept either spelling as an
  alias so both shapes import cleanly.
- The admin's import screen already accepted both flat per-table
  exports (`[ {row}, ... ]`) and bundle objects, so no further work was
  needed there beyond the alias fix.

Touched: `packages/react/tools/config-browser-react/src/{hooks/useConfigBrowser.ts,components/Toolbar.tsx,ConfigBrowser.tsx}`,
`apps/config-admin-web/src/views/ImportFromJson.tsx`.

> The legacy v1 surface area is fully retired. Earlier removal pulled
> the v1 packages (`@grid-customizer/markets-grid`-v1, the v1 modules
> inside `@grid-customizer/core`, and the v1 e2e specs); a follow-up
> pass removed the deserializer back-compat shims for v1-shape profile
> snapshots (`migrateFromLegacy`, `LegacyOverride`,
> `LegacyColumnCustomizationState`) and rewrote the in-source comments
> that still referenced "v1 / v2" historical decisions. The branch now
> ships v2 only — no version qualifier is meaningful in this codebase.
> History for v1 is preserved on the backup tag taken prior to the
> original removal.

> **Repo reorganization (2026-05-06).** The 27 workspace packages were
> regrouped under `packages/{shared,react,angular}/` buckets, and the
> npm scope was renamed `@marketsui/*` → `@starui/*`. Older entries
> below still reference the pre-reorg paths (e.g. `packages/core` is
> now `packages/shared/core`); semantic content of the entries is
> unchanged. See `docs/ARCHITECTURE.md` for the new folder map.

## 2026-05-08 — Config-manager redesign Session 16: collapse dual surfaces (`isRegisteredComponent` retired, `ConfigManager` deprecated in favour of `ConfigClient`)

Sixteenth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 16, Decision 13 trim-pass tail). Per the design's "collapse
dual surfaces" call: pick one canonical row template flag and one
canonical client API. `isTemplate` is the sole template signal, and
`ConfigClient` (introduced in Session 6/9) is the forward-looking
public entry point — `ConfigManager` collapses behind it for a
deprecation window.

- `AppConfigRow.isRegisteredComponent` is removed from the schema
  type. Every writer that used to mirror the deprecated alias next
  to `isTemplate` now writes `isTemplate` only:
  `packages/shared/services/config-service/src/profileStorage.ts`
  (`saveSet`), `packages/shared/services/component-host/src/saveConfig.ts`
  (debounced saver enforced fields), `.../resolveIdentity.ts` (template
  clone path), and
  `packages/shared/platform/openfin-platform/src/launch.ts`
  (`cloneTemplateRowForInstance`).
- New Dexie `version(4)` upgrade in
  `packages/shared/services/config-service/src/db.ts` walks
  every appConfig row and silently `delete`s the legacy
  `isRegisteredComponent` field. No index changes — data-only
  migration. Two new tests in `db.upgrade.test.ts` cover the
  drop-on-read path (rows that carried the field, rows that never
  did) so a regression that resurrects the alias is caught early.
- `workspaceGc.ts` retires its old "rule 3" (preserve when
  `isRegisteredComponent === true`) — `isTemplate` (rule 2),
  well-known shared ids, registry singleton keys, the singleton-shape
  fallback, and workspace-referenced instances together cover every
  case the alias used to. `GcResult.preservedRegistered` is gone with
  the rule; `workspaceGc.test.ts` is renumbered and the heterogeneous
  batch test refreshed to match. `DebouncedSaverOptions.isRegisteredComponent`
  (already deprecated) is dropped from the public type.
- `createConfigManager(...)` and the `ConfigManager` class are
  marked `@deprecated` in source and in
  `packages/shared/services/config-service/src/index.ts` re-exports —
  both still work, but their JSDoc now points consumers at
  `createConfigClient` from `./client`. The next session-set
  finishes lifting the auth-table / dock-snapshot helpers onto
  `LocalConfigClient` and removes the factory + class entirely.
- Server-side row type already lives in `@starui/shared-types`'
  `AppConfigRow` (Session 1 / Decision 7 trim) which has never
  carried `isRegisteredComponent`; SQLite migrations stay unchanged.

Acceptance: `grep -rn isRegisteredComponent packages apps` matches
only the v4 upgrade hook and this entry; one client API name
(`ConfigClient`) and one canonical template flag (`isTemplate`) on
the row type.

Touched: `packages/shared/services/config-service/src/{types.ts,db.ts,db.upgrade.test.ts,profileStorage.ts,profileStorage.identity.test.ts,ConfigManager.ts,index.ts}`,
`packages/shared/services/component-host/src/{saveConfig.ts,resolveIdentity.ts}`,
`packages/shared/platform/openfin-platform/src/{launch.ts,workspaceGc.ts,workspaceGc.test.ts}`,
`docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md` (Session 16 checkboxes).

## 2026-05-08 — Config-manager redesign Session 15: `apps/config-admin-web` bundled inside config-service-server

Fifteenth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 15, Decision 10). Operator-facing multi-app admin console
ships as a brand-new app (`apps/config-admin-web/`) and is bundled
into `apps/config-service-server` so the operator gets one URL, one
process, one deployment artifact.

What landed:

- New SPA at `apps/config-admin-web/` — Vite + React 19 + react-router
  + `@starui/ui` (shadcn) + `@starui/design-system` tokens. Uses the
  canonical `@starui/tokens-primeng/tailwind-preset` so theming flips
  via `data-theme` like every other React surface in the repo.
- Top-level `<AppSelector>` reads `client.apps.list()` and lets the
  operator scope subsequent screens to one registered application.
  Per design Decision 11 the in-app `config-browser-react` wrapper
  remains hard-coded to `ApplicationContext.AppId` — only this admin
  SPA exposes the dropdown.
- All four list editors (`AppRegistryEditor`, `RolesEditor`,
  `PermissionsEditor`, `UserProfileEditor`) and both matrices
  (`PermissionMatrix`, `RoleAssignmentMatrix` from Sessions 12–13)
  wired into the routing. The two matrices are wrapped in
  `PermissionMatrixView` / `RoleAssignmentMatrixView` which load the
  initial state, hold the working copy, and persist only the diff
  via per-row `update()` calls (so Session 6 optimistic locking
  rejects per row, not per-batch).
- Plus a fifth screen — `AppConfigList` — for the actual `appConfig`
  rows scoped to the active appId. Beyond the plan's Session 15
  acceptance list (the four auth editors), but the auth editors
  alone don't let an operator inspect or repair what an app has
  saved (MarketsGrid profiles, dock layouts, order tickets, etc.).
  Talks to the framework-agnostic `ConfigClient` via `findByAppId` /
  `getConfig` / `updateConfig` / `cloneConfig` / `deleteConfig`,
  with the same Session-6 optimistic-locking guard and a JSON
  `<Textarea>` for payload edits.
- Operator auth gate is the placeholder Decision-16 surface: any
  non-empty `?token=...` URL param (or sessionStorage value) counts
  as signed in. The token plumbs into `RestConfigClient` via
  `AppIdentity.getAccessToken`, so every request carries
  `Authorization: Bearer <token>` once the server gains a real auth
  middleware. Real IDP integration is deferred per the design.
- Server-side mount: `apps/config-service-server/src/app.ts` now
  serves `dist/admin-web/` from `/` via `express.static` and falls
  back to `index.html` for any non-`/api`, non-`/health` route so
  deep-links (e.g. `/permissions`) survive a hard refresh. The mount
  is gated on the bundle existing — `tsx watch src/server.ts` runs
  API-only when the SPA hasn't been built.
- Build glue: `apps/config-service-server/scripts/copy-admin-web.mjs`
  is a small Node script (cross-platform `cp -r`) that copies the
  Vite output into `dist/admin-web/` after `tsc`. The new
  per-package `apps/config-service-server/turbo.json` declares
  `build.dependsOn: ["@starui/config-admin-web#build"]` so turbo
  orders the SPA build first and caches both correctly.
- Smoke test: `apps/config-service-server/src/app.adminWeb.test.ts`
  fakes a minimal `dist/admin-web/` bundle next to `app.ts`, calls
  `createApp()`, and asserts that `/`, deep-link routes, static
  assets, `/health`, and `/api/*` all behave as designed. Five new
  tests, restored alongside the original 12.

Verification: `npx turbo typecheck build test` (79/79 green incl. new
admin-web typecheck/build and 5 new server tests). Manual smoke:
`PORT=3018 npm --workspace apps/config-service-server run start`,
then `curl http://localhost:3018/{,permissions,health,api/v1/app-registry}`
all return 200 with the SPA index served on `/` and `/permissions`.

Out-of-scope for Session 15 (deferred per the plan): real IDP
integration (Decision 16); the Angular admin twin (the parity rule
explicitly carves out the operator-facing admin UI per Decision 10);
collapse of dual `ConfigManager` / `ConfigClient` surfaces and
`isRegisteredComponent` cleanup (Session 16).

Touched: `apps/config-admin-web/**` (new app — package.json,
tsconfig*, vite.config.ts, tailwind.config.cjs, postcss.config.cjs,
index.html, src/{main,App*,Sign*,AppSelector,auth,index.css},
src/views/{PermissionMatrixView,RoleAssignmentMatrixView}.tsx);
`apps/config-service-server/{package.json,turbo.json,scripts/copy-admin-web.mjs,src/app.ts,src/app.adminWeb.test.ts}` (server mount + build wiring + smoke test);
`docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md` (Session 15 checkboxes).

## 2026-05-08 — Config-manager redesign Session 14: list polish (filter/sort/paginate + validation + optimistic locking)

Fourteenth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 14, Decisions 12.3 / 12.4 / 12.5 / 12.6). The four list
editors in `@starui/config-editor-ui` move past the Session 12
"baseline drawer-CRUD" floor by gaining a sortable / filterable /
paginated table view, cross-table validation, and a client-side
optimistic-lock dialog that mirrors the upstream `OptimisticLockError`
surfaced by the REST client (Session 6).

- New `EditorDataTable` component (Decision 12.6 user-facing benefit):
  a thin wrapper over the shadcn `<Table>` primitives that adds
  case-insensitive substring filter (across every column), tri-state
  per-column sort (asc → desc → unsorted), and paginated row windowing
  with a `pageSize` selector. Filter/sort/paginate state is local to
  the component; rebooting an editor does not preserve it (operator
  scope is per-session for now). Each control surface emits a stable
  test-id (`{prefix}-filter`, `{prefix}-sort-{column}`,
  `{prefix}-page-prev`, `{prefix}-page-next`, `{prefix}-page-size`,
  `{prefix}-row-{key}`, `{prefix}-edit-{key}`).
- Net effect: the four list editors render up to a hundred rows
  comfortably without an extra tab; common operator flows (filter to
  one row, click Edit, save) are now one input + one click instead of
  scroll-and-hunt.
- Decision 12.6's "eat our own dog food" via `MarketsGrid` is queued
  as a follow-up — the editor package stays peer-dep-free of AG-Grid
  and the heavy `@starui/markets-grid` test surface; we land the
  user-facing filter/sort/paginate today and swap the underlying grid
  in a separate change.

- New `validation/` module with pure validators per table and a shared
  `ValidationError` shape (`code`, `message`, `field?`, `severity?`).
  `hasBlockingError` / `formatErrors` helpers let editors render the
  full set of errors above the drawer footer. Each editor calls its
  validator on every keystroke (the validator is pure, so no debounce
  is needed), feeds the blocking subset into `canSave`, and the
  warning subset into the drawer's error surface alongside upstream
  client errors.
- Rules covered (Decision 12.4):
  - Required-field gates per table (id, displayName, etc.).
  - Duplicate id on **create** → block save (edit mode skips so a row
    can be saved without renaming).
  - Role with zero permissions → block save.
  - Permission referenced by any role → block delete (cross-table).
  - User-profile delete that strands a `createdBy` reference → warn
    but allow.
  - App registry: `manifestUrl` must be a valid http/https URL.

- Client-side optimistic-lock guard (Decision 12.5). Each editor
  captures `row.updatedTime` at edit-start and runs
  `guardOptimisticUpdate({ expectedUpdatedTime, fetchCurrent })`
  immediately before the auth-table `update` call. On stale time the
  guard throws a typed `EditorOptimisticLockError`; the editor's
  catch path handles either that or the upstream `OptimisticLockError`
  via the shared `isOptimisticLockError` test (so the same UX runs
  whether the lock fired client-side or via a 412 from the server).
- New `OptimisticLockDialog` (shadcn `AlertDialog`) presents
  "Reload current values" and "Discard your changes" actions. Reload
  refetches the row and rehydrates the drawer + the captured
  `expectedUpdatedTime`; discard closes the drawer and clears the
  draft. Same component reused across all four editors.
- Why a local `EditorOptimisticLockError` — the upstream
  `OptimisticLockError` from `@starui/config-service` is typed for
  `AppConfigRow`, but the auth tables (`apps` / `roles` / `permissions`
  / `userProfiles`) are different row shapes. The local mirror keeps
  the upstream type unchanged while letting the editor preserve the
  current row in the error.

- New tests: 14 `validation/validation.test.ts` cases covering each
  rule, 3 `EditorDataTable.test.tsx` cases (paginate / filter / sort),
  5 `optimisticLock.test.tsx` cases (guard helper + dialog flow on
  the canonical `RolesEditor`). Total `@starui/config-editor-ui` test
  count: 48 across 9 files (was 30 across 6 files at end of Session
  13). The new tests don't depend on AG-Grid or any browser-only API,
  so they run cleanly under the existing jsdom setup.

Verification: `npx turbo test --filter=@starui/config-editor-ui --filter=@starui/markets-grid`
(48 + markets-grid tests pass; FULL TURBO on rerun); `npx turbo
typecheck build` (60 tasks green; one cache miss for the editor-ui
package itself). Look-and-feel of the matrices and the drawer surface
is unchanged from Sessions 12 + 13 — visual diff is limited to the
list view (filter row + sortable headers + pagination footer when row
count exceeds the page size).

Out-of-scope for Session 14 (deferred to later sessions per the
plan): MarketsGrid as the underlying table primitive (Decision 12.6 —
plan was to swap in the AG-Grid stack, deferred so the package can
stay engine-agnostic; the user-visible filter/sort/paginate behavior
delivered today is the same outcome the plan named); bundling the
editors into a standalone admin SPA (Session 15);
`ConfigManager` / `ConfigClient` collapse + `isTemplate` cleanup
(Session 16).

Touched: `packages/react/tools/config-editor-ui/src/{EditorDataTable,EditorDataTable.test,OptimisticLockDialog,useOptimisticUpdate,optimisticLock.test}.{ts,tsx}` (new),
`packages/react/tools/config-editor-ui/src/validation/{types,roles,permissions,userProfiles,appRegistry,index,validation.test}.ts` (new),
`packages/react/tools/config-editor-ui/src/{RolesEditor,PermissionsEditor,UserProfileEditor,AppRegistryEditor}.tsx` (validation + lock + grid wiring),
`packages/react/tools/config-editor-ui/src/index.ts` (new exports),
`docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md` (Session 14 checkboxes).

## 2026-05-08 — Config-manager redesign Session 13: PermissionMatrix + RoleAssignmentMatrix

Thirteenth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 13, Decisions 12.1 / 12.2 — RBAC matrices). Two new
controlled components in `@starui/config-editor-ui` that turn the
roles / permissions / users tables into the centerpiece RBAC UX:

- `PermissionMatrix` — `roles × permissions` checkbox grid. Rows are
  roles, columns are permissions grouped by `category` (uncategorised
  permissions land in their own `(uncategorised)` group). A filter
  input narrows columns by `permissionId`, `description`, or
  `category`. Toggling any cell emits the next `roles: RoleRow[]`
  array via `onChange`; the host owns persistence so Session 14's
  optimistic-locking flow can batch one save per row instead of one
  per toggle. Role label cells stick to the left edge for horizontal
  scrolling.
- `RoleAssignmentMatrix` — `users × roles` chip surface with a mode
  pill that toggles between two layouts: "by user" (rows = users,
  chips = their `roleIds`) and "by role" (rows = roles, chips = the
  users that hold them). A shared `<AddPicker>` Popover provides the
  add affordance on each row, hiding itself with an "All assigned"
  hint when no candidates remain. Every chip toggle and add emits
  the next `users: UserProfileRow[]` array via `onChange`. The
  filter input narrows users in by-user mode, roles in by-role mode.
- Both matrices render via shadcn `Table` + `Checkbox` + `Badge` +
  `Popover` + `ToggleGroup` — no native `<input>` / `<select>` /
  `<table>` primitives. Surfaces use semantic tokens
  (`bg-background`, `text-foreground`, `border-border`,
  `text-muted-foreground`) so dark/light theming Just Works under
  the existing `[data-theme]` plumbing.

Verification: `npx turbo test --filter=@starui/config-editor-ui`
(26/26 pass — 14 new across `PermissionMatrix.test.tsx` and
`RoleAssignmentMatrix.test.tsx`); `npx turbo typecheck build` green
for the package and 60-task full-repo run. The new matrices export
through `src/index.ts` as `PermissionMatrix` /
`RoleAssignmentMatrix` plus the `PermissionMatrixProps`,
`RoleAssignmentMatrixProps`, and `RoleAssignmentMode` types.

Out-of-scope for Session 13 (deferred to later sessions per the
plan): MarketsGrid swap-in for tables (Session 14), cross-table
validation rules / referential integrity (Session 14), client-side
optimistic-locking on save (Session 14), bundling the editors into
`apps/config-admin-web` (Session 15).

Touched: `packages/react/tools/config-editor-ui/src/{PermissionMatrix,RoleAssignmentMatrix}.tsx` (new),
`packages/react/tools/config-editor-ui/src/{PermissionMatrix,RoleAssignmentMatrix}.test.tsx` (new),
`packages/react/tools/config-editor-ui/src/index.ts` (matrix exports),
`docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md` (Session 13 checkboxes).

## 2026-05-08 — Config-manager redesign Session 12: `@starui/config-editor-ui` skeleton + four list editors

Twelfth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 12, Decision 11 — engine-agnostic shared editor library). New
React-only workspace package that ships the four list-editor screens
for the `config-service` auth tables. Components consume the
framework-agnostic `ConfigClient` interface (Local-Dexie or REST — same
shape) via a thin `<ConfigEditorProvider>`, so the same screens work
regardless of how the host wires storage. Filter / sort / paginate +
client-side optimistic locking are explicitly deferred to Session 14;
the matrices land in Session 13.

- Package `@starui/config-editor-ui` lives at
  `packages/react/tools/config-editor-ui/` with the standard
  `package.json` / `tsconfig.json` / `vitest.config.ts` layout matching
  the other React tools workspaces. Peer deps:
  `@starui/config-service` (type-only),
  `@starui/ui` (shadcn primitives), `@starui/design-system` (tokens),
  and `@starui/widgets-react` (declared as optional peer for the
  Session 14 MarketsGrid usage; not consumed yet). React 19 / React
  DOM 19 are peer'd as well.
- `src/ConfigEditorContext.tsx` — `<ConfigEditorProvider client={...}>`
  + `useConfigClient()` hook. Throws if used outside the provider —
  mirrors the assertive style already used by
  `useConfigService` / `useDataServices`.
- `src/EditorShell.tsx` — shared visual frame for all four editors:
  header (title + "New {item}" button), list slot, and a right-docked
  shadcn `<Sheet>` with body slot, optional inline error, and
  Cancel/Save footer. The `canSave` / `saving` props centralise the
  save-button-disabled states so polish in Session 14 lands in one
  place.
- `src/RolesEditor.tsx` — `Table`-based list (`roleId`, `displayName`,
  permission count) with edit drawer fields: `Input` for roleId
  (locked on edit) + displayName, `Textarea` for permissionIds
  (comma- or newline-separated). Inline warning when a typed
  permissionId is not in the permissions table.
- `src/PermissionsEditor.tsx` — list view (`permissionId`, `category`,
  `description`) with edit drawer using shadcn `Select` for category;
  picking the `+ New category…` sentinel reveals an `Input` for
  free-text categories so the dropdown is not a hard wall on day one.
- `src/UserProfileEditor.tsx` — list with role chips (`Badge`) per row;
  edit drawer combines `Input` (userId, displayName), shadcn `Select`
  for app (with Input fallback when no apps are seeded yet), and a
  `Popover` + `Checkbox` list for the role multi-select with chips
  shown above. Clicking a chip removes the role.
- `src/AppRegistryEditor.tsx` — list of registered apps with
  environment + config-service-enabled columns; edit drawer uses
  `Input` (appId locked on edit, displayName, manifestUrl), shadcn
  `Select` for environment (`dev`/`uat`/`prod`), and shadcn `Switch`
  for the config-service-enabled flag.
- All four editors use shadcn primitives end-to-end — no native
  `<input>` / `<textarea>` / `<select>` (CLAUDE.md rule). Tokens
  resolve through Tailwind utility classes that already map to
  `--bn-*` / `--fi-*` via `@starui/ui` — no hardcoded colors. Sheet,
  Table, Select, Switch, Popover, Checkbox, Badge, Button, Input,
  Textarea, Label all come from `@starui/ui`.
- `src/createStubClient.ts` — hand-rolled in-memory `ConfigClient`
  that records every write call to `client.calls` for assertion.
  Implements every method on the contract; the four editors only
  touch the auth-table ops, so the appConfig methods throw loudly
  rather than silently no-op. Lives in `src/` (not `test/`) so
  consumer apps can use it for Storybook-style smoke screens.
- Tests (12 total across 4 files; all pass under jsdom via
  `vitest run`):
  - `RolesEditor.test.tsx` (3): renders existing roles; saves a new
    role, asserting the recorded `roles.create` payload; blocks save
    when validation fails.
  - `PermissionsEditor.test.tsx` (3): renders; validates that
    description-only without category is blocked; round-trips an
    `permissions.update` through the edit path with the seeded
    category.
  - `UserProfileEditor.test.tsx` (3): renders chips for existing
    profiles; creates a new profile (no roles) through the
    Input-fallback when no apps are seeded; toggles a role via the
    popover checkbox and saves an `userProfiles.update` with the
    expected `roleIds`.
  - `AppRegistryEditor.test.tsx` (3): renders existing apps; updates
    `displayName` via the edit drawer and asserts the recorded
    `apps.update` patch; blocks save when manifestUrl is empty.
- Verification:
  `npx turbo test --filter=@starui/config-editor-ui` (12/12 pass);
  `npx turbo typecheck build` (60 tasks green across the monorepo);
  full `npx turbo test` (38 tasks, all green — 12 new + the existing
  baseline).
- Acceptance gates met: four functional editors land, engine-agnostic
  via `ConfigClient`, dark/light correct (token-driven), no native
  form controls, no filter/sort/paginate (Session 14 boundary).

Touched: `packages/react/tools/config-editor-ui/{package.json,tsconfig.json,turbo.json,vitest.config.ts,test/setup.ts,src/{index,ConfigEditorContext,EditorShell,RolesEditor,PermissionsEditor,UserProfileEditor,AppRegistryEditor,createStubClient}.{ts,tsx},src/{RolesEditor,PermissionsEditor,UserProfileEditor,AppRegistryEditor}.test.tsx}` (new),
`docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md` (Session 12 checkboxes).

## 2026-05-08 — Config-manager redesign Session 11: `<MarketsGrid>` dev-mode warning on MemoryAdapter fallback

Eleventh session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 11, Decision 15 follow-up). One-time `console.warn` when a
`<MarketsGrid>` is mounted without `storage` (or the legacy
`storageAdapter`) and the inner host falls through to the in-memory
default — the half-day "why aren't my profiles saving?" gotcha every
new framework consumer hits exactly once.

- Module-scoped `_memoryAdapterWarned` flag in
  `packages/react/widgets/markets-grid/src/MarketsGrid.tsx` guards a
  single warning per page session even across many grid mounts.
- The check fires inside `MarketsGridInner` (where both `storage` and
  `storageAdapter` are in scope, before the host's
  `storageAdapter ?? new MemoryAdapter()` fallback runs) and is gated
  by `process.env.NODE_ENV !== 'production'` so production bundles
  stay quiet.
- Message: `[MarketsGrid] No storage prop provided. Using in-memory
  storage — profiles, layouts and grid-level-data WILL be lost on
  reload. Wire @starui/config-service via createConfigServiceStorage(...)
  to persist.`
- Tests `packages/react/widgets/markets-grid/src/MarketsGrid.devwarning.test.tsx`
  (2 tests): two consecutive mounts without storage → warn called
  exactly once with the expected message; mount with a `storage`
  factory → warn never called. Uses Vitest's per-file module isolation
  so the flag starts false.
- Verification: `npx turbo test --filter=@starui/markets-grid`
  (68 tests pass — 2 new, 66 pre-existing); `npx turbo typecheck build`
  (58 tasks green across the monorepo).

Touched: `packages/react/widgets/markets-grid/src/MarketsGrid.tsx`,
`packages/react/widgets/markets-grid/src/MarketsGrid.devwarning.test.tsx` (new).

## 2026-05-08 — Config-manager redesign Session 10: `@starui/config-service-angular` provider package

Tenth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 10, Decision 14 Angular half). Ships the Angular twin of
Session 9 — a host's `app.config.ts` now carries identity + `appId`
+ (optional) seed / REST URLs as `provideConfigService(...)`, and
`ConfigServiceClient` exposes the live `{ configManager, storage,
appId, userId, applicationContext }` surface to any component via DI.

- New workspace package
  `packages/angular/providers/config-service-angular/` with the
  standard `package.json` / `tsconfig.json` / `ng-package.json` shape
  (mirrors `data-services-angular`). Peer-dep on
  `@starui/data-services-angular` (the client injects
  `DataServicesService` so the ConfigManager attaches to the same
  AppData mirror the worker hub writes to). Exports:
  - `provideConfigService(opts: { identity, appId, seedUrl?,
    restUrl? }): EnvironmentProviders` — registers
    `CONFIG_SERVICE_OPTIONS` and a `provideAppInitializer` that
    awaits `ConfigServiceClient.init()` so by the time any component
    injects the client, `ConfigManager.init()` has resolved and
    `ApplicationContext` is published into AppData.
  - `ConfigServiceClient` (`@Injectable({ providedIn: 'root' })`):
    constructs `ConfigManager` from the registered options +
    `DataServicesService`, exposes `configManager`, `storage`
    (pre-bound `ProfileStorageFactory` for `<MarketsGrid>`), `appId`,
    `userId`, and an `applicationContext` getter that throws if read
    before `init()` resolved. `ngOnDestroy` calls `dispose()`.
  - `CONFIG_SERVICE_OPTIONS` (`InjectionToken<ConfigServiceOptions>`):
    public escape hatch for advanced wiring.
- Tests `packages/angular/providers/config-service-angular/src/ConfigServiceClient.test.ts`
  (3 tests, jsdom + fake-indexeddb + `@angular/compiler` for JIT):
  exposes the expected shape after `init()` (incl. ApplicationContext
  snapshot and a check that the ConfigManager actually published into
  the fake AppData mirror); throws when `applicationContext` is read
  before `init()`; disposes the ConfigManager on `ngOnDestroy`. Tests
  use `Injector.create` (not `TestBed`) since the monorepo doesn't
  install `@angular/platform-browser-dynamic` — bare DI is enough to
  exercise injection.
- Consumer wiring in `@starui/config-browser-angular`:
  `ConfigBrowserService` now `inject(ConfigServiceClient, { optional:
  true })` and prefers the Provider-managed manager when present,
  falling back to the existing `getConfigManager()` /
  `readHostEnv()` path so legacy OpenFin shells keep working
  unchanged. `package.json` adds `@starui/config-service-angular: "*"`
  as a workspace dep.
- Verification: `npx turbo test --filter=@starui/config-service-angular`
  (3 tests pass); `npx turbo typecheck build test` (74 tasks green
  across the monorepo).

Touched: `packages/angular/providers/config-service-angular/{package.json,ng-package.json,tsconfig.json,vitest.config.ts,test/setup.ts,src/{index,tokens,provider,ConfigServiceClient,ConfigServiceClient.test}.ts}`,
`packages/angular/tools/config-browser-angular/{package.json,src/config-browser/config-browser.service.ts}`.

## 2026-05-08 — Config-manager redesign Session 9: `@starui/config-service-react` Provider package

Ninth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 9, Decision 14 React half). Ships the React Provider + hook
that wires `@starui/config-service` end-to-end — a host's `main.tsx`
now carries identity + `appId` + (optional) seed / REST URLs and
`ConfigServiceProvider` does the rest: constructs the `ConfigManager`,
runs `init()` (which publishes `ApplicationContext` into the
surrounding `<DataServicesProvider>` per Session 7), and exposes
`{ configManager, storage, appId, userId, applicationContext }` via a
single `useConfigService()` hook.

- New workspace package
  `packages/react/providers/config-service-react/` with the standard
  `package.json` / `tsconfig.json` / `vitest.config.ts` shape (mirrors
  `data-services-react`). Peer-dep on `@starui/data-services-react`
  (the Provider reads `useDataServices()` so the ConfigManager can
  attach to the same AppData mirror that the worker hub writes to).
  Exports:
  - `ConfigServiceProvider` (React component): props `{ identity,
    appId, seedUrl?, restUrl?, children }`. On mount: constructs
    `ConfigManager` with `dataServices = useDataServices()`, runs
    `init()`, then exposes context. On unmount or prop change:
    `dispose()` the manager. Pending bootstrap is short-circuited via
    a `disposed` guard so a late `init()` resolution doesn't leak a
    manager. Errors thrown during bootstrap rethrow on the next
    render so the nearest `<ErrorBoundary>` catches them.
  - `useConfigService()` (hook): returns the live
    `ConfigServiceContextValue` or throws when called outside the
    Provider so missing wiring fails fast.
  - `ConfigServiceContextValue` (type): `configManager: ConfigManager`,
    `storage: ProfileStorageFactory` (pre-bound for `<MarketsGrid>`),
    `appId: string`, `userId: string`,
    `applicationContext: ApplicationContext`.
- Tests `packages/react/providers/config-service-react/src/ConfigServiceProvider.test.tsx`
  (5 tests, jsdom + fake-indexeddb): exposes the expected shape after
  init (incl. ApplicationContext snapshot); disposes the ConfigManager
  on unmount; renders `null` while bootstrap is pending; throws from
  `useConfigService` outside the Provider; re-bootstraps when `appId`
  changes. `useDataServices` is `vi.mock`-ed to return a tiny
  in-memory `appData` that satisfies `AppDataMirrorHandle` so the
  Provider's real `ConfigManager.init()` exercises the actual
  publish-into-AppData path.
- Reference-app cutover in
  `apps/markets-ui-react-reference/src/main.tsx`: the per-window
  `createConfigClient({})` line is replaced with a `ViewRoutesLayout`
  that wraps non-platform-provider routes in
  `<DataServicesProvider services={dataServices}>` →
  `<ConfigServiceProvider identity={IDENTITY} appId={APP_ID}>` →
  inner `HostWrapperWithProviderClient` that derives a stable
  `ConfigClient` from `useConfigService().configManager` via
  `createConfigClient({ configManager })`. The hidden
  `/platform/provider` route stays OUTSIDE the new providers so its
  `bootstrapPlatform()` keeps owning the platform's ConfigManager
  singleton without competition.
- Verification: `npx turbo test --force` (35 packages, all green
  including the new Provider's 5 tests); `npx turbo typecheck build
  --force` (56 tasks green incl. the reference app's Vite bundle);
  Vite dev server smoke for `markets-ui-react-reference` boots cleanly
  on `http://localhost:5174/` with no console errors.

Touched: `packages/react/providers/config-service-react/{package.json,tsconfig.json,vitest.config.ts,test/setup.ts,src/{index,types,configServiceContext,ConfigServiceProvider,useConfigService,ConfigServiceProvider.test}.{ts,tsx}}`,
`apps/markets-ui-react-reference/{package.json,src/main.tsx}`.

## 2026-05-08 — Config-manager redesign Session 8: impersonation + effective-user helper

Eighth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 8, Decision 5). Splits the row's **owner** slot
(`AppConfigRow.userId` — drives visibility) from the **audit** slots
(`createdBy` / `updatedBy`) so an admin / debug UI can flip
`ImpersonatedUser` on `ApplicationContext` and have the manager treat
that user as the effective user for ownership and visibility — while
audit fields keep tracking the real signed-in user so impersonation
can never rewrite history.

- New helper `packages/shared/services/config-service/src/effectiveUser.ts`:
  `getEffectiveUser(ctx: ApplicationContext)` returns
  `ImpersonatedUser ?? LoggedInUser`. Pure function, no side effects —
  hosts can apply the same rule outside `ConfigManager` (e.g. a "what
  would alice see?" admin preview).
- `ConfigManager.setImpersonatedUser(user | null)` — sets or clears the
  impersonated user on `ApplicationContext`. Throws when `dataServices`
  isn't wired; otherwise writes through to the AppData mirror so the
  next visibility check / owner stamp picks up the new effective user
  without any explicit refresh.
- `ConfigManager.getEffectiveUserId()` (private) — single source of
  truth used by both `visibilityContext` (Session 4) and the inline
  owner default in `saveConfig`. Reads `ImpersonatedUser` live off the
  AppData mirror, falling back to `identity.userId` when impersonation
  is null or `dataServices` isn't wired (back-compat for tests / hosts
  that haven't opted into ApplicationContext).
- `saveConfig` now defaults `AppConfigRow.userId` to the effective user
  on insert. Audit fields (`createdBy` / `updatedBy` / `creationTime` /
  `updatedTime`) keep flowing through `stampWrite` from
  `this.identity.userId`, so an impersonated write lands as
  `userId === alice` but `createdBy === LoggedInUser.userId`.
- New `ImpersonatedUser` type alias re-exported from the package
  barrel for callers that hold the shape independently.
- New tests:
  - `packages/shared/services/config-service/src/configManager.impersonation.test.ts`
    (10 tests): `setImpersonatedUser` updates ApplicationContext;
    `setImpersonatedUser(null)` clears the slot; saved row owner ===
    impersonated user while audit === real user; clearing impersonation
    reverts owner default; reads while impersonating alice show
    alice-owned private rows AND public rows but hide real-user-owned
    private rows; clearing reverts visibility; `setImpersonatedUser`
    throws without `dataServices`. Plus pure-helper tests for
    `getEffectiveUser` covering both branches.

Files touched:
`packages/shared/services/config-service/src/{effectiveUser,ConfigManager,index}.ts`,
`packages/shared/services/config-service/src/configManager.impersonation.test.ts`.

## 2026-05-08 — Config-manager redesign Session 7: ApplicationContext publishing into AppData

Seventh session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 7, Decisions 3 + 4). `ConfigManager` becomes the first writer
of the framework-owned `"ApplicationContext"` AppData provider so every
component in every window can read identity synchronously off the
main-thread mirror — no prop drilling, no per-host context plumbing.

- New types in `packages/shared/services/config-service/src/types.ts`:
  - `AppDataMirrorHandle` — structural shape of the AppData mirror
    surface (`set` / `get` / `ready`). Defined inline so the dependency
    direction stays one-way: `@starui/data-services` already depends
    on `@starui/config-service`, and the real `AppDataMirror` from
    `@starui/data-services` satisfies this shape verbatim.
  - `DataServicesHandle` — `{ appData: AppDataMirrorHandle }`. The
    bundle returned by `bootstrapDataServices` is structurally
    assignable.
  - `ApplicationContext` — typed view of the four published keys
    (`AppId`, `LoggedInUser`, `ImpersonatedUser`, `LoggedInUserProfile`).
- `ConfigManagerOptions.dataServices?: DataServicesHandle` is the new
  wiring slot. When present, `ConfigManager.init()` (after
  `seedIfEmpty`) awaits `appData.ready()` for the worker's persisted
  snapshot, derives `LoggedInUserProfile` from the seeded user / role
  / permission tables, and writes the four ApplicationContext keys
  sequentially so they land on a single named row. Without
  `dataServices`, init is a silent no-op for AppData publishing —
  every existing call site keeps working.
- `ConfigManager.setDataServices(handle)` is the late-wiring path.
  Today's `bootstrapDataServices(...)` takes a `ConfigManager`, so
  the host can't supply `dataServices` to `createConfigManager(...)`
  without constructing two managers; the setter lets the host wire
  the bundle back AFTER bootstrap and BEFORE `init()`.
- `ConfigManager.getApplicationContext()` is a sync read off the
  mirror. Throws when `dataServices` isn't wired or before init has
  published; the four keys land together so post-init the read is
  always coherent.
- New tests:
  - `packages/shared/services/config-service/src/configManager.applicationContext.test.ts`
    (9 tests): publishes all four keys with the correct values from a
    seeded auth-tables setup; `getApplicationContext()` round-trips
    the published shape; missing user profile yields empty
    roles/permissions arrays; `LoggedInUser.displayName` is omitted
    when the identity has none; `init()` awaits `appData.ready()`
    before publishing; `init()` succeeds silently without
    `dataServices`; `setDataServices(...)` supports late wiring;
    `getApplicationContext()` throws before `init()` has published;
    the four keys are published in the documented order.

Files touched:
`packages/shared/services/config-service/src/{ConfigManager,types,index}.ts`,
`packages/shared/services/config-service/src/configManager.applicationContext.test.ts`.

## 2026-05-08 — Config-manager redesign Session 6: optimistic locking + bearer plumbing

Sixth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 6, Decisions 12.5 + 13). Adds RFC 7232-style optimistic
locking on `PUT /configurations/:id` so two operators editing the same
row never silently overwrite each other, and lands the
`AppIdentity.getAccessToken` outbound bearer-header plumbing one step
ahead of the deferred Decision 16 server-side auth pass.

- Server: `IConfigurationStorage.update(id, updates, expectedUpdatedTime?)`
  takes an optional pinned `updatedTime`. When supplied, `SqliteStorage`
  re-reads the row and throws `OptimisticLockMismatchError` (new
  `apps/config-service-server/src/storage/errors.ts`) carrying the
  current row when the check fails. `ConfigurationService.updateConfiguration`
  forwards the value through.
- Server route `PUT /api/v1/configurations/:configId` now reads the
  caller's `If-Match` header (RFC 7232 §3.1) and forwards it as
  `expectedUpdatedTime`. On match the response sets `ETag: <updatedTime>`
  and returns 200 as today; on mismatch the route returns HTTP 412
  Precondition Failed with the current row in the body and the same
  `ETag` header pointing at the new `updatedTime`. Without the header
  the route preserves today's last-write-wins behavior — every existing
  caller compiles unchanged.
- Client: new `packages/shared/services/config-service/src/errors.ts`
  hosts a single `OptimisticLockError` class (re-exported from `client.ts`
  for back-compat) used by both the local Dexie path and the REST path
  so consumers catch one error name regardless of mode. `ConfigClient.updateConfig`
  gains an optional third `UpdateConfigOptions` arg with
  `expectedUpdatedTime`. Today no caller passes it (default behavior is
  preserved); the editor UI in Session 14 will.
- `RestConfigClient` sends `If-Match` when `expectedUpdatedTime` is
  present and surfaces 412 responses as `OptimisticLockError(currentRow)`
  before the generic `ConfigClientHttpError` branch fires. Auth-table
  ops inherit the same outbound headers via `rawRequest`.
- `ConfigManager.saveConfig(row, options?)` mirrors the contract on the
  Dexie/local side: when `options.expectedUpdatedTime` no longer matches
  the stored row it throws `OptimisticLockError`. In REST mode the same
  value flows out through `syncToRest` as `If-Match`, and a 412 from
  the server short-circuits the queue-for-retry branch so the caller
  sees the lock failure instead of a silent retry.
- `AppIdentity.getAccessToken` is now consulted on every outbound
  config-service REST call: the `RestConfigClient` request helper, the
  `ConfigManager.syncToRest` write path, and the `drainPendingSync`
  retry loop all `await identity.getAccessToken()` and attach
  `Authorization: Bearer <token>` when the host supplied one. The
  server doesn't yet verify the token (Decision 16 deferred), but the
  editor UI never has to think about auth from now on. `createConfigClient`
  accepts the identity option and forwards it to the REST client; local
  mode forwards it to a fresh `ConfigManager`.
- New tests:
  - `apps/config-service-server/src/routes/configurations.optimisticlock.test.ts`
    (4 tests, supertest-driven): no-If-Match writes through with `ETag`,
    matching If-Match writes through, stale If-Match returns 412 with
    the current row + ETag, missing configId returns 404 even with
    If-Match.
  - `packages/shared/services/config-service/src/client.optimisticlock.test.ts`
    (6 tests): no header by default, header sent when option passed,
    412 surfaces `OptimisticLockError(currentRow)`, non-412 errors stay
    `ConfigClientHttpError`, `Authorization: Bearer` attached when the
    identity exposes `getAccessToken`, header omitted otherwise.
  - `packages/shared/services/config-service/src/configManager.optimisticlock.test.ts`
    (5 tests): default last-write-wins, matching expected time succeeds,
    stale expected time throws, REST sync sends both `Authorization`
    and `If-Match`, 412 from the server surfaces as `OptimisticLockError`
    and is not queued for retry.

Files touched:
`apps/config-service-server/src/storage/{IConfigurationStorage,SqliteStorage,errors}.ts`,
`apps/config-service-server/src/services/ConfigurationService.ts`,
`apps/config-service-server/src/routes/configurations.ts`,
`apps/config-service-server/src/routes/configurations.optimisticlock.test.ts`,
`packages/shared/services/config-service/src/{ConfigManager,client,errors,index}.ts`,
`packages/shared/services/config-service/src/{client.optimisticlock,configManager.optimisticlock}.test.ts`.

## 2026-05-08 — Config-manager redesign Session 5: server `isPublic` + visibility + trim

Fifth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 5, Decisions 6 + 13). Mirrors Sessions 1 + 4 on the SQLite
backend, lands the design Decision 13 trim pass, and renames the
canonical row type so client and server speak the same name.

- `apps/config-service-server` gains an `isPublic INTEGER NOT NULL
  DEFAULT 1` column on `configurations`. The migration is idempotent —
  on connect the storage runs `PRAGMA table_info(configurations)` and
  appends the column only when missing, so pre-redesign databases
  upgrade silently and existing rows backfill `isPublic = 1` (public).
- The visibility filter `(isPublic = 1 OR userId = ?)` is applied
  inside `buildWhereClause` whenever `criteria.effectiveUserId` is set.
  Admin / unfiltered paths simply omit the field. `findByAppId`,
  `findByUserId`, and `findByComponentType` gain an optional trailing
  `effectiveUserId` argument and forward it through `findByMultipleCriteria`.
- List route handlers read `?userId=...` from the query string and pass
  it as `effectiveUserId` (defaulting to `"anonymous"` — which sees
  only public rows). `/by-user/:userId` accepts a separate
  `?effectiveUserId=...` query so the path-vs-caller userId stays
  unambiguous. Documented as a placeholder until Decision 16 (real
  auth on endpoints) lands.
- Decision 13 trim pass:
  - The `MongoDB` storage stub is gone — `mongodb` removed from
    `package.json`, the `case "mongodb"` branch removed from
    `StorageFactory`, and `MONGODB_URI` / `DATABASE_TYPE` env-var
    branching removed from server bootstrap. SQLite is the only engine.
  - Renamed the wire-format type from `UnifiedConfig` to `AppConfigRow`
    in `@starui/shared-types`, with a `@deprecated` `type UnifiedConfig
    = AppConfigRow` alias kept for one release. Server src is
    fully on the new name; the shared-types alias keeps every existing
    consumer (`data-services`, `widget-sdk`, etc.) compiling unchanged.
- New `vitest.config.ts` at the server root selects the node
  environment (no DOM). Two new test files cover the migration and
  visibility behaviour:
  - `SqliteStorage.migration.test.ts` (2 tests): builds a pre-redesign
    DB by hand, opens it through `SqliteStorage`, asserts the row
    reads back with `isPublic === true`. Second test asserts the
    migration is idempotent — re-opening an already-upgraded DB does
    not fail or duplicate-add the column.
  - `SqliteStorage.visibility.test.ts` (6 tests): persists
    public/private rows under different owners, verifies
    `findByAppId(...)` and `findByMultipleCriteria(...)` return the
    correct subset for alice / bob / anonymous callers, the unfiltered
    admin path returns every row, cross-app rows are excluded, and
    legacy rows (no `isPublic` column write) normalize to public on
    read.
- End-to-end smoke verified: server boots cleanly against an empty DB
  file, schema migration runs once, `POST /configurations` creates
  public + private rows, `GET /by-app/TestApp?userId=alice` returns
  both, `?userId=bob` returns only the public row, no `?userId` defaults
  to `"anonymous"` and also returns only public.

Files touched:
`apps/config-service-server/src/storage/{SqliteStorage,IConfigurationStorage,StorageFactory}.ts`,
`apps/config-service-server/src/services/ConfigurationService.ts`,
`apps/config-service-server/src/routes/configurations.ts`,
`apps/config-service-server/src/utils/validation.ts`,
`apps/config-service-server/src/server.ts`,
`apps/config-service-server/{package.json,vitest.config.ts,.env.example}`,
`apps/config-service-server/src/storage/{SqliteStorage.migration,SqliteStorage.visibility}.test.ts`,
`packages/shared/foundation/shared-types/src/configuration.ts`.

## 2026-05-08 — Config-manager redesign Session 4: visibility filter on read paths

Fourth session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 4, Decision 6). Lands the
`row.appId === ctx.appId AND (row.isPublic OR row.userId === effectiveUser)`
predicate on every client-side `appConfig` list path. Existing rows
(all `isPublic: true` after Session 1's backfill) read identically when
the manager is scoped to their app; private rows owned by other users
are now hidden, and cross-app rows never leak.

- New `visibility.ts` exports a tiny `isVisible(row, ctx)` predicate and
  `VisibilityContext` type. The predicate is pure — no Dexie / no fetch
  — so consumers can mirror the rule on row arrays they assembled
  themselves (e.g. a remote bundle).
- `ConfigManager` gains a private `visibilityContext` getter that
  builds `{ appId, effectiveUserId }` per call. Until Session 8 swaps
  the source of `effectiveUserId` to `getEffectiveUser(...)`, it's
  just `this.identity.userId`, so behaviour for existing call sites is
  unchanged.
- Filter applied to `getConfigsByApp`, `getConfigsByUser`,
  `getAllConfigs`, and `getTemplates`. `getLatestSnapshot` inherits the
  filter through its inner `getConfigsByApp` call.
- `getTemplates` now scans via `toArray()` and filters `isTemplate` in
  JS rather than `where("isTemplate").equals(1)` — IndexedDB cannot
  index booleans, so the previous indexed query never returned anything
  in practice. Same public API, working implementation.
- New `*Unfiltered` admin opt-out variants: `getAllConfigsUnfiltered`,
  `getConfigsByUserUnfiltered`, `getConfigsByAppUnfiltered`. Reserved
  for cross-app GC, migrations, full exports, and the multi-app admin
  browser landing in Session 12 / 15.
- Downstream admin / migration paths in `@starui/openfin-platform`
  (`realignAllConfigsToPlatformScope`, `migrateRegistryToGlobalScope`,
  `exportAllConfig`, `gcOrphanedConfigs`, `getSavedWorkspaces`, the
  `configImport` dedup scan) and the platform-global `DataProvider` /
  `AppData` stores in `@starui/data-services` switched to the
  unfiltered variants — these read across appIds by design.
- New `visibility.test.ts` (7 tests) pins the predicate matrix from the
  plan plus two edge cases: undefined `isPublic` is treated as private
  (safer default if the row reaches the predicate without going
  through the Session 1 upgrade), and the appId check happens before
  the public-vs-private branch.
- New `configManager.visibility.test.ts` (7 tests) covers each list
  path end-to-end: planted rows under various `(appId, userId,
  isPublic)` combinations, asserting both the filtered and unfiltered
  variants return the expected subset, including the
  `getLatestSnapshot` snapshot-listing path. DB is wiped between tests
  via `indexedDB.deleteDatabase` to keep cases isolated.

Files touched:
`packages/shared/services/config-service/src/{ConfigManager,index,visibility}.ts`,
`packages/shared/services/config-service/src/{visibility,configManager.visibility}.test.ts`,
`packages/shared/platform/openfin-platform/src/{db,workspace,workspaceGc,workspacePersistence,configImport}.ts`,
`packages/shared/services/data-services/src/runtime/{config/store,providers/appdata/store}.ts`,
plus matching `*Unfiltered` stubs in five existing test fakes.

## 2026-05-08 — Config-manager redesign Session 3: owner/audit stamping centralized

Third session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 3, Decision 7). Centralizes owner/audit stamping behind one
helper so Session 8's impersonation swap is a one-line change. No
external behavior change for existing call sites — owner === audit on
every row until Session 8 lands.

- New private `ConfigManager.stampWrite<T>(row, isInsert)` helper
  applies the audit-only rule to any row passing through `saveConfig`,
  `saveAppRegistry`, `saveUserProfile`, `saveRole`, or `savePermission`:
  on insert, default `createdBy` / `creationTime` to the current
  identity / now if the caller didn't set them; on every write, stamp
  `updatedBy` / `updatedTime` unconditionally. Audit always reflects
  the real logged-in user (`identity.userId`) — never an impersonated
  one.
- `ConfigManager.saveConfig` now reads the existing row to detect
  insert-vs-update, defaults the OWNER slot (`AppConfigRow.userId`) to
  `identity.userId` on insert if the caller didn't supply one, then
  funnels through `stampWrite`. The single extra read is acceptable —
  config writes are rare and local to Dexie.
- `ConfigManager.saveSnapshot` drops its previous `userId: "system"` /
  `createdBy: "system"` / `updatedBy: "system"` hardcoding. Snapshots
  are now owned by — and audited against — whoever the manager's
  current identity is. Verified no consumer depends on the literal
  `"system"` (only the deprecated `UnifiedConfig` JSDoc still mentions
  it as a historical convention).
- Auth-table rows (`AppRegistryRow`, `UserProfileRow`, `RoleRow`,
  `PermissionRow`) gain optional `createdBy` / `updatedBy` /
  `creationTime` / `updatedTime` fields so audit-only stamping has a
  declared shape. They're optional to keep older rows readable
  unchanged.
- New `configManager.audit.test.ts` (8 tests) pins the contract: insert
  defaults all three of `userId === createdBy === updatedBy ===
  identity.userId`; update preserves `createdBy` / `creationTime` and
  advances `updatedBy` / `updatedTime` to the new writer; explicit
  caller-supplied values on insert survive verbatim while audit slots
  still get stamped; `saveSnapshot` no longer writes `"system"`; auth
  tables stamp audit independently of their primary key.

Files touched:
`packages/shared/services/config-service/src/{ConfigManager,types}.ts`,
`packages/shared/services/config-service/src/configManager.audit.test.ts`.

## 2026-05-08 — Config-manager redesign Session 2: `AppIdentity` option (additive)

Second session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 2, Decisions 1 + 2). Pure surface addition — no behavior changes,
no call site needs to update.

- New `AppIdentity` interface in
  `@starui/config-service`: `{ userId, displayName?, getAccessToken?
  }`. JSDoc captures the two future-session uses (owner/audit stamping
  in Session 3, outbound `Authorization: Bearer` in Session 6) so
  there is one place future readers can land on.
- `ConfigManagerOptions` gains `appId?: string` and `identity?:
  AppIdentity`. Both default to dev placeholders (`"dev-app"` and
  `{ userId: "dev-user", displayName: "Dev User" }`) so first-run
  developer setup keeps working with zero wiring; existing call sites
  (`markets-ui-react-reference/src/main.tsx`, the OpenFin platform's
  worker entry, `demo-configservice-react`, etc.) compile unchanged.
- `ConfigManager` stores both as `private readonly` fields and exposes
  them through `getAppId()` / `getIdentity()` accessors. Sessions 3
  (owner/audit stamping), 4 (visibility filter), 6 (REST auth) and 7
  (ApplicationContext publication) all read from these accessors —
  centralizing the source of identity here avoids re-threading it
  through method signatures later.
- `AppIdentity` re-exported from the package barrel so host apps can
  type their own identity object against the framework's contract.

Files touched:
`packages/shared/services/config-service/src/{types,ConfigManager,index}.ts`,
`packages/shared/services/config-service/src/configManager.identity.test.ts`.

## 2026-05-08 — Config-manager redesign Session 1: `isPublic` schema field (additive)

First session of the [config-manager redesign](./plans/plan-2026-05-07/config-manager-redesign.md)
([per-session breakdown](./plans/plan-2026-05-07/config-manager-redesign-sessions.md)
§Session 1, Decisions 6 + 7). Pure schema addition — no read/write paths
consult the field yet; existing consumers compile and behave unchanged.

- `AppConfigRow.isPublic?: boolean` lands as an optional column. JSDoc
  on the type captures the owner-vs-audit role split (Decision 7) so
  Sessions 3+8 can swap stamping/visibility into one place without
  needing to retell the whole story.
- Dexie schema bumped to v3 with an idempotent `.upgrade()` hook that
  fills `isPublic = true` on every pre-existing row. The field is
  intentionally NOT indexed — Decision 6's visibility filter runs in
  JS, so adding an index would only slow opens for no read win.
- New writes through `ConfigManager.saveSnapshot` and the
  `createConfigServiceStorage` profile-set adapter populate
  `isPublic: true` explicitly. The adapter preserves a row's existing
  `isPublic` value across read-modify-write so a row that's already
  private stays private.
- `@starui/config-service` is now wired for vitest:
  `vitest.config.ts` (jsdom env) + `test/setup.ts`
  (`fake-indexeddb/auto`). The pre-existing
  `profileStorage.identity.test.ts` had been dead-code under the old
  setup; this session adopts it into a runnable suite (10 existing
  tests + 2 new `isPublic` tests + 3 new `db.upgrade.test.ts` tests
  for the schema migration). `fake-indexeddb ^6.2.5` is recorded in
  [`docs/DEPS_STANDARD.md`](./DEPS_STANDARD.md).

Files touched:
`packages/shared/services/config-service/src/{types,db,profileStorage,ConfigManager}.ts`,
`packages/shared/services/config-service/src/{db.upgrade,profileStorage.identity}.test.ts`,
`packages/shared/services/config-service/{package.json,vitest.config.ts}`,
`packages/shared/services/config-service/test/setup.ts`,
`docs/DEPS_STANDARD.md`.

## Migrated 2026-05-08 — worker-owned AppData persistence + BlottersMarketsGrid eager mode

Two related changes that close the last code-changing items in the
data-services redesign:

### Worker is sole IndexedDB writer for AppData

Per [design doc §3](./plans/plan-2026-05-07/data-services-redesign.md):
> Persistence: worker is the single writer to IndexedDB. Windows
> never persist locally — avoids drift.

Previously (Step 2's "fan-out bus" shape) each window's main thread
persisted AppData via its own ConfigManager and posted the row to
the SharedWorker for fan-out — two writes raced per mutation. Now:

- `SharedWorkerDataServicesHub` takes a `configManager` opt and
  exposes `hydrateAppData()`. The hub is sole writer.
- `installSharedWorkerHub({ configManager })` is async — awaits
  `hydrateAppData()` BEFORE registering the connect handler so first
  port attaches see a fully-loaded snapshot.
- `AppDataMirror` drops its `configManager` opt and `AppDataConfigStore`.
  Writes are pure RPC: `set/upsert/remove` send a request and resolve
  when the hub's ack arrives (post-persist + post-broadcast).
- The reference app's `dataServices.sharedWorker.ts` constructs its
  own ConfigManager via `createConfigManager({})` + `await init()`,
  then `await installSharedWorkerHub({ configManager })`.

The main-thread `bootstrapDataServices({ configManager })` arg stays —
it's still threaded into `DataProviderConfigStore` for editor flows
(which the worker never serves). Both ConfigManagers connect to the
same Dexie database; only AppData writes are funnelled through the
worker's connection.

### BlottersMarketsGrid flips to `mode='eager'`

The blotter's cfg uses `{{positions.asOfDate}}`. Lazy mode could
race-condition first attach with an unresolved template. Eager mode
suspends first paint until `services.ready` resolves — the route's
outer `<Suspense>` already renders the loading fallback. With
worker-owned persistence the hub hydrates from IndexedDB at boot,
so the suspend gap is just one ~50ms attach round-trip.

`HostedMarketsGrid` gains a `dataServicesMode?: 'eager' | 'lazy'`
prop (default `'lazy'` for back-compat). The reference app's
`BlottersMarketsGrid` opts in.

### Verification

`npx turbo typecheck build test` green: 67 tasks, all data-services
tests rewired to construct the hub WITH a ConfigManager and hydrate
before mirrors attach. The widgets-angular and React-adapter test
helpers updated in lockstep.

## Refactored 2026-05-08 — widgets-angular adopts data-services-angular adapter

`DataProviderService` in `@starui/widgets-angular` migrates from the
legacy `new DataProviderConfigService()` wrapper to
`inject(DataServicesService)` from `@starui/data-services-angular`.
After the redesign, persistence is uniformly ConfigManager-backed
via `bootstrapDataServices({ configManager })`; the v1 service's
REST/local-backend duo is redundant.

Method-by-method mapping:

| Legacy | New |
|---|---|
| `getAll(userId)` | `configStore.list(userId, { includeAppData: true })` |
| `create(p, userId)` | `configStore.save(p, userId)` (generates providerId) |
| `update(id, patch, u)` | fetch+merge then save |
| `delete(id)` | `configStore.remove(id)` |
| `configure({apiUrl})` | dropped (no callers) |

Behavioural change: consumers must register `provideDataServices(...)`
at the app root. Without it, DataServicesService resolution fails
with a clear DI error ("No provider for InjectionToken DATA_SERVICES")
which is strictly better than silently using a misconfigured REST
service.

## Added 2026-05-08 — `@starui/data-services-angular` adapter

Closes design doc §8 (React/Angular parity). New package mirrors
[@starui/data-services-react](../packages/react/providers/data-services-react/)
over the same vanilla TS core, with one Angular helper per React hook:

| React hook | Angular helper |
|---|---|
| `<DataServicesProvider services>` | `provideDataServices({ services })` in `app.config.ts` |
| `useDataServices()` | `inject(DataServicesService)` |
| `useAppDataStore()` | `injectAppDataStore()` — Signal-backed `version` + `loaded` |
| `useAppData(name)` | `injectAppData(name)` — Signal-backed `values` + `get`/`set`/`setMany` |
| `useDataProviderConfig(id)` | `injectDataProviderConfig$(id)` — Observable |
| `useDataProvidersList(opts)` | `injectDataProvidersList$(opts)` — Observable + `refresh()` |
| `useResolvedCfg(cfg)` | `injectResolvedCfg(cfg$)` — `computed()` Signal |
| `useProviderStream(id, cfg)` | `injectProviderStream(id, cfg)` — `rows$` / `status$` / `error$` + `refresh()` |
| `useProviderStats(id)` | `injectProviderStats$(id)` — Observable<ProviderStats> |

Both adapters drive the same `AppDataMirror` and `SharedWorkerDataServicesClient`
under the hood — only the reactive primitive differs (Signals + Observables for
Angular, `useState`/`useEffect` for React). Every `inject*` helper threads
`DestroyRef` so dynamic component injectors clean up subscriptions on teardown.

Lazy-only in v1. Eager mode parity (Angular's `provideAppInitializer()`
awaiting `services.ready` to defer app bootstrap until the AppDataMirror's
first snapshot lands — the Angular analogue of React's `<Suspense>`-mediated
`mode="eager"`) is a planned follow-up; no in-repo Angular consumer needs
it today.

Out of scope (separate PRs):
- Migrating widgets-angular's `DataProviderService` and `FieldInferenceService`
  onto the new adapter.
- Building a real Angular reference app on top of the adapter (apps/demo-angular
  is currently a fresh skeleton with no `@starui/*` imports).

The adapter ships standalone — ready when the first Angular consumer arrives.

## Tightened 2026-05-08 — REST hub coverage + provider-type lockdown

Step 4 of `docs/plans/plan-2026-05-07/data-services-redesign.md`,
closing out the original 5-step sequence. The actual generalization
work (REST runs through the same registry / hub / probe pipeline as
STOMP) had already shipped; Step 4 is the audit + lockdown pass.

| Layer | Before | After |
|---|---|---|
| `SharedWorkerDataServicesHub.test.ts` | mock-only coverage; REST ran in production but had no test through the hub | New "REST round-trip" describe block injects `startRest` with a stubbed `fetchImpl` and asserts loading → fetched-rows-replace → ready over the hub protocol |
| Angular editor's `providerTypes` picker | offered `websocket` + `socketio` (no factory implementations — saving such configs failed at first attach with `No provider factory registered`) | offers stomp + rest + mock only, matching React's `SUPPORTED_TYPES` |
| `provider-form.component.ts` | dead `<section *ngIf="…websocket">` + `…socketio` template branches and matching config getters | branches removed, getters dropped, type imports trimmed |
| `runtime/providers/index.ts` | barrel exported probe functions but didn't tell future maintainers how to add a transport | five-step "Adding a new transport" recipe documents the pattern at the discovery point; references `mock.ts` as the simplest reference and the new REST hub test as the template for verification |

Net delta: +98 LOC test, -52 LOC dead Angular code, +27 LOC docs.
The five-step redesign sequence (rename → AppData mirror → bootstrap
+ Provider mode → REST generalization → unified probe surface) is
now complete. Remaining work outside the redesign sequence: the
Angular adapter (`provideDataServices()` + `injectDataServices()`)
and worker-owned IndexedDB persistence — both deferred items, both
unblocked by the Step 1-5 chain.

## Removed 2026-05-08 — legacy `StompProbe` class; unified probe surface

Step 5 of `docs/plans/plan-2026-05-07/data-services-redesign.md`.
Finishes the design doc's `transport: 'main'` consolidation. Angular
migrates off the legacy `StompProbe` class (and the probe sibling
abstract bases `ProviderBase` / `StreamProviderBase`) to the same
`probeStomp` / `probeRest` / `inferFields` shared functions the
React editor's `useProviderProbe` already consumes.

| Layer | Before | After |
|---|---|---|
| Public root | `import { StompProbe } from '@starui/data-services'` | `import { probeStomp, probeRest, inferFields } from '@starui/data-services'` |
| React import | `from '@starui/data-services/runtime/sharedWorker'` (misleading — the path implied SharedWorker required) | `from '@starui/data-services'` (root) |
| Angular `FieldInferenceService.inferFields()` | `new StompProbe(...).fetchSnapshot()` + `StompProbe.inferFields()` (static) + `convertFieldInfoToNode` bridge | `probeStomp(cfg, opts)` + `inferFields(rows, opts)` (returns `FieldNode[]` directly) |
| Angular `StompForm.testConnection()` | `new StompProbe(cfg).fetchSnapshot(1)` (throws on failure) | `probeStomp(cfg, { maxRows: 1, timeoutMs: 10_000 })` (returns `{ ok, error }`) |
| Folder | `packages/shared/services/data-services/src/probes/` (5 files) | DELETED |

Behavioural diff (matches React's existing behaviour): `probeStomp`
resolves `[bracket]` tokens before connecting; the legacy
`StompProbe` class did not. Verified the Angular call sites build
cfgs from form inputs without `[bracket]` syntax — no consumer
behaviour change.

Net deletion: ~620 LOC across 5 deleted files + 2 trimmed Angular
files; one new ~25-LOC barrel (`runtime/providers/index.ts`)
aggregates the probe surface.

The Angular adapter (`provideDataServices()` / `injectDataServices()`)
is now the natural next move — it can drop in cleanly without
dragging legacy probe types along. Tracked separately.

## Added 2026-05-08 — `bootstrapDataServices()` + `<DataServicesProvider mode>`

Step 3 of `docs/plans/plan-2026-05-07/data-services-redesign.md`.
Single entry point for wiring data-services into a consuming app —
caller passes a pre-constructed `SharedWorker` (Vite worker plugin
constraint), bootstrap returns a `DataServices` bundle:

```ts
const dataServices = bootstrapDataServices({
  appName: 'TestApp',
  worker,                // new SharedWorker(new URL('./worker.ts', ...))
  configManager,         // ConfigManager class instance
  userId: LOGGED_IN_USER_ID,
});
// → { client, appData, configManager, ready, dispose }
```

Bootstrap is idempotent by `appName` — same key returns the same
object reference, so two parts of the app booting independently
share one client + one mirror.

The React Provider's prop shape switches from the 3-prop legacy
(`client`/`configManager`/`userId`) to a single `services` prop +
optional `mode: 'eager' | 'lazy'`:

```tsx
<DataServicesProvider services={dataServices} mode="lazy">
  <App />
</DataServicesProvider>

<Suspense fallback={<Spinner />}>
  <DataServicesProvider services={dataServices} mode="eager">
    <DashboardKeyedOnAppData />
  </DataServicesProvider>
</Suspense>
```

Eager mode uses React 19's `use(services.ready)` to suspend first
paint until the AppDataMirror's first snapshot lands — for
dashboards keyed off `{{positions.asOfDate}}`-style templates that
must have real values on first render.

Reference-app consumer wiring drops from ~46 LOC to ~10 LOC of
meaningful code — `dataServices.mainThread.ts` becomes a SharedWorker
construction + a single `bootstrapDataServices()` call. Downstream
views (`BlottersMarketsGrid`, `DataProviders`) read `dataServices`
directly from this module.

`HostedMarketsGrid`'s `dataServicesClient` prop is renamed to
`dataServices` (DataServices bundle); the inner Provider mount uses
the new `services` prop.

## Renamed 2026-05-08 — `@starui/data-plane` → `@starui/data-services`

Step 1 of `docs/plans/plan-2026-05-07/data-services-redesign.md`. Pure
rename / no-logic-change PR; coordinates folder, package, class, file,
and identifier names so the package name self-documents (transport-
hidden public surface, transport-exposed internal naming).

| Layer | Before | After |
|---|---|---|
| Shared package dir | `packages/shared/services/data-plane/` | `packages/shared/services/data-services/` |
| React package dir  | `packages/react/providers/data-plane-react/` | `packages/react/providers/data-services-react/` |
| Shared package     | `@starui/data-plane` | `@starui/data-services` |
| React package      | `@starui/data-plane-react` | `@starui/data-services-react` |
| Subpath (worker)   | `@starui/data-plane/v2/worker` | `@starui/data-services/runtime/sharedWorker` |
| Subpath (client)   | `@starui/data-plane/v2/client` | `@starui/data-services/runtime/client` |
| Subpath (runtime)  | `@starui/data-plane/v2`        | `@starui/data-services/runtime` |
| Folder             | `src/v2/` | `src/runtime/` |
| Folder             | `src/providers/` (one-shots) | `src/probes/` |
| Class              | `Hub` | `SharedWorkerDataServicesHub` |
| Class              | `DataPlane` | `SharedWorkerDataServicesClient` |
| Class              | `StompDataProvider` | `StompProbe` |
| Function           | `installWorker()` | `installSharedWorkerHub()` |
| Hook               | `useDataPlane()` | `useDataServices()` |
| React component    | `<DataPlaneProvider>` | `<DataServicesProvider>` |
| App-side file      | `apps/markets-ui-react-reference/src/dataPlaneClient.ts` | `dataServices.mainThread.ts` |
| App-side file      | `apps/markets-ui-react-reference/src/dataPlaneWorker.ts` | `dataServices.sharedWorker.ts` |
| Prop / variable    | `dataPlaneClient` | `dataServicesClient` |
| SharedWorker name  | `mkt-data-plane-v2:<APP_ID>` | `mkt-data-services:<APP_ID>` |

The naming convention agreed in the redesign doc — public names hide
transport, internal names expose it (`SharedWorker*` prefix, `*.sharedWorker.ts` /
`*.mainThread.ts` filename suffixes) — is now in effect for the
data-services package; subsequent steps (AppData → worker, bootstrap
entrypoint, REST/probe consolidation) layer on top without further
rename churn.

Older IMPLEMENTED_FEATURES entries below still reference the previous
`data-plane` names — they describe the package as it existed at the
time and are left as historical record.

## Repackaged in 2026-05-08 (Task 11 / PR-10 of code-organization migration)

The `packages/` tree was reorganized into role-based sub-buckets per
[`docs/plans/plan-2026-05-07/code-organization.md`](./plans/plan-2026-05-07/code-organization.md)
(Decisions 5–8). Tasks 1–10 performed the structural moves; this entry
captures the resulting layout for the living docs.

- `packages/shared/`: `core/`, `foundation/{shared-types, design-system,
  icons-svg, tokens-primeng}`, `runtime/{runtime-port, runtime-browser,
  runtime-openfin}`, `services/{config-service, data-services,
  component-host}`, `platform/{openfin-platform}`.
- `packages/react/`: `ui/`, `sdk/{widget-sdk}`,
  `widgets/{markets-grid, grid-react, widgets-react}`,
  `hosts/{host-wrapper-react}`, `providers/{data-services-react}`,
  `tools/{config-browser-react, workspace-setup-react}`.
- `packages/angular/`: `hosts/{host-wrapper-angular}`,
  `tools/{config-browser-angular}`, `widgets/{widgets-angular}`.

**New packages introduced during the migration:**

- `@starui/grid-react` (PR-8) — extracted React surfaces (`ui/`, `hooks/`,
  `modules/`) from `@starui/core`. ~24,117 LOC across 143 files.
- `@starui/workspace-setup-react` (PR-3) — extracted `WorkspaceSetup` and
  its registry-editor primitives from the deleted `@starui/dock-editor`.

**Renamed:**

- `@starui/angular` → `@starui/widgets-angular`
- `@starui/angular-config-browser` → `@starui/config-browser-angular`

**Deleted (PR-1 + PR-4):**

- `@starui/openfin-platform-stern` (Stern OpenFin shell).
- `@starui/dock-editor` and `@starui/registry-editor` (React) plus their
  Angular twins.
- Reference apps: `stern-reference-react`, `stern-reference-angular`,
  `fi-trading-reference`, `fi-trading-reference-angular`,
  `axe-blotter-demo`, `markets-ui-angular-reference`.

**Living docs updated in lockstep:** root `package.json` workspace globs
(audited and tightened to match the new sub-buckets), `CLAUDE.md`
"Package layout" section, and `docs/ARCHITECTURE.md` folder layout.

## Removed in 2026-05-08 (PR-1 of code-organization migration)

- Stern OpenFin shell (`@starui/openfin-platform-stern`) and reference apps.
- fi-trading reference apps (empty placeholders).
- axe-blotter demo (out of scope).
- markets-ui-angular-reference (deferred until Angular parity catches up).
- Three Stern-only OpenFin hooks (`useViewManager`, `useOpenFinEvents`,
  `useOpenfinTheme`) that re-exported Stern symbols through
  `@starui/widgets-react` — removed alongside the shell. No surviving
  app consumed them.

## Repackaged in 2026-05-08 (Task 9 / PR-8 of code-organization migration)

- **Extracted React surfaces from `@starui/core` into a new
  `@starui/grid-react` package.** ~24,117 LOC across 143 files moved
  from `packages/shared/core/src/{ui,hooks,modules}/` to
  `packages/react/widgets/grid-react/src/{ui,hooks,modules}/`. After
  this PR `@starui/core` is vanilla TypeScript with NO React peer-dep.
- Moved blocks: hooks (`GridProvider`, `useDirty`, `useModuleDraft`,
  `useGridColumns`, `useUndoRedo`, `useProfileManager`, `useGridApi`,
  `useGridEvent`, `useModuleState`, `useGridPlatform`,
  `GridCoreLike`/`GridCore`, `UseProfileManagerResult`); ui
  (SettingsPanel primitives, gc-themed shadcn primitives, StyleEditor,
  ColorPicker, FormatterPicker, format-editor, ExpressionEditor,
  PopoutPortal/Poppable/PortalContainer); modules (all 9 module
  definitions + their React panels — general-settings,
  column-templates, column-customization, conditional-styling,
  calculated-columns, saved-filters, toolbar-visibility, grid-state,
  column-groups).
- Stayed in `@starui/core`: GridPlatform, ProfileManager, expression
  engine, persistence adapters, security policy, history stack,
  colDef helpers, css tokens, OpenFin shim, shared types.
- Public-surface change: `IDirtyBus` is now exported from
  `@starui/core`'s public barrel (was internal); the `Module`
  interface's `SettingsPanel`/`ListPane`/`EditorPane` slots are now
  framework-agnostic `(props: P) => any` so core has no React
  imports anywhere.
- Consumer moves: `@starui/markets-grid` adds `@starui/grid-react`
  as a workspace dep and splits its imports per-symbol;
  `apps/markets-ui-react-reference`'s `RenameViewTab.tsx` switches
  `Button, Input` to `@starui/grid-react`; demo apps add the alias
  in `vite.config.ts`.
- `core/ui/shadcn/` was moved verbatim — these gc-themed primitives
  are intentionally divergent from `@starui/ui`'s Stern-themed
  copies (different sizes, focus rings, native-vs-Radix `Select`,
  `usePortalContainer`-routed Popovers). Reconciling the two
  themes is out of scope for PR-8.
- Vitest passing count = **653** (matches pre-PR-8 baseline
  exactly). Test redistribution: `@starui/core` 272 → 75 (the 197
  moved-tests now run in `@starui/grid-react`). All other packages
  unchanged.

## Removed in 2026-05-08 (Task 5 / PR-4 of code-organization migration)

- React Dock Editor (`@starui/dock-editor` package) — replaced by
  Workspace Setup (extracted in Task 4 to
  `@starui/workspace-setup-react`).
- React Component Registry editor (`@starui/registry-editor` package) —
  replaced by Workspace Setup.
- Angular Dock Editor + Component Registry editor
  (`@starui/angular-dock-editor`, `@starui/angular-registry-editor`) —
  Angular parity for Workspace Setup is deferred (Decision 1); these
  packages will return when parity catches up.
- `/dock-editor` and `/registry-editor` routes in
  `apps/markets-ui-react-reference` (and the `views/DockEditor.tsx` /
  `views/RegistryEditor.tsx` view files that backed them).

---

## 1. Feature Catalog

The feature catalogue below is organised by area rather than chronologically.
It covers the full Cockpit editor surface — shared primitives, the settings
shell, every module's panel, and the correctness + UX fixes that make v2
production-ready for the FI blotter use case.

### 1.1 Figma-inspired Format Editor primitives

A shared set of primitives used by every v2 editor that authors cell / header
styling. All live in `packages/core/src/ui/format-editor/` and are promoted
through the package barrel for core-v2 consumers.

- **`FormatPopover`** — Radix-Popover wrapper. Portal-based (escapes
  `overflow: hidden`), collision-detected (flip + shift), registered with
  a shared popover stack so nested popovers (border-editor → color-picker →
  thickness dropdown) don't close each other on outside-click.
- **`FormatColorPicker`** — saturation-value square + hue slider + alpha
  slider + hex input + recent-swatch strip. One component replaces every
  earlier colour picker variants.
- **`FormatSwatch`** / **`FormatDropdown`** — compact colour swatch with
  drill-in picker, dropdown primitive that portals its menu.
- **`BorderSidesEditor`** — 5-row table (All / Top / Bottom / Left / Right)
  with colour + thickness (1-5px) + style (solid/dashed/dotted) per side.
  Emits `BorderSpec` shapes consumed by both column-customization and
  conditional-styling.
- **`ExcelReferencePopover`** — dark-mode-aware scrollable panel listing the
  8 categories of Excel format string tokens, accessible from every format
  input via an info icon. Theme-aware scrollbar colours (fixed a white-bar
  bug when portaled out of the gc-sheet scope).
- **Responsive popover height** — every `FormatPopover` caps content at
  `--radix-popover-content-available-height` with `overflowY: auto`, so a
  tall popover (e.g. the FormatterPicker's preset grid) scrolls internally
  instead of clipping off the viewport edge on short windows.

### 1.2 Cockpit SettingsPanel primitive kit

New in `packages/core-v2/src/ui/SettingsPanel/` — every v2 editor composes
from these instead of rolling its own chrome.

| Primitive | Purpose |
|---|---|
| `PanelChrome` | Panel-frame shell with grip, title, status, close |
| `Band` | Numbered section header (`01 EXPRESSION`…) + hairline rule |
| `FigmaPanelSection` | Collapsible grouping of Rows with header + actions |
| `SubLabel` | 11px uppercase subsection label |
| `ObjectTitleRow` | 18px object-title row with action pills |
| `TitleInput` | Inline rename input sized for object titles |
| `ItemCard` | Single-item shell: title + dirty-dot + Save pill + delete |
| `PairRow` | 2-column paired field (Size/Weight, Top/Right border) |
| `IconInput` | 30px input pill with left icon + right suffix, commit-on-blur |
| `PillToggleGroup` + `PillToggleBtn` | Butt-joined sharp-corner toggles |
| `SharpBtn` | 26px rectangular action button (4 variants: default/action/ghost/danger) |
| `Stepper` | Narrow numeric field for up/down |
| `TGroup` / `TBtn` / `TDivider` | Flat-tray toolbar buttons used by toolbars + editors |
| `MetaCell` | Cell for the 4-column meta strip (SCHEMA / OVERRIDES / DIRTY / …) |
| `GhostIcon` | Transparent icon button for row-end actions |
| `DirtyDot` / `LedBar` | Pulsed indicators for unsaved state |
| `Caps` / `Mono` | Typography primitives |
| `TabStrip` | Sub-tabs under chrome (Rule / Preview) |
| `Band` index scaffold | Consistent `01 ESSENTIALS` band-numbering style |

All primitives consume the `--ck-*` token system scoped to `.gc-sheet-v2`:
`--ck-bg / --ck-card / --ck-border / --ck-green / --ck-t0..t3 / --ck-font-sans /
--ck-font-mono`. Dark is the default; a `[data-theme='light']` variant remaps
everything.

### 1.2b GhostIconButton — shared row-action primitive

`packages/core/src/ui/shadcn/ghost-icon-button.tsx` exports the
ghost-icon-button pattern as a token-driven primitive so callers
stop hand-rolling 30 lines of inline-styled `<button>` boilerplate
each time they need a hover/reveal action button.

- **Variants** — `default` / `accent` (info-blue hover tint) and
  `destructive` (negative-red hover tint). Resting color sits at
  the `--bn-t1` secondary text tier; hover swaps to the matching
  accent token, theme-aware automatically.
- **Sizes** — `sm` (22×22, the default for row actions) and `md`
  (28×28, toolbar tier).
- **Reveal modes** — `always` keeps the button visible (toolbar
  use); `on-row-hover` keeps the button at `opacity:0` until any
  ancestor with `data-row-hover-target` is hovered, with the
  button itself focus-visible as a fallback for keyboard users.
  A `revealed` boolean prop force-shows during edit-mode states.
- **Self-contained styles** — the stylesheet is injected once at
  module load via a `<style>` tag (id `gc-ghost-icon-button-styles`),
  not imported as a separate CSS file. tsc preserves CSS imports
  in emitted .js but downstream bundlers may not resolve them; the
  inline injection makes the primitive work in every consumer
  without build-config changes. SSR-safe (no-op without `document`)
  and idempotent under StrictMode's double-render.
- **First migration** — `ProfileSelector` per-row buttons (rename,
  clone, export, delete, cancel-rename) all moved to the primitive.
  The component shed `hoverId` React state entirely (CSS owns the
  reveal now) and lost ~80 lines of duplicated inline-style
  configuration. Coverage: 10 unit tests in
  `ghost-icon-button.test.tsx` covering variant/size/reveal
  forwarding, ref forwarding, disabled-state click suppression,
  and className composition.
- **Follow-up** — `FiltersToolbar` filter-pill action buttons,
  conditional-styling rule rows, and column-template rows still
  use bespoke inline-styled buttons; migrating them is a cosmetic
  cleanup best done as those files are touched.

### 1.3 Unified `<StyleEditor>` (shared across every panel)

One component edits the style of any AG-Grid element (cell, header, group
header). Lives at `packages/core-v2/src/ui/StyleEditor/`. Composes:
- **TextSection** — PillToggleGroup for B / I / U / S + alignment, Size +
  Weight pair via shadcn Select.
- **ColorSection** — two `CompactColorField`s (Text / Background).
- **BorderSection** — reuses `BorderSidesEditor` unchanged.
- **FormatSection** — `FormatterPicker` driven by `dataType`.

Value shape is `StyleEditorValue` with `bold / italic / underline /
strikethrough / align / fontSize / fontWeight / color / backgroundColor /
backgroundAlpha / borders / valueFormatter`. Consumers pass `sections={[…]}`
to opt into subsets (e.g. column-groups uses `['text', 'color']` only).

### 1.4 Compact `<ColorPicker>` (`CompactColorField` + `ColorPickerPopover`)

Replaces every swatch + custom hex input scattered through early v2
editors. `CompactColorField` is the 30px inline field (swatch + hex +
alpha + eye / clear). `ColorPickerPopover` is the full Figma popover:
Custom / Libraries tabs, fill-type strip, saturation square, hue + alpha
sliders, eyedropper, hex + mode dropdown, recent swatches.

### 1.5 Radix Popover migration

Every popover in the app (ColorPicker, FormatPopover, shadcn `<Popover>`,
`<Select>`, `<AlertDialog>`, AG-Grid menus adjacencies) now routes through
Radix primitives. Handles portal rendering, collision detection, focus
management, Escape dismiss, and accessibility out of the box.

### 1.6 ExpressionEditor hardening (Monaco-based)

- **Suggest widget body-mount** — the settings sheet uses `transform:
  translate(-50%, -50%)` which creates a containing block for `position:
  fixed`. Monaco's suggest widget was drifting hundreds of px below the
  cursor. Fix: body-mounted `data-gc-monaco-overflow` container with
  `overflowWidgetsDomNode` pointing to it; sheet-scoped `--ck-*` tokens
  rebound on the host so the widget paints with a solid background.
- **Popout-safe DOM context** — `<ExpressionEditor>` now resolves Monaco
  helper DOM from the editor host's `ownerDocument`. When the Grid
  Customizer is portaled into a browser/OpenFin popout, overflow widgets,
  placeholder styles, palette listeners, and help-overlay listeners bind to
  the popout document/window instead of the parent document.
- **Popout keyboard completion** — popup-hosted editors keep the Monaco
  textarea focused while accepting column suggestions. `Enter` uses Monaco's
  suggestion acceptance; `Tab` is captured on the editor document/window and
  falls back to the focused `[column]` suggestion so focus does not advance
  into the next input control. When the suggestion widget is visible, Up/Down
  route to Monaco's previous/next suggestion actions; otherwise
  Arrow/Home/End keys have a popup-safe navigation fallback through Monaco's
  `setPosition`. Space is inserted through Monaco's model position, avoiding
  the popup hidden-textarea selection drift that inserted spaces at the start
  of the expression. The Monaco caret uses native blink mode, and whitespace
  glyph rendering is disabled so typed spaces don't look like extra carets.
- **Live draft propagation** — both the calc-column editor and the
  conditional-styling rule editor now wire `<ExpressionEditor onChange>`
  into `useDraftModuleItem.setDraft`. Previously only `onCommit`
  (blur / Ctrl+Enter) fed the draft, so typing a new expression left the
  SAVE pill greyed out until the user explicitly blurred. Users filed
  this as "SUM doesn't work" because they never saw the button light up.

### 1.7 Conditional Styling — rich rule editor

Full rewrite of the Style Rules panel on the Cockpit primitives:
- Expression field (Monaco `<ExpressionEditor>`) with live column / function
  autocomplete and `[col]` hints.
- Scope pill (cell vs row) + target-columns chip picker + priority +
  APPLIED-rows live counter.
- `<StyleEditor>` embedded with all four sections enabled.
- Flash config band — target (row / cells / headers / cells+headers),
  duration, fade, continuous-pulse toggle.
- **Rule indicator badges** — per-rule icon (20+ Lucide glyphs) + color +
  position (top-left / top-right) + target (cells / headers / both).
  Renders via CSS `::before` on the `gc-rule-{id}` class so paint stays
  cheap; no per-cell React work. Indicators now explicitly exclude
  `.ag-floating-filter` so they don't double-paint on the filter row.
- **Per-rule value formatter** — a rule can carry a `valueFormatter` that
  wraps the column's existing formatter; the highest-priority matching
  rule wins. Same `ValueFormatterTemplate` shape every other format-aware
  module uses.
- Per-card Save + Dirty LED pattern via `useDraftModuleItem`.

### 1.7b Column Settings — per-column master-detail editor

New entry in the settings-sheet header dropdown: **Column Settings**
(module id `column-customization`, renamed from the earlier internal
"Columns" label). Replaces the hidden per-column editing surface that
previously only lived inside the Formatting Toolbar. Now every column
is addressable from one screen.

- **ListPane** — reads the live column set from
  `api.getColumns()` (re-subscribed on `columnEverythingChanged /
  displayedColumnsChanged / columnVisible / columnPinned / columnResized`)
  so the left rail always lists every column the grid currently has,
  including virtual / calculated cols. Internal columns with ids
  starting `ag-Grid-` (e.g. the auto-selection column) are filtered
  out — they're configured globally via Grid Options. Each row
  carries a dirty-state LED (via the shared `gc-dirty-change` custom
  event) and a green `•` marker when the column has any stored
  overrides.

- **EditorPane** — seven bands, all driven by `useDraftModuleItem`
  scoped to `state.assignments[colId]`:

  | Band | Controls |
  |---|---|
  | 01 HEADER | header name override, tooltip |
  | 02 LAYOUT | initial width, pinned (OFF/LEFT/RIGHT), initial hide, sortable/resizable as tri-state Selects (DEFAULT/ON/OFF) |
  | 03 TEMPLATES | **chip list of applied `column-templates`** with per-chip × to remove + shadcn-Select picker to add any unapplied template. Caption clarifies "APPLICATION ORDER — LATER TEMPLATES LAYER OVER EARLIER" since resolution is order-dependent. |
  | 04 CELL STYLE | embedded `<StyleEditor sections={['text','color','border']}>` wired through a local `CellStyleOverrides ↔ StyleEditorValue` bridge (typography / colors / alignment / per-side borders) |
  | 05 HEADER STYLE | same editor, scoped to `headerStyleOverrides`. Caption: "Blank alignment = follow the cell. Explicit value overrides." — matches the header-follows-cell fallback in reinjectCSS. |
  | 06 VALUE FORMAT | shared `FormatterPicker` in compact popover mode — same Figma-style preset grid the Formatting Toolbar + Style Rule editor + Calculated Column editor all use. |
  | 07 FILTER | rich per-column filter config (schemaVersion 4): master enable tri-state, kind picker (`agTextColumnFilter` / `agNumberColumnFilter` / `agDateColumnFilter` / `agSetColumnFilter` / `agMultiColumnFilter`), floating-filter Switch, button multi-select (apply/clear/reset/cancel), debounce, closeOnApply. When kind = `agSetColumnFilter`: mini-filter, select-all, alphabetical sort, Excel-mode Windows/Mac, default-to-nothing-selected. When kind = `agMultiColumnFilter`: ordered sub-filter list with per-row display-mode (inline / subMenu / accordion) + remove. The transform composes AG-Grid `filter` / `filterParams` / `floatingFilter` ColDef fields. |
  | 08 ROW GROUPING | per-column grouping / aggregation / pivot (schemaVersion 5). Switches for `enableRowGroup` / `enableValue` / `enablePivot` (tool-panel interactivity), `rowGroup` / `pivot` with their index stepper (initial state), agg-function Select (sum / min / max / count / avg / first / last / **custom expression**). Custom mode reveals a monospace textarea compiled by the shared `ExpressionEngine` — aggregate values array is exposed as `[value]`, so formulas like `SUM([value]) * 1.1` or `MAX([value]) - MIN([value])` work end-to-end. Compile errors are warned + the column falls back to no agg. The band also surfaces four **grid-level** controls (shared source-of-truth with Grid Options → general-settings module state): `groupDisplayType` (singleColumn / multipleColumns / groupRows / custom), `groupTotalRow` (subtotal rows per group), `grandTotalRow` (grand-total row for the dataset), `suppressAggFuncInHeader` (toggles "Sum(Price)" prefix). |

- **Save semantics** — explicit SAVE pill (draft / dirty pattern). A
  commit that clears every override deletes the assignment entry
  outright rather than leaving a `{ colId }`-only stub. Auto-save
  picks the commit up on the usual 300ms debounce.

- **Sticky chip-strip summary (v5)** — the legacy 4-column meta grid
  (`COL ID / TYPE / OVERRIDES / TEMPLATES`) became a wrap-flexed strip
  of `<SummaryChip>` chips pinned BELOW the editor header (outside the
  scrolling band container, so it stays visible while bands scroll).
  Always-on chips: COL ID, TYPE, DIRTY, OVERRIDES, TEMPLATES. Tone is
  driven by state so the eye latches on edits — DIRTY/OVERRIDES warm to
  warning amber, TEMPLATES warm to positive teal when non-zero, TYPE
  warms to info cyan when a `cellDataType` is detected. Conditional
  chips surface PINNED (`LEFT` / `RIGHT` / `ON`), HIDDEN, and FILTER
  (with short-name TEXT / NUMBER / DATE / SET / MULTI / STREAM TEXT
  / STREAM NUM / OFF / CUSTOM) when the column has that state set.
  Implementation lives in `ColumnMetaStrip.tsx`; the chip primitive is
  shared with `GridOptionsPanel` (`SettingsPanel/SummaryChip.tsx`).

- **Unified row primitive (v5)** — every label-and-control row in the
  Grid Customizer (Grid Options field rows + all six Column Settings
  band sub-editors: HeaderBand, LayoutBand, TemplatesBand,
  RowGroupingEditor, FilterEditor, CellEditorEditor) now routes through
  one shared `<SettingsRow>` in `SettingsPanel/SettingsRow.tsx`. Same
  160px fixed label gutter, same compact 6px vertical padding, same
  10px uppercase Caps label, same `--ds-border-primary` divider, same
  `items-center` alignment so the label TEXT lines up vertically with
  the control TEXT regardless of which control kind sits in the row
  (Switch / IconInput / Select / TriStateToggle / read-only pill).
  When a hint is present it drops onto a second grid row in column 2
  only — it never pushes the label off-centre relative to the control.
  Rows without a hint stay tight at one line; rows with a hint grow by
  exactly the hint's own line height. The old `editors/Row.tsx`
  inside column-customization is reduced to a 2-line re-export so the
  six band imports keep working without changes.

- **Unified sticky summary strips across editors (v5)** — the remaining
  Grid Customizer editors now use the same summary-strip visual language
  as Grid Options (`bg-card` + `border-b` strip with wrap-flexed
  `<SummaryChip>` entries and shared semantic tones). `RuleMetaStrip`
  (conditional-styling), `CalculatedColumnsPanel` meta strip, and
  `ColumnGroupsPanel` meta strip were migrated from legacy `MetaCell`
  grids to chip strips and made `sticky top-0 z-10` inside their
  scroll containers. Accent semantics are now consistent across all
  editors: primary for identity/anchor state, info for contextual
  metadata, warning for attention/overrides/counts, positive for active
  confirmation states.

- **Token-only accent references + hint legibility pass (v5)** — removed
  local accent utility drift from SettingsPanel controls so pressed/active
  states now resolve directly via `--ds-accent-positive` and
  `--ds-overlay-positive-soft` (no implicit `text-success` class path).
  Conditional-styling indicator defaults now source warning accent from
  `var(--ds-accent-warning)` instead of a local hex. Shared row hints in
  `SettingsRow` were bumped to a more legible DS-driven treatment
  (`text-[11px]`, `text-muted-foreground`, `leading-relaxed`) so helper
  descriptions under labels/inputs read consistently across all editors.

- **Icon contrast pass for light/dark parity (v5)** — icon-bearing
  primitives used across Grid Customizer editors (`SummaryChip`,
  `GhostIcon`, `Cockpit` toggle buttons, `PillToggleBtn`,
  `GhostIconButton`) were tuned to a stronger DS-driven resting ink
  (`text-foreground/85` or `--ds-text-primary`) and full icon opacity.
  This removes low-contrast icon states in dark mode while preserving
  semantic accent hover/pressed colours via existing DS overlay tokens.

- **Sidebar filter + shared row chrome unification (v5)** — Column
  Settings list rail now includes a sticky top search field
  (`cols-filter-input`) that filters by both `headerName` and `colId`,
  keeps selection valid when filters narrow, and preserves windowed list
  performance against the filtered slice. Sidebar item styling for all
  grid-customizer editors that use the shared list rail
  (`ColumnSettings`, `ConditionalStyling`, `CalculatedColumns`,
  `ColumnGroups`) is now centralized in `CockpitListItem` with one DS
  token-driven style contract (same active surface, same left-accent
  border token, same hover/selected treatment), eliminating per-editor
  drift.

- **Immediate diff-aware conditional expressions (v5)** — conditional
  styling now captures per-cell `{oldValue,newValue}` on
  `cellValueChanged` and injects them into expression context as
  dotted column refs (`[price.old]`, `[price.new]`) while preserving
  existing `[price]` semantics. Diff refs are available to both cell
  and row predicates; AG-string compilation is skipped only for rules
  that reference `.old` / `.new` so performance optimisations remain for
  non-diff rules. Rule commits now schedule an immediate grid refresh
  (`refreshCells`, `redrawRows`, `refreshHeader`) so indicator/style
  changes appear without requiring full grid save/reload.

- **Works for virtual columns** — calculated columns land in
  `api.getColumns()` once `calculated-columns.transformColumnDefs`
  has run at priority 15, so they show in the list automatically.
  Header-follows-cell alignment + the Excel-colour cellStyle
  resolver already cover the styling pipeline end-to-end for
  virtual cols (see 17.8).

- **Back-compat** — module id / schemaVersion / serialise contract
  unchanged. Existing profile snapshots round-trip without a
  migration bump; the rename is display-only.

Test IDs: `cols-item-{colId}`, `cols-editor-{colId}`, `cols-save-{colId}`,
`cols-discard-{colId}`, `cols-{colId}-header-name`,
`cols-{colId}-header-tooltip`, `cols-{colId}-width`,
`cols-{colId}-hide`, `cols-{colId}-sortable-default|on|off`,
`cols-{colId}-templates`, `cols-{colId}-template-{tplId}`,
`cols-{colId}-template-remove-{tplId}`, `cols-{colId}-template-picker`,
`cols-{colId}-cell-style`, `cols-{colId}-header-style`, `cols-{colId}-fmt`,
`cols-{colId}-filter-enabled`, `cols-{colId}-filter-kind`,
`cols-{colId}-filter-floating`, `cols-{colId}-filter-debounce`,
`cols-{colId}-filter-closeonapply`, `cols-{colId}-filter-btn-{apply|clear|reset|cancel}`,
`cols-{colId}-setfilter-minifilter` / `-selectall` / `-sorting` / `-excel` / `-dtn`,
`cols-{colId}-multi-add`, `cols-{colId}-multi-{idx}-kind` / `-display` / `-remove`,
`cols-{colId}-rg-enable-rowgroup`, `cols-{colId}-rg-rowgroup`,
`cols-{colId}-rg-rowgroup-index`, `cols-{colId}-rg-enable-value`,
`cols-{colId}-rg-aggfunc`, `cols-{colId}-rg-custom-expr`,
`cols-{colId}-rg-enable-pivot`, `cols-{colId}-rg-pivot`, `cols-{colId}-rg-pivot-index`.

Verified end-to-end in preview: 21 columns listed for the demo
blotter, selecting a column opens the full 6-band editor, applied
templates show as removable chips, × on a chip drops the template
from the draft and lights the SAVE pill.

### 1.8 Calculated Columns — full port + first-class citizenship

- Native v2 module with per-grid `ExpressionEngine`, schema v1, module
  dependencies enforced by the core.
- Master-detail panel (`CalculatedColumnsList` + `CalculatedColumnsEditor`)
  using the Cockpit primitives.
- Expression field with live column / function palette + diagnostics.
- **Value formatter** via the shared compact `FormatterPicker` (same
  popover the Formatting Toolbar uses; one picker everywhere).
- **First-class styling pipeline** — virtual columns honour every toolbar /
  style-rule / column-group write:
  - Typography, alignment, colours, borders from `column-customization`
    flow into `.gc-col-c-{colId}` and `.gc-hdr-c-{colId}` classes on the
    virtual colDef (parity with base columns).
  - Excel colour tags (`[Red]` / `[Green]`) inside formatters produce a
    `cellStyle` function via `excelFormatColorResolver`, mirroring the
    base-column path.
  - Header alignment follows cell alignment automatically — the
    `effectiveHeaderAlign` fallback chain (`headerStyleOverrides →
    cellStyleOverrides`) applies to virtual cols too.
  - Column groups composer (`composeGroups`) walks the full column tree by
    colId and picks virtual columns up naturally.
- **Column-wide aggregations** — `SUM([price])` now sums every row's
  `price`, not the current row's scalar. Implementation:
  - `EvaluationContext.allRows?: ReadonlyArray<Record<string, unknown>>`
    populated from a per-GridApi WeakMap cache that invalidates on
    `rowDataUpdated / modelUpdated / cellValueChanged`.
  - `FunctionDefinition.aggregateColumnRefs?: boolean` opts each function
    in. SUM, COUNT, DISTINCT_COUNT, AVG, MEDIAN, STDEV, VARIANCE, MIN,
    MAX are all flagged; a direct `[col]` arg is replaced with the full
    column array before the function runs. Falls back to scalar
    resolution when `allRows` isn't supplied (tests, server-side).
- **Aggregate-refresh on edits** — `cellValueChanged` / `rowValueChanged`
  / `rowDataUpdated` trigger `api.refreshCells({ columns: virtualColIds,
  force: true })` so column-wide aggregates re-evaluate across every
  visible row, not just the edited one.
- **Phase 4 — compat-shim cleanup, host chrome, and FormattingToolbar
  ApiHub migration**:
  - **Deleted** `packages/core/src/store/useDraftModuleItem.ts` (the v3
    draft hook replaced by `useModuleDraft` in phase 3, zero callers).
  - **Deleted** runtime `useGridCore()` / `useGridStore()` hooks from
    `hooks/GridContext.ts` — every module panel migrated to
    `useModuleState(id)` + `useModuleDraft` + platform context in
    phase 3, so the shims had zero runtime callers. The `GridCoreLike`
    TYPE stays exported; `GridCore` / `GridStore` type aliases stay too
    so FormattingToolbar's pure helpers can keep their prop-threading
    pattern.
  - **Dropped unused `core` + `store` props from `SettingsSheet`** — the
    props were explicitly `void`-ed out. Sheet now reads `gridId` from
    `useGridPlatform()` directly and wires DIRTY=NN via a new
    `useDirtyCount()` hook against the per-platform DirtyBus instead
    of a hardcoded `0` placeholder.
  - **New `useDirtyCount()` hook** (`hooks/useDirty.ts`) — subscribes
    via `useSyncExternalStore` and returns the live number of dirty
    keys. Used by the settings-sheet header so the `DIRTY=NN` counter
    actually reflects reality across all panel drafts. Tear-free under
    concurrent rendering. 1 regression test added.
  - **FormattingToolbar `useActiveColumns` rewrite** — the 300ms
    `setInterval` polling loop for the grid api (last remaining
    instance of that antipattern) replaced with
    `platform.api.onReady()` + three typed `platform.api.on(…)`
    subscriptions (`cellFocused`, `cellClicked`,
    `cellSelectionChanged`). All listeners auto-dispose with the
    platform, no leaked timers across StrictMode mount cycles.
  - **Stale doc polish** — `IconInput.tsx`'s comment now references
    `useModuleDraft` instead of the deleted `useDraftModuleItem`; the
    `useModuleDraft` file-level header drops its "vs the v3 shim"
    framing now that the shim is gone.

- **Cockpit list rail unified on shadcn / cmdk Command** — the four
  master-detail settings panels (Column Settings, Conditional
  Styling, Column Groups, Calculated Columns) used to hand-roll the
  same `<ul><li><button>` rail. Replaced with a shared
  `<CockpitList>` / `<CockpitListItem>` primitive in
  `packages/core/src/ui/SettingsPanel/CockpitList.tsx` that wraps
  `cmdk` directly (the same primitive shadcn's Command is built on,
  used un-styled so the `gc-popout-list-item` cockpit theme stays
  the single source of truth). Wins:
  - Free keyboard navigation (Up/Down/Enter), `role="listbox"` /
    `role="option"` semantics, and ARIA wiring without per-panel
    bookkeeping.
  - One markup pattern for all four panels — future panels just use
    the same primitive.
  - Selection model split: cmdk's transient `aria-selected`
    (keyboard / hover highlight) is now visually distinct from the
    persistent `data-active="true"` attribute that marks the card
    open in the editor. The cockpit CSS keys the green left-border
    on `data-active` only; `aria-selected` falls back to a softer
    surface tint so keyboard nav stays discoverable.
  - jsdom test environment learned `ResizeObserver` and
    `Element.prototype.scrollIntoView` shims so cmdk mounts cleanly
    under Vitest. All 242 core unit tests still pass; every panel's
    `data-testid` is preserved character-for-character (`cols-item-`,
    `cs-rule-card-`, `cs-rules-list`, `cg-group-`, `cc-virtual-`).

- **Column Settings list-rail perf pass** — `ColumnSettingsList` now
  scales cleanly to grids with hundreds of columns. Three changes
  layered on top of the shared `<CockpitList>` migration; zero
  behavior change, all 7 panel tests still pass:
  1. Override badge — `Object.keys(...).some(...)` recomputed per row
     on every render, replaced with a single `useMemo`-built
     `Set<colId>` keyed on `state.assignments`.
  2. Dirty LED — N `useDirty(key)` subscriptions (one per column) →
     a single `useDirtyColIds()` subscription against the platform
     DirtyBus that yields a `Set<colId>` filtered by the
     `column-customization:` prefix. Stable identity via shallow set
     equality so unrelated bus traffic doesn't re-render the rail.
  3. Inline windowing — when `columns.length > 60`, the rail walks
     up to the first scrolling ancestor (`.gc-popout-list` or the
     legacy `<aside>`) and slices to the visible range +
     8-row overscan (fixed `ROW_HEIGHT = 36`). Padding spacers above
     and below the visible window keep the scrollbar honest. Falls
     through to full render when no scroll parent is found (jsdom
     tests, edge containers).

- **Column Settings v4 panel rewrite (phase 3e)** — the last of the five
  settings panels. Same three shared antipatterns removed:
  `dirtyRegistry + window.dispatchEvent('gc-dirty-change')` →
  `useDirty('column-customization:<colId>')`; `useAllColumns()` with
  local `tick` polling 5 AG-Grid events → platform `useGridColumns()`;
  `useDraftModuleItem({ store, … })` + `useModuleState(store, id)`
  compat shims → `useModuleDraft` + 1-arg `useModuleState(id)`. Plus
  one panel-specific cleanup: the CUSTOM AGGREGATION expression row
  was a native `<textarea>` (the last native form element on any
  settings panel) → swapped to shadcn `Textarea` per the v4
  UI-primitives rule. `module.ListPane` + `module.EditorPane` wired
  natively. All `cols-*` testIds preserved; panel 1614 → 1521 LOC; 7
  integration tests added against a fake GridApi harness. Every module
  panel in the project is now on the clean v4 pattern.

- **Conditional Styling v4 panel rewrite (phase 3d)** — same three
  antipatterns cleaned plus two extra that only this panel carried:
  - `new ExpressionEngine()` allocated at module load → switched to
    `useGridPlatform().resources.expression()`. Validation now runs
    through the same engine that evaluates rules at transform time.
  - `<RuleRow>` subscribed to the entire `conditional-styling` slice
    just to read a committed snapshot it `void`-ed out and never used —
    re-rendered every row on every keystroke. Dropped; `RuleRow` now
    re-renders only when its own `rule`/`active` props change, with the
    dirty LED subscribing independently via `useDirty`.
  - Plus the shared fixes: `dirtyRegistry + window.dispatchEvent('gc-
    dirty-change')` → `useDirty('conditional-styling:<ruleId>')`; local
    `useGridColumns()` with tick polling → platform `useGridColumns()`;
    compat shims `useDraftModuleItem` / `useModuleState(store, id)`
    replaced.
  All `cs-*` testIds preserved. `module.ListPane` + `module.EditorPane`
  wired. Panel 1115 → 1036 LOC; 9 integration tests added.

- **Column Groups v4 panel rewrite (phase 3c)** — same v2 antipatterns
  removed (file-level `dirtyRegistry` + `window.dispatchEvent('gc-dirty-
  change')`, a second local `useGridColumns()` with its own `tick`
  polling, compat shims `useDraftModuleItem` / `useModuleState(store,
  id)`). Tree-mutation helpers (`flattenGroups`, `updateGroupAtPath`,
  `deleteGroupAtPath`, `moveGroupAtPath`, `findGroupByPath`) extracted
  into a dedicated `treeOps.ts` module with 11 unit tests — they're pure
  data transforms and now individually exercised instead of only being
  hit through the panel. `module.ListPane` + `module.EditorPane` wired
  so the settings sheet renders master-detail natively. All `cg-*`
  testIds preserved; panel file 868 → 669 LOC; 8 integration tests added.

- **v4 panel rewrite (phase 3b)** — three v2 antipatterns stripped while
  preserving every `cc-*` testId:
  - File-level `dirtyRegistry = new Set<string>()` +
    `window.dispatchEvent('gc-dirty-change')` broadcast → replaced by
    `useDirty(key)` against the per-platform `DirtyBus`. Fixes the
    cross-grid dirty-bleed v2 had on multi-grid pages.
  - `useBaseGridColumns()` with local `tick` state + raw
    `api.addEventListener` → replaced by the stable fingerprint-cached
    `useGridColumns()` hook (ApiHub-wired, auto-disposed).
  - `useDraftModuleItem({ store, … })` + `useModuleState(store, id)` v3
    compat shims → `useModuleDraft` (no store arg, auto-registers on
    dirty bus) + `useModuleState(id)` 1-arg form.
  - `module.ListPane` + `module.EditorPane` now set so the settings
    sheet renders master-detail natively instead of falling back to the
    flat `SettingsPanel` composition. 8 integration tests added.

### 1.8b Column Groups — nestable group editor

Module `column-groups` (priority 18 — runs after column-customization + calculated-columns so group children include renamed + virtual cols; before conditional-styling so rules can target grouped columns). Authored settings panel under the `Column Groups` nav entry.

- **ListPane** (`cg-panel` root, `cg-add-group-btn` for creating a new top-level group) — flattens the tree with `flattenGroups()` so nested subgroups appear indented under their parent. Each row (`cg-group-{groupId}`) carries a dirty LED via `useDirty('column-groups:<groupId>')`. Groups inherit a stable `groupId` emitted as `ColGroupDef.groupId` so AG-Grid's expand/collapse state survives every `columnDefs` update.

- **EditorPane** (`cg-group-editor-{groupId}`):

  | Control | Testid | Effect |
  |---|---|---|
  | Header name (TitleInput) | `cg-name-{groupId}` | `ColumnGroupNode.headerName` |
  | Move up / Move down | `cg-up-{groupId}` / `cg-down-{groupId}` | Reorder sibling groups via `moveGroupAtPath` — disabled at list ends |
  | Save | `cg-save-{groupId}` | Commit draft into state (dirty LED clears) |
  | Delete | `cg-delete-{groupId}` | Remove via `deleteGroupAtPath` — drops the corresponding `openGroupIds[groupId]` in the same action |
  | OPEN BY DEFAULT Switch | (no testid) | `ColGroupDef.openByDefault` — overridden at runtime by `openGroupIds[groupId]` once the user expands/collapses manually |
  | MARRY CHILDREN Switch | (no testid) | AG-Grid `marryChildren` — prevents users dragging cols out of the group header |
  | DEPTH / CHILDREN readouts | — | Live count, updates as the user composes |

  **01 COLUMNS band** — chip list of `ColumnGroupChild` entries with add + subgroup affordances:
  - Column chips: `cg-chip-{groupId}-{colId}` — shows header name + a tri-state visibility toggle (`cg-chip-show-{groupId}-{colId}`) cycling through `always` / `open` / `closed` (Eye / EyeOff / Lock icons). Maps 1:1 to AG-Grid's native `ColDef.columnGroupShow`.
  - Add column: `cg-add-col-{groupId}` — Select that lists every unassigned column (`eligibleToAdd` = columns not yet assigned to any group via `collectAssignedColIds`).
  - Add subgroup: `cg-add-sub-{groupId}` — inserts a nested `ColumnGroupNode`. Disabled when depth ≥ 3 (nesting cap).
  - Remove column: per-chip × button.

  **Header-style band** — embedded `<StyleEditor sections={['text','color','border']} dataType="text">` with testid `cg-hdr-style-{groupId}`. Writes into `ColumnGroupNode.headerStyle`: `{ bold, italic, underline, fontSize, color, background, align, borders }`. Styles are applied via runtime CSS injection (`gc-hdr-grp-{groupId}` class targeting the header cell + its inner label span), with a `::after` overlay for per-side borders so dashed / dotted strokes render correctly (box-shadow can't).

- **Runtime expand/collapse memory** — `platform.api.on('columnGroupOpened')` (subscribed in `module.activate(...)` via a single `onReady` hook, not a polled reconnect) writes `{ [groupId]: isExpanded }` into `openGroupIds`. The next `transformColumnDefs` applies that to `ColGroupDef.openByDefault`, so reloading the profile restores the exact layout the user left. Stale entries pruned on deserialize via `collectGroupIds(state.groups)`.

- **State shape** (`ColumnGroupsState`):
  ```ts
  {
    groups: ColumnGroupNode[],
    openGroupIds: Record<string, boolean>,   // pruned on deserialize
  }
  ```
  Each `ColumnGroupNode.children` is a mixed array of `{ kind: 'col', colId, show? }` or `{ kind: 'group', group }`, so nesting is arbitrary-depth (capped at 3 by the panel UI, not the state).

- **Save semantics** — same draft/dirty pattern as every other editor (`useModuleDraft` scoped to `<groupId>`); explicit SAVE pill commits into module state. Module state changes flip the profile-level dirty flag until the user clicks the primary Save button (profile-level auto-save is off as of 2026-04-20).

- **Pure tree ops** — `treeOps.ts` hosts `updateGroupAtPath` / `deleteGroupAtPath` / `moveGroupAtPath` / `flattenGroups` as pure helpers with their own 11-test `treeOps.test.ts`. No rendering needed to regress group mutation logic.

Testids: `cg-panel`, `cg-add-group-btn`, `cg-group-{groupId}`, `cg-group-editor-{groupId}`, `cg-name-{groupId}`, `cg-up-{groupId}`, `cg-down-{groupId}`, `cg-save-{groupId}`, `cg-delete-{groupId}`, `cg-add-sub-{groupId}`, `cg-chip-{groupId}-{colId}`, `cg-chip-show-{groupId}-{colId}`, `cg-add-col-{groupId}`, `cg-hdr-style-{groupId}`.

### 1.8c Column Templates — reusable override bundles

Module `column-templates` (priority 5 — runs BEFORE column-customization so its state is settled when the customization walker reads it). Unlike the other editor modules, this one has NO dedicated settings panel — templates are authored from two existing surfaces:

- **Save-as-template (in Formatting Toolbar)** — `save-tpl-input` + `save-tpl-btn` inside the Templates popover (`templates-menu-trigger`). Reads the currently-selected column's `ColumnAssignment` via `snapshotTemplate(custState, tplState, colId, name, dataType)`, strips fields that match the column's `typeDefault` template (so the snapshot captures only user-authored overrides), and dispatches `addTemplateReducer(tpl)` into `column-templates` state.
- **Apply-template (in Formatting Toolbar)** — Templates popover lists every existing template; clicking `templates-menu-item-{tplId}` dispatches `applyTemplateToColumnsReducer` which writes the templateId into every selected column's `ColumnAssignment.templateIds[]`.
- **Remove-template (in Column Settings)** — the TEMPLATES band (`03`) on `ColumnSettingsPanel` renders each applied template as a chip with per-chip × (`cols-{colId}-template-remove-{tplId}`); the `cols-{colId}-template-picker` Select adds any unapplied template.

- **State shape** (`ColumnTemplatesState`):
  ```ts
  {
    templates: Record<string, ColumnTemplate>,
    typeDefaults: Partial<Record<ColumnDataType, string>>,   // numeric/date/string/boolean → templateId
  }
  ```
  Each `ColumnTemplate`:
  - `id` (stable), `name`, optional `description`
  - `cellStyleOverrides`, `headerStyleOverrides` (same shape as column-customization)
  - `valueFormatterTemplate` (discriminated union: `preset` / `expression` / `excelFormat` / `tick`)
  - Behaviour flags: `sortable`, `filterable`, `resizable`
  - Cell editor / renderer registry keys: `cellEditorName`, `cellEditorParams`, `cellRendererName`
  - `createdAt` / `updatedAt` audit timestamps

- **Resolution** (`resolveTemplates(assignment, state, dataType)`):
  1. `cellStyleOverrides` / `headerStyleOverrides` — merge per-field across the chain (later templates win individual facets).
  2. Every other field — last-writer-wins.
  3. `cellEditorParams` — opaque, no deep merge; last template's params object replaces earlier.
  4. If `assignment.templateIds` is undefined AND the column has a `dataType`, the `typeDefaults[dataType]` template folds in at the bottom of the chain. An explicit empty `templateIds: []` opts out of the typeDefault.

- **44-test `snapshotTemplate.test.ts`** covers: capture / round-trip on every eligible field, behavior-flag passthrough, empty-cellEditorParams elision, full filter blob (incl. floating-filter), rowGrouping live-state stripping, identity-field exclusion, the update + rename reducers (preserves identity, bumps `updatedAt`, no-op on unknown id, rejects empty rename), null-safe empty-assignment paths.

- **No `SettingsPanel` / no `transformColumnDefs`** — column-templates is a passive state holder. `column-customization.transformColumnDefs` reads it via `ctx.getModuleState<ColumnTemplatesState>('column-templates')` and folds the chain through `resolveTemplates` before emitting the final per-column AG-Grid ColDef.

Testids (interaction surfaces, not direct state): `templates-menu-trigger`, `templates-menu`, `tb-tpl-row-{tplId}` / `fmt-panel-tpl-row-{tplId}` (apply on click), `tb-tpl-row-{tplId}-update` (re-snapshot into existing template), `tb-tpl-row-{tplId}-rename` + `tb-tpl-row-{tplId}-rename-input`, `tb-tpl-row-{tplId}-delete` (mousedown to arm, click `tb-tpl-row-{tplId}-delete-confirm` to commit), `tb-tpl-save-input`, `tb-tpl-save-btn`, `tb-tpl-capture-hint`, `cols-{colId}-templates`, `cols-{colId}-template-{tplId}`, `cols-{colId}-template-remove-{tplId}`, `cols-{colId}-template-picker`.

### 1.8c.1 Column Templates UX redesign + expanded scope (2026-05-03)

The original Templates popover was a 220px Select dropdown + name input + plus / trash row. Two limitations drove a redesign:

1. **No way to add settings to an existing template** — every save was a new template, leading to duplicate clutter.
2. **Snapshot scope was style-only** — only `cellStyleOverrides` / `headerStyleOverrides` / `valueFormatterTemplate` / `editable` were captured; everything else authored through the Column Settings dialog (filter config, row-grouping capabilities, editor / renderer registry keys, behavior flags) had to be re-authored on every column.

**Expanded snapshot scope** — `pickTemplateFields(resolved)` is the new single source of truth for "what does a template carry". It captures every ColumnAssignment field except those bound to a specific column instance:

| Captured | Excluded (column-unique) |
|---|---|
| `cellStyleOverrides`, `headerStyleOverrides` | `colId`, `headerName`, `headerTooltip` |
| `valueFormatterTemplate` | `initialWidth`, `initialPinned`, `initialHide` |
| `editable`, `sortable`, `filterable`, `resizable` | `templateIds` (would create circular template-on-template refs) |
| `cellEditorName`, `cellEditorParams`, `cellRendererName` | `rowGrouping.rowGroup` / `.rowGroupIndex` / `.pivot` / `.pivotIndex` (live grouping state) |
| `filter` (full blob, incl. `floatingFilter`, `debounceMs`, `closeOnApply`, `buttons`, `setFilterOptions`, `multiFilters`) | |
| `rowGrouping` (capability subset: `enableRowGroup`, `enableValue`, `enablePivot`, `aggFunc`, `customAggExpression`, `allowedAggFuncs`) | |

`ColumnTemplate.filter` and `.rowGrouping` are imported as the narrowed shapes from `column-customization/state.ts` (was: relied on the base `unknown` from `colDef/types`). `applyOver` in `resolveTemplates` accepts a loose union of both shapes so the existing precedence rules (per-field merge for styles, last-writer-wins everywhere else, opaque wholesale-replace for `filter` / `rowGrouping` / `cellEditorParams`) keep working unchanged.

**Update existing template** — new `updateTemplateReducer(id, snapshot)` replaces an existing template's data fields with a fresh snapshot of the active column. Identity (`id`, `name`, `description`, `createdAt`) is preserved; `updatedAt` bumps. Replace-not-merge: if the column has lost a setting since the template was first saved, that setting drops from the template too — matches the user's mental model "save the column as it is now". Caller-side accidental id / name / createdAt overrides are stripped at the reducer boundary.

`snapshotTemplateUpdate(cust, tpls, colId, dataType)` is the sibling of `snapshotTemplate` — returns the picked field set ready for the update reducer (without minting an id), or `undefined` when the column has nothing eligible (so the UI can short-circuit).

**Rename existing template** — `renameTemplateReducer(id, name)` writes a new `name` (trimmed, empty rejected) and bumps `updatedAt`. Unknown id / no-op rename / blank-name are all no-ops returning the same state reference (cheap subscriber early-out).

**TemplateManager UX** — replaced the cramped `<Select>` + plus / trash row with a per-row list:

- Each row: leading active-check / dot, template name, hover-revealed `[Update] [Rename] [Delete]` buttons. Row-click applies (matches the ProfileSelector pattern). The Update icon is `RotateCw`; rename is `Pencil`; delete is `Trash2`.
- Inline rename: click pencil → name swaps to an input seeded with the current name. Enter / blur commits, Escape / X cancels. Empty / unchanged values silently cancel.
- Two-step delete: click trash to arm a per-row red `DELETE` button; click that to commit. Auto-disarms after 3s OR when the template list shape changes (so a stale arm can't target a different row).
- Save-as footer: name input + `[+]`. Compact mode bumped from 220px to 320px.
- "Will save: …" caption beneath the save row lists the categories the active column has authored (Cell style · Header style · Formatter · Behavior · Editor · Renderer · Filter · Grouping). Sourced from `state.capturableFields`, which runs `pickTemplateFields` on the active column's resolved assignment and maps populated keys to friendly labels. Hidden when the column has nothing template-eligible.
- Empty state (no templates yet) shows an inline hint instead of a disabled Select + tooltip.

**Formatter-state additions** — `actions.updateTemplate(id) → boolean`, `actions.renameTemplate(id, name) → boolean`, `state.capturableFields: ReadonlyArray<string>`. Both new actions return `false` on no-op so the host can treat that as "nothing to do" rather than a write — currently the ModuleLibrary host doesn't surface a toast since the Will-save caption already tells the user the column is empty.

### 1.8d Saved Filters — opaque state holder

Module `saved-filters` (priority 1001 — effectively last in the module chain; no transforms, no ordering constraint). Core does NOT interpret the filter records. The host (`markets-grid`'s `FiltersToolbar`) defines the concrete `SavedFilter` shape and casts through `useModuleState<SavedFiltersState>('saved-filters')`. The module exists so the host's filter pills ride along inside the active profile snapshot via `serializeAll()` / `deserializeAll()`.

- **State shape**:
  ```ts
  interface SavedFiltersState {
    filters: unknown[];   // opaque — host defines SavedFilter
  }
  ```

- **Host-defined shape** (`markets-grid/src/types.ts:SavedFilter`):
  ```ts
  interface SavedFilter {
    id: string;                                  // `sf_<timestamp>_<random4>` (makeId)
    label: string;                               // user-editable, auto-generated from model
    filterModel: Record<string, unknown>;        // AG-Grid filter-model snapshot
    active: boolean;                             // whether this pill's model is currently applied
  }
  ```

- **Interaction surface** lives in `FiltersToolbar` (documented in §1.x). Pure logic extracted to `filtersToolbarLogic.ts` with 34 unit tests covering `generateLabel`, `doesRowMatchFilterModel`, `filterModelsEqual`, `mergeFilterModels`, and `isNewFilter` (per-pill count predicates, echo detection for `+` button enabling, multi-filter OR merge with `set`-value union, duplicate-vs-inactive-pill guard).

- **+ button uniqueness spans active AND inactive pills** — the `+` button enables only when the live AG-Grid filter model doesn't match any existing pill's model (active OR inactive) AND doesn't match the merged-active echo. Prevents duplicates: if the user toggles a pill off and then re-enters the same filter into the grid, `+` stays disabled because the pill still exists (just muted). Before this fix, the check only compared against the merged-ACTIVE set, so that flow created a duplicate pill. The `isNewFilter(live, pills)` helper in `filtersToolbarLogic.ts` encapsulates the rule; `handleAdd` also runs the same guard defensively.

- **New pill captures the DELTA, not the merged model** — when the user adds a column filter while one or more pills are active, AG-Grid reports the combined model `{ <active pills' criteria> ⊕ <new column> }`. Capturing that as the new pill's `filterModel` would duplicate the active pills' criteria inside the new pill, breaking toggle semantics (toggling an active pill off would still leave its criterion enforced by the new pill). `subtractFilterModel(live, mergedActive)` in `filtersToolbarLogic.ts` returns only the columns the user actually added or changed; `handleAdd` persists that delta. Example: pill A active with `{side: BUY}` → user filters `price > 100` → AG-Grid live = `{side: BUY, price > 100}` → new pill stores only `{price > 100}`.

- **Save path** — every add / toggle / rename / remove writes through `useModuleState(...)` setState; the profile-level dirty flag trips and the primary Save button becomes the commit point. Reload restores every pill (including active/inactive state) before the grid's first `modelUpdated`, provided the user hit Save before reloading.

- **No settings panel** — the toolbar IS the editor. Nav entry intentionally omitted from the settings sheet.

Testids (all in FiltersToolbar): `filters-toolbar`, `filters-add-btn`, `filter-pill-{id}`, `filter-pill-count-{id}`, `filters-caret-left`, `filters-caret-right`, `filters-collapse-toggle`, `filters-summary-chip`. (The `style-toolbar-toggle` now lives in the primary row's action cluster outside FiltersToolbar — see §1.12c.)

- **Pill-row scrollbar is hidden** — once pills overflow the toolbar width, the browser's horizontal scrollbar would otherwise render underneath the pill row, stealing vertical space and looking noisy. Since the left/right chevron carets (`filters-caret-left` / `filters-caret-right`) already auto-reveal on overflow and scroll by 150px per click, the scrollbar is redundant UI. Hidden in `cockpit.ts` via `scrollbar-width: none` (Firefox) + `::-webkit-scrollbar { display: none }` (Chromium/WebKit) + `-ms-overflow-style: none` (legacy). Wheel-scroll + programmatic scroll still work; only the scrollbar chrome disappears.

- **Clear-all + add-new are sticky (always visible)** — clustered in `.gc-filters-actions` AFTER the right scroll caret, outside the scrollable `.gc-filter-scroll` container. When the pill row overflows and the user scrolls through pills, these action buttons never scroll off-screen. Previously they lived inside `.gc-filter-scroll` and scrolled with the pills, leaving the user unable to reach them without scrolling back. The layout order (collapse-toggle → summary-chip-OR-pills → right-caret → clear → add) keeps the carets hugging the carousel they control. **The formatter-toolbar toggle (Brush) has been hoisted out** — it now lives in the primary row's shared action cluster (MarketsGrid), decoupled from filter semantics.

- **Collapse / expand the pill carousel** — the first thing in the filters row is a chevron toggle (`filters-collapse-toggle`). Clicking it swaps the carousel for a compact summary chip `N filters · M active` (`filters-summary-chip`). Either the chevron OR the chip toggles back to the expanded view. State persists via the `toolbar-visibility` module under `filters-toolbar-pills`. Clear + add buttons remain reachable in both states because they live outside the collapsible section.

- **Primary-row redesign (MarketsGrid)** — the row hosting FiltersToolbar, the formatter-toolbar toggle (Brush), ProfileSelector, Save button, and Settings icon was refactored into a single `.gc-primary-row` flex strip. Previously every right-side action carried a full-height `border-left` and hard-coded inline-styled chrome, which read like a row of spreadsheet tabs. The new layout uses:
  - One shared `.gc-primary-action` class (30 × 30 icon button, hover-tint, teal-accented on active, amber on dirty, green on save-flash)
  - `.gc-primary-divider` 1 × 20 px hairlines between logical groups instead of per-button border-lefts
  - A single bottom hairline on `.gc-primary-row` owned by the outer container (inner components render against transparent backgrounds)

  Action order: filters (flex:1) → Brush → divider → ProfileSelector → divider → Save → divider → Settings.

### 1.8e Toolbar Visibility — hidden per-profile toolbar layout

Module `toolbar-visibility` (priority 1000). Tracks which optional toolbars (Filters, Formatting, etc.) the user has shown in the host app so the layout round-trips across profile load / save.

- **State shape**:
  ```ts
  interface ToolbarVisibilityState {
    visible: Record<string, boolean>;   // toolbar id → visible. Missing key = host default.
  }
  ```

- **Never appears in the settings nav** — no `SettingsPanel` field on the module. Consumed via `useModuleState<ToolbarVisibilityState>('toolbar-visibility')` from host chrome.

- **First wired consumer** — `FiltersToolbar` persists its collapse/expand state under the key `filters-toolbar-pills`. `visible[key] === false` collapses the pill carousel into a compact summary chip ("N filters · M active"). Missing key defaults to expanded. Reloading the profile restores the last state so users who prefer the compact view stay there.

- **Forgiving deserialize** — missing keys mean "host default" (deliberately NOT seeded `false` so a host that adds a new toolbar id later doesn't have to migrate every old profile). Non-boolean values are dropped on deserialize so a stray `null` / string can't poison render.

- **Usage today** — registered in `MarketsGrid.DEFAULT_MODULES` so its state ships in every profile snapshot, but the concrete toolbar-toggle bindings (Brush pill, filters toolbar show/hide) are not yet routed through it. Documented here as a scaffold module — the missing wiring is one of the known follow-up items for host-chrome layout polish.

- **No testids** — purely state.

### 1.9 Expression Engine extensions

- **Multi-branch conditionals** — `IFS(cond1, val1, cond2, val2, …,
  default?)`, `SWITCH(expr, case1, val1, …, default?)`, and a `CASE`
  alias. Trailing default is optional (odd arg count); no-match returns
  `null` when absent.
- Column-aggregation semantics (see 17.8).
- Existing `IF` / chained ternary unchanged for back-compat.

### 1.10 Grid State Persistence (new `grid-state` module)

Captures the native AG-Grid state (column order / widths / pinning /
sort / filters / column-group open-closed / pagination / sidebar / focus
/ selection / row-group expansion) plus a viewport anchor + quick filter
**on explicit Save only** — every other module keeps its auto-save
cadence, but native grid state is explicit-save-only to match the user's
expectation that Save is a commit, not a keystroke write.

- Replayed on `onGridReady` (cold mount) and `profile:loaded` events
  (profile switch).
- Wire format matches the standalone `agGridStateManager.ts` reference
  (SavedGridState envelope, schema v3) so snapshots from either side
  are interchangeable.

Correctness fixes layered on top:
- **Blank-slate new profile** — `createProfile` now calls `core.resetAll()`
  before serializing, and the grid-state module resets the live grid
  (`api.setState({})` + clear quickFilterText) when the loaded profile
  has no saved state. Creating a new profile no longer inherits the
  previous profile's layout / rules / calc-cols / filters.
- **Delete doesn't resurrect** — `deleteProfile` cancels the pending
  auto-save debounce before erasing the record and passes `skipFlush:
  true` when falling back to Default, so the outgoing profile can't be
  rewritten by a post-delete flush.
- **Selection column position + pinning** — `api.setState` silently
  drops the auto-generated `ag-Grid-SelectionColumn`'s position AND
  pinning on reload. Fix: emit `selectionColumnDef: { suppressMovable:
  false, lockPosition: false, initialPinned: 'left' }` from
  `general-settings` so the column is a first-class participant, then
  re-apply order + pinning post-setState via `applyColumnState({ state:
  mergedOrder, applyOrder: true })` deferred to `queueMicrotask` +
  `firstDataRendered`. Each entry carries its `pinned` value derived
  from the saved `columnPinning` sets, so pinning round-trips.
- **Stale saved order doesn't hide new columns** — when a calc column
  is added after the last save, the reorder merges the live column set
  into the saved order: saved IDs first, then live IDs not in the
  snapshot appended at the end. Without this, adding a new virtual
  column made it disappear on reload because the stale `orderedColIds`
  list didn't reference it.
- **Save doesn't jolt the selection column** — stable-reference memo on
  `gridOptions` + diff-then-push in the setGridOption effect ensure
  the `rowSelection` + `selectionColumnDef` props aren't re-issued on
  every store tick. Previously every Save click fired setGridOption
  for both, which made AG-Grid regenerate the auto-injected selection
  column and lose its pinned / reordered position.

### 1.11 Grid Options Settings Panel (module renamed `general-settings`)

New dedicated editor at `Settings → Grid Options`. Dropdown label
`"Grid Options"` (renamed from `"General Settings"`); schema bumped v1 →
v2 with additive migrate.

**State coverage** — every user-actionable scalar / toggle / enum from the
curated Top-40 AG-Grid v35 options spec (`ag-grid-customizer-input-controls.md`)
plus the full Row Grouping surface:

| Band | Controls |
|---|---|
| **01 ESSENTIALS** | rowHeight, headerHeight, animate, rowSelection, checkbox + cellSelection, flash / fade duration, pagination (+auto-page + hide-panel), quickFilterText |
| **02 ROW GROUPING** | groupDisplay, defaultExpanded, rowGroupPanel (+ no-sort), hideOpenParents, hideColumnsUntilExpanded, showOpenedGroup, single-child flatten (bool \| leafGroupsOnly), allowUnbalanced, maintainOrder, stickyGroups, lockGroupColumns, dragLeaveHides, suppressGroupChangesColumnVisibility (4-way enum), refreshAfterGroupEdit, ssrmExpandAllAffectsAllRows |
| **03 PIVOT · TOTALS · AGGREGATION** | pivotMode, pivotPanel, grandTotalRow, groupTotalRow, suppressAggFuncInHeader |
| **04 FILTER · SORT · CLIPBOARD** | enableAdvancedFilter, includeHiddenColumnsInQuickFilter, multiSortMode (compound → suppressMultiSort + alwaysMultiSort + multiSortKey), accentedSort, copyHeadersToClipboard, clipboardDelimiter |
| **05 EDITING · INTERACTION** | singleClickEdit, stopEditingWhenCellsLoseFocus, enterNavigation (compound → enterNavigatesVertically + …AfterEdit), undoRedoCellEditing + limit, tooltipShowDelay, tooltipShowMode |
| **06 STYLING** | suppressRowHoverHighlight, columnHoverHighlight |
| **07 DEFAULT COLDEF** | 7 subsections: SIZING (resizable, min/max/width/flex, suppressSizeToFit, suppressAutoSize), SORT & FILTER (sortable, filter, unSortIcon, floatingFilter), EDITING (editable, suppressPaste, suppressNavigable), HEADER (wrapHeaderText, autoHeaderHeight, suppressHeaderMenuButton), MOVEMENT & LOCKING (suppressMovable, lockPosition enum, lockVisible, lockPinned), CELL CONTENT (wrapText, autoHeight, enableCellChangeFlash), GROUPING · PIVOT · VALUES (enableRowGroup, enablePivot, enableValue) |
| **08 PERFORMANCE (ADVANCED)** | rowBuffer (live), suppressScrollOnNewData (live), + 5 initial-only flags (suppressColumnVirtualisation, suppressRowVirtualisation, suppressMaxRenderedRowRestriction, suppressAnimationFrame, debounceVerticalScrollbar) |

**UI pattern** — every multi-option enum is a shadcn `<Select>` dropdown
(replaced earlier overlapping pill groups). Readable Title Case labels
(e.g. "Only when grouping" instead of "WHEN GROUPING"). `boolean |
'literal'` unions encode/decode through string sentinels at the
SelectControl boundary so TypeScript keeps the union typed while the
native select stays in string-value land.

**Header with explicit SAVE** — the panel has its own `<ObjectTitleRow>`
header with a teal SAVE pill (action when dirty, ghost when clean) and
a RESET pill. Runs through `useModuleDraft` (v4 replacement for
`useDraftModuleItem`) treating the whole state as the "item"; every
control edits a local draft and the grid doesn't re-render until the
user clicks SAVE. Dirty flag auto-registers on the per-platform
`DirtyBus` so the settings sheet's DIRTY=NN counter stays accurate.

60 total controls on one panel.

**v4 schema-driven rewrite (phase 3a)** — the 1425-LOC v2-verbatim panel
(hand-rolled `<Row>`/`<BooleanControl>`/… repeated 80×) collapsed to a
~130-LOC thin shell (`GridOptionsPanel.tsx`) + a pure-data schema
(`gridOptionsSchema.tsx`) + a generic `<BandRenderer>`
(`fieldSchema.tsx`). Adding a new grid option is now a single record in
the schema array, not a fresh JSX block. Visual fidelity is preserved
pixel-for-pixel — the renderer emits the same `<Band>` + `<Row>` markup
v2 used; tests cover all seven field kinds (bool / num / optNum / text
/ select / invert / conditional / custom). 10 integration tests added
(`GridOptionsPanel.test.tsx`).

**v5 sidebar-nav layout** — the flat scrolling list became a left
sidebar + content split. The 10 category bands (ESSENTIALS, ROW
GROUPING, …, PERFORMANCE) live in a fixed-width left rail with a small
override-count badge per band; clicking a band scrolls its content into
view and an IntersectionObserver passively updates the active highlight
as the user scrolls (jsdom-safe — guarded). The summary strip
(SCHEMA / OVERRIDES / DIRTY / QUICK FILTER + an extra SEARCHING chip
while a filter is active) is now a sticky chip row pinned below the
search bar, formatted with semantic Tailwind classes and the
`--ds-overlay-{warning,info,primary}-soft/-ring` token surfaces so it
renders correctly in both dark and light. Row padding tightened (160px
label column, 5px vertical padding) for a denser body. Field-key
collection is centralised in `collectFieldKeys` on the schema module
(used by per-band override counters).

### 1.12 Formatter Toolbar + FormatterPicker

- **Shared FormatterPicker** — one component (`packages/core-v2/src/ui/
  FormatterPicker/`) used by the Formatting Toolbar, the Style Rule
  editor, AND the Calculated Column editor. `compact` variant renders
  the Figma-style popover with preset tile grid grouped by DECIMALS /
  NEGATIVES / SCIENTIFIC / BASIS POINTS + CUSTOM EXCEL FORMAT row with
  currency quick-insert.
- **Value formatter presets** — Integer, 2 decimals, 4 decimals, parens-neg,
  red-parens-neg, Green / Red (no sign) with $ / € / £ / ¥ / ₹ / CHF
  variants, Scientific, Basis points, 5 tick formats (TICK32, TICK32_PLUS,
  TICK64, TICK128, TICK256) for fixed-income bond prices.
- **Tick button denominator** — the toolbar tick button shows the
  denominator (`32` / `32+` / `64` / `128` / `256`), not the ticks
  numerator portion of the sample string. Previously applying TICK32
  flipped the button label from `32` → `16` which was the numerator.
- **Currency quick-insert row** — $, €, £, ¥, ₹, CHF buttons smart-
  replace the currency symbol in the current custom format while
  leaving the rest of the pattern intact.
- **SSF-safe symbol handling** — £ / ¥ / ₹ / CHF wrapped in quoted
  literals (`"£"` etc.) because SSF rejects bare non-dollar/euro
  currency glyphs. Fixed a round-trip bug where INR failed
  `isValidExcelFormat` on the second click.
- **SSF format auto-sanitizer** — `excelFormatter` runs every format
  through a try-and-quote loop before SSF.format: probes positive /
  negative / zero / text values to walk every section, and on
  `unrecognized character X` wraps each top-level occurrence of X in
  quotes (leaving `[Color]` tags and existing quoted literals
  untouched). Lets format strings authored with bare unicode glyphs
  (`▲ ▼ — ± °`) render correctly without hand-quoting — Excel itself
  is forgiving where SSF isn't, so unquoted glyphs survive copy-paste
  from Excel UI / docs / legacy profiles.
- **ISO date coercion** — Date objects + ISO-8601 strings (starts with
  `yyyy-mm-dd`) get parsed to Date before being handed to SSF so date
  formats like `dd-mm-yyyy` render, not raw ISO text.
- **Excel color resolver** — `[Red]` / `[Green]` tags in format
  strings produce a per-value `cellStyle` resolver that paints the
  cell colour. Now applies to virtual columns too.
- **Cell-datatype auto-detection** — on first data render, sample the
  first 20 rows of each column to infer `cellDataType` so the
  FormatterPicker filters its preset list by column type (number /
  date / string / boolean). Host-provided `cellDataType` wins.
- **Header alignment follows cell** — aligning cells via "Cell" target
  applies the same alignment to the column header by default; the user
  can override by explicitly selecting the "Header" target in the
  toolbar. Implementation: a fallback chain in `reinjectCSS`
  (`headerStyleOverrides → cellStyleOverrides`) + header-class
  attachment whenever either is set.

- **Inline column-caption rename** — when exactly one column is
  selected, the column-label chip in the formatter's context module
  becomes click-to-edit (Pencil hint on hover). Enter / blur commits
  the new caption through `applyHeaderNameReducer`, Escape cancels.
  Empty input clears the override so the host's original `headerName`
  takes back over. Multi-column selections fall back to the read-only
  pill — renaming N columns to one name doesn't make sense.
- **Cells-editable toggle** — small Pencil/Lock pill next to the
  column-label chip. Active = cells in the selected column(s) are
  editable, inactive = explicitly locked (writes `editable: false`,
  overriding any host default). Wired through
  `applyEditableReducer` → `colDef.editable` in
  `column-customization/transforms.ts`. Tooltip is the entire UI —
  no eyebrow label needed.
- **Clear-selected button (formatter toolbar + popout)** — second
  destructive action in the Clear module that resets only the
  currently-targeted column(s) instead of the whole profile. Wired
  to `clearAllStylesReducer(colIds)` so it drops cell + header
  styling, value formatter, borders, filter, and template references
  for the selected columns; saved templates and other columns are
  untouched. Confirms via a scoped AlertDialog that names the
  affected columns ("Clear styles for column \"price\"?" / "Clear
  styles for 3 columns?"). Disabled when no cell/column is selected.
  Renders icon-only (Eraser) in the horizontal in-grid toolbar and
  full label in the popped vertical panel footer, alongside the
  existing profile-wide "Clear all styles" button.
- **Section-eyebrow strip removal in the in-grid toolbar** — the
  `02 · TYPE`, `03 · PAINT`, `04 · FORMAT`, etc. eyebrow chips are
  hidden in horizontal mode (`.fx-shell--horizontal .fx-eyebrow {
  display: none }`). Tooltips on every action already self-document
  the toolbar; the eyebrows competed with the data grid for row
  real estate. The popped vertical panel keeps the eyebrows as
  section headers — the surface area is there.

### 1.12b Floating / draggable Formatting Toolbar

- **Floating panel** — the Formatting Toolbar is no longer pinned
  inline below the main toolbar. It renders inside a position-fixed
  `DraggableFloat` wrapper (`packages/markets-grid-v2/src/DraggableFloat.tsx`)
  at `z-index: 9999` so it floats above the grid but below its own
  Radix popovers (`z-[2147483647]`).
- **Drag handle** — a 22px-tall bar at the top of the panel with the
  `GripVertical` icon, "FORMATTING" label, and a close (X) button. A
  single `pointerdown` on the handle starts a drag tracked on the
  window via `pointermove`/`pointerup`; position is clamped to the
  viewport so the handle can never be stranded offscreen.
- **Close any time** — the X button in the handle dismisses the panel
  instantly. Re-open via the `STYLE` pill (see below) — the panel
  returns at its last-dragged position (local state).
- **Style pill on the FiltersToolbar** — the toggle button was moved
  from the primary `gc-toolbar-primary` bar (where it lived alongside
  Save/Settings) to the inline filter pill row (`FiltersToolbar`).
  Styled as a teal pill with a `Brush` icon and "STYLE" label,
  matching the filter pill vocabulary. Test id `style-toolbar-toggle`.
- **Width** — the panel clamps to `min(1180px, 100vw - 32px)` so the
  toolbar's horizontal-scroll chrome inside keeps working on narrow
  viewports.
- **Window-resize clamp** — on `window.resize` the panel re-clamps
  its (x, y) back into the new viewport so a shrunk browser window
  can't leave the handle unreachable.

### 1.13 Column Reorder + Horizontal Scroll Chrome

- `maintainColumnOrder: true` on the AgGridReact props preserves the
  user's drag-reordered column positions when `columnDefs` re-derive
  (happens on every module-state change). Without this, applying a
  toolbar format would reset the column order to the base `columnDefs`
  sequence.
- Toolbar slot horizontal overflow contained (`min-w-0 overflow-x-auto
  overflow-y-visible`) so applying a formatter doesn't push the page
  into horizontal scroll.
- AG-Grid `theme` adjustments: `iconSize: 10` on shared params (both
  light + dark). Vertical column borders re-enabled in the demo theme.

### 1.14 Header / floating-filter icon hover chrome

- Menu button + filter funnel + floating-filter button render with
  `opacity: 0` + `pointer-events: none` in the idle state instead of
  collapsing `width` to zero. Hover / `:focus-within` /
  `[aria-expanded='true']` restore `opacity: 1` + `pointer-events:
  auto`. No layout thrash — previously every cursor pass reflowed the
  column header by ~32px.

### 1.15 Profile UX

- **Explicit-save profile contract** — as of 2026-04-20, profiles no
  longer auto-persist live state. `ProfileManager` is constructed with
  `disableAutoSave: true`; module state mutations flip an internal
  `isDirty` flag instead of scheduling a write. The primary Save
  button (top-right of the grid's chrome) is the sole write path; it
  calls `captureGridStateInto()` to capture AG-Grid native state then
  `profiles.save()` which clears dirty on success. Rationale: "profile
  = saved document" is a clearer mental model than "profile = live
  mirror"; users lose no edits they didn't intend to persist.
- **Dirty indicator on Save button** — `<DirtyDot/>` (teal pulsed
  badge) appears at the top-right of the Save icon whenever the live
  store diverges from the last persisted snapshot. Clears on successful
  save; covered by `save-all-dirty` testid.
- **Unsaved-changes prompt on profile switch** — switching profiles
  while dirty opens a shadcn `AlertDialog` with three explicit
  actions: `Save & switch`, `Discard changes`, `Cancel`. The prompt
  emits under testid `profile-switch-confirm`; actions under
  `profile-switch-save`, `profile-switch-discard`,
  `profile-switch-cancel`. No edit is ever silently dropped.
- **`beforeunload` warning** — a native `beforeunload` handler is
  registered whenever `isDirty === true` (and only then, so clean
  sessions don't warn on close). Modern browsers show a generic
  "unsaved changes" dialog.
- **New profile starts blank** — `resetAll()` runs before snapshotting
  in `createProfile`; the grid-state module handles `saved: null` by
  calling `api.setState({})` to clear AG-Grid-native state that lives
  outside module transforms. Profile creation itself is an explicit
  write — no debounce needed.
- **Auto-save still available** — `useProfileManager({ disableAutoSave: false })`
  restores the legacy 300ms-debounced contract; tests use this path.
- **Delete safety** — cancels pending auto-save (if any) before
  erasing the record, uses `skipFlush: true` when falling back to
  Default.
- **Shadcn AlertDialog** — replaced native `window.confirm` for delete
  confirmation with a proper modal (`@radix-ui/react-alert-dialog`).
  Adds `AlertDialog` / `AlertDialogContent` / `AlertDialogHeader` /
  `AlertDialogFooter` / `AlertDialogTitle` / `AlertDialogDescription`
  / `AlertDialogAction` (primary / destructive variants) /
  `AlertDialogCancel` to the shadcn primitive set.
- **Export / Import profiles as JSON** — every profile in the selector
  popover has a per-row `Download` button on hover; a footer row offers
  `Export` (active profile) and `Import` (file picker). Payload shape:
  ```json
  {
    "schemaVersion": 1,
    "kind": "gc-profile",
    "exportedAt": "2026-04-18T…",
    "profile": { "name": "T2", "gridId": "demo-blotter-v2", "state": { <9 modules> } }
  }
  ```
  The state is the same module → versioned envelope shape the store
  produces via `core.serializeAll()`, so round-tripping through
  export → import goes through each module's regular deserialize /
  migrate path. Import is always additive (generates a unique id +
  name on collision), flushes auto-save before exporting, and
  activates the imported profile. Test IDs: `profile-export-{id}`
  per-row, `profile-export-active-btn`, `profile-import-btn`,
  `profile-import-file`. New hook API:
  `useProfileManager().exportProfile(id?)` →
  `Promise<ExportedProfilePayload>`, and `.importProfile(payload,
  options)` → `Promise<ProfileMeta>`.
- **Inline rename in the profile selector** — every non-Default row
  exposes a hover-revealed `Pencil` button (testid
  `profile-rename-{id}`) that swaps the row's name into an editable
  input seeded with the current value. Enter / blur commit, Escape /
  the trailing `X` cancel; empty or unchanged values cancel quietly
  rather than firing a no-op write. The reserved Default profile
  stays locked (the lock icon replaces all per-row actions). Wires
  through `useProfileManager().renameProfile(id, name)` →
  `ProfileManager.rename(...)`, which rejects the reserved id.
  ProfileSelector adds a new optional `onRename` callback prop;
  omitting it hides the affordance entirely.
- **Icon visibility bump in the profile popover** — every per-row
  action icon (rename, clone, export, delete, lock) was raised from
  the muted `--bn-t2` text tier to the standard secondary `--bn-t1`
  tier and the stroke weight from `1.75` → `2.25`. The same shift
  applies to the popover's labels and the disabled "Save" button
  text. Visibility — not opacity — was the actual problem (the
  buttons already animated to `opacity:1` on row hover); they read
  cleanly under both `[data-theme="dark"]` and
  `[data-theme="light"]` now.

### 1.16 SettingsSheet chrome cleanup

- Removed the `PROFILE=<gridId>` status pill from the header — duplicated
  what the main toolbar's profile selector already shows.
- DIRTY counter stays.

### 1.17 Demo app

- **Price column is editable** (`editable: true` + `agNumberCellEditor`
  with 4-digit precision) — drives the cell-edit → aggregate-refresh
  flow in the Calculated Columns module.
- **Grid API debug hook** (opt-in, not committed by default) for
  preview-based E2E / manual testing of column-state APIs.

### 1.18a Pop-out settings sheet (detached OS window)

- **`<PopoutPortal/>`** in `packages/core/src/ui/PopoutPortal.tsx` — a
  generic React component that opens an OS window via `window.open`
  (browser) or `fin.Window.create` (OpenFin, via the
  `openFinWindowOpener()` helper in `packages/core/src/utils/openFin.ts`),
  clones the main document's `<head>` stylesheets into the popout,
  and returns `createPortal(children, popoutBody)`. Because the
  children stay in the MAIN window's React tree, they share the same
  `GridProvider`, Zustand store, `ProfileManager`, and theme — no
  BroadcastChannel or URL-routed re-hydration needed.
- **Button** — `ExternalLink` icon in the settings-sheet header next
  to Help / Maximize / Close. Testid `v2-settings-popout-btn`. Hides
  while popped (the OS window owns its own chrome). Clicking once
  opens a 960×700 window named `gc-popout-<gridId>`; clicking again
  while an open popout exists refocuses the existing window (real
  browsers reuse named windows).
- **Theme sync** — a MutationObserver on the main document's
  `<html data-theme>` mirrors the value onto the popout so
  dark/light toggling in main instantly repaints the popout. Cloned
  stylesheets carry the `--bn-*`, `--ck-*`, `--primary` token
  system.
- **Lifecycle** — closing the popout (OS close button, Cmd-W,
  `beforeunload`) flips the sheet back to inline mode. Closing the
  main window closes the popout too (via `window.addEventListener
  ('beforeunload', () => popout.close())`). Popup-blocker rejection
  falls back to inline mode with a console warning.
- **CSS** — `.gc-popout.is-popped` strips the fixed-overlay
  centering chrome (position/transform/width/height/border/shadow)
  so the sheet fills its new OS window edge-to-edge.
- **Coverage** — 7 unit tests in `PopoutPortal.test.tsx` (rendering
  into the portal doc, stylesheet cloning, beforeunload → onClose,
  cleanup on unmount, popup-blocker fallback, OpenFin override) +
  5 e2e tests in `v2-popout-window.spec.ts` (button presence, window
  features, data-popped flip, backdrop suppression, main-window
  buttons hidden).

### 1.18 `@grid-customizer/design-system` package

New workspace at `packages/design-system` lifted from the FI Trading
Terminal design-system reference. Gives the monorepo a single, typed
home for brand tokens and framework adapters so the demo (and future
Angular / PrimeNG apps) can consume one canonical palette.

- **Primitive tokens** (`tokens/primitives.ts`) — charcoal, teal, red,
  orange, blue, purple scales plus typography / spacing / radius /
  opacity / transition scales.
- **Semantic tokens** (`tokens/semantic.ts`) — `dark` / `light` / `shared`
  maps covering surface, text, border, accent, state, overlay.
- **Component tokens** (`tokens/components.ts`) — button / input / table
  sizing lifted from the semantic layer.
- **Themes** — pre-generated CSS files exposing `--bn-*`, legacy
  `--fi-*` aliases, order-book fill tokens (`--ob-bid-fill`,
  `--ob-ask-fill`) and trade-ticket strip tokens (`--tt-bid-strip`,
  `--tt-ask-strip`). Imported into `apps/demo/src/main.tsx` BEFORE
  `globals.css` so the demo's teal-brand hex block in globals.css still
  takes precedence — only the design-system's additive tokens flow
  through. Migration to the design-system's full HSL-triplet shadcn
  palette is a follow-up pass.
- **Framework adapters** — `agGridDarkParams` / `agGridLightParams`
  (fixed to use v35-valid `headerTextColor`, no `rowBorderColor`),
  `generateShadcnCSS()` with hex→HSL conversion, and
  `generatePrimeNGPreset()` for future Angular consumers.
- **Framework-agnostic cell renderers** (`cell-renderers.ts`) —
  vanilla-TS implementations of SideCellRenderer, StatusBadgeRenderer,
  ColoredValueRenderer, OasValueRenderer, SignedValueRenderer,
  TickerCellRenderer, RatingBadgeRenderer, PnlValueRenderer,
  FilledAmountRenderer, BookNameRenderer, ChangeValueRenderer,
  YtdValueRenderer, RfqStatusRenderer. Available to any grid host
  without pulling React into the renderer path.
- **Typecheck wired** — the new package participates in the monorepo
  `npm run typecheck` flow and the full build (`npm run build`) stays
  green.

### 1.X Expression-formatter security policy (CSP gate)

Runtime switch governing the `kind: 'expression'` branch of
`ValueFormatterTemplate` — the legacy escape hatch compiled via
`new Function(...)` and therefore incompatible with a `script-src` CSP
that forbids `unsafe-eval`.

- **Three modes** — `'allow'` (default, preserves historical behaviour),
  `'warn'` (compiles but fires `onViolation` + emits a one-shot
  `console.warn` per unique expression), `'strict'` (adapter returns an
  identity formatter; profile import rejects payloads containing
  expression-kind templates).
- **Public API** — `configureExpressionPolicy({ mode, onViolation })`
  and `getExpressionPolicy()` exported from `@grid-customizer/core`.
  Set once at application boot, before any `<MarketsGrid>` mounts.
- **Two enforcement points** — (1) runtime compile in
  `valueFormatterFromTemplate` (the identity fallback keeps cells
  rendering a raw value); (2) synchronous scan in
  `ProfileManager.import` that walks the payload before any storage
  write. Strict-mode rejections throw with the offending expression in
  the message so UIs can surface actionable errors.
- **Opt-in sanitizer** — strict-mode imports accept a
  `{ sanitize: true }` flag that rewrites every matching template to a
  safe `{ kind: 'preset', preset: 'number' }` stand-in in place, then
  completes the import. Lets ops migrate legacy profiles without a
  round-trip through an editor.
- **Observer hook** — `onViolation({ kind, expression, reason })` fires
  in all modes so telemetry can watch for legacy-formatter usage even
  under `'allow'`. Observer errors are swallowed so the import / format
  pipeline can't be broken by a buggy listener.
- **Test coverage** — 18 unit tests for the policy module (mode
  merging, cyclic-object walking, one-shot warn dedup,
  sanitize-in-place counting) + 6 integration tests against
  `ProfileManager.import` (strict rejects, strict+sanitize rewrites,
  warn observes, allow no-ops).

---

## 1.N MarketsGrid v2 API — imperative handle, storage factory, admin actions

Consumer-facing API additions on `<MarketsGrid>`. All four props are
**optional** and **additive** — apps on the today's API (`storageAdapter`
only) keep working unchanged. Plan doc:
[`docs/plans/MARKETS_GRID_API.md`](./plans/MARKETS_GRID_API.md).

### What shipped

| Prop | Purpose | Default |
|---|---|---|
| `ref` + `MarketsGridHandle` | Imperative handle exposing `{ gridApi, platform, profiles }` via `forwardRef`. `profiles` is `UseProfileManagerResult` (hook-shaped wrapper — ergonomic delta from the plan's original `ProfileManager` class). | no handle exposed |
| `onReady?` | Same handle delivered via callback; fires exactly once per mount after AG-Grid ready + platform mount + active profile applied. | no-op |
| `instanceId?` | Stable per-instance identity from a framework (OpenFin customData). | falls back to `gridId` |
| `storage?: StorageAdapterFactory` | Factory `(instanceId) => StorageAdapter`. Typically closes over `(appId, userId)` at app bootstrap. Takes precedence over `storageAdapter`. | falls back to `storageAdapter`, then `MemoryAdapter` |
| `adminActions?: AdminAction[]` | Entries rendered in the settings-sheet Tools dropdown (Wrench icon in header). Hidden entirely when array is empty or all-hidden. | no Tools button |

### ConfigService-backed persistence

`@starui/config-service` ships `createConfigServiceStorage({ configManager, appId, userId })` — a `StorageAdapterFactory` that persists **one `AppConfigRow` per instance** with all profiles bundled in the payload:

| Field | Value |
|---|---|
| `componentType` | `"markets-grid-profile-set"` |
| `componentSubType` | `""` (unused) |
| `configId` | `<instanceId>` |
| `appId` / `userId` | baked into the factory closure |
| `payload` | `{ profiles: ProfileSnapshot[] }` — the whole bundle |

Each adapter method does load-modify-write against the single row. ProfileManager sees the standard per-profile `StorageAdapter` API; the bundling is internal.

Also exports `migrateProfilesToConfigService({ source, target, gridId, ... })` — consumer-triggered, one-shot migration from `DexieAdapter`/`MemoryAdapter` → ConfigService storage. `skip-if-exists` default, `overwrite` available.

### ConfigBrowser integration

`@starui/config-browser` ships `createConfigBrowserAction({ launch })` — returns an `AdminAction` with default id / label / icon / description. Consumer supplies just the launch callback (route, OpenFin window, overlay — whatever fits the app). Apps that don't use ConfigBrowser omit the dep; no forced coupling.

### Demo app

`apps/demo-configservice-react` (port 5191) — forked from `apps/demo-react`, same three views (single / dashboard / depth), but persistence routes through the ConfigService factory. Demonstrates:

- Per-user profile scoping (Alice / Bob switcher in header)
- Cross-grid profile isolation under one `(appId, userId)` scope
- Full-screen ConfigBrowser overlay launched via the Tools menu
- Showcase profile seeded per-user via the same factory MarketsGrid uses (so seed rows are inspectable in the Config Browser)

Run side-by-side with `apps/demo-react` on 5190 for A/B comparison (different IndexedDB databases, no clobbering).

### Layer cleanliness

- `@starui/core`'s `StorageAdapter` interface unchanged — 242 existing tests untouched.
- `@starui/config-service` declares `@starui/core` as an **optional** peerDependency (type-only).
- `@starui/config-browser` declares `@starui/markets-grid` as an **optional** peerDependency (for the `AdminAction` type the helper returns).
- `<MarketsGrid>` does NOT import anything from `@starui/config-browser` or `@starui/config-service` — the admin-actions slot is the integration seam. Composition, not coupling.

### Angular mirror

Deferred to ANGULAR_PORT Phase 4 (`docs/plans/ANGULAR_PORT.md`) — the plan's Angular selectors (`mkt-markets-grid` with `[adminActions]` and `(ready)`) ship together with `@starui/markets-grid-angular`. React API is the frozen reference shape.

### Tests + verification

298 unit tests unchanged (242 core + 56 markets-grid). `npx turbo typecheck build test` → 55/55 green across 3 new files (`registry-host-env.ts`, `profile-storage.ts`, `helpers.ts`) + 2 modified components (`MarketsGrid.tsx`, `SettingsSheet.tsx`) + 1 new demo app (25 files).

---

## 1.O `@starui/data-plane` — Week 1 + 1.5 (protocol + dual cache + dual provider bases)

Per [`docs/plans/DATA_PLANE.md`](./plans/DATA_PLANE.md). Week 1 delivered protocol + cache + provider bases for keyed-resource mode; Week 1.5 adds the row-stream primitives that match stern-1's production architecture (`/Users/develop/Documents/projects/stern-1/client/src/workers/engine/`).

### Why two cache models + two provider bases

Reviewing the existing stern-1 STOMP implementation and the companion `/Users/develop/Documents/projects/stomp-server` surfaced a fundamental distinction the original plan conflated:

| Mode | Cache | Provider | Used by |
|---|---|---|---|
| **Keyed-resource** (Week 1) | `ProviderCache` — per-key LRU + TTL, `singleFlight` dedup | `ProviderBase` with `fetch(key)` / `subscribe(key, emit)` | AppData (kv store), future REST-per-endpoint, per-ticker price |
| **Row-stream** (Week 1.5) | `RowCache` — upsert keyed by `keyColumn`, no TTL, no LRU cap | `StreamProviderBase` with snapshot → snapshot-complete → realtime phases + late-joiner detection | STOMP / WebSocket / SocketIO blotters |

Both coexist in the same package and use the same wire protocol — the client picks opcodes by provider type.

### Package

- `packages/data-plane/` — workspace `@starui/data-plane@0.1.0`
- Depends only on `@starui/shared-types`.
- Subpath exports: `@starui/data-plane` (full barrel), `@starui/data-plane/protocol`, `@starui/data-plane/providers`.

### What landed

| File | What it is |
|---|---|
| `src/protocol.ts` | `DataPlaneRequest` / `DataPlaneResponse` discriminated unions. Opcodes for both modes: keyed-resource (`get` / `put` / `subscribe` + `update`) AND row-stream (`subscribe-stream` / `get-cached-rows` + `snapshot-batch` / `snapshot-complete` / `row-update`). `ErrorCode`, `isRequest` / `isResponse` type guards. JSON-safe + structured-clone-safe. |
| `src/protocol.test.ts` | 46 tests — round-trip coverage for every message shape under both JSON and native structured clone. |
| `src/worker/cache.ts` | Keyed-resource cache: `ProviderCache` (per-key LRU + TTL), `CacheState`, `isExpired`, `singleFlight` thundering-herd dedup. |
| `src/worker/cache.test.ts` | 20 tests — LRU eviction, TTL boundaries, concurrent `singleFlight` dedup, cross-provider isolation. |
| `src/worker/rowCache.ts` | Row-stream cache: `RowCache<TRow>` — upsert-by-`keyColumn`. Direct port of stern-1's `CacheManager`. Returns `{ accepted, skipped }` so the router can surface diagnostics when `keyColumn` is misconfigured (rows arriving but cache empty). |
| `src/worker/rowCache.test.ts` | 10 tests — upsert identity, row-copy-on-insert, skip-when-key-missing, remove, clear. |
| `src/providers/ProviderBase.ts` | Keyed-resource abstract base with `configure` / `fetch` / `subscribe?` / `teardown` + `track` / `untrack` refcount helpers. |
| `src/providers/MockProvider.ts` | Keyed-resource synthetic provider for demos + tests. |
| `src/providers/AppDataProvider.ts` | Keyed-resource reactive k/v — backbone for template bindings (`{{app1.token1}}`). |
| `src/providers/AppDataProvider.test.ts` | 12 tests — reactivity, unsubscribe-during-fanout safety, teardown. |
| `src/providers/StreamProviderBase.ts` | Row-stream abstract base. Manages `RowCache`, phase state (snapshot / realtime), listener fan-out, `registerSubscriber` / `shouldReceiveCached` late-joiner tracking, error + connect/disconnect statistics. Direct port of stern-1's `StompEngine` patterns, generalized so `StompStreamProvider`, `WebSocketStreamProvider`, `SocketIOStreamProvider` can all subclass it. |
| `src/providers/StreamProviderBase.test.ts` | 13 tests — snapshot phase transitions, snapshot-complete idempotency, upsert-on-realtime-update, late-joiner logic (early vs late port detection), listener safety (throwing + self-removing during fan-out), error + lifecycle reporting, reset for reconnects. |
| `src/index.ts` | Public barrel exporting both modes. |

### Design decisions worth calling out

- **Correction from earlier Week-1 doc:** my original take called `StompDatasourceProvider` "snapshot-only + not streaming." That's true of `packages/widgets-react/src/provider-editor/stomp/StompDatasourceProvider.ts` (which is a field-inference tool — fetches one snapshot, disconnects). The REAL streaming provider lives in stern-1 (`client/src/workers/engine/StompEngine.ts` + `CacheManager.ts` + `BroadcastManager.ts`). It's full snapshot + realtime with late-joiner support. The row-stream primitives added in Week 1.5 are the porting target for that architecture.
- **Phase machine is authoritative.** `StreamProviderBase.markSnapshotComplete()` is idempotent; any late `ingestSnapshotBatch()` after completion transparently routes to the update path. This matches stern-1's defensive behaviour and avoids clients seeing mode regressions.
- **`keyColumn` is REQUIRED for row-stream providers.** Unlike the keyed-resource mode where the caller chooses the key, row-stream rows carry their own identity in a configured field (`positionId`, `tradeId`, etc.). `RowCache` drops rows missing that field and exposes the count via `UpsertResult.skipped` so the protocol's `snapshot-batch.diagnostics.skipped` can surface the misconfiguration at grid bootstrap.
- **Late-joiner semantics ported 1:1 from stern-1.** A port subscribing during the snapshot phase is marked in `liveSnapshotPorts`. After `snapshot-complete`, `shouldReceiveCached(portId)` returns `false` for those ports — they already received the live data, sending cached rows would duplicate. Ports that subscribed after complete are not in the set, so they get the cached replay.
- **Listener iteration is crash + mutation safe.** `StreamProviderBase.dispatch` snapshots the listener set and catches per-listener exceptions so one bad consumer doesn't kill the provider or break iteration for other listeners. Tested with a listener that removes itself mid-dispatch and one that throws.
- **Existing `DataProviderEditor` UI stays put.** It persists through `dataProviderConfigService` → the shared-types `ProviderConfig` union. The data-plane consumes the same union verbatim at `configure()` time.
- **Existing `IBlotterDataProvider` contract kept.** It lives in `@starui/widgets-react/interfaces.ts` and drives `useBlotterDataConnection`. Legacy per-widget adapter; `StreamProviderBase` is the new multiplexed contract. Both coexist during migration.

### Tests + verification

- 97 tests in `@starui/data-plane`:
  - 46 protocol round-trip (keyed + row-stream opcodes)
  - 20 keyed-resource cache (LRU / TTL / dedup / isolation)
  - 10 row cache (upsert / skip / remove / clear)
  - 12 AppData reactivity
  - 13 StreamProviderBase (phases / late-joiner / listener safety / lifecycle)
- `npx turbo typecheck build test` → 58/58 tasks green across the monorepo.

---

## 1.O.W2 — Week 2 (Router + BroadcastManager + DataPlaneClient + transport ladder)

Week 2 bolts the dispatch + transport surface onto the Week-1/1.5 primitives. Nothing about the primitives changed; the new code is purely additive and tested end-to-end through `connectInPage` so every assertion exercises the real wire format.

### What landed in Week 2

| File | What it is |
|---|---|
| `src/worker/broadcastManager.ts` + 11 tests | Per-provider port registry with targeted + fan-out delivery, dead-port purge on `postMessage` throws, `removePortFromAll` for port-closed cleanup. Direct port of stern-1's `BroadcastManager` generalised to the data-plane's response union. |
| `src/worker/providerFactory.ts` | `ProviderFactory` type + `defaultProviderFactory`. Returns a discriminated `{ shape: 'keyed' \| 'stream', provider }` so the router can branch safely. Wrap to add STOMP / WebSocket / SocketIO without touching router code. |
| `src/worker/router.ts` + 14 tests | The dispatcher. Handles every opcode: `configure / get / put / subscribe / unsubscribe / invalidate / teardown / ping` (keyed-resource) AND `subscribe-stream / get-cached-rows` (row-stream). Owns: in-flight `ProviderCache` per keyed provider, single-flight dedup on `get`, monotonic per-provider `streamSeq` for row updates, port-id generation (`WeakMap<MessagePort, string>`), auto-teardown on idle — but ONLY for stream providers (keyed providers persist in-memory state and must not lose it when the last subscriber leaves). |
| `src/worker/entry.ts` | `installWorker({ router })` — wires `self.onconnect` (SharedWorker) AND `self.onmessage` (dedicated Worker bootstrap) into the router. Periodic dead-port sweep at configurable interval (default 30s / 60s timeout, matching stern-1). |
| `src/worker/index.ts` | Subpath barrel `@starui/data-plane/worker` for worker assets. |
| `src/client/DataPlaneClient.ts` + 9 tests | Main-thread SDK. Typed async APIs for every one-shot op (`configure/get/put/invalidate/teardown/ping`) plus `subscribe(k, onUpdate)` / `subscribeStream(listener)` / `getCachedRows()`. `close()` rejects every pending request with `TRANSPORT_CLOSED`. Typed `DataPlaneClientError` (extends `Error`) for every failure so callers can `catch` and branch on `.code` / `.retryable`. |
| `src/client/fallbacks.ts` | `hasSharedWorker` / `hasDedicatedWorker` probes + `TransportMode` type. |
| `src/client/connect.ts` | Three entry points: `connectSharedWorker(url)` (production), `connectDedicatedWorker(url)` (fallback for environments without SharedWorker — Safari old / OpenFin view contexts), `connectInPage(router)` (last resort + test path). Auto-degrading `connect({ url, router? })` picks the best available. |
| `src/client/index.ts` | Subpath barrel `@starui/data-plane/client` for main-thread code. |
| `package.json` exports | Added `./client` + `./worker` subpath exports so consumers can tree-shake. |

### Design decisions worth calling out

- **Two transport modes share one code path.** Everything the router does is `handleRequest(port, req)` — totally oblivious to whether the port came from `SharedWorker.port`, a dedicated `Worker` bootstrap message, or a local `MessageChannel`. This is why the `connectInPage` test path produces the same assertions the SharedWorker would: no simulation of wire-format, just a real Channel.
- **Keyed providers do NOT auto-teardown on idle.** AppData is pure memory. Tearing down a keyed provider when its last subscriber leaves would silently wipe state. Stream providers DO auto-teardown — they hold network connections we should release. The distinction is enforced in `maybeTeardownProvider` by checking `slot.instance.shape`.
- **In-flight dedup for `get`.** Three concurrent `client.get(p, k)` calls for the same `(providerId, key)` invoke `provider.fetch` exactly once and all three resolve with the same value. The router uses the `ProviderCache.singleFlight` helper from Week 1.
- **Row-stream late-joiner semantics preserved end-to-end.** When a port subscribes during the snapshot phase, `StreamProviderBase.registerSubscriber` marks it in `liveSnapshotPorts`. Post-complete, a `get-cached-rows` from that port replies with an empty batch + immediate complete (no double-delivery). Late joiners get the full cached set with `diagnostics.keyColumn` / `cacheSize` attached so the grid can surface key-column mismatches at bootstrap.
- **Client-side error routing is explicit.** `onSubscribeError` is optional per subscription; protocol `err` frames with a reqId correlate back to the pending promise, everything else fans out to registered listeners.
- **Dead-port detection is best-effort.** The `entry.ts` heartbeat sweep is the only reliable signal in a SharedWorker (ports don't fire a `close` event). Clients don't need to send explicit heartbeats — every request counts as liveness. 60s timeout (stern-1's value) is the default; consumers can tune via `installWorker({ deadPortTimeoutMs })`.

### Public API surface

```ts
// Main-thread consumer:
import { connect, connectInPage, DataPlaneClient } from '@starui/data-plane/client';
import type { AppDataProviderConfig } from '@starui/shared-types';

const { client, close } = connect({
  url: new URL('./myDataWorker.ts', import.meta.url),
  name: 'my-app-data-plane',
});

await client.configure('app', { providerType: 'appdata', variables: {} });
await client.put('app', 'token', 'abc');
const token = await client.get<string>('app', 'token');

const unsub = await client.subscribeStream<Position>('bond-blotter', {
  onSnapshotBatch: (b) => grid.applyTransaction({ add: [...b.rows] }),
  onSnapshotComplete: () => grid.hideLoadingOverlay(),
  onRowUpdate: (u) => grid.applyTransaction({ update: [...u.rows] }),
  onError: (err) => console.error(err),
});
```

```ts
// Worker side (Vite asset):
import { installWorker, Router } from '@starui/data-plane/worker';

const router = new Router({
  providerFactory: async (id, cfg) => {
    if (cfg.providerType === 'stomp') {
      const { StompStreamProvider } = await import('./providers/StompStreamProvider');
      const p = new StompStreamProvider(id);
      await p.configure(cfg);
      return { shape: 'stream', provider: p };
    }
    const { defaultProviderFactory } = await import('@starui/data-plane/worker');
    return defaultProviderFactory(id, cfg);
  },
});
installWorker({ router });
```

### Tests + verification

- 129 tests in `@starui/data-plane` (up from 97):
  - 46 protocol round-trip (unchanged)
  - 20 keyed-resource cache (unchanged)
  - 10 row cache (unchanged)
  - 12 AppData reactivity (unchanged)
  - 13 StreamProviderBase (unchanged)
  - **11 BroadcastManager (new)** — add/remove/count, fan-out, dead-port purge, targeted delivery
  - **14 Router (new)** — every opcode, keyed-resource dedup via singleFlight, row-stream snapshot/complete/update sequence, late-joiner via `get-cached-rows`, port-close cleanup distinguishing keyed from stream, ping/pong, BroadcastManager injection
  - **9 DataPlaneClient (new)** — end-to-end round-trip via `connectInPage`, keyed put/get/subscribe/unsubscribe, row-stream snapshot ordering, late-joiner replay, early-joiner empty replay, typed errors on unconfigured provider, `close()` rejecting pending with `TRANSPORT_CLOSED`
- `npx turbo typecheck build` on the package: clean
- Full monorepo sweep `npx turbo typecheck build test`: **58/58 tasks green** (fully cached after first run)

---

## 1.O.W3 — Week 3 (StompStreamProvider — real production STOMP)

Port of stern-1's `StompEngine` onto the Week-1.5 `StreamProviderBase`. Speaks the same wire format as `/Users/develop/Documents/projects/stomp-server/` (the reference broker): subscribe to a listener topic, optionally publish a trigger, consume snapshot batches until a `"Success"`-containing body arrives, then handle every subsequent message as a realtime update.

### What landed

| File | What it is |
|---|---|
| `src/providers/StompStreamProvider.ts` | Full subclass of `StreamProviderBase<StompProviderConfig, StompRow>`. `configure()` validates `keyColumn`/`websocketUrl`/`listenerTopic` and rebuilds the internal `RowCache` keyed by the configured column. `start()` constructs a `@stomp/stompjs` client via an injectable factory, resolves `{clientId}` template vars in both `listenerTopic` + `requestMessage`, publishes the optional trigger on `onConnect`. Message handling: trim body → if `body.toLowerCase().includes(snapshotEndToken.toLowerCase())` → `markSnapshotComplete()`; otherwise JSON-parse and route to snapshot/update ingest based on current phase. Supports four payload shapes: top-level array, `{rows: [...]}`, `{data: [...]}`, single-object. Rejects non-JSON frames silently (reference broker occasionally sends control frames). Missing-keyColumn rows counted in `UpsertResult.skipped`. |
| `src/providers/StompStreamProvider.test.ts` (18 tests) | Full protocol coverage without a live broker — a `FakeClient` implements `StompClientLike` so tests drive the protocol directly. Covers: configure validation (keyColumn / websocketUrl / listenerTopic), start-before-configure throws, onConnect → activate + subscribe + trigger publish, STOMP error propagation, WebSocket error propagation, stop tears down subscription + client + cache, all four payload shapes parse correctly, non-JSON bodies are dropped silently, snapshot-end detection is case-insensitive (`"success"` / `"SUCCESS"` / `"Success"` all match), updates post-complete route through realtime path and upsert the cache, listener ordering (snap → snap → complete → update), `{clientId}` template substitution in topic + trigger destination, stable clientId across stop/start cycles. |
| `src/worker/providerFactory.ts` | Updated: `defaultProviderFactory` now constructs `StompStreamProvider` for `providerType: 'stomp'`. Added `composeFactory(base, ...overrides)` helper for consumers wiring custom providers. Added `buildStompFactory(createClient)` for injecting the STOMP transport (auth middleware / telemetry). |

### Design decisions

- **Transport injection, not a hard dep.** `@stomp/stompjs` is a peerDependency marked `optional` in the package.json, and the module is `require`-imported lazily inside `defaultCreateClient` only when a real STOMP provider is constructed. Consumers who don't use STOMP pay nothing; consumers who do provide `{ createClient }` can substitute auth middleware without patching our module.
- **`StompClientLike` structural interface.** The provider doesn't depend on `@stomp/stompjs`'s concrete types at compile time — just a structural shape. That keeps tests totally offline (no live broker) and makes the provider portable to stomp-over-sockjs or stomp-over-webtransport adapters if those ever land.
- **`{clientId}` stability.** Generated at provider construction and cached in `this.clientId`. A stop/start cycle reuses the same id. This matches the broker's expectation that client identity is stable across reconnects (the broker uses it to index per-client stream state).
- **Late-joiner semantics inherited for free.** Because `StompStreamProvider` just extends `StreamProviderBase`, the live-snapshot / late-joiner dedup logic from Week 1.5 applies verbatim — no STOMP-specific code had to be written for it.

---

## 1.O.W4 — Week 4 (React bindings — new `@starui/data-plane-react` package)

New workspace. Framework isolation per the plan: `@starui/data-plane` stays framework-agnostic; every React import lives in the companion package.

### Package

- `packages/data-plane-react/` — `@starui/data-plane-react@0.1.0`
- peerDep: React `>=19.0.0`
- Depends on `@starui/data-plane` + `@starui/shared-types`

### What landed

| File | What it is |
|---|---|
| `src/context.tsx` | `<DataPlaneProvider>` + `useDataPlaneClient()`. Provider accepts either a pre-built `DataPlaneClient` (caller owns lifetime) or full `connect()` args (provider owns lifetime, tears down on unmount). Hook throws if called outside the provider. |
| `src/useDataPlaneValue.ts` | `useDataPlaneValue<T>(providerId, key)` — subscribes + fetches initial value. Returns `{ value, isLoading, error }`. Mount: subscribe first (don't miss an update during get), then fetch initial. Unmount / providerId-or-key change: unsubscribe + cancel pending. `fetchInitial: false` option for write-only keys. |
| `src/useDataPlaneAppData.ts` | `useDataPlaneAppData<T>(providerId, key)` — returns `{ value, setValue, isLoading, error }`. `setValue` is a stable `client.put` wrapper. The backbone of `{{app.token}}`-style bindings: one component writes, all subscribed components re-render. |
| `src/useDataPlaneRowStream.ts` | `useDataPlaneRowStream<TRow>(providerId, opts)` — two modes. Default: buffered. Hook maintains an internal Map keyed by the provider's `keyColumn`; `rows` reflects the current cached state after every snapshot batch / update. `opts.onEvent` mode: no buffering — every `snapshot-batch` / `snapshot-complete` / `row-update` is forwarded verbatim to the callback, and `rows` stays empty. The onEvent escape hatch is the primary integration point for AG-Grid's `applyTransaction` on large blotters (bypasses React re-renders). |
| `src/hooks.test.tsx` (5 tests) | RTL + `connectInPage` end-to-end round-trips. Covers: `useDataPlaneAppData` read + subscribe + setValue; `useDataPlaneValue` external-put triggers re-render; `useDataPlaneRowStream` buffered mode accumulates snapshot → flips on complete → upserts on update; `useDataPlaneRowStream` onEvent mode forwards events and keeps `rows` empty; `DataPlaneProvider` throws when hooks run outside. |
| `src/index.ts` | Public barrel. |

### Why buffered + onEvent

Row-stream providers can deliver 10k+ rows per snapshot. Pushing that into `useState([...prev, ...batch])` is O(n²) and re-renders the tree on every batch. The `onEvent` mode lets grid consumers pipe straight into an imperative sink (AG-Grid `applyTransaction`, Recharts dataset ref, etc.) without React re-renders. The buffered mode covers small-scale cases (app-state-ish streams, demo blotters) where the ergonomics win.

### Tests + verification

- **18 tests** on STOMP provider (offline, via FakeClient)
- **5 tests** on React hooks (jsdom + RTL + `connectInPage`)
- **165 tests** total across `@starui/data-plane` (up from 129)
- `npx turbo typecheck build test` on both new packages: clean
- Full monorepo sweep `npx turbo typecheck build test`: **61/61 tasks green** (up from 58 — new workspace adds typecheck/build/test)

### Consumer usage example

```tsx
// Near the app root:
import { DataPlaneProvider } from '@starui/data-plane-react';

function App() {
  return (
    <DataPlaneProvider connect={{ url: new URL('./dataWorker.ts', import.meta.url), name: 'my-app' }}>
      <Dashboard />
    </DataPlaneProvider>
  );
}

// AppData usage — a text input backed by a template-binding variable:
function TokenInput() {
  const { value, setValue } = useDataPlaneAppData<string>('app', 'token');
  return <input value={value ?? ''} onChange={(e) => void setValue(e.target.value)} />;
}

// Row-stream usage — a blotter fed by STOMP:
function PositionsBlotter() {
  const gridApiRef = useRef<GridApi>();
  useDataPlaneRowStream('bond-blotter', {
    onEvent: {
      onSnapshotBatch: (b) => gridApiRef.current?.applyTransaction({ add: [...b.rows] }),
      onSnapshotComplete: () => gridApiRef.current?.hideOverlay(),
      onRowUpdate: (u) => gridApiRef.current?.applyTransaction({ update: [...u.rows] }),
    },
  });
  return <AgGridReact onGridReady={(p) => { gridApiRef.current = p.api; }} getRowId={getRowId} />;
}
```

### What's NOT here yet

- `providers/RestStreamProvider.ts` / `WebSocketStreamProvider.ts` / `SocketIOStreamProvider.ts` — the STOMP pattern is trivially transposable to each, but each has quirks (REST polling backoff; WebSocket binary vs JSON; SocketIO event names). Defer until a consumer actually needs one.
- `worker/iab-bridge.ts` — cross-app routing (stern-1's AppData + OpenFin IAB pattern). Deferred to the `SHELL_AND_REGISTRY.md` plan rather than pinned to this package.
- Angular signal bindings (`@starui/data-plane-angular`) — analogous shape to the React package.
- `apps/demo-react` integration with a running STOMP server — requires `/Users/develop/Documents/projects/stomp-server` booted, so scoping as a local dev/e2e cycle rather than a CI artifact.
- E2E: 4-widgets-one-STOMP-topic assertion that only one outbound WebSocket connects.

---

## 1.O.X — Bracket-token resolver (`[xyz]` → per-attach unique IDs)

Companion to the `{{name.key}}` AppData resolver. Where `{{name.key}}` pulls deterministic values out of AppData, `[identifier]` MINTS a fresh per-attach short ID and reuses it for every occurrence of the same token name across the same provider config — so `[clientTag]` in `listenerTopic` and `[clientTag]` in `requestBody` line up to the same value, while a different token like `[corr]` gets a different value. The two systems coexist (different syntaxes, different timing) and work on the same provider configs.

### Why it exists

STOMP (and likely future REST) configs frequently need a session-unique correlation/client tag that appears in two or more string fields and must match. Today users would either (a) hand-edit both fields with the same magic string, or (b) publish a value to AppData first and use `{{appData.tag}}` in both places. Bracket tokens collapse both workarounds into one ergonomic syntax: `[clientTag]` anywhere → same generated ID everywhere within one provider attach.

### Token grammar

Regex: `/\[([A-Za-z_][A-Za-z0-9_-]*)\]/g`. Must start with a letter or underscore; body may contain letters, digits, underscores, hyphens. Anything that doesn't match (e.g. `[]`, `[1abc]`, `[a b]`, `[a.b]`, JSON `[1,2,3]`) is left in place verbatim — same fail-safe debug affordance as the brace resolver.

### Files

| File | What it is |
|---|---|
| `packages/data-plane/src/v2/template/bracket-resolver.ts` | New module. Exports `BracketCache = Map<string, string>`, `resolveBracketString(input, cache)`, and `resolveBracketCfg<T>(cfg, cache): T` that deep-walks objects/arrays mirroring the existing `resolveCfg` shape. The cache parameter is REQUIRED (no defaulting) so lifetime is explicit at the call site. |
| `packages/data-plane/src/v2/template/bracket-resolver.test.ts` | 10 unit tests: same-token-same-value, different-token-different-value, fresh-cache-fresh-values, grammar-rejection, JSON-array non-collision, identifier-body characters, deep walk through nested arrays/objects, non-string leaves preserved, cross-call cache sharing. |
| `packages/data-plane/src/v2/providers/registry.ts` | `startProvider` now mints a fresh `BracketCache` and runs `resolveBracketCfg(cfg, cache)` immediately before dispatching to the provider-specific factory. One insertion gives every provider type the feature (mock / stomp / rest today). |

### Unique-value generator

12-char alphanumeric IDs from `crypto.getRandomValues` over a 62-char alphabet (`0-9A-Za-z`) → ~71 bits of entropy. No external dep. Works in the SharedWorker, browser main thread, and Node 18+ (where `crypto` is global).

### Cache lifetime

Per `startProvider` call. Same `[name]` resolves identically across all string fields of one config; auto-reconnects within the same attach reuse the cache because the resolved cfg is captured in the factory closure; on stop + re-attach a fresh `BracketCache` mints fresh values. The cache is not persisted, not shared across providers, and not shared across user-registered factories' independent calls.

### Coexistence with `{{name.key}}`

The brace resolver runs upstream in the React hook `useResolvedCfg` (in `data-plane-react`) before the cfg crosses into the worker. By the time `startProvider` runs, only bracket tokens remain. Mixing `{{appData.userId}}` and `[sessionTag]` in the same field works correctly: the brace resolver fills `{{...}}` first, then the bracket resolver fills `[...]`.

### Tests + verification

- **10 new tests** on bracket-resolver (Vitest)
- **18 tests total** across `packages/data-plane/src/v2/template/` (8 brace + 10 bracket)
- **78 tests total** across `@starui/data-plane`: green
- `npm run typecheck --workspace=@starui/data-plane`: clean
- `npm run build --workspace=@starui/data-plane`: clean
- `npx turbo build --filter='...@starui/data-plane'`: 24/24 dependents build clean

### Consumer usage example

In a STOMP provider editor:

```
listenerTopic:  /topic/events/[clientTag]
requestMessage: /app/subscribe/[clientTag]
requestBody:    {"client":"[clientTag]","corr":"[corr]"}
```

At attach time, all three `[clientTag]` occurrences become the same 12-char ID (e.g. `aB3kLm9PqRsT`); `[corr]` becomes a different 12-char ID. On disconnect + re-attach, fresh values are minted.

### UX Polish — Help text

Editor-side help text has been added under all STOMP form fields that support the syntax:
- **WebSocket URL** — explains both `{{appData.key}}` and `[name]` syntax
- **Listener Topic** — explains session-unique ID behavior and cross-field sharing
- **Trigger Destination** — explains `[name]` token support
- **Trigger Body** — explains `[name]` tokens for correlation IDs and session-unique values

Help text is consistent across both React (`packages/widgets-react/src/v2/provider-editor/transports/StompFields.tsx`) and Angular (`packages/angular/src/components/data-provider-editor/stomp-form.component.ts`) implementations.

### What's NOT here yet

- Reserved well-known tokens (`[uuid]`, `[timestamp]`, etc.) — out of scope; every token is "stable random" within an attach.
- UI preview of resolved values inside the editor before save — out of scope; resolution is runtime-only.

---

## 1.P DockEditor + Component Registry — ConfigService alignment

DockEditor and Component Registry now save through the same canonical path as MarketsGrid profiles: generic `ConfigManager.saveConfig(AppConfigRow)` with kebab-case `componentType`, a scope-aware `configId`, and an optional `(appId, userId)` scope parameter.

### The change

Before the refactor, both editors wrote to unscoped global rows with inconsistent conventions: `ConfigManager` carried domain-specific shim methods (`saveDockConfig`, `loadDockConfig`, `clearDockConfig`) that hardcoded `configId: "dock-config"`, `appId: ""`, `userId: "system"`, `componentType: "DOCK"` (uppercase). Registry was analogous with `componentType: "REGISTRY"` and `componentSubType: "EDITOR"`. Neither followed the `markets-grid-profile-set` pattern established by `createConfigServiceStorage`.

### What shipped

| File | Change |
|---|---|
| `packages/shared-types/src/configuration.ts` | Added `COMPONENT_TYPES.DOCK_CONFIG = 'dock-config'`, `COMPONENT_TYPES.COMPONENT_REGISTRY = 'component-registry'`, `COMPONENT_TYPES.MARKETS_GRID_PROFILE_SET = 'markets-grid-profile-set'` as the canonical discriminators. |
| `packages/config-service/src/config-manager.ts` | Removed `saveDockConfig()`, `loadDockConfig()`, `clearDockConfig()` shims + the `DOCK_CONFIG_ID` constant. ConfigManager is now purely generic `(configId → AppConfigRow)`; domain knowledge lives in consumer packages. |
| `packages/openfin-platform/src/db.ts` | Rewritten. Exports `saveDockConfig(config, scope?)`, `loadDockConfig(scope?)`, `clearDockConfig(scope?)`, and the matching Registry trio. All build `AppConfigRow` directly and call generic `saveConfig`. Preserves `creationTime` on overwrite. New `ConfigScope` type. `scopedConfigId(base, scope)` composes a `${base}::${appId}::${userId}` primary key when scope differs from the default — legacy default-scope writes keep the bare `configId` for back-compat. Load paths tolerate legacy `componentType: "DOCK"` / `"REGISTRY"` rows so existing Dexie data survives the upgrade. |
| `packages/openfin-platform/src/workspace.ts` | `exportAllConfig()` now reads dock + registry rows via generic `cm.getConfig('dock-config')` / `cm.getConfig('component-registry')` instead of the deleted shims. |
| `packages/openfin-platform/src/index.ts` + `config-only.ts` | Export the new `ConfigScope` type. |
| `packages/dock-editor-react/src/hooks/useDockEditor.ts` | New `UseDockEditorOptions { scope? }` parameter. Hook threads `scope` through load/save/clear. Default behaviour unchanged (no scope → global singleton). |
| `packages/dock-editor-angular/src/dock-editor/dock-editor.service.ts` | Added `setScope(scope)` + private `scope` field; service threads it through load/save/clear. Same back-compat default. |
| `packages/registry-editor-react/src/hooks/useRegistryEditor.ts` | New `UseRegistryEditorOptions { scope? }` parameter; same threading pattern. |
| `packages/registry-editor-angular/src/registry-editor/registry-editor.service.ts` | Same `setScope()` pattern as dock editor. |

### Canonical `AppConfigRow` shape each editor now writes

```ts
// DockEditor:
{
  configId: 'dock-config' | `dock-config::${appId}::${userId}`,
  appId: 'system' | <hostApp>,
  userId: 'system' | <signedInUser>,
  displayText: 'Dock Configuration',
  componentType: 'dock-config',          // kebab-case, matches MarketsGrid style
  componentSubType: '',
  isTemplate: false,
  payload: DockEditorConfig,             // unchanged interior shape
  createdBy, updatedBy, creationTime, updatedTime,
}

// Component Registry:
{
  configId: 'component-registry' | `component-registry::${appId}::${userId}`,
  appId: 'system' | <hostApp>,
  userId: 'system' | <signedInUser>,
  displayText: 'Component Registry',
  componentType: 'component-registry',
  componentSubType: '',
  isTemplate: false,
  payload: RegistryEditorConfig,
  createdBy, updatedBy, creationTime, updatedTime,
}
```

### Back-compat story

- Existing rows with `componentType: "DOCK"` / `"REGISTRY"` at `configId: "dock-config"` / `"component-registry"` still load (the fallback branch in the new `loadDockConfig` / `loadRegistryConfig`).
- On the next save with default scope, they're overwritten with the canonical `dock-config` / `component-registry` componentType.
- The `exportAllConfig()` path in `workspace.ts` continues to see them either way.
- Non-default scope creates new `${base}::${appId}::${userId}` rows; legacy default-scope rows remain untouched until re-saved under the default scope.

### Per-user / per-app scoping

Host apps that want per-user registries or dock layouts opt in by passing scope:

```tsx
// React
const { save, ...rest } = useDockEditor({ scope: { appId, userId } });
const { save: saveReg, ...registryRest } = useRegistryEditor({ scope: { appId, userId } });

// Angular (DockEditorService / RegistryEditorService)
dockService.setScope({ appId, userId });
await dockService.init(); // (for RegistryEditorService — Dock service loads in constructor)
```

Without a scope argument, both services keep the historical global-singleton behaviour so existing call-sites are unaffected.

### Architecture win

`ConfigManager` is now a purely generic (configId → AppConfigRow) store — no domain-specific shims. Every editor that wants to persist config follows the same pattern as `createConfigServiceStorage`:

1. Build an `AppConfigRow` with your canonical componentType (kebab-case, exported from `shared-types`).
2. Compose a scope-aware `configId` if multiple instances per user/app are needed.
3. Call `manager.saveConfig(row)`.
4. Preserve `creationTime` by reading the existing row first.

Config Browser sees Dock + Registry rows in the same table as MarketsGrid's `markets-grid-profile-set` rows, with `appId` + `userId` filters working identically.

### Verification

- `npx turbo typecheck build test` → **61/61 tasks green**
- No changes to payload shapes — `DockEditorConfig` + `RegistryEditorConfig` are identical on the wire, so existing Dexie data + REST payloads continue to deserialize.
- All hook consumer call-sites are source-compatible (new `scope` parameter is optional).

---

## 1.Q DockEditor ↔ Component Registry integration

A dock menu item can now launch a component selected from the Component Registry. At edit time, the menu-item form shows a dropdown of every registered entry. At runtime, clicking the dock item resolves the entry from the live registry and launches it as an OpenFin View (default) or Window (opt-in).

### Why the design avoids a "registered component" flag

The dock editor reads a single, well-known ConfigService row (`componentType: 'component-registry'`) via `loadRegistryConfig()` and iterates its `payload.entries[]` directly. **Every entry in that array is, by definition, a registered component.** No additional "is-launchable" flag is needed; being in the registry's entries IS the signal. The `componentType` / `componentSubType` on each entry describe the registered thing (e.g. `'grid'` + `'stomp'`), not whether it's launchable.

### What landed

| File | Change |
|---|---|
| `packages/openfin-platform/src/iab-topics.ts` | New `ACTION_LAUNCH_COMPONENT = 'launch-component'` constant alongside the existing dock action IDs. |
| `packages/openfin-platform/src/launch.ts` | New `launchRegisteredComponent(entryId, { asWindow? })` helper. Loads the live registry, finds the entry by id, builds `customData` identical to `registry-editor/testComponent()`, and calls `platform.createView` (default) or `fin.Window.create` (when `asWindow`). Missing ids log a warning and no-op — never throw. |
| `packages/openfin-platform/src/workspace.ts` | Registers `[ACTION_LAUNCH_COMPONENT]` in both `customActions` (CustomButton / CustomDropdownItem callers) and `dockActionHandlers` (Dock3 launchEntry path). Each delegates to `launchRegisteredComponent`. |
| `packages/openfin-platform/src/dock.ts` + `index.ts` + `config-only.ts` | Re-export `ACTION_LAUNCH_COMPONENT` + `launchRegisteredComponent` + `LaunchRegisteredComponentOptions` so consumers can import from the main barrel or the `/config` subpath. |
| `packages/dock-editor-react/src/hooks/useDockEditor.ts` | Loads the registry on mount via `loadRegistryConfig(scope)`, subscribes to `IAB_REGISTRY_CONFIG_UPDATE` so edits in another window propagate live, exposes `registryEntries: RegistryEntry[]` on the hook return. |
| `packages/dock-editor-react/src/components/dock-editor/ItemFormDialog.tsx` | New `customData?: unknown` field on `ItemFormData`. New `registryEntries?: RegistryEntry[]` prop. When `actionId === ACTION_LAUNCH_COMPONENT`, renders a sorted `<select>` of entries (with `componentType / componentSubType` hint) and a "Launch in new window" checkbox. Quick-set "🧩 Launch a registered component…" button flips the action so users don't need to type the action id. |
| `packages/dock-editor-react/src/DockEditor.tsx` | Threads `registryEntries` to all three `<ItemFormDialog>` instances (add-toolbar, add-child, edit). All three save handlers preserve `customData` on ActionButton + menu-item paths. Edit seed reads existing `customData` so the dropdown pre-selects the saved registry id. |
| `packages/dock-editor-angular/src/dock-editor/dock-editor.service.ts` | Adds `_registryEntries: signal<RegistryEntry[]>` + public `registryEntries()` computed. `loadRegistryAndSubscribe()` runs in the constructor and binds an IAB unsubscribe to `ngOnDestroy`. |
| `packages/dock-editor-angular/src/dock-editor/item-form/item-form.component.ts` | `ItemFormData` extended with `customData?: unknown`. New `@Input() registryEntries: RegistryEntry[]`. Two `signal()`s back the launch-component fields. Template adds the registry `<select>`, the "Launch in new window" toggle, and the quick-set button. `onSave()` blocks when launch-component is selected without a registry pick. |
| `packages/dock-editor-angular/src/dock-editor/dock-editor.component.ts` | Passes `[registryEntries]="service.registryEntries()"` to `<mkt-item-form>`. `onEditItem` seeder reads existing `customData`; `onDialogSaved` writes it back through `addButton` / `updateButton` / `addMenuItem` / `updateMenuItem`. |

### Runtime flow

1. User opens the dock editor, picks a button or menu item, clicks the quick-set button.
2. Form switches to the `launch-component` action; a sorted dropdown of registry entries appears.
3. User picks an entry, optionally checks "Launch in new window", saves.
4. Dock config persists with `actionId: 'launch-component'` + `customData: { registryEntryId, asWindow? }` — schema-compatible with `AppConfigRow` (the dock saves through the canonical `dock-config` componentType from §1.P).
5. At runtime, OpenFin invokes the `customActions['launch-component']` handler in `workspace.ts`, which calls `launchRegisteredComponent`. That helper reads `loadRegistryConfig()`, finds the entry by id, and creates the View / Window with `customData = { instanceId, templateId, componentType, componentSubType, appId, configServiceUrl }` — the same shape `registry-editor/testComponent()` uses.

### Graceful failure

- Registry entry deleted between dock save + click → console warning, no crash.
- `customData.registryEntryId` missing or malformed → console warning, no crash.
- Registry not yet loaded → `loadRegistryConfig` returns `null`, helper logs the missing id and returns `undefined`.

### Verification

- `npx turbo typecheck build test` → **61/61 tasks green** (no regressions outside this feature).
- The `dock-config` AppConfigRow shape is unchanged; only optional `customData` payloads grow new structured fields. Existing dock configs without launch-component menu items load identically.
- Live propagation: editing a registry entry's `displayName` in the registry-editor window → IAB publishes → dock editor's open dropdown re-renders. No reload required.

### Deferred

- **"Add all from registry" bulk-import button** in the dock editor — cheap follow-up that creates one ActionButton per registry entry in a single click.
- **Visible warning badge** in the rendered dock when a referenced entry is missing — currently we log + no-op; a disabled/badged item would be a nicer UX. Out of scope for v1.

---

## 1.R Workspace Setup — unified editor redesign + persistence fix

The "Workspace Setup (new)" 3-pane editor (`packages/dock-editor-react/src/WorkspaceSetup.tsx`) was functionally working but had four user-reported issues. All four are now closed; the older standalone Dock Editor + Component Registry windows remain available unchanged.

### Persistence — components stop disappearing

Root cause: the child window opened with no scope context from the parent provider, so `db.ts`'s module-level `currentPlatformScope` defaulted to legacy `(system, system)`. Saves wrote to that scope while the provider's boot-time migrations (`migrateLegacyPlatformScope`, `realignAllConfigsToPlatformScope`, `migrateRegistryToGlobalScope`) relocated rows to the real `(appId, userId)` scope, and the next reload found nothing.

- All six dock/registry/workspace-setup launchers in `workspace.ts` now forward `customData: { appId, userId }` (matching the existing Config Browser pattern).
- `HostEnv` carries `userId` through `readHostEnv()`. Optional in the type so demo apps that build a manual `HostEnv` for `encodeHostEnvForQueryString` keep compiling.
- WorkspaceSetup reads `customData` at mount, calls `setPlatformDefaultScope`, and passes the scope explicitly into both `useRegistryEditor({ scope })` and `useDockEditor({ scope })` so the load + save effects target the right row even before the module-level default propagates.

### Discard no longer wipes IndexedDB

The previous Discard button called `registry.reset()` / `dock.reset()`, both of which invoked `clear*Config(scope)` and silently wiped the entire row. A user pressing Discard expecting "revert my unsaved edits" got their catalogue erased.

- Added `reload()` (non-destructive — re-reads from storage) to both `useRegistryEditor` and `useDockEditor`.
- Discard now wires through `reload()`. The destructive `reset()` is preserved for admin "Clear all" flows but no longer reachable from a Discard control.

### Cascade prune on registry deletion

Deleting a registry entry left orphaned dock items pointing at the dead `customData.registryEntryId`. The Inspector showed an orange "Component {uuid} was deleted" warning but the dock itself still rendered the broken button.

- `WorkspaceSetup.handleDelete` now walks the dock tree (top-level ActionButtons + nested DropdownButton menu items, recursively through sub-menus) and dispatches `REMOVE_BUTTON` / `REMOVE_MENU_ITEM` for every item that references the deleted entry. The orphan warning still exists for legacy stale rows but no longer accumulates from new deletions.

### Layout — fits its container, themed scrollbars

- Outer shell: `h-full w-full overflow-hidden` + three rows (`<header>` / `<main>` / `<footer>`). The previous `h-screen w-screen` ignored window resizing.
- Save / Discard moved from the header into a dedicated footer so primary actions stay anchored at the bottom regardless of which pane is scrolled. Header keeps the title, summary counts, and the unsaved-changes badge.
- Each pane's inner content is the only scrolling region; outer container has `overflow-hidden` so the shell never shows a scrollbar of its own.
- New `.bn-scrollbar` utility in `editor-styles.ts` resolves track + thumb colours through `--bn-bg2` / `--bn-border` / `--bn-t3`, so dark and light themes both render correctly without per-theme overrides. Pure CSS — `::-webkit-scrollbar` for Chromium and `scrollbar-color` for Firefox / recent WebKit.

### Icon picker (per-component default + per-placement override)

Replaced the placeholder "(per-item label/icon overrides land in a follow-up commit)" text in `DockItemInspector` with real fields backed by the shared `IconPicker`.

- `IconField` (Popover-hosted searchable grid) lives above the Name field in `ComponentForm` (writes `entry.iconId`) and beside the Label field in `DockItemInspector` (writes the dock button's `iconId`, treated as a per-placement override). Component default is shown as a hint underneath the override field.
- Fixed the existing `IconPicker` contract: was emitting display name (`"Bond"`) while the storage layer expects iconId (`"mkt:bond"`). The component had no live callers, so the signature change is a clean break.
- Added 33 curated trading-action icons under the user's `/svg` folder into `packages/icons-svg/svg/` and the corresponding entries in `ICON_PATHS` / `ICON_META` / `MARKET_ICON_SVGS` (`all-icons.ts`). These ship with hardcoded hex palettes (e.g. `#1ed8a0` / `#ff4d7d`) so they keep their stylized colour identity in both themes — `svgToDataUrl()`'s currentColor replacement is a no-op for them. Names that overlapped with existing icons-svg entries (alert, blotter, bond, candlestick, compliance, heatmap, line-chart, order-book, pnl, refresh, risk, settings, watchlist) were not imported; the existing currentColor variants stay because they theme correctly.

### Dropdown authoring — registered components reachable inside dropdown menus

Schema already supported nested dropdowns (`DockDropdownButtonConfig.options: DockMenuItemConfig[]`) and the older standalone Dock Editor authored them; the new editor was missing the affordances.

- `DockPane` now has a header **+ New menu** button that creates an empty `DropdownButton`.
- Each `DropdownButton` row carries a **+ Add** Popover listing every registered component with search; selecting one fires `ADD_MENU_ITEM` with the right `parentItemId`. Sub-menus are rendered recursively.
- Each row gets an **X** button that fires `REMOVE_MENU_ITEM` (top-level) or `REMOVE_BUTTON` (root).
- `InspectorPane` now resolves a selected dock-item id to either a top-level button or a nested menu item via a discriminated-union `resolveDockEntity`. Edit fields route to `onEditButton` (UPDATE_BUTTON) or `onEditMenuItem` (UPDATE_MENU_ITEM with the right `parentItemId` chain). Without that split, clicking a nested item silently mutated the parent dropdown.

### Files

| Path | Role |
|---|---|
| `packages/dock-editor-react/src/WorkspaceSetup.tsx` | Outer shell — scope init, header / body / footer, dock CRUD bridges |
| `packages/dock-editor-react/src/components/workspace-setup/DockPane.tsx` | Tree renderer + +New menu + +Add Popover + remove |
| `packages/dock-editor-react/src/components/workspace-setup/InspectorPane.tsx` | Component form + dock-item form (button OR menu item) with icon picker |
| `packages/dock-editor-react/src/components/dock-editor/editor-styles.ts` | `.bn-scrollbar` utility + token aliases |
| `packages/dock-editor-react/src/components/IconPicker.tsx` | Shared grid (now emits iconId, not display name) |
| `packages/dock-editor-react/src/hooks/useDockEditor.ts` | + non-destructive `reload()` |
| `packages/registry-editor-react/src/hooks/useRegistryEditor.ts` | + non-destructive `reload()` |
| `packages/openfin-platform/src/registry-host-env.ts` | `HostEnv.userId` (optional) + readHostEnv populates from `customData.userId` |
| `packages/openfin-platform/src/workspace.ts` | Six launchers forward `customData: { appId, userId }` |
| `packages/icons-svg/index.ts`, `all-icons.ts`, `svg/` | + 33 curated trading-action icons |

### Tests

Baseline preserved: 242 (`@starui/core`) + 56 (`@starui/markets-grid`) + 42 (`@starui/openfin-platform`) + 147 (`@starui/data-plane`) = 487 tests passing. No regressions; full `npx turbo typecheck test --force` is green across all 50 tasks.

---

## 1.S DataProvider integration — v2 redesign

Replaces the v1 data plane (~14k LOC of trial-and-error: dual configure/subscribe ops, late-joiner replay protocol, per-view gates, dual-mode REST/local persistence shim, mirrored STOMP+REST editor tabs) with a clean rewrite landed on a side branch and merged in one cutover commit. Old IndexedDB rows are wiped — users re-create providers in the new editor.

### Architecture

```
[main thread]                                    [SharedWorker]
                                                 ┌─────────────────────────┐
ConfigManager  ───────────read/write─────┐       │  Hub                    │
   (Dexie / REST, dual-mode)             │       │   providers: Map<id, H> │
                                         │       │   listeners: Map<id,Set>│
DataProvider editor (popout) ──save / list ┘     │   caches:    Map<id,Map>│
   STOMP / REST / Mock / AppData                 │   stats:     Map<id,S>  │
                                                 │                         │
DataPlane (client) ◄────MessagePort──────────────┤  startStomp / startRest │
   .attach(id, cfg, listener, opts?)             │  startMock — free fns   │
   .attachStats(id, listener)                    │     return {stop, restart}
   .detach(subId)                                │  Stats sampler: 1Hz     │
   .stop(id)  ← explicit teardown only           │  No auto-teardown       │
                                                 └─────────────────────────┘
MarketsGridContainer (toolbar hidden until Shift+Ctrl+P)
   liveProviderId / historicalProviderId / mode='live'|'historical'
   asOfDate → AppDataStore.set('positions','asOfDate',date)
   {{positions.asOfDate}} → resolveCfg → re-attach → Hub.restart(extra)
```

### Wire protocol (3 + 3)

```ts
// Client → Worker
type Req =
  | { kind: 'attach'; subId; providerId; cfg?; mode: 'data' | 'stats'; extra? }
  | { kind: 'detach'; subId }
  | { kind: 'stop';   providerId };

// Worker → Client
type Evt =
  | { subId; kind: 'delta';  rows; replace? }
  | { subId; kind: 'status'; status: 'loading' | 'ready' | 'error'; error? }
  | { subId; kind: 'stats';  stats: ProviderStats };
```

`attach` is configure-or-attach (no race window), the first emit on every attach is a guaranteed `delta { replace: true, rows: [...cache] }` plus the current status — late-joiner replay is built into attach instead of being a separate protocol step. `restart` is implicit: a second `attach` with the same `providerId` plus `extra` triggers `provider.restart(extra)` on the running provider.

### Key invariants

- **No auto-teardown.** Providers run until explicit `stop()` or worker death. Refresh + restart go through `attach({ extra: { __refresh: ts } })`.
- **Hub owns the cache.** Providers emit `{rows, replace?}` / `{status}` / `{byteSize}` via a single `emit` callback — no provider-side state.
- **Templates resolve on the main thread, before attach.** `{{appdata.key}}` substitution against an in-memory snapshot fed by the v2 `AppDataStore` (which wraps `ConfigManager`). When AppData mutates, `useResolvedCfg` swaps the cfg identity, the hook re-attaches, the Hub restarts the provider.
- **Two-provider MarketsGrid.** Required `liveProviderId` + optional `historicalProviderId`. Only one is active at a time; the toolbar (revealed via `Shift+Ctrl+P`) exposes a Calendar-popover date picker when historical is selected, and writes the picked value into AppData via `historicalDateAppDataRef`.
- **Editor as popout.** `openProviderEditorPopout({providerId?})` opens `/dataproviders` in a fixed-named window (OpenFin `fin.Window.create` or `window.open` fallback). Re-launches focus the existing window and navigate to the new id.

### Packages

| Path | Role |
|---|---|
| `packages/data-plane/src/v2/protocol.ts` | Wire types + `ProviderStats` + type guards |
| `packages/data-plane/src/v2/worker/Hub.ts` | Cache + listener fan-out + 1Hz stats sampler (no auto-teardown) |
| `packages/data-plane/src/v2/worker/entry.ts` | `installWorker` — boots the Hub on a SharedWorker / dedicated worker |
| `packages/data-plane/src/v2/providers/{stomp,rest,mock}.ts` | `start*(cfg, emit) → ProviderHandle` free functions |
| `packages/data-plane/src/v2/providers/registry.ts` | `startProvider(cfg, emit)` lookup table; `registerProvider` for app-side overrides |
| `packages/data-plane/src/v2/providers/inferFields.ts` | Completeness-weighted sampling (returns `FieldNode[]`) |
| `packages/data-plane/src/v2/template/resolver.ts` | `resolveTemplate` + `resolveCfg` (deep walk) |
| `packages/data-plane/src/v2/config/store.ts` | `DataProviderConfigStore` + `AppDataConfigStore` over `ConfigManager` |
| `packages/data-plane/src/v2/config/AppDataStore.ts` | Reactive in-memory snapshot + change subscription |
| `packages/data-plane/src/v2/client/DataPlane.ts` | Main-thread client (3-method surface + in-page wiring helper for tests) |
| `packages/data-plane-react/src/v2/index.tsx` | `<DataPlaneProvider>` + 7 hooks (`useDataPlane`, `useAppDataStore`, `useDataProviderConfig`, `useDataProvidersList`, `useResolvedCfg`, `useProviderStream`, `useProviderStats`) |
| `packages/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx` | Two-provider container, hidden toolbar (`useChordHotkey`), refresh, mode toggle |
| `packages/widgets-react/src/v2/markets-grid-container/{ProviderToolbar,DatePicker}.tsx` | Toolbar (selectors + mode + date) and shadcn Calendar+Popover date picker |
| `packages/widgets-react/src/v2/provider-editor/DataProviderEditor.tsx` | Outer list + form shell — popout-ready, viewport-fit (no outer scrollbars) |
| `packages/widgets-react/src/v2/provider-editor/EditorForm.tsx` | 4-tab form (Connection · Fields · Columns · Behaviour) + Diagnostics when editing existing |
| `packages/widgets-react/src/v2/provider-editor/tabs/{Connection,Fields,Columns,Diagnostics}Tab.tsx` | Tab bodies — Diagnostics surfaces live stats + Restart + Stop. FieldsTab flattens the inferred field tree and slices to the scroll viewport (inline windowing, no new dep) past 100 rows so wide STOMP payloads with thousands of nested fields stay nimble — same pattern as `ColumnSettingsPanel`. |
| `packages/widgets-react/src/v2/provider-editor/transports/{Stomp,Rest,Mock,AppData,Behaviour}Fields.tsx` | Per-transport Connection / Behaviour inputs (all shadcn primitives) |
| `packages/widgets-react/src/v2/data-provider-selector/DataProviderSelector.tsx` | Picker (dropdown / list); reads `useDataProvidersList`, no React Query |
| `packages/design-system/src/themes/scrollbars.css` | `.scrollbar-themed` + `.scrollbar-thin` reading the theme-flipping `--scrollbar-thumb` token |
| `apps/markets-ui-react-reference/src/data-providers-popout.ts` | `openProviderEditorPopout({providerId?})` — OpenFin + browser fallback |
| `apps/markets-ui-react-reference/src/dataPlaneWorker.ts` | SharedWorker entry — calls `installWorker()` |
| `apps/markets-ui-react-reference/src/data-plane-client.ts` | Constructs `new SharedWorker(new URL(...))` + the v2 `DataPlane` client |

### What got deleted

`packages/data-plane/src/{client/*, worker/{router,cache,bufferedDispatch,broadcastManager,providerFactory,rowCache,entry,index}.ts, protocol.ts}`, `packages/data-plane-react/src/{context.tsx, useDataPlane*.ts, hooks.test.tsx}`, `packages/widgets-react/src/{markets-grid-container, provider-editor, data-provider-selector}/*` (all v1), `apps/markets-ui-react-reference/src/data-providers-local.ts`. Three v1 modules survive at `packages/data-plane/src/{services, providers/{ProviderBase, StreamProviderBase, StompDataProvider, rowCache}}.ts` — only because `@starui/angular` still imports them; they retire on Angular's v2 cutover.

### Subpath surface

```ts
// Main-thread types + helpers
import { resolveCfg, AppDataStore, type ProviderStats } from '@starui/data-plane/v2';
// SharedWorker entry
import { installWorker } from '@starui/data-plane/v2/worker';
// Client
import { DataPlane } from '@starui/data-plane/v2/client';

// React bindings
import {
  DataPlaneProvider, useProviderStream, useResolvedCfg, useDataProvidersList,
} from '@starui/data-plane-react/v2';

// Widgets
import { MarketsGridContainer } from '@starui/widgets-react/v2/markets-grid-container';
import { DataProviderEditor }   from '@starui/widgets-react/v2/provider-editor';
import { DataProviderSelector } from '@starui/widgets-react/v2/data-provider-selector';
```

### Tests

| Package | Tests | Notes |
|---|---|---|
| `@starui/data-plane` | **59** v2 tests (Hub, STOMP, REST, Mock, inferFields, template resolver, AppDataStore, DataPlane client) + the surviving v1 `dataProviderConfigService.test.ts` (7) | Down from v1's ~175 tests because the v1 worker / client / providers are gone, not because of regression |
| `@starui/data-plane-react` | **3** (jsdom + in-page wiring) | v1 hooks deleted |

`npx turbo typecheck` covers all 45 packages with no regressions.

### Net code change

~12.7k LOC removed, ~3.7k LOC added across the v2 series. The new data plane is a single edit per feature.

---

## 1.T HostWrapper — runtime-port-driven hosting seam (Seam #2)

Apps render hosted components without those components knowing whether they live in OpenFin or a plain browser. Both the React and Angular flavors now ship.

### React (`@starui/host-wrapper-react`)

`<HostWrapper runtime={runtime} configManager={configManager}>` provides a `HostContext` that hosted components consume via `useHost()`. Reads identity, current theme, configManager, and lifecycle events (`onWindowShown`, `onWindowClosing`, `onCustomDataChanged`, `onWorkspaceSave`) without importing `@openfin/core`. Wired into `apps/demo-react`, `apps/demo-configservice-react`, and `apps/markets-ui-react-reference` (with an `Outlet` layout pattern that excludes the `/platform/provider` route).

### Angular (`@starui/host-wrapper-angular`)

`provideHostWrapper({ runtime, configManager })` registers three `InjectionToken`s (`HOST_RUNTIME`, `HOST_CONFIG_MANAGER`, `HOST_CONFIG_URL`). Hosted Angular components inject `HostService`, the DI mirror of `useHost()`:

- Identity getters (`instanceId`, `appId`, `userId`, `componentType`, `roles`, `permissions`, `customData`).
- Theme as **both** `themeSignal: Signal<Theme>` and `theme$: Observable<Theme>` so consumers pick whichever fits their template flavor.
- `windowShown$`, `windowClosing$`, `customData$`, `workspaceSave$` Observables bridged from the underlying `RuntimePort`.
- `dispose()` tears down listener subscriptions and completes every Subject. Wired automatically through `DestroyRef` so the singleton cleans itself up when the root injector tears down.

Built via `ng-packagr` (FESM2022 + `.d.ts`). Recommended wiring pattern for an Angular host: an `app.config.ts` exports `buildAppConfig(): Promise<ApplicationConfig>` (async because `OpenFinRuntime.create()` is async), selects `OpenFinRuntime` when `isOpenFin()` else `BrowserRuntime`, and spreads `provideHostWrapper(...)` into the providers list; `main.ts` awaits `buildAppConfig()` before `bootstrapApplication`. (The `apps/markets-ui-angular-reference` app that demonstrated this pattern was removed on 2026-05-08 — see "Removed in 2026-05-08" above.)

### Workspace-save event

The new `RuntimePort.onWorkspaceSave(fn)` method completes the lifecycle surface for both flavors. `OpenFinRuntime` bridges `fin.Platform.getCurrentSync().on('workspace-saved', …)`; `BrowserRuntime` is a no-op (no workspace concept in the browser). React's `HostContext` exposes it as `onWorkspaceSave`; Angular's `HostService` exposes it as `workspaceSave$`. Hosted components use this as a flush-to-disk hook.

### 1.O.VTR View-tab "Save Tab As…" rename + window-title binding

Two small platform additions that make OpenFin browser windows and view tabs honour user-facing names instead of internal-generated identifiers.

**Window title bound to active page.** `BrowserWorkspacePlatformWindowOptions.title` is set to `{ type: 'page-title' }` in the shell init path so the OS taskbar entry tracks the current page name (no more `internal-generated-window-…`). Wired in [packages/openfin-platform/src/workspace.ts](../packages/openfin-platform/src/workspace.ts).

**View-tab rename via right-click → "Save Tab As…".** Adds a custom item to the top of the view-tab context menu, mirroring the platform's "Save Page As" UX. Selecting it opens a small frameless popout window (a route in the reference app) prompting for a new tab name. On confirm the action does two things in the target view: (1) runs `document.title = "..."` via `executeJavaScript` so the workspace tabstrip mirrors the rename immediately (default `titlePriority: 'document'`), and (2) writes the new title to `customData.savedTitle` via `view.updateOptions(...)` so the rename rides through the workspace snapshot. `View.updateOptions({ title })` is intentionally NOT used: `title` lives on the create-time `ViewOptions` shape, not on `MutableViewOptions`, and is silently dropped at runtime.

**Persistence on workspace restore.** On the next workspace load, `OpenFinRuntime` reads `customData.savedTitle` from the resolved view options during construction and reapplies it to `document.title`. A `MutationObserver` on the `<title>` element pins the title back to `savedTitle` for a 3 s post-boot window, defeating the page's mount-time `document.title = ...` `useEffect` (used by `HostedComponent.tsx`, `DataProviders.tsx`, etc.) which would otherwise clobber the restored title. The observer disconnects after the window so live rename, notification badges, and other dynamic title updates work freely. The customData poll re-applies `savedTitle` on actual changes (guarded by `lastAppliedSavedTitle` so unrelated customData mutations like `activeProfileId` don't clobber dynamic titles).

| File | Change |
|---|---|
| `packages/openfin-platform/src/internal/viewTabRename.ts` | New. Exports `ACTION_RENAME_VIEW_TAB`, `RENAME_VIEW_TAB_WINDOW_NAME`, `injectRenameMenuItem(payload)` (template helper that's a no-op when `selectedViews.length !== 1`), and `createRenameViewTabAction(openChildWindow)` (CustomActionsMap factory guarded on `CustomActionCallerType.ViewTabContextMenu`). |
| `packages/openfin-platform/src/internal/customActions.ts` | Spreads `createRenameViewTabAction(openChildWindow)` into the returned `CustomActionsMap`. |
| `packages/openfin-platform/src/workspace-persistence.ts` | `MarketsUIWorkspaceProvider.openViewTabContextMenu` injects the rename item before delegating to `super`. |
| `packages/openfin-platform/src/index.ts` | Re-exports the four rename helpers from the main barrel. |
| `apps/markets-ui-react-reference/src/views/RenameViewTab.tsx` | Frameless popout that reads `view` + `currentTitle` from `fin.me.getOptions().customData`, renders a card matching the "Save Page As" layout (header icon + title row + single shadcn `Input` + Cancel/Save row), auto-focuses + selects on mount, Enter submits / Esc cancels. On confirm, runs `document.title = "..."` in the target view via `executeJavaScript` for the immediate tabstrip update, then calls `view.updateOptions({ customData: { ..., savedTitle } })` so the rename round-trips through the workspace snapshot. Theme-sensitive via the ambient `<ThemeProvider>`. |
| `packages/runtime-openfin/src/OpenFinRuntime.ts` | `applySavedViewTitle()` — reads `customData.savedTitle` during construction and reapplies it to `document.title`. The hook closes the persistence loop: without it, the rename would be lost on every workspace reload because `document.title` is a runtime-only DOM mutation that the snapshot never captures. |
| `apps/markets-ui-react-reference/src/main.tsx` | New `/rename-view-tab` route (lazy). |

Verified green: `npx turbo typecheck --filter=@starui/openfin-platform --filter=@starui/markets-ui-react-reference`; `npx turbo test --filter=@starui/openfin-platform` (49 tests).

### 1.P Universal `<HostedFeatureView>` wrapper for OpenFin route views

Consolidates boilerplate across all feature route views (MarketsGrid, Charts, TradeTickets, Analytics Playground, etc.) into a single reusable component.

**Problem:** Every route view (BlottersMarketsGrid, DataProviders, etc.) was repeating the same pattern — wrapping with `HostedComponent` to resolve OpenFin identity + ConfigManager, then wrapping with `DataPlaneProvider`, then handling loading states and layout. This introduced duplication and a misleading naming convention (e.g., "BlottersMarketsGrid" reads like a grid-specific view, but most of it is generic infrastructure).

**Solution:** New `<HostedFeatureView>` component at `apps/markets-ui-react-reference/src/components/HostedFeatureView.tsx` that:
- Accepts a feature component as a **child** (either ReactNode or render-prop callback for context access)
- Wraps internally with `HostedComponent` (identity + storage factory). Identity (path, instanceId, appId, userId) is surfaced by the grid itself via the new toolbar ⓘ info popover — see `MarketsGrid` `componentName` prop.
- Mounts `DataPlaneProvider` automatically
- Handles loading states while ConfigManager resolves
- Exposes full `HostedContext` to children via render-prop so views can access `instanceId`, `storage`, `configManager`, `userId`, `appId`

**Result:** Route views become lean. Example refactoring of `BlottersMarketsGrid`:
- **Before:** 177 LOC (HostedComponent + DataPlaneProvider + BlotterShell + LoadingState sub-component)
- **After:** 120 LOC (HostedFeatureView wrapper + BlotterGrid sub-component), with identical functionality
- The component name is now honest — `BlottersMarketsGrid` is just the MarketsGrid feature mounted inside the generic wrapper

**Architecture:**
- `HostedFeatureView` lives at the app level since `HostedComponent` is app-specific (it knows about routes, theme context, data-providers popout, etc.)
- Scales to all feature views: Charts, TradeTickets, Analytics, Playground, etc. — any new view gets the boilerplate for free
- Maintains render-prop flexibility so views that need advanced context (storage, custom identity handling) can still access it
- No changes to the underlying `HostedComponent` or `HostedComponent` behavior — just a clean abstraction over the existing pattern

**Status:**
- New component created
- `BlottersMarketsGrid` refactored and tested
- All tests pass (build, typecheck, full suite: 298+ tests green)
- Design reusable for all future feature views in the same app

---

## 2. Summary Statistics

| Category | Count |
|----------|-------|
| **v2 Shipped Modules** | **9** — general-settings (Grid Options), column-templates, column-customization, calculated-columns, column-groups, conditional-styling, saved-filters, toolbar-visibility, grid-state |
| **v2 Settings Panels** | **5 dedicated editors** (Grid Options, Column Settings, Calculated Columns, Column Groups, Style Rules) + **3 indirect editors** (Column Templates via Formatter Toolbar + Column Settings, Saved Filters via FiltersToolbar, Toolbar Visibility auto-tracked) + Profile Selector |
| Built-in Expression Functions | **65+** across Math / Stats / Aggregation / String / Date / Logic / Type / Lookup / Coercion |
| → column-aware aggregation functions | 9 (SUM, COUNT, DISTINCT_COUNT, AVG, MEDIAN, STDEV, VARIANCE, MIN, MAX) |
| → multi-branch conditional functions | 4 (IF, IFS, SWITCH, CASE) |
| **Grid Options controls** | **60** across 8 bands (+ 7 subsections in DEFAULT COLDEF) |
| Value Formatter Presets | **14** (Integer / 2dp / 4dp / parens-neg / red-parens-neg / green-red-nosign / green-red-$, + 5 tick formats + Scientific + BPS) |
| Currency quick-insert symbols | 6 ($, €, £, ¥, ₹, CHF) |
| Cockpit SettingsPanel Primitives | 20+ |
| Shared `StyleEditor` sections | 4 (text / color / border / format) |
| Format Editor popover primitives | 6 (FormatPopover, FormatColorPicker, FormatSwatch, FormatDropdown, BorderSidesEditor, ExcelReferencePopover) |
| Shadcn UI Components (incl. AlertDialog) | 12 |
| Rule Indicator Icons (Lucide) | 20+ |
| Tick-format denominations | 5 (32, 32+, 64, 128, 256) |
| Profile save contract | Explicit Save button only — dirty flag + beforeunload + switch-prompt guards |
| v2 E2E Test Suites | 10+ |
| v2 Approximate LOC | ~9,000 (core-v2 ~7,200 + markets-grid-v2 ~1,800) |

### Architecture invariants held across the v2 work

- Single source of truth: IndexedDB profile snapshots (`gc-customizer-v2` db).
- Per-module `schemaVersion` with optional `migrate(raw, fromVersion)`.
- Save path: Save-button click → `captureGridStateInto` → `serializeAll` → persist → `profile:saved` event. Auto-save (300ms debounce) is still implemented but opt-in — `MarketsGrid` ships with `disableAutoSave: true`. Internal `isDirty` flag drives the Save-button dirty-dot + profile-switch AlertDialog + `beforeunload` warning.
- `grid-state` module is the one deliberate exception — captures on explicit Save only so AG-Grid native state isn't touched on every keystroke.
- Module ordering (priority): `general-settings (0)` → `column-templates (1)` → `column-customization (10)` → `calculated-columns (15)` → `column-groups (18)` → `conditional-styling (20)` → `grid-state (200)`.
- Every cross-module read goes through `ctx.getModuleState<T>(moduleId)` — no direct imports between modules.

---

## 3. Editor coverage matrix — unit + e2e status

**As of 2026-04-19, every user-facing editor in the grid customizer has
meaningful behavioural e2e coverage.** The §3 backlog closed across
five sessions: column-customization → column-groups → conditional-
styling → calculated-columns → column-templates → general-settings.
Remaining non-UI surfaces (`toolbar-visibility` has no UI; `grid-state`
is auto-capture runtime state exercised indirectly by the autosave
spec).

**Legend:** ✅ solid · ◐ partial (smoke only / pure logic only) · ❌ none

| Module / Editor | Feature catalog (§) | Pure-logic unit tests | Panel unit tests | E2E |
|---|---|---|---|---|
| `general-settings` — Grid Options | §1.11 | — | ✅ `GridOptionsPanel.test.tsx` (10) | ✅ `v2-general-settings.spec.ts` (9 — row-height/animate/selection/quick-filter/pagination/discard/persist) |
| `column-customization` — Column Settings | §1.7b | ✅ `formattingActions.test.ts` (43) | ✅ `ColumnSettingsPanel.test.tsx` (7) | ✅ `v2-column-customization.spec.ts` (18 — all 8 bands + meta / discard / list marker) |
| `calculated-columns` — Virtual columns | §1.8 | — | ✅ `CalculatedColumnsPanel.test.tsx` (8) | ✅ `v2-calculated-columns.spec.ts` (11 — seed/add/rename/colId/delete/formatter/persist; grid-render flow deferred) |
| `column-groups` — Nestable group editor | §1.8b | ✅ `treeOps.test.ts` (11) | ✅ `ColumnGroupsPanel.test.tsx` (8) | ✅ `v2-column-groups.spec.ts` (14 — add/rename/columns/chip-cycle/subgroup/reorder/delete/style/persist/expand) |
| `column-templates` — Reusable bundles | §1.8c | ✅ `snapshotTemplate.test.ts` (20) | — | ✅ `v2-column-templates.spec.ts` (9 — save-from-toolbar / apply / replace vs stack / remove chip / picker / persist) |
| `conditional-styling` — Rule editor | §1.7 | — | ✅ `ConditionalStylingPanel.test.tsx` (9) | ✅ `v2-conditional-styling.spec.ts` (13 — empty/add/rename/row-paint/cell-paint/no-cols-warn/disable/priority/delete/flash/indicator/persist/multi-rule) |
| `saved-filters` — Filter pills | §1.8d | ✅ `filtersToolbarLogic.test.ts` (26) | — | ✅ 7 tests in `v2-filters-toolbar.spec.ts` |
| `toolbar-visibility` — Layout memory | §1.8e | — | — | ❌ |
| `grid-state` — Native state capture | §1.10 | — | — | ◐ via `v2-autosave.spec.ts` |
| Formatting Toolbar (host chrome) | §1.12 | ✅ formatter presets in-line | ✅ `FormattingToolbar.test.tsx` (15) | ✅ 10 tests in `v2-formatting-toolbar.spec.ts` |
| Inline column-caption rename + cell-editable toggle | §1.12 | — | (covered indirectly via `applyHeaderNameReducer` / `applyEditableReducer` in `formattingActions`) | — |

**Totals:** 10 surfaces · 5 with pure-logic coverage · 6 with panel unit coverage · **8 with meaningful behavioural e2e** (formatting toolbar, filters toolbar, column-customization, column-groups, conditional-styling, calculated-columns, column-templates, general-settings) + 2 non-UI surfaces (toolbar-visibility no-op, grid-state indirectly via autosave spec).

**Smoke coverage** lives in `e2e/v2-settings-panels.spec.ts` (8 tests) + the shared helper `e2e/helpers/settingsSheet.ts`. Every settings panel has at least a "mounts via dropdown nav" guard plus DOM-level assertions for the visible + hidden nav paths. The helper exports `bootCleanDemo` / `openPanel` / `forceNavigateToPanel` / `closeSettingsSheet` for reuse in future behavioural specs.

### Priority backlog for e2e coverage

Ordered by risk × churn, highest first. Strike-throughs mark completed.

1. ~~**`column-customization`** — largest surface area (8 bands, 4 sub-editors). Highest regression risk after the M3 split.~~ ✅ Done (`v2-column-customization.spec.ts`, 18 tests covering all 8 bands + meta count + discard + list marker).
2. ~~**`column-groups`** — just refactored, currently zero behavioural e2e after the retirement.~~ ✅ Done (`v2-column-groups.spec.ts`, 14 tests: add/rename/save, columns add+remove, show-tri-state cycle, subgroup creation, reorder up/down, delete, header-style band, SAVE-dirty gating, profile persistence, runtime expand/collapse via openGroupIds).
3. ~~**`conditional-styling` (non-smoke)** — rule create / enable-disable / delete cycle against a real blotter column.~~ ✅ Done (`v2-conditional-styling.spec.ts`, 13 tests: empty state, add/rename, row-scope paint + cell-scope paint (via `gc-rule-<id>` on AG-Grid cells/rows), no-cols warning, disable strips injected CSS, priority persistence, delete, flash band scope-gating, indicator band, profile round-trip, multi-rule cards).
4. ~~**`calculated-columns`** — virtual column create / edit expression / delete.~~ ✅ Done (`v2-calculated-columns.spec.ts`, 11 tests). **Known deferral:** virtual columns appear correctly in AG-Grid's filter tool panel but not in the main grid header in this demo's config. Tracked as a separate bug to investigate (spawned as a follow-up task); 4 previously-drafted grid-render tests will come back once resolved.
5. ~~**`column-templates` indirect flow** — save-from-toolbar → apply-to-another-column → remove-via-settings chip.~~ ✅ Done (`v2-column-templates.spec.ts`, 9 tests covering the three authoring surfaces: save-from-toolbar, apply-from-toolbar, Column-Settings picker + chip remove, plus a behaviour-telling test that documents toolbar apply = REPLACE semantics while picker = APPEND).
6. ~~**`general-settings`** — toggle representative options.~~ ✅ Done (`v2-general-settings.spec.ts`, 9 tests: panel mount / SAVE gating / row-height reflects in `.ag-row` inline height / animate-rows toggle + OVERRIDES counter / row-selection Select round-trip / quick-filter narrows grid to zero rows on no-match / pagination toggle reveals `.ag-paging-panel` / discard reverts / persist across reload).

Each item follows the `e2e/README.md` write-alongside policy: don't backfill in one pass; add tests as the surfaces get touched. The list above is the priority order when they do.

### 1.13 Per-view active-profile override (OpenFin)

Lets traders duplicate a MarketsGrid view in OpenFin and view a *different*
profile of the same grid instance in each duplicate, surviving workspace
save/restore.

- **`ActiveIdSource`** — pluggable pointer source on `ProfileManager`
  (`packages/core/src/profiles/ProfileManager.ts`). Read at `boot()`
  before localStorage; written through on every active-id commit
  (`boot`/`load`/`create`/`clone`/`import`/`remove-active`). Errors
  swallowed — best-effort, never blocks the manager. Exported from
  `@starui/core`.
- **OpenFin source** — `createOpenFinViewProfileSource()` in
  `packages/markets-grid/src/openfinViewProfile.ts`. Reads/writes
  `activeProfileId` on `fin.me.getOptions().customData`. Returns `null`
  when `fin` is unavailable, so non-OpenFin hosts (browser, Electron,
  tests) keep their existing localStorage behaviour.
- **Workspace round-trip** — `Platform.getSnapshot()` reads from the
  same view options that `updateOptions({ customData })` mutates, so
  the per-view active id is captured into the workspace JSON
  automatically. `packages/openfin-platform/src/workspace-persistence.ts`
  needed no changes.
- **Read priority** — OpenFin override → localStorage → reserved
  Default. Each layer falls through if its candidate row no longer
  exists on disk.
- **Duplicate semantics** — duplicates inherit the source view's
  `customData` (OpenFin's behaviour), then diverge as each user makes
  a switch. Exactly the desired UX.
- Worklog entry: `docs/FEATURE_WORKLOG.md` — Feature 1.

### 1.14 HostedMarketsGrid (consolidated hosting wrapper)

Single component that collapses the previous six-deep
`BlottersMarketsGrid → HostedFeatureView → HostedComponent →
BlotterGrid → MarketsGridContainer → MarketsGrid` stack into one call
site. Lives at
[`packages/widgets-react/src/hosted/HostedMarketsGrid.tsx`](../packages/widgets-react/src/hosted/HostedMarketsGrid.tsx);
the module's own README is the source of truth for the prop contract:
[`packages/widgets-react/src/hosted/README.md`](../packages/widgets-react/src/hosted/README.md).

**Added:**

- `<HostedMarketsGrid>` exported from `@starui/widgets-react/hosted`
  and the package root. Owns identity resolution (OpenFin +
  browser-fallback), ConfigService-backed storage with auto-injected
  registered-component metadata, the AG-Grid blotter theme, the
  DataPlane mount, the full-bleed layout, the ConfigManager loading
  guard, the document title, and a one-shot legacy view-state
  cleanup. Flat props per refactor decision D7 — no `gridProps`
  escape hatch.
- Public types `HostedContext`, `RegisteredComponentMetadata`,
  `ConfigManager`, and `StorageAdapterFactory` re-exported from
  `@starui/widgets-react/hosted` so external consumers have a
  documented integration contract.
- Public hooks `useHostedIdentity` and `useAgGridTheme` exported from
  the same module for consumers that want to compose their own hosted
  wrapper.
- Reference app's `BlottersMarketsGrid.tsx` collapsed from 163 LOC to
  a single `<HostedMarketsGrid>` call (38 LOC).
- 27 Vitest specs in `packages/widgets-react/src/hosted/__tests__/`
  covering every parity-matrix row at the wrapper boundary; 5
  Playwright specs in
  [`e2e/hosted-markets-grid.spec.ts`](../e2e/hosted-markets-grid.spec.ts)
  covering grid mount, profile lifecycle, Alt+Shift+P provider picker,
  toolbar info popover, and theme flip.

**Removed:**

- `apps/markets-ui-react-reference/src/components/HostedComponent.tsx`
- `apps/markets-ui-react-reference/src/components/HostedFeatureView.tsx`
- `packages/widgets-react/src/blotter/SimpleBlotter.tsx`
- `packages/widgets-react/src/blotter/BlotterGrid.tsx` (the
  package-level component — the empty `blotter/` directory was deleted
  with it)
- `SimpleBlotter` / `BlotterGrid` exports from
  `packages/widgets-react/src/index.ts`

Net change: 727 LOC removed across the four deleted files, replaced by
~225 LOC of wrapper + hooks. Updating
`agGridBlotter{Light,Dark}Params` in
`packages/design-system/src/adapters/ag-grid.ts` re-themes every
hosted blotter at once.

Worklog entry:
[`docs/HOSTED_MARKETS_GRID_REFACTOR_WORKLOG.md`](./HOSTED_MARKETS_GRID_REFACTOR_WORKLOG.md).

### 1.15 Hosted-view hooks (`useHostedView` + sub-hooks)

Hook-based public API exposing OpenFin runtime events to any feature
hosted inside the OpenFin shell. All live under
[`packages/widgets-react/src/hosted/`](../packages/widgets-react/src/hosted/)
and degrade safely outside OpenFin (subscriptions noop, state defaults).

**New hooks:**

- `useIab()` — `{ subscribe, publish }` over `fin.InterApplicationBus`,
  with auto-cleanup of every subscription on unmount.
- `useOpenFinChannel()` — `{ createProvider, connect }` Channel-API
  factory with provider/client teardown on unmount.
- `useTabsHidden()` — boolean tracking the parent OpenFin window's
  tab-strip visibility via the shared `options-changed` listener.
- `useWorkspaceSaveEvent(cb)` — connects to the platform-side Channel
  provider and registers an awaited flush handler so the workspace
  snapshot includes the latest in-memory state.
- `useColorLinking()` — `{ color, linked }` from the parent window's
  workspace-platform color/link state.
- `useFdc3Channel()` — `{ current, join, leave, addContextListener,
  broadcast }` thin wrapper over `window.fdc3` user channels.
- `useHostedView(args)` — composing entry point that calls every
  sub-hook above plus the existing `useHostedIdentity` and
  `useAgGridTheme`. Single result bag with stable identity-keyed
  callbacks.

**Platform-side fan-out:**
[`packages/openfin-platform/src/workspace-persistence.ts`](../packages/openfin-platform/src/workspace-persistence.ts)
creates a singleton Channel provider named
`marketsui-workspace-save-channel` and dispatches `'workspace-saving'`
to every connected client *before* `augmentSnapshotWithLiveCustomData`,
awaiting `Promise.allSettled` so async flushes complete before the
snapshot is captured. A fire-and-forget `'workspace-saved'` publish
follows successful `cm.saveConfig`.

**HostedMarketsGrid integration:**

- Now consumes `useHostedView` and forwards `onWorkspaceSave` to
  `MarketsGridHandle.profiles.saveActiveProfile()` — the same code path
  the toolbar Save button calls.
- New optional `caption?: string` prop. When the OpenFin shell hides
  the view-tab strip (`tabsHidden === true`), an editable label is
  rendered at the **left edge of the primary toolbar row** (not as a
  separate strip) via `MarketsGrid`'s new `caption` + `tabsHidden`
  props. The label seeds from `caption` (falling back to
  `componentName`); hovering reveals an inline pencil that swaps the
  label for a shadcn `<Input>` — Enter or blur commits, Escape
  cancels. Committed edits fire the optional `onCaptionChange(next)`
  callback so the host can persist the override.
- **Caption persistence** (`MarketsGridContainer`): the persisted
  caption is stored alongside the picker `ProviderSelection` in the
  same `gridLevelData` row used for grid-level state — keyed by
  `instanceId` via the StorageAdapter, ConfigService-backed. Hydrates
  on mount; user edits (via the inline pencil) flow through
  `onCaptionChange`, update local state, and trigger a debounced save
  on the same write path that already handles provider-selection
  changes. The persisted value takes precedence over the prop on
  hydration, so the prop becomes a first-run / fallback value.
- Existing call sites untouched — every new prop is additive.

Worklog entry:
[`docs/HOSTED_VIEW_HOOKS_WORKLOG.md`](./HOSTED_VIEW_HOOKS_WORKLOG.md).

### Known gaps documented but not blocking

- **Toolbar Visibility wiring** (§1.8e) — module state ships in every profile but concrete toolbar-toggle bindings aren't routed through it yet. Non-blocking; current host chrome uses local React state. Wiring pass is a known follow-up.
- **Column Templates standalone panel** — today templates are authored indirectly (save-from-toolbar, remove-via-Column-Settings-chip). A dedicated Templates panel with rename / description / duplicate affordances would be additive, not required.

## 1.U Registered-component `instanceId` format

When a non-singleton registered component spawns a new instance, its
`instanceId` now follows a deterministic, scan-friendly format instead
of an opaque UUID:

```
${userId}${componentType}-${componentSubType}-${Date.now()}
```

Example: `dev1blotter-markets-1714999999999`. Singletons are unchanged
— they continue to use their templateId so all callers share one row.

Why this format:
- **Per-user prefix** clusters every row owned by a given user under
  the same Config Browser visual block; `startsWith()` finds them all.
- **Type-scoped middle** (`componentType-componentSubType`, casing
  preserved) makes the template id a strict prefix of every instance
  spawned from it after the userId portion.
- **Monotonic suffix** — `Date.now()` (long ms-since-epoch) makes ids
  sortable by creation time. Sufficient uniqueness for human-paced
  launches; the launcher already guards against duplicate configIds at
  save time so a 1-ms double-click can't clobber.

| File | Change |
|------|--------|
| `packages/openfin-platform/src/registry-config-types.ts` | New `mintRegisteredInstanceId(userId, componentType, componentSubType)` helper alongside the existing `deriveTemplateConfigId` / `deriveSingletonConfigId` family. |
| `packages/openfin-platform/src/launch.ts` | `createComponentInstance()` non-singleton branch now calls the helper instead of `crypto.randomUUID()`. Singleton branch unchanged. |
| `packages/openfin-platform/src/config-only.ts` + `index.ts` | Re-exports `mintRegisteredInstanceId` and `DEFAULT_USER_ID` so other launchers can stay aligned. |
| `packages/registry-editor-angular/.../registry-editor.service.ts` | Test-launch path replaces `crypto.randomUUID()` with the helper so admin "Test Launch" produces an instance with the same shape. |
| `packages/openfin-platform/src/mint-registered-instance-id.test.ts` (new) | 5 invariants pinning the exact format, casing preservation, empty-subtype handling, and monotonic ordering. |

The React registry-editor's "Test Launch" path is intentionally NOT
changed — it sets `instanceId === templateId` so saves overwrite the
template directly (per the existing test-launch design). The helper
applies only to genuine instance spawns, not template edits.

## 1.T Single-user pin — `userId` always `'dev1'`

The codebase intentionally runs single-user (no SSO yet). A long-tail
divergence had crept back in where some resolution paths produced
`'dev1'`, others produced `''` (empty), and a few honoured
`customData.userId` / URL `?userId=` overrides. Mixed userIds across
machines and views silently orphaned config rows: a workspace saved
under one userId became unreadable under another.

**Fix:** introduce a single canonical constant and hard-pin every
client-side userId resolution to it.

| File | Change |
|------|--------|
| `packages/runtime-port/src/types.ts` | Adds `export const LOGGED_IN_USER_ID = 'dev1'` — single source of truth, foundation-layer (zero-dep types package). |
| `packages/runtime-port/src/index.ts` | Re-exports the constant from the package barrel. |
| `packages/runtime-browser/src/identity.ts` | `userId` is now hard-pinned in `resolveBrowserIdentity()` — URL `?userId=` and override `userId` are intentionally ignored. |
| `packages/runtime-openfin/src/identity.ts` | `userId` is hard-pinned in `resolveOpenFinIdentity()` — `customData.userId` is intentionally ignored. |
| `packages/openfin-platform/src/registry-host-env.ts` | All three `readHostEnv()` resolution paths (OpenFin customData, `?hostEnv=` decode, dev fallback) collapse onto `DEFAULT_USER_ID`. The local constant is now documented as the same value as `LOGGED_IN_USER_ID`. |
| `packages/widgets-react/src/hosted/useHostedIdentity.ts` | Drops the `customData.userId` read; `userId` initialises directly from `LOGGED_IN_USER_ID`. The hook's `defaultUserId` arg is preserved on the public API for back-compat but is now ignored at runtime. New dep: `@starui/runtime-port`. |
| `packages/component-host/src/resolve-identity.ts` | `readCustomData()` now hard-pins `userId` regardless of what the launcher's customData carried. |
| `packages/component-host/src/save-config.ts` | Build-fresh fallback uses `LOGGED_IN_USER_ID` instead of `""` so a row never lands with `userId=''`. New dep: `@starui/runtime-port`. |
| `packages/data-plane-react/src/v2/index.tsx` | `useAppData().setMany()` falls back to `LOGGED_IN_USER_ID` (was `''`) for the user-owner field on a freshly-created AppData config row. New dep: `@starui/runtime-port`. |
| `apps/markets-ui-react-reference/src/views/DataProviders.tsx` | Removes the `VITE_DEFAULT_USER_ID` env override and the `readHostEnv()`-based userId pickup; `userId` is now `LOGGED_IN_USER_ID` directly. |
| Tests in `runtime-browser`, `runtime-openfin`, `widgets-react`, `component-host` | Updated to assert the new pin (`expect(id.userId).toBe(LOGGED_IN_USER_ID)`) where they previously verified URL/override/customData propagation for `userId`. |

Result: every client write to the config service lands under
`(appId, userId='dev1')`. No code path auto-generates a `userId`, and
no inbound `customData` / URL parameter / env variable can drift the
runtime userId off the canonical value. Replace the literal in
`runtime-port/types.ts` (and the matching `DEFAULT_USER_ID` literal in
`registry-host-env.ts`) the day SSO lands.

## 1.S Import Config — full-bundle import (cross-machine workflow)

The Import Config dialog used by the dock previously persisted **only the
`dock-config` row** from an exported JSON file, silently dropping every
other section. That broke import-from-Windows workflows because saved
workspaces, the component registry, and the per-instance
`markets-grid-profile-set` rows that carry `gridLevelData` (i.e. the
data-provider selection) never made it across machines: the workspace
restored, the grid mounted, but the live/historical provider always
came back unset.

**Fix:** [`packages/openfin-platform/src/config-import.ts`](../packages/openfin-platform/src/config-import.ts) —
new `importConfigBundle(bundle, opts?)` helper that ingests the full
export shape (`appConfig`, `appRegistry`, `roles`, `permissions`) into
the local ConfigManager. Each `appConfig` row is run through a re-own
pass that rewrites `appId` / `userId` to the local hostEnv values
(matching the existing per-row reown in the Config Browser), so the
imported rows become readable under the local `(appId, userId)` scope.
Sentinel values `userId === 'system'` and `appId === ''` are preserved
unchanged so public/global rows and pre-scoped legacy rows continue to
resolve via their existing back-compat fallbacks. `userProfile` rows
are intentionally NOT imported — `userId` IS the row's primary key, so
auto-importing would silently clobber local user records; replicating
users remains a per-row Config Browser action.

| File | Change |
|------|--------|
| `packages/openfin-platform/src/config-import.ts` (new) | `importConfigBundle()` + per-table `ImportTableResult` + aggregate `ImportConfigBundleResult`. Modes: `overwrite` (default), `skip-existing`. |
| `packages/openfin-platform/src/config-only.ts` | Re-exports the new helper + types from the side-effect-free `/config` subpath. |
| `packages/openfin-platform/src/index.ts` | Same re-exports from the main barrel. |
| `packages/dock-editor-react/src/ImportConfig.tsx` | Replaces the `dock-config`-only loop with a single `importConfigBundle(importData)` call. Status message reports per-section counts. Fires both `IAB_RELOAD_AFTER_IMPORT` (dock) and `IAB_REGISTRY_CONFIG_UPDATE` (registry editor / launchers) so other windows pick up the new state. |
| `packages/dock-editor-angular/src/import-config/import-config.component.ts` | Same change for the Angular twin. |
| `packages/openfin-platform/src/config-import.test.ts` (new) | 8 unit tests: reown happy path, `userId === 'system'` preservation, empty-`appId` preservation, registry/roles/permissions import, skip-existing mode, invalid-row handling, userProfile exclusion, aggregate totals. |

Result: importing a Windows-exported config on Mac (or vice versa)
brings in the full bundle — workspaces, registry, blotter
profile-sets, and `gridLevelData` — so opening a saved workspace on the
new machine restores the same data-provider selection it had on the
source machine.

---

## Unified Design-System Token Sweep (2026-05-09)

Every legacy CSS variable family (`--bn-*`, `--fi-*`, `--gc-*`, `--ck-*`,
`--mdl-*`) and every hardcoded hex colour outside the design-system package
has been replaced with the unified `--ds-*` token set across the entire
monorepo. The lint gate `npm run check-ds` (`npx tsx tools/scripts/check-ds-tokens.ts`)
now exits clean (zero violations).

Key changes:
- **`packages/react/widgets/markets-grid/`** — all CSS and TSX files swept;
  `--bn-*`/`--gc-*`/`--fi-*` vars replaced with `--ds-*` equivalents in
  `marketsGrid.css`, `formatter.css`, `ProfileSelector.css`, `HelpPanel.css`,
  and all `.tsx` component files.
- **`packages/react/widgets/widgets-react/`** — `sternAgGridTheme.ts`
  updated to use `var(--ds-surface-primary)` etc. in `themeQuartz.withParams()`.
  `HostedMarketsGrid.tsx`, `LoadingOverlay.tsx`, `useColorLinking.ts` swept.
- **`packages/shared/core/`** — `injectEditorStyles.ts` scrollbar/editor CSS
  updated; `excelFormatter.ts` Excel color map updated.
- **`packages/react/widgets/grid-react/`** — shadcn primitives
  (`alert-dialog.tsx`, `popover.tsx`, `select.tsx`, `ghost-icon-button.tsx`,
  `PopoutPortal.tsx`) swept.
- **`packages/react/tools/`** — `config-browser-react` and
  `workspace-setup-react` fully swept.
- **`packages/angular/tools/config-browser-angular/`** — Angular template
  inline styles swept.
- **`apps/demo-react/`**, **`apps/demo-configservice-react/`**,
  **`apps/demo-angular/`**, **`apps/config-admin-web/`**,
  **`apps/markets-ui-react-reference/`** — all app-level CSS, SCSS, and
  component files swept.
- **`tools/scripts/check-ds-tokens.ts`** — ALLOW_PATHS extended for
  legitimate data files (color-picker swatches, Monaco editor token theme,
  OpenFin API hex, console.log `%c` debug colors, WCAG test fixtures, demo
  fixture data, Recharts SVG attribute selectors).

Token mapping used (partial):

| Legacy | Unified |
|--------|---------|
| `--bn-bg` / `--fi-bg1` | `--ds-surface-primary` |
| `--bn-bg2` / `--fi-bg2` | `--ds-surface-secondary` |
| `--fi-bg0` | `--ds-surface-ground` |
| `--fi-bg3` | `--ds-surface-tertiary` |
| `--bn-t0` / `--fi-t0` | `--ds-text-primary` |
| `--bn-t1` / `--fi-t1` | `--ds-text-secondary` |
| `--bn-t2` / `--fi-t2` | `--ds-text-muted` |
| `--fi-t3` | `--ds-text-faint` |
| `--bn-border` / `--fi-border` | `--ds-border-primary` |
| `--fi-border2` | `--ds-border-secondary` |
| `--bn-green` / `--fi-green` | `--ds-accent-positive` |
| `--bn-red` / `--fi-red` | `--ds-accent-negative` |
| `--bn-blue` / `--fi-blue` | `--ds-accent-info` |
| `--fi-amber` | `--ds-accent-warning` |
| `--fi-sans` | `--ds-font-sans` |
| `--fi-mono` | `--ds-font-mono` |

## 2026-05-09 — Unified Chroma Desk Design System

- Single token tree at `packages/shared/foundation/design-system/src/tokens/`
- Three adapters generate Tailwind preset, PrimeNG preset, AG Grid params from the same source
- Bundled stylesheet at `@starui/design-system/css` — imported once per app
- Theme matrix: `<html data-theme="dark|light" [data-cvd="on"]>` = 4 combos
- Single `.ds-scrollbar` utility (theme-aware via color-mix)
- `tailwindcss-primeui` plugin gives Angular/PrimeNG templates the same utility class vocabulary as React/shadcn
- `applyTheme()` / `getTheme()` helpers persist user preference to localStorage
- `check-ds-tokens` lint script gates CI: forbids hardcoded hex, inline styles, legacy CSS vars
- Build-time WCAG contrast audit codifies AAA body / AA chrome thresholds
- Replaces deleted: `@starui/tokens-primeng` package, Cockpit stylesheet (`packages/shared/core/src/css/cockpit.ts`)
- See `docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md`

## 2026-05-09 — Grid Customizer popout chrome visual regression fix

- **Root cause**: `cockpit.ts` deletion (Task 17) + Phase 6 var sweeps removed structural chrome classes without recreating them. Popout rendered as a flat unstyled vertical stack.
- **Fix**: `packages/react/widgets/markets-grid/src/grid-chrome.css` — new scoped CSS file that recreates `.gc-sheet`, `.gc-popout`, `.gc-popout-title*`, `.gc-popout-module-btn`, `.gc-popout-body`, `.gc-popout-list*`, `.gc-popout-editor`, `.gc-editor-header`, `.gc-editor-scroll`, `.gc-popout-footer`, `.gc-caps`, `.gc-mono`, `.gc-led`, themed scrollbars for list/body/formatting-toolbar.
- All colour refs use `var(--ds-*)` tokens; light-mode override blocks dropped (theme switching handled automatically by unified CSS adapter).
- Imported in `SettingsSheet.tsx` and `MarketsGrid.tsx`; Vite deduplicates.
- Same pattern as `BorderStyleEditor.css` fix on this branch.
- `check-ds-tokens`: clean; typecheck: clean; 68 tests passing.

## 2026-05-11 — `@starui/ui` portals respect popped-out / OpenFin windows

- **`packages/react/ui/src/portal-container.tsx`** — Shared
  `PortalContainerProvider` + `usePortalContainer()` (same contract as the
  former grid-local context).
- **Radix `Portal` `container` prop** threaded through `@starui/ui`:
  `popover`, `dropdown-menu` (content + submenus), `context-menu` (content +
  submenus), `menubar` (content + submenus), `select`, `dialog`,
  `alert-dialog`, `sheet`, `drawer`, `hover-card`, `tooltip`.
- **`packages/react/widgets/grid-react/src/ui/PortalContainer.tsx`** — Now
  re-exports from `@starui/ui` so `PopoutPortal` and `@starui/ui` share one
  React context; overlays/menus mount into the popout `document.body` instead
  of the parent shell.
- **`packages/react/ui/src/index.ts`** — Exports `PortalContainerProvider`,
  `usePortalContainer`, `useResolvedPortalContainer`,
  `PortalContainerProviderProps`.
- **`useResolvedPortalContainer()`** — When no provider wraps the tree, returns
  `document.body` immediately so Radix `Portal` gets an explicit container on
  the first paint (omitting `container` relied on Radix’s deferred mount and
  broke overlays/popovers on the parent shell). Popout paths still pass an
  explicit child `body` via `PortalContainerProvider`.
- **Portaled z-index vs Grid Customizer chrome** — `markets-grid`
  `grid-chrome.css` uses `.ds-popout-backdrop` at **10000** and `.ds-popout` at
  **10001**. Radix surfaces portaled to `document.body` used shadcn’s default
  **`z-50`**, so selects/menus drew **behind** the backdrop on the parent page.
  `@starui/ui` portaled primitives now use **`z-[11000]`** so dropdowns,
  popovers, dialogs, etc. stack above that sheet.

## 2026-05-11 — `@starui/grid-react` Select uses `@starui/ui` (Radix)

- **`packages/react/widgets/grid-react/src/ui/shadcn/select.tsx`** — Replaced the
  token-styled native `<select>` wrapper with Radix/shadcn primitives from
  `@starui/ui` (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`,
  `SelectItem`). Call sites keep legacy `<option>` children and
  `onChange({ target: { value } })`; empty-string option values round-trip via
  an internal sentinel because Radix forbids `SelectItem value=""`.
- **`@starui/ui`** added as a workspace dependency of `@starui/grid-react`.
- **Tests** — `GridOptionsPanel.test.tsx` and `ConditionalStylingPanel.test.tsx`
  updated for combobox interaction; `RuleMetaStrip` exposes
  `data-testid="cs-rule-scope-<ruleId>"`; `src/test/setup.ts` polyfills
  `hasPointerCapture` / `setPointerCapture` for jsdom + user-event.

## 2026-05-11 — `@starui/design-system` synced from `fi-trading-terminal`

- Primitive and semantic tokens now follow the `/Users/develop/wfh/fi-trading-terminal/design-system` direction: cool off-white light chrome, deep charcoal dark chrome, saturated blue primary, teal positive, red negative, pure orange warning, Geist sans, and JetBrains Mono.
- The monorepo token contract is preserved (`--ds-*`, shadcn HSL aliases, PrimeNG bridge vars, CVD overrides, elevations) while the checked-in `fi-light.css` and `fi-dark.css` mirror the imported palette.
- Light-theme trading accents use darker stops from the same hue families so the existing contrast audit remains green.

## 2026-05-11 — Exchange-terminal color pop

- Dark mode now uses electric exchange accents: cyan primary/focus, neon teal buy/positive, hot red sell/negative, bright orange warning, and a stronger cyan focus glow.
- Light mode keeps the same energy with high-contrast blue, teal, red, and restrained orange stops that still pass the design-system contrast audit.
- Dark-mode primary/destructive/action foregrounds use deep ink on electric fills so the saturated colors pop without sacrificing button readability.

## 2026-05-11 — Primary and accent token roles separated

- `ColorScheme` now has an explicit `primary` block for brand CTA, focus, active navigation, framework primary hooks, AG Grid accent color, and selected-state styling.
- `accent.info` is reserved for informational/status usage such as pending badges, live status chips, and the Tailwind/shadcn `info` semantic color.
- Shadcn, PrimeNG, AG Grid, and component tokens now consume `scheme.primary` for primary/focus behavior instead of borrowing `scheme.accent.info`.
- Contract tests assert that primary brand colors remain distinct from informational accents in both dark and light themes.

## 2026-05-11 — Sophisticated light-mode surface polish

- Light mode now uses an “Arctic glass” surface scale: cooler blue-gray app ground, crisp white cards/grid cells, lifted header/hover surfaces, and clearer pressed/accent bands.
- Text and border ramps were deepened so the grid chrome reads sharper and less washed out in dense financial layouts.
- Light elevations now use subtle slate-blue shadows instead of flat generic gray shadows, adding depth without making the UI feel heavy.

## 2026-05-11 — Formatting toolbar alignment polish

- The in-grid formatting toolbar now has consistent vertical padding and centered wrapped rows so icon buttons no longer cling to the top edge.
- Toolbar dividers now align to the control centerline instead of stretching through the full row height.
- The popout trigger is separated into a fixed right-edge action lane with its own divider and vertical centering.

## 2026-05-11 — Low-glare comfort light theme

- Light mode now uses warm-neutral “comfort paper” surfaces instead of the cooler, brighter Arctic glass palette to reduce glare during long sessions.
- Light-mode text stays high contrast but avoids harsh black-on-white; muted/faint text was softened for older-eye readability.
- Light-mode primary and semantic accents were desaturated and overlay strengths reduced so status colors remain clear without visual vibration.

## 2026-05-11 — Mercury-inspired light theme

- Light mode was refined toward Mercury’s visual language: airy limestone workspace, white cards, quiet dividers, graphite text, and soft periwinkle primary actions.
- Status accents now use calm teal, rose, ochre, and slate-blue tones with lighter overlays so dense grids feel less noisy.
- The light theme keeps the primary/accent role split and continues to pass the design-system contrast audit.

## 2026-05-11 — Cool-clinical light theme direction

- Light mode now follows the preferred cool-clinical reference: `#F8F9FB` canvas, crisp white cards/cells, quiet cool-gray dividers, and slate text.
- Primary brand color is cobalt (`#2952CC`) with subdued focus/selection tints, matching the reference without over-saturating the workspace.
- Semantic colors remain rationed and muted so dense tables feel calm rather than visually noisy.

## 2026-05-12 — Conditional styling timed revert window

- `@starui/grid-react` conditional rules now support an optional per-rule
  `activeDurationMs` window. When set, a rule applies style for the
  configured milliseconds after a value-change event causes a match, then
  the cell/row reverts to default styling automatically.
- `ConditionalStylingPanel` exposes this as **STYLE WINDOW (MS)** in the
  `FLASH ON MATCH` band (`cs-rule-style-window-ms-<ruleId>`), with blank
  meaning persistent behaviour.
- Runtime stores timed activations per grid API + row node and uses the
  existing rule class predicates to gate style visibility until expiry;
  expiry schedules a lightweight refresh so the revert is visible without
  manual interaction.

## 2026-05-12 — Conditional styling: per-rule flash (mode / colour / duration)

- `@starui/grid-react` `FlashConfig` is now a real, applied schema. New
  fields:
  - `mode: 'oneShot' | 'pulse'` (default `oneShot` — single fade-in/out
    on match; `pulse` keeps pulsing while the rule matches).
  - `color: FlashColor` — one of eight theme-aware palette names:
    `amber`, `emerald`, `rose`, `sky`, `violet`, `teal`, `orange`,
    `slate`. Default `amber`. Light/dark alphas tuned per colour so the
    pulse stays visible (and text stays legible) under both themes.
  - `durationMs` — single ms value covering one full animation cycle
    (default 700). Replaces the old unused `flashDuration` +
    `fadeDuration` pair.
- **Per-rule isolation**: each enabled flash rule emits its own
  `@keyframes ds-flash-<ruleId>` block and a scoped `--ds-flash-color`
  on its own class, so two flashing rules on the same cell keep distinct
  colours and timings — no global animation, no shared variables.
- **Header flash** now uses a dedicated `.ds-flash-hdr-<ruleId>` class
  (per-rule), so the rule's full cell styling no longer leaks onto
  header cells; only the colour-aware pulse does.
- `ConditionalStylingPanel` `FLASH ON MATCH` band now exposes:
  `cs-rule-flash-mode-<mode>-<ruleId>`,
  `cs-rule-flash-color-<color>-<ruleId>` swatches (×8), and
  `cs-rule-flash-duration-<ruleId>` (ms).
- `deserialize` migration: legacy `{ flashDuration, fadeDuration }`
  payloads are summed into `durationMs`; unknown `mode`/`color` values
  fall back to `oneShot` / `amber`. Eight passing tests cover commit +
  migration + bad-input coercion.
- Implementation is **not** AG-Grid's `api.flashCells()` — that was
  documented as the intent but never wired. Keeping the CSS-keyframes
  path lets us paint headers, give each rule its own colour, and
  compose with `activeDurationMs` for free. Stale docstrings in
  `state.ts` corrected accordingly.

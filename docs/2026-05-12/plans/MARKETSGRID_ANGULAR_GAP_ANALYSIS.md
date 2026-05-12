# MarketsGrid (Angular) — Gap analysis

What does Angular have today vs. what `@starui/markets-grid` +
`@starui/grid-react` ship on the React side? This document inventories
every package and produces a present / partial / missing verdict per
surface, with file-level evidence so the resulting Jira backlog is
sized against reality, not boilerplate.

Method:
- Walked every file under `packages/angular/` and `packages/react/widgets/`.
- Counted lines + read imports to confirm framework-coupling boundaries.
- Confirmed `apps/demo-angular` exists but does NOT consume any future
  `markets-grid-angular`; it's a standalone trading dashboard.
- Read `docs/2026-05-08/architecture-and-design/ARCHITECTURE.md` for the
  layer model and the "every component is an app" contract.

---

## Section 1 — Workspace package inventory

### What exists on each framework side today

| Layer | React | Angular | Verdict |
|---|---|---|---|
| Foundation | `@starui/shared-types`, `@starui/design-system`, `@starui/icons-svg`, `@starui/ui` (shadcn primitives), `@starui/widget-sdk` | same — `@starui/design-system` already ships PrimeNG preset (see `apps/demo-angular/src/app/app.config.ts` ll. 4-7) | Present |
| Runtime | `@starui/runtime-port`, `@starui/runtime-browser`, `@starui/runtime-openfin`, `@starui/openfin-platform` | reuses identical vanilla packages | Present |
| Vanilla core | `@starui/core` (GridPlatform, ProfileManager, expression engine, persistence adapters, history stack — see `packages/shared/core/src/index.ts`) | reuses identical vanilla package | Present |
| Vanilla services | `@starui/component-host`, `@starui/config-service`, `@starui/data-services` | reuses identical vanilla packages | Present |
| Service DI shells | `@starui/host-wrapper-react`, `@starui/config-service-react`, `@starui/data-services-react` | `@starui/host-wrapper-angular` (134 LOC `HostService.ts`), `@starui/config-service-angular` (102 LOC `ConfigServiceClient.ts` + tested), `@starui/data-services-angular` (5 `inject-*` helpers) | **Present — Angular parity already shipped here.** |
| Operator tools | `@starui/config-browser` (react), `@starui/workspace-setup-react`, `@starui/config-editor-ui` | `@starui/config-browser-angular` (594 LOC, AG-Grid based) | Config browser parity ✓. Workspace setup + config-editor-ui have no Angular twin (out of scope for grid epic). |
| Grid React surface | `@starui/grid-react` (162 `.ts` + 250 `.tsx` files across `hooks/`, `modules/{9 modules}/`, `ui/{SettingsPanel,StyleEditor,FormatterPicker,ExpressionEditor,format-editor,ColorPicker,shadcn,PopoutPortal,Poppable,PortalContainer}`) | **Nothing.** No `@starui/grid-angular` exists. | **MISSING — biggest gap.** |
| Grid host component | `@starui/markets-grid` (`MarketsGrid.tsx` 1281 LOC + 18 sibling files: `FiltersToolbar`, `FormattingToolbar`, `SettingsSheet`, `ProfileSelector`, `HelpPanel`, `TemplateManager`, `DraggableFloat`, `useGridHost`, `streamSafeFloatingFilter[Dom]?` ×3, `formatter/*`, `formatterPresets`, `openfinViewProfile`, etc.) | **Nothing.** | **MISSING — primary deliverable.** |
| Demo apps | `apps/demo-react`, `apps/demo-configservice-react`, `apps/markets-ui-react-reference` | `apps/demo-angular` exists (38 files), but it's a standalone PrimeNG/Aura trading dashboard with raw `ag-grid-angular` widgets — does NOT mount any future `<stern-markets-grid>` | **Partial — host shell + theming wired, MarketsGrid integration missing.** |
| Generic widgets | `@starui/widgets-react` | `@starui/widgets-angular` — has `DataProviderEditor` (216+233+197+394 LOC = 1040 LOC across 4 files) and `DockConfigurator` (373+134+116 LOC = 623 LOC across 3 files), plus `field-inference.service` and `data-provider.service` | Two named widgets at parity. **No grid surface here.** |

### Key takeaways

1. **The Layer-1 / Layer-2 / Layer-3 vanilla foundation is fully shared.**
   The hard architectural work — extracting GridPlatform, ProfileManager,
   ConfigService, DataServices, RuntimePort to vanilla — already
   happened and Angular benefits for free.
2. **DI shells are already at parity.** `host-wrapper-angular`,
   `config-service-angular`, `data-services-angular` mirror their React
   siblings (with Signals + Observables instead of hooks). One unit-test
   suite already exists for `config-service-angular`.
3. **The entire `grid-react` + `markets-grid` surface needs an
   Angular sibling.** That's the actual scope of this epic.
4. **A `demo-angular` app exists** (38 source files) but consumes
   AG-Grid directly via `ag-grid-angular`, NOT through any abstraction.
   It can be evolved into the reference integration, not rebuilt.

---

## Section 2 — `@starui/grid-react` surface breakdown

`grid-react`'s public barrel exports **125 named symbols** (`packages/react/widgets/grid-react/src/index.ts`). These fall into 5
buckets — each bucket needs a different Angular strategy.

### 2a. Bucket A — Vanilla logic mistakenly living in `grid-react` (already React-free, just needs a different home)

These files import **zero React** today (verified by grep across
`packages/react/widgets/grid-react/src/modules/*/{state,transforms,treeOps,virtualColumn,composeGroups,resolveTemplates,snapshotTemplate,helpers,indicatorIcons,styleBridge,formattingActions,fieldSchema,gridOptionsSchema}.ts` — 0 matches for `from 'react'`).

| Module | Vanilla files (LOC) | React-coupled files |
|---|---|---|
| `general-settings` | `state.ts`, `fieldSchema.tsx`, `gridOptionsSchema.tsx` (fieldSchema is `.tsx` but only because it embeds Lucide icon JSX into the schema — pure data, no hooks); `index.ts` first 17 lines | `GridOptionsPanel.tsx` (267 LOC) |
| `column-templates` | `state.ts`, `resolveTemplates.ts`, `snapshotTemplate.ts`, full `index.ts` (66 LOC) | none — passive state holder |
| `column-customization` | `state.ts`, `transforms.ts`, `formattingActions.ts`, `index.ts` minus 5 lines | `ColumnSettingsPanel.tsx` + `editors/*.tsx` (≈1500 LOC) |
| `calculated-columns` | `state.ts`, `virtualColumn.ts`, `index.ts` minus 5 lines | `CalculatedColumnsPanel.tsx` (≈700 LOC) |
| `column-groups` | `state.ts`, `treeOps.ts`, `composeGroups.ts`, `index.ts` minus 5 lines | `ColumnGroupsPanel.tsx` (≈900 LOC) |
| `conditional-styling` | `state.ts`, `transforms.ts`, `indicatorIcons.ts`, `styleBridge.ts`, `index.ts` minus 5 lines (776 LOC of vanilla logic just shipped in PR #2) | `ConditionalStylingPanel.tsx` + `editor/*` (≈1200 LOC) |
| `grid-state` | `state.ts`, `helpers.ts`, full `index.ts` (90 LOC) | none |
| `saved-filters` | full `index.ts` (86 LOC) | none |
| `toolbar-visibility` | full `index.ts` (47 LOC) | none |

**Coupling shape:** every module's `index.ts` is 95% vanilla; the
React coupling is *just three lines per module-with-panel*:

```typescript
ListPane: ColumnSettingsList,
EditorPane: ColumnSettingsEditor,
SettingsPanel: ColumnSettingsPanel,
```

(See `conditional-styling/index.ts` ll. 713-715, `column-customization/index.ts` ll. 137-139, `column-groups/index.ts` ll. 160-162, `calculated-columns/index.ts` ll. 206-208, `general-settings/index.ts` l. 267.)

**Implication:** the "vanilla extraction" epic I originally sized at
47 SP is much smaller in real scope:

- No need to physically move files into a new package.
- Either:
  - **Option A (preferred)**: split each module barrel into
    `module.vanilla.ts` (everything except the 3 panel slots) +
    `panel.react.ts` (the 3 panel imports + a `withReactPanels()`
    helper that mixes them onto the vanilla module). Angular shell
    publishes an equivalent `withAngularPanels()` helper. One file
    add + one import-rewrite per module, no relocation.
  - **Option B**: physically move the vanilla files into a new
    `@starui/markets-grid-core` package. Loud refactor; touches every
    import in `grid-react`. Higher risk for negligible gain.

**Recommendation:** Option A. Cuts the vanilla-extraction epic from
47 SP to ~15 SP.

### 2b. Bucket B — React hooks (need Angular `inject()` twins)

| React hook (file) | Purpose | Angular twin |
|---|---|---|
| `useGridPlatform` (`hooks/GridProvider.tsx`) | reads the `GridPlatform` from React context | `GridPlatformService` (`@Injectable`) — needed |
| `useModuleState` (`hooks/useModuleState.ts`) | subscribes to a module slice | Signal-backed `moduleState<T>(id)` from `GridPlatformService` |
| `useGridApi` / `useGridEvent` (`hooks/useGridApi.ts`) | accesses AG-Grid API + subscribes to grid events | `inject(GridApiToken)` + RxJS `gridEvent$(name)` |
| `useProfileManager` (`hooks/useProfileManager.ts`) | profile-manager-as-hook surface | `ProfileManagerService` (already vanilla state machine; thin shell) |
| `useDirty` / `useDirtyCount` (`hooks/useDirty.ts`) | subscribes to DirtyBus | Signal-backed `dirty$(key)` |
| `useGridColumns` (`hooks/useGridColumns.ts`) | column list subscription | Signal-backed `columns()` |
| `useModuleDraft` (`hooks/useModuleDraft.ts`) | local draft buffer + undo/redo | needed for every Angular editor pane |
| `useUndoRedo` (`hooks/useUndoRedo.ts`) | thin shell over `@starui/core`'s `HistoryStack` | direct use of `HistoryStack` (already vanilla) |

**Coverage:** the underlying vanilla state machines all live in
`@starui/core` (`GridPlatform`, `ProfileManager`, `DirtyBus`,
`HistoryStack`). The hooks are pure adapters. Angular twins are short
files — ~30-60 LOC each — that subscribe via `signal()` or
`new Observable()`. Total ≈ 8 files, ~400 LOC.

### 2c. Bucket C — UI primitives (SettingsPanel + StyleEditor + format-editor + ColorPicker + ExpressionEditor + Poppable/PopoutPortal/PortalContainer)

LOC counts (excluding tests):

| Primitive cluster | Files | LOC |
|---|---:|---:|
| `SettingsPanel/` (Cockpit, CockpitList, DirtyDot, IconInput, PillToggleGroup, SettingsRow, SummaryChip, TabStrip, ItemCard, FigmaPanelSection, ObjectTitleRow, PairRow, PanelChrome, TitleInput, SubLabel, GhostIcon) | 16 | 1227 |
| `StyleEditor/` (StyleEditor.tsx + 4 sections) | 5 | ~600 |
| `FormatterPicker/` (FormatterPicker.tsx) | 1 | 1002 |
| `format-editor/` (FormatPopover, FormatDropdown, FormatColorPicker, registerPopoverRoot, defaultSideSpec) | ~5 | ~700 |
| `ColorPicker/` (CompactColorField) | 1 | ~200 |
| `ExpressionEditor/` (Monaco-based; ExpressionEditor + Inner + Fallback + HelpOverlay + Palette + completions/diagnostics/language/keyBridges/deletion/editorDom/editorOptions/etc.) | 19 | ≈2500 |
| `PopoutPortal.tsx`, `Poppable.tsx`, `PortalContainer.tsx` | 3 | ≈500 |
| `shadcn/` (carved-out copy of shadcn primitives used by panels) | 12+ | ≈1500 |
| **UI total** | **62 files** | **≈8230 LOC** |

The shadcn carve-out is React-only; Angular consumers will use PrimeNG
equivalents (already themed via `@starui/design-system/primeng` — see
`apps/demo-angular/src/app/app.config.ts`). One PrimeNG primitive per
shadcn primitive isn't 1-to-1 — `IconInput`, `PillToggleGroup`,
`SettingsRow`, `SummaryChip`, `DirtyDot`, `LedBar`, `Caps`, `Mono`,
`Stepper`, `Band`, etc. are custom-built MarketsUI primitives that
need a hand-port.

**Verdict per primitive cluster:**

| Cluster | Reuse path | Verdict |
|---|---|---|
| `SettingsPanel/` custom primitives | Pure hand-port to Angular standalone components. Most are tiny (24-130 LOC) and have no React semantics beyond style + click handlers. | **Missing — hand-port** |
| `StyleEditor/` | Hand-port. Internal state can move to a vanilla `StyleEditorState` class if we want to reuse with Angular. | **Missing — hand-port + extract state** |
| `FormatterPicker/` | The catalog (`formatterPresets.ts`) is already vanilla and shared. The picker UI is React-specific; hand-port. | **Missing — hand-port (logic vanilla already)** |
| `format-editor/` | Hand-port; uses CSS + small popover state. | **Missing — hand-port** |
| `ColorPicker/CompactColorField` | Hand-port; or wrap PrimeNG `p-colorPicker` if it can match the chrome. **Spike needed.** | **Missing — spike + port** |
| `ExpressionEditor/` Monaco editor | Monaco is framework-agnostic; we mount it through a different host (`monaco-editor-core` API directly). React-specific bits are just lifecycle wiring. The hard work (completions, diagnostics, language, keyBridges, palette, help overlay) is in `*.ts` files that are React-free. | **Largest port; ~half the LOC is reusable as-is** |
| `PopoutPortal` + `Poppable` + `PortalContainer` | `window.open` + DOM portal logic. The DOM piece can be lifted to vanilla; React-specific React Portal API needs an Angular `@angular/cdk/portal` equivalent. | **Missing — hand-port using CDK** |
| `shadcn/` carve-out | NOT needed for Angular. PrimeNG fills the role. | n/a |

### 2d. Bucket D — Panel components

The 5 module panels with master-detail surfaces are the biggest unit
of work. From the file inventory:

| Module panel | React LOC | Complexity drivers |
|---|---:|---|
| `column-customization/ColumnSettingsPanel.tsx` + `editors/*` | ≈1500 | Largest. ColumnMetaStrip, HeaderBand, Row, sub-editors. Reducers are vanilla. |
| `conditional-styling/ConditionalStylingPanel.tsx` + `editor/*` | ≈1200 | RuleMetaStrip, FlashBand, IndicatorBand, predicate input, swatches |
| `column-groups/ColumnGroupsPanel.tsx` | ≈900 | Tree editor + drag/drop |
| `calculated-columns/CalculatedColumnsPanel.tsx` | ≈700 | Embeds ExpressionEditor |
| `general-settings/GridOptionsPanel.tsx` + `fieldSchema.tsx` | ≈700 | Schema-driven; schema is vanilla |
| **Panel total** | **≈5000 LOC** | |

For Angular: each panel is one standalone component (or a small
component tree) + form bindings using Reactive Forms or signal-based
state. The same vanilla module state + reducers drive them. Estimated
Angular LOC ≈ 1.0-1.2× React LOC (template + class are roughly equal,
RxJS state ≈ hooks state).

### 2e. Bucket E — `markets-grid` host chrome

Files under `packages/react/widgets/markets-grid/src/`:

| File | LOC | Purpose | Angular equivalent strategy |
|---|---:|---|---|
| `MarketsGrid.tsx` | 1281 | Main host component | `MarketsGridComponent` standalone |
| `FiltersToolbar.tsx` | ≈700 | Saved-filter pill carousel + actions | Hand-port |
| `FormattingToolbar.tsx` | ≈600 | Pinned + draggable floating toolbar | Hand-port |
| `SettingsSheet.tsx` | ≈400 | Cockpit drawer host | Hand-port |
| `ProfileSelector.tsx` | ≈500 | Dropdown w/ rename/clone/import/export | Hand-port |
| `HelpPanel.tsx` | ≈300 | Help overlay | Hand-port |
| `TemplateManager.tsx` | ≈300 | Template inline manager | Hand-port |
| `DraggableFloat.tsx` | ≈200 | Draggable float wrapper | CDK drag-drop |
| `useGridHost.ts` | ≈400 | Internal hook orchestrating grid lifecycle | Migrate to `GridHostController` (vanilla) + thin Angular service |
| `streamSafeFloatingFilter[Dom]?.ts` (×3) | ≈800 combined | Custom AG-Grid floating filter that survives row stream churn | **Same DOM logic for both shells**, swap React renderer for `IFloatingFilterAngularComp` |
| `formatter/*` (Formatter.tsx, modules/, primitives.tsx, state.ts) | ≈1400 | The Formatter sub-tool (Context · Type · Format · Paint · Clear · Library) | Largest sub-port. State (`formatter/state.ts`) is already vanilla. |
| `formatterPresets.ts` | ≈300 | Preset catalog | Already vanilla; reused as-is |
| `filtersToolbarLogic.ts` | ≈200 | Pure-logic helpers (`generateLabel`, `doesRowMatchFilterModel`, etc.) | Already vanilla; reused as-is |
| `openfinViewProfile.ts` | ≈100 | OpenFin profile source helper | Already vanilla |
| `grid-chrome.css`, `styles/marketsGrid.css`, `HelpPanel.css`, `ProfileSelector.css` | n/a | CSS | Reused as-is |
| `types.ts`, `index.ts` | 384 | Public surface | Hand-port shape; types already vanilla |
| **`markets-grid` total** | **≈8000 LOC** | | |

---

## Section 3 — `apps/demo-angular` status

**Files:** 38 (`src/app/widgets/*.widget.ts` × 28, services × 4, app
shell × 4, tailwind/angular config).

**Wired:**
- `@angular/core` 21.1.0, `ag-grid-angular` 35.1.0, `primeng` 21.1.5
- `@starui/design-system` PrimeNG preset (`app.config.ts`)
- Direct `AgGridAngular` usage in every `*.widget.ts`
- `SharedStateService`, `TradingDataService`, custom cell renderers,
  custom `fiGridTheme` from `@starui/design-system/adapters/ag-grid`

**Not wired:**
- No `@starui/markets-grid-angular` package to consume (doesn't exist)
- No `@starui/grid-react`-equivalent panels
- No profile management
- No saved filters / formatting toolbar / settings sheet / column customizer
- `LicenseManager.setLicenseKey('')` on every widget — license wiring deferred

**Reuse path:** `demo-angular` evolves into the reference integration
once `markets-grid-angular` lands. The trading dashboard widgets stay
as auxiliary screens; the order-blotter widget can be retrofitted to
mount `<stern-markets-grid>` once available.

---

## Section 4 — What's NOT in scope (called out explicitly)

These are not gaps; they're scope-fences for the epic.

1. **`@starui/widget-sdk` and `@starui/component-host`** — vanilla, fully reused, no Angular work needed.
2. **`@starui/runtime-*` and `@starui/openfin-platform`** — vanilla, fully reused.
3. **`@starui/config-browser-angular`** — already shipped (594 LOC). Stays as-is; not part of MarketsGrid epic.
4. **`@starui/widgets-angular` DockConfigurator + DataProviderEditor** — already shipped. Not MarketsGrid concern.
5. **`@starui/workspace-setup-react`** — no Angular twin exists, not in this epic's scope (separate operator-tooling track).
6. **`@starui/config-editor-ui`** — same.
7. **`apps/markets-ui-react-reference`** — there's no corresponding "markets-ui-angular-reference" planned in this epic.

---

## Section 5 — Risks now grounded in evidence

| Risk | Evidence | Severity |
|---|---|---|
| Monaco in Angular has historically been finicky | `ExpressionEditor` ships 19 files ≈ 2500 LOC, most vanilla. The React-specific bit is the Monaco mount + lifecycle. Angular has `ngx-monaco-editor-v2` but it lags; we may need direct `monaco-editor-core` integration through a standalone component. Spike before sizing. | **High — top risk** |
| Drag-drop chrome (`FormattingToolbar` floating mode, `DraggableFloat`, column-group tree) | React side uses bespoke pointer-event handlers; `@angular/cdk/drag-drop` is mature but APIs differ. | **Medium** |
| Custom shadcn primitives lack PrimeNG twins | `IconInput`, `PillToggleGroup`, `SummaryChip`, `DirtyDot`, `LedBar`, `SettingsRow`, `Caps`, `Mono`, `Band`, `MetaCell`, `Stepper` — all custom MarketsUI primitives, no PrimeNG counterpart. Hand-ports required. | **Medium — bulk port work** |
| Conditional styling's DOM watcher interacts with AG-Grid header DOM | Per PR #2: differential class mutations on `.ag-header-cell` outside Angular's change-detection awareness. Needs `runOutsideAngular` wrapping or zoneless verification. | **Low — recipe known** |
| `streamSafeFloatingFilter` rendering | React uses `IFloatingFilterReactComp`; Angular needs `IFloatingFilterAngularComp`. The pure DOM/state piece (`streamSafeFloatingFilterDom.ts`) is already framework-agnostic so it can be reused. | **Low** |
| Schema migrations (e.g. PR #2's `flashDuration` → `durationMs`) | Tests live in `grid-react`'s vitest suite. If logic stays in `grid-react` under bucket-A Option-A, the tests stay where they are. Angular shell calls the shared deserializer. | **Low** |
| Profile-snapshot byte-for-byte round-trip between shells | Same serializer (vanilla). Easy to enforce via a golden-file test. | **Low** |
| `ag-grid-angular` v35 with zoneless change detection | `apps/demo-angular` uses zoneless and AG-Grid 35.1.0 already — works in the existing demo. | **Low — already proven** |

---

## Section 6 — Revised sizing (replaces the over-engineered backlog)

Now that the gaps are evidence-based:

| Epic | Title | Revised SP | Original SP | Delta |
|---|---|---:|---:|---:|
| A | Module barrel split (Option A) — vanilla / React adapter | **15** | 47 | −32 |
| B | `@starui/markets-grid-angular` skeleton + host component + DI services | **30** | 34 | −4 |
| C | Settings cockpit & panel primitives (Angular hand-port of `SettingsPanel/`) | **34** | 29 | +5 |
| D | Module panels × 5 + shared editors (StyleEditor, FormatterPicker, ExpressionEditor in Angular) | **89** | 89 | 0 |
| E | Host chrome (FiltersToolbar, FormattingToolbar, ProfileSelector, SettingsSheet, HelpPanel, Formatter) | **55** | 42 | +13 |
| F | AG-Grid Angular integration polish (floating filters, theme, header DOM, license) | **24** | 24 | 0 |
| G | `apps/demo-angular` MarketsGrid integration (evolve existing demo, not rebuild) | **13** | 24 | −11 |
| H | Test infra, e2e, docs, release pipeline | **31** | 31 | 0 |
| | **Total** | **291** | **320** | **−29** |

Net change is small (−29 SP), but the **shape** changes materially:

- Epic A cratered from 47 to 15 SP because the vanilla logic is
  already React-free; we only need a barrel-split, not a package move.
- Epic C grew because the unique MarketsUI primitives (no PrimeNG
  twin) need hand-ports.
- Epic E grew because the Formatter sub-tool was missed in the
  original sizing — it's ≈1400 LOC of React under `markets-grid/src/formatter/`.
- Epic G shrank because `apps/demo-angular` already exists and
  doesn't need to be scaffolded from zero.

---

## Section 7 — Open questions before drafting the Jira backlog

1. **Monaco in Angular** — does the org standard pin a wrapper, or do
   we direct-mount? **Resolution needed before sizing Epic D-3 final.**
2. **PrimeNG version skew** — `apps/demo-angular` corporate registry
   is on PrimeNG 21.1.5 with `@primeng/themes` 20.3.0 (`package.json`
   `//dependencies-registry-notes`). Are we comfortable building all
   new Angular widgets against that pin, or do we need a forward-compat
   spike?
3. **License keys** — `LicenseManager.setLicenseKey('')` is currently
   stubbed across every Angular widget. Story to resolve in Epic F or
   centrally?
4. **`grid-react` rename** — if Angular consumers will import vanilla
   logic from `@starui/grid-react`, that's framework-misleading. Do we
   rename to `@starui/grid` and let React/Angular shells live in
   `grid-react` / `grid-angular` subpackages? Or keep the asymmetric
   name? Affects every Jira story description.
5. **Demo parity vs. demo isolation** — should the Angular demo aim
   for **byte-identical profile round-trip** with the React demo
   (requires shared snapshot), or just **feature parity** (each demo
   can write its own profiles)? Affects Epic G scope.

Resolve these in a 30-minute sync, then I can rewrite the backlog
file with concrete, sized stories — this time grounded in the evidence
above instead of the over-engineered first pass.

# MarketsGrid UI parity track — preservation-first backlog

Execution backlog for **Track B** of the strangler plan
([`MARKETSGRID_V2_STRATEGY.md`](./MARKETSGRID_V2_STRATEGY.md) §2.5). Complements the
data-spine rewrite (Track A) without touching UI surfaces wholesale.

**Charter (non-negotiable):**

1. **Zero feature regression** — every shipped UI capability keeps the same
   functionality, interaction behaviour, and look-and-feel.
2. **Extend in place** — new work adds bands, modules, toolbar segments, or engine
   hooks under existing package paths. No parallel toolbar, no second settings
   sheet, no “v2 customizer” tree.
3. **Current design system only** — `@starui/design-system` tokens (`--bn-*` /
   `--fi-*`), `@starui/ui` shadcn primitives, `ChromeButton` / `SettingsPanel`
   cockpit patterns. No hardcoded hex, no native `<input>` / `<textarea>` /
   `<select>`, no third-party UI kit.

**Related docs:**

| Document | Role |
|----------|------|
| [`MARKETSGRID_V2_STRATEGY.md`](./MARKETSGRID_V2_STRATEGY.md) | Spine strangler; UI rewrite explicitly forbidden |
| [`MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md`](./MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md) | Product parity matrix + P0–P3 backlog |
| [`current-features.md`](./current-features.md) | Granular inventory of shipped UI |
| [`E2E_STATUS.md`](./E2E_STATUS.md) | Playwright baseline |
| [`PARITY.md`](./PARITY.md) | Legacy migration parity (not product parity) |

---

## 1. Preservation gates (every UI PR)

No UI change merges unless **all** gates pass.

### 1.1 Functionality

- Existing module state round-trips through profile save/load (memory,
  localStorage, ConfigService).
- Formatter toolbar ↔ column-settings ↔ conditional-styling ↔ calculated-columns
  cross-edits remain consistent (no silent field drops on save).
- OpenFin popout toolbar: same graph as inline; dialogs portal into popout
  document (`Poppable` / `PopoutPortal`).

### 1.2 Behaviour

- Draft/save cockpit pattern preserved (`useModuleDraft` — local draft, SAVE
  pill commits).
- Settings sheet: grouped menubar navigation, deferred module mount,
  progressive Grid Options band mounting (`requestIdleCallback` sweep).
- Keyboard shortcuts (plus/minus, letter shortcuts, QuickSearch Escape/✕,
  editing toolbar) unchanged unless explicitly extended with new tests.
- Theme flip (`data-theme` on `<html>`) — all surfaces render in dark **and**
  light.

### 1.3 Look-and-feel

- Token resolution only — run `tools/scripts/check-ds-tokens.ts` on touched CSS.
- Toolbar layout: flat labeled clusters, hairline separators, **no** boxed
  button groups (formatter + editing toolbars).
- Settings panels: `Band` / `Row` / `LedBar` / `Caps` / `Mono` cockpit chrome
  from `customizer/ui/SettingsPanel`.
- AG Grid chrome: parameter-based theming via `theme.withParams`; density pill
  presets (Ultra / Compact / Comfortable).

### 1.4 Automated regression

| Suite | Command / path | Scope |
|-------|----------------|-------|
| Unit | `npm test --workspace=@starui/grid` | Module reducers, formatter hooks, transforms |
| Unit | `npm test --workspace=@starui/engine` | Expression engine, profile reducers |
| E2e | `npm run e2e` — all `e2e/v2-*.spec.ts` | UI interaction + profile persistence |
| Lab | `npm run dev:markets-grid-lab` | Scenario cards per feature tab |
| Visual | `e2e/visual-reference-capture.spec.ts` | Popout + design-system snapshots |

**Before/after rule:** any refactor touching a module panel or toolbar must add
or extend a characterisation test (`MarketsGrid.characterisation.test.tsx`,
`FormattingToolbar.test.tsx`, or matching `e2e/v2-*` spec) that locks the
observable behaviour being preserved.

---

## 2. Frozen UI inventory (do not rewrite)

Complete map of surfaces that **must survive** Track A spine work unchanged in
user-visible terms. Track B **extends** these paths only.

### 2.1 Widget chrome (`packages/react-grid/grid/src/widget/`)

| Surface | Primary files | Preservation notes |
|---------|---------------|-------------------|
| Primary toolbar | `PrimaryToolbar.tsx`, `PrimaryToolbarOverflowMenu.tsx`, `GridDensityPill.tsx` | Caption, settings toggle, editing pencil, overflow ⋯, theme toggle, toolbar date |
| Quick search | `QuickSearch.tsx` | Hover-expand, pin, `quickFilterText` wiring |
| Auto format | `AutoFormatButton.tsx` | Catalog plan, overwrite mode, check flash |
| Filters toolbar | `FiltersToolbar.tsx`, `filtersToolbarLogic.ts` | Pills, saved filters, expression filter |
| Formatting toolbar | `FormattingToolbar.tsx`, `formatter/*` | Inline + popout; Scope/Type/Paint/Format/Templates/Clear |
| Editing toolbar | `editingToolbar/EditingToolbar.tsx`, `*ToolbarBody.tsx` | Unified row, segment gating, keyboard menu |
| Settings sheet | `LazySettingsSheet.tsx`, `SettingsSheet.tsx`, `SettingsModuleMenubar.tsx` | Drawer, menubar categories, deferred open |
| Profile UI | `ProfileSelector.tsx`, `TemplateManager.tsx`, `UnsavedSwitchDialog.tsx` | Create/rename/delete, dirty guard |
| Help | `HelpPanel.tsx`, `help/*` | Overview, expressions, Excel, trading, traffic-light, emoji |
| Banners | `StaleDataBanner.tsx`, `HistoricalViewBanner.tsx` | Staleness + historical mode |
| Popout shell | `DraggableFloat.tsx`, `customizer/ui/Poppable.tsx`, `PopoutPortal.tsx` | OpenFin frameless, alwaysOnTop |
| Context menu | `gridContextMenu.ts` | Settings + Remove from Grid prepended items |

### 2.2 Formatter modules (`widget/formatter/modules/`)

| Module | File | Role |
|--------|------|------|
| Context | `ModuleContext.tsx` | Applied-column summary |
| Type | `ModuleType.tsx` | Data-type picker |
| Paint | `ModulePaint.tsx` | Cell colours |
| Format | `ModuleFormat.tsx` | Format string + presets |
| Library | `ModuleLibrary.tsx` | Preset library |
| Editor filter | `ModuleEditorFilter.tsx` | Column target |
| Clear | `ModuleClear.tsx` | Clear selected / all dialogs |

Hooks: `formattingToolbarHooks.ts`, `formatter/useFormatterActions.ts`,
`formatter/useFormatterSelection.ts`, `formatter/useFormatterTemplates.ts`.

### 2.3 Customizer modules (`customizer/modules/`)

| Module ID | Panel / toolbar | Key files |
|-----------|-----------------|-----------|
| `general-settings` | Grid Options | `GridOptionsPanel.tsx`, `gridOptionsSchema.tsx` (~92 controls, progressive mount) |
| `column-templates` | Column Templates | `ColumnTemplatesPanel.tsx` |
| `column-customization` | Column Settings | `ColumnSettingsPanel.tsx`, `editors/*` (10 bands), `CellRendererEditors/*` |
| `conditional-styling` | Conditional Style | `ConditionalStylingPanel.tsx`, `editor/*` (flash, animate, indicator) |
| `calculated-columns` | Calculated Columns | `CalculatedColumnsPanel.tsx` |
| `column-groups` | Column Groups | `ColumnGroupsPanel.tsx` |
| `alerts` | Alerts | `AlertsPanel.tsx` |
| `saved-filters` | Saved Filters | `SavedFiltersPanel.tsx` |
| `smart-edit` | Smart Edit | `SmartEditPanel.tsx`, `SmartEditToolbarBody.tsx` |
| `bulk-update` | Bulk Update | `BulkUpdatePanel.tsx`, `BulkUpdateToolbarBody.tsx` |
| `plus-minus` | Plus/Minus | `PlusMinusPanel.tsx` |
| `shortcuts` | Shortcuts | `ShortcutsPanel.tsx` |
| `data-change-history` | Edit History | `DataChangeHistoryPanel.tsx`, `EditHistoryToolbarBody.tsx` |
| `visual-excel` | Visual Excel | `VisualExcelPanel.tsx` |
| `toolbar-visibility` | Toolbar Visibility | `ToolbarVisibilityPanel.tsx` |
| `toolbar-date-settings` | Custom Settings (date) | `ToolbarDateSettingsPanel.tsx`, `ProviderGridHostSection.tsx` |
| `grid-state` | (runtime capture) | `grid-state/index.ts` |

### 2.4 Shared customizer UI (`customizer/ui/`)

| Primitive | Path | Used by |
|-----------|------|---------|
| Settings cockpit | `SettingsPanel/*` | All module panels |
| Style editor | `StyleEditor/*` | Conditional styling, column customization |
| Formatter picker | `FormatterPicker/*` | Column settings band 06, toolbar |
| Expression editor | `ExpressionEditor/*` | Calculated columns, alerts, filters |
| Color picker | `ColorPicker/*` | Style editor, flash bands |
| Theme hook | `hooks/useActiveThemeMode.ts` | Dark/light variant resolution |

### 2.5 Design-system contract

| Rule | Enforcement |
|------|-------------|
| Colours, spacing, typography | `--bn-*` / `--fi-*` or `@starui/design-system/tokens/semantic` |
| Controls | `@starui/ui` shadcn (`Button`, `Select`, `Drawer`, `Dialog`, …) |
| Cell renderers | `@starui/design-system/cell-renderers-registry` |
| Chrome buttons | `ChromeButton` (legacy `.ds-*` / `.fx-*` resets) |
| AG Grid theme | `useGridTheme` + `theme.withParams` from design-system adapters |
| CSS splits | `styles/core.css` (tokens), `styles/chrome.css` (toolbar layout), `grid-chrome.css` |

**Forbidden in UI PRs:** new colour hex literals, native form controls, alternate
component libraries, per-panel one-off styling that bypasses tokens.

---

## 3. E2e preservation matrix

Every row is a **must-stay-green** gate when spine or engine work touches the
grid. Extend this table when new e2e specs land; never delete without replacing
coverage.

| E2e spec | UI surface locked |
|----------|-------------------|
| `v2-formatting-toolbar` | Formatter toolbar inline + presets |
| `v2-popout-toolbar` | Popout formatter parity |
| `v2-popout-design-system` | Token/theming in popout window |
| `v2-popout-window` | OpenFin popout lifecycle |
| `v2-filters-toolbar` | Filter pills + saved filters |
| `v2-settings-panels` | Settings sheet navigation |
| `v2-general-settings` | Grid Options bands |
| `v2-column-customization` | Column Settings 10 bands |
| `v2-conditional-styling` | Rules, flash, animate |
| `v2-calculated-columns` | Virtual column editor |
| `v2-column-groups` | Group layout |
| `v2-column-templates` | Template library |
| `v2-cell-renderer` | Renderer picker + config |
| `v2-alerts` | Alert rules + channels |
| `v2-editing-family` | Full editing stack |
| `v2-smart-edit` / `v2-bulk-update` / `v2-edit-history` / `v2-plus-minus` / `v2-shortcuts` | Per-module editing |
| `v2-editing` | Unified editing toolbar |
| `v2-expression-editor` | Monaco DSL completions |
| `v2-autosave` | Profile autosave |
| `v2-profile-lifecycle` | Create/rename/switch |
| `v2-profile-isolation-*` | Multi-grid profile isolation |
| `v2-template-create-apply` | Template manager |
| `v2-two-grid-isolation` | Side-by-side grids |
| `v2-row-exclusion` | Toolbar date historical exclusion |
| `v2-perf` | Perf budget smoke |

**Lab mirror:** `apps/demos/markets-grid-lab` — each tab has scenario cards that
patch live row data. Any module change must be exercisable from its lab tab
(see `labFeatureConfigs.ts`).

---

## 4. Gap backlog → extension map

Items from [`MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md`](./MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md) §8,
mapped to **where to extend** (never replace). Effort bands: S &lt; 1 week, M 1–4
weeks, L &gt; 4 weeks.

### 4.1 P0 — next quarter

| # | Feature | Effort | Extend here | Preservation requirements |
|---|---------|--------|-------------|---------------------------|
| P0-1 | Direction-aware flashing module (UP/DOWN/Neutral) | M | **Option A:** new `flashing` module under `customizer/modules/` **or** **Option B:** extend `conditional-styling/editor/FlashBand.tsx` with column-scoped presets | Existing per-rule flash (palette, keyframes, oneShot/pulse, cell/row/header targets) must behave identically; add e2e in `v2-conditional-styling` |
| P0-2 | Alert extensions (aggregation limits, validation rollback, auto-jump, `AlertFired` event) | M | `alerts/AlertsPanel.tsx`, `alerts/index.ts` runtime, `MARKETS_GRID_EVENT_CATALOG` | Existing data/relative/row-change triggers + toast/bell/OpenFin channels unchanged; extend `e2e/v2-alerts` |

**Already shipped (preserve, document only):** Visual Excel, alerts P0 triggers,
Smart Edit family, styled columns — see gap analysis strikethroughs.

### 4.2 P1 — 2-quarter horizon

| # | Feature | Effort | Extend here | Preservation requirements |
|---|---------|--------|-------------|---------------------------|
| P1-6 | Pivot layout customizer | L | **New module** `customizer/modules/pivot-layout/` + panel; wire via `general-settings` or own menubar entry; engine state in `@starui/engine` | Do not alter existing `column-groups` or row-grouping band behaviour |
| P1-7 | Grand total rows + weighted averages | M | `general-settings/gridOptionsSchema.tsx` (aggregation bands) + `calculated-columns` for weighted defs | Existing aggFunc picker in `RowGroupingEditor.tsx` unchanged |
| P1-8 | Action columns | M | `column-customization/editors/CellRendererBand.tsx` — new action-column renderer + editor in `CellRendererEditors/` | Existing renderers (Pill, Heatmap, Sparkline, …) unchanged |
| P1-9 | Charting from selection | M | New `charting` module or `PrimaryToolbar` segment; Recharts; profile blob | Toolbar layout rules preserved (overflow vs inline) |
| P1-10 | Data validation UI | M | `alerts` (PreventEdit path) + `smart-edit` apply guard + `bulk-update` preview | Editing journal undo/redo semantics unchanged |
| P1-11 | Quick Search highlight + as-filter mode | S | `QuickSearch.tsx` + optional `saved-filters` integration | Current hover-expand / Escape / ✕ behaviour preserved |
| P1-12 | Grid filter (expression-based) | M | `saved-filters` panel or new band in filters toolbar; reuse `ExpressionEditor` | `FiltersToolbar` pill UX unchanged for existing saved filters |
| P1-13 | Status bar customizer | M | **New module** `status-bar` + AG Grid status panel component; menubar under Options | No change to primary toolbar height/layout defaults |

### 4.3 P2 — 3+ quarter horizon

| # | Feature | Effort | Extend here | Preservation requirements |
|---|---------|--------|-------------|---------------------------|
| P2-14 | AdaptableQL-class expressions | L | `@starui/engine` `ExpressionEngine` + `ExpressionEditor/completions.ts` | Existing per-row DSL expressions evaluate identically — migration tests |
| P2-15 | Aggregated calculated columns | M | `calculated-columns/` after P2-14 | Virtual column list UI pattern unchanged |
| P2-16 | Master-detail | M | `general-settings` + `MarketsGridSurface` detail grid options | Streaming `applyTransactionAsync` path unchanged |
| P2-17 | Reports + scheduling | L | New module + `PrimaryToolbar` export menu extension | Visual Excel export path preserved |
| P2-18 | Data validation (pre/client/server hooks) | M | `smart-edit`, `bulk-update`, column `CellEditorBand` | |
| P2-19 | Import rows wizard | M | `PrimaryToolbar` or admin actions; shadcn `Dialog` wizard | |
| P2-20 | Team sharing UI | M | `ProfileSelector.tsx` + `@starui/host-config` adapter UI | Local profile CRUD unchanged |
| P2-21 | FDC3 mapping config UI | M | `toolbar-date-settings` Custom Settings or new host module | |
| P2-22 | Expression editor QoL | M | `ExpressionEditor/` Monaco layer | Completions additive only |
| P2-23 | Tool panel / column menu / context menu slots | M | `gridContextMenu.ts`, `MarketsGridProps` slot API, `@starui/widget-sdk` | Existing Settings + Remove items remain first |

### 4.4 P3 — lower priority

| # | Feature | Extend here |
|---|---------|-------------|
| P3-24 | Notes (per-cell) | New `notes` module + cell renderer overlay |
| P3-25 | Comments (team) | Depends P2-20; new module |
| P3-26 | Free text columns | `calculated-columns` or column-customization band |
| P3-27 | Row forms | New module + `EditingToolbar` or context menu entry |
| P3-28 | Schedules + reminders | Host service + alerts module extension |
| P3-29 | Named queries `QUERY()` | `ExpressionEngine` + calculated-columns picker |
| P3-30 | Layout wizard | Rebrand `SettingsSheet` onboarding flow — same panels |
| P3-31 | Permissions UI | `toolbar-visibility` + ConfigService gating |

### 4.5 Explicitly NOT implementing

Per gap analysis §8.5 — do not spend Track B budget here: AdapTable No Code,
transposing, tree data, server-side AdaptableQL, ipushpull, Vue.

---

## 5. Per-item delivery checklist

Copy into every Track B PR description.

```markdown
## UI parity PR checklist

- [ ] **Extend only** — no files deleted/replaced wholesale in `widget/` or `customizer/`
- [ ] **Design system** — tokens + `@starui/ui`; `check-ds-tokens` clean on touched CSS
- [ ] **Dark + light** — manually verified under `[data-theme="dark"]` and `light`
- [ ] **Profile round-trip** — new state survives save/load/autosave
- [ ] **Formatter ↔ settings** — cross-surface edits consistent (if touching formatting)
- [ ] **Popout** — if toolbar/sheet dialogs: verified in popout window (OpenFin or lab)
- [ ] **Tests** — unit + e2e extended (not just happy path)
- [ ] **Lab** — scenario card added/updated in markets-grid-lab
- [ ] **current-features.md** — bullet added/updated same PR
- [ ] **No spine coupling** — PR does not require Track A protocol/controller changes
```

---

## 6. Interaction with Track A (spine)

| Track A change | Allowed UI impact |
|----------------|-------------------|
| `GridDataController` extraction | None visible — wiring move only |
| Hub protocol / reconnect | Banner text timing only (`StaleDataBanner`) |
| `RowChangeBus` delta engine | Module **runtime** faster; panels unchanged |
| Profile schema v2 envelope | Transparent migration; module blob shapes stable |
| Deprecate `useBlotterDataConnection` | No customizer/toolbar changes |

If a spine PR touches any file under `widget/` or `customizer/ui/`, it requires
**explicit UI parity review** and full `e2e/v2-*` run.

---

## 7. Suggested execution order

Prioritize items that **add** capability without risking existing surfaces:

1. **P0-2** alert extensions (isolated module runtime)
2. **P1-11** quick search highlight (small `QuickSearch.tsx` delta)
3. **P0-1** flashing (extend conditional-styling before new module)
4. **P1-10** validation UI (wires existing editing + alerts)
5. **P1-12** expression grid filter (reuses `ExpressionEditor`)
6. **P1-6** pivot layout (large — only after preservation gates proven on smaller items)

Parallel: keep all `e2e/v2-*` green on every `feature/worker-publish` merge.

---

## 8. Document history

| Date | Change |
|------|--------|
| 2026-06-17 | Initial Track B backlog — preservation charter, frozen inventory, gap map, gates |

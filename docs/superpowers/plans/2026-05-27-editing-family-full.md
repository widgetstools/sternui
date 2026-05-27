# Editing Family — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship **full AdapTable §4.7 editing parity** as modular, profile-configurable MarketsGrid customizer modules — with cell-patch **undo/redo**, validation-aware previews, and a complete **markets-grid-lab** curriculum — with **zero regression** to existing grids, themes, toolbars, or behaviour.

**Status:** Phase 0 (**Smart Edit P0**) is **shipped** on branch `feat/smart-edit-family` (core × ÷ + − Set, K/M/B parser, +/- keys, opt-in toolbar, lab tab). This plan covers **Phases 1–7** to reach full parity.

**Architecture:** Mirror the **alerts module split**: framework-agnostic logic in `@starui/engine`, React surfaces in `@starui/grid`. **No new packages.** Angular 21 later consumes engine exports from `@starui/grid-angular`.

**Tech stack:** `@starui/engine`, `@starui/grid`, `@starui/ui` (shadcn only), `@starui/design-system` tokens, AG Grid Enterprise 33+, Vitest, Playwright, markets-grid-lab `LabFeatureTab`.

**Parity target:** AdapTable §4.7 Editing — **~55% → ~85%** weighted (Smart Edit family + Bulk Update + Plus/Minus + Shortcuts + Change History UI; validation hooks stubbed for alerts integration in a follow-on PR).

**Supersedes:** Extends [`2026-05-27-smart-edit-family.md`](./2026-05-27-smart-edit-family.md) — keep that doc as Phase 0 record; execute remaining work from **this** plan.

---

## Module map (modular, configurable)

AdapTable ships **four editing modules + change history**. We implement **five customizer modules + one shared engine layer**:

| Module ID | Code | Priority | Toolbar prop | Purpose |
|-----------|------|----------|--------------|---------|
| `editing-core` | — | — | — | **Engine-only** shared types, patch builder, preview/validation ports, single-column guard |
| `smart-edit` | `06` | 22 | `showSmartEditToolbar` | × ÷ + −, custom ops, preview, K/M/B parser (existing P0 + Phase 1 extensions) |
| `bulk-update` | `07` | 23 | `showBulkUpdateToolbar` | Replace N cells in one column (text / number / date), column value dropdown |
| `plus-minus` | `08` | 24 | — (keyboard only) | Nudge rules: scope, expression, per-rule step |
| `shortcuts` | `09` | 25 | — (keyboard only) | Letter keys → Add/Subtract/Multiply/Divide + operand |
| `data-change-history` | `10` | 26 | `showEditHistoryToolbar` | Cell-patch journal, undo/redo, monitor panel, suspend |

**Module registration order in `DEFAULT_MODULES` (append-only, never reorder existing):**

```
… conditionalStylingModule (21)
  smartEditModule          (22)  ← shipped P0
  bulkUpdateModule         (23)
  plusMinusModule          (24)
  shortcutsModule          (25)
  dataChangeHistoryModule  (26)
  alertsModule             (27)  ← was 25; bump priority only, not position relative to others
```

When **any** editing module has `settings.enabled === false`, that module is **fully inert** (no transforms, no listeners, no toolbar row).

---

## Package placement (mandatory)

| Package | Path | What goes here |
|---------|------|----------------|
| **`@starui/engine`** | `packages/shared/engine/` | `editing-core/`, per-module state/ops/journal; no React, no DOM |
| **`@starui/grid`** | `packages/react-grid/grid/` | Module shells, panels, toolbars, runtime `activate`, widget wiring |
| **`@starui/ui`** | `packages/react-ui/ui/` | Consume shadcn only — **no editing-specific components in react-ui** |
| **`markets-grid-lab`** | `apps/markets-grid-lab/` | **Editing** tab (unified curriculum) + per-feature profile catalogs |

**Do NOT create:** new npm packages, new top-level `packages/*` buckets, duplicate logic in `react-core`.

---

## Non-regression contract (non-negotiable)

Every PR in this plan MUST satisfy:

| Rule | Detail |
|------|--------|
| **Opt-in toolbars** | All new toolbar props default **`false`** (`showSmartEditToolbar`, `showBulkUpdateToolbar`, `showEditHistoryToolbar`) |
| **Opt-in modules** | `settings.enabled === false` → no transforms, no keyboard hooks, no journal writes, toolbar hidden |
| **Append-only DEFAULT_MODULES** | Insert new modules **after** `conditionalStylingModule`, **before** `alertsModule`; never remove or reorder existing entries |
| **Existing toolbars untouched** | PrimaryToolbar, FiltersToolbar, FormattingToolbar, AlertsBadge — new rows are **additive optional strips** |
| **Chain transforms** | All `transformColumnDefs` pure + compose (valueParser chain for K/M/B; never replace existing parser) |
| **Full-row transactions** | Every `applyTransactionAsync({ update })` merges with `getRowNode(id).data` — never partial row objects |
| **Profile round-trip** | Unknown deserialize keys dropped; missing keys → `INITIAL_*`; schemaVersion per module |
| **Theme** | All surfaces use `--ds-*` / `--bn-*` tokens; classes `ds-sheet-v2`, `ds-*-toolbar`; **zero hardcoded hex** |
| **Dark/light** | Verify under `[data-theme="dark"]` and `[data-theme="light"]` on `<html>` |
| **shadcn only** | No native `<input>`, `<select>`, `<textarea>` |
| **AG Grid 33+** | `applyTransactionAsync`, `getCellRanges`, `cellKeyDown`, `getEditingCells` — no deprecated APIs |
| **Stream isolation** | Lab editing tab: `enableUpdates: false`; journal default `recordStreamUpdates: false` |
| **Alerts / CS / calc cols** | Edits must fire `cellValueChanged`; module priorities keep alert evaluation after edits |
| **Regression gate** | `npx turbo typecheck build test` green + listed e2e specs + all **13 lab tabs** smoke |

### Baseline e2e (must stay green after every task)

- `e2e/v2-alerts.spec.ts`
- `e2e/v2-smart-edit.spec.ts` (extend in Phase 1+)
- `e2e/v2-conditional-styling.spec.ts` (sample — full list in Task 0)

---

## Design system & UI standards

### Toolbar chrome pattern

Add blocks to `packages/react-grid/grid/src/widget/grid-chrome.css` following `.ds-formatting-toolbar` / `.ds-smart-edit-toolbar`:

```css
.ds-bulk-update-toolbar { /* same flex/gap/padding/border tokens as smart-edit */ }
.ds-edit-history-toolbar { /* undo/redo buttons + optional entry count chip */ }
```

All toolbars: `className="ds-*-toolbar ds-sheet-v2"`, `data-testid` on root and primary controls.

### shadcn component map

| UI need | `@starui/ui` component |
|---------|------------------------|
| Op / action buttons | `Button` variant `outline` size `sm` |
| Operand / value fields | `Input` |
| Bulk set / preview dialogs | `Dialog`, `DialogContent`, `DialogFooter` |
| Confirm threshold / invalid batch | `AlertDialog` |
| Column value picker (bulk update) | `Select`, `SelectContent`, `SelectItem` |
| Date bulk value | `Calendar` + `Popover` (existing date patterns) |
| Preview table (before apply) | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` |
| Validation status | `Badge` variants (success/warning/destructive map to semantic tokens) |
| Monitor panel list | `Table` + `ScrollArea` |
| Settings fields | `BoolControl`, `NumberControl`, `SettingsRow`, `Band` from customizer |
| Tooltips on disabled ops | `Tooltip`, `TooltipTrigger`, `TooltipContent` |
| Undo/redo in toolbar | `Button` + icons from `@starui/design-system` / lucide via existing patterns |

**Forbidden:** native form elements; hardcoded colours; new primitive duplicates of existing shadcn.

### Settings panel pattern

Each module panel:

- Root: `data-testid="{module-id}-panel"`, `className="ds-sheet-v2 flex h-full flex-col"`
- Header: `ObjectTitleRow` + `SharpBtn` Reset/Save via `useModuleDraft`
- Bands: `Band index="01" title="GLOBAL"` etc.
- Register in `SettingsSheet.tsx` nav + `PANEL_ROOT_TESTID` map

---

## Engine: `editing-core` (shared layer)

**Path:** `packages/shared/engine/src/customizer/modules/editing-core/`

### Types

```typescript
export interface CellPatch {
  rowId: string;
  field: string;
  colId: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface EditJournalEntry {
  id: string;
  at: number;
  source: 'smart-edit' | 'bulk-update' | 'plus-minus' | 'shortcut' | 'cell-editor';
  label: string;
  patches: CellPatch[];
}

export type EditValidationResult = 'valid' | 'invalid' | 'warning';

export type EditValidator = (patch: CellPatch) => EditValidationResult;
```

### Key functions (all unit-tested)

| Function | Responsibility |
|----------|----------------|
| `buildPatchesFromTargets(cells, computeNewValue)` | Old/new pairs before apply |
| `buildRowUpdatesFromPatches(api, patches, direction)` | Full-row merge for undo/redo |
| `applyPatches(api, patches, 'undo' \| 'redo')` | `applyTransactionAsync` wrapper |
| `previewPatches(patches, validator?)` | `{ allValid, someInvalid, allInvalid, results[] }` |
| `assertSingleColumnSelection(cells)` | AdapTable single-column rule |
| `assertColumnDataType(colDef, allowed)` | Numeric / string / date guard |

### `EditJournal` class

```typescript
export class EditJournal {
  constructor(options: { limit: number });
  readonly entries: readonly EditJournalEntry[];  // monitor list, newest first
  record(entry: EditJournalEntry): void;
  canUndo: boolean;
  canRedo: boolean;
  undo(api: GridApi): Promise<boolean>;
  redo(api: GridApi): Promise<boolean>;
  suspend(): void;
  resume(): void;
  reset(): void;
}
```

Uses past/future stacks of **journal entry references** (not full grid snapshots). One user action = one undo step.

**Export from** `packages/shared/engine/src/customizer/index.ts`.

---

## Phase 0 — Smart Edit P0 (DONE)

Reference: [`2026-05-27-smart-edit-family.md`](./2026-05-27-smart-edit-family.md).

Shipped: engine ops, col-def K/M/B, grid module + toolbar, lab tab, e2e smoke, partial row bugfix (full-row merge).

**Remaining P0 debt to close in Phase 1:**

- [ ] Wire `buildPatchesFromTargets` + journal record in `applyEdits.ts`
- [ ] Single-column enforcement in toolbar (disable ops + tooltip when multi-column selection)
- [ ] Preview dialog before apply (valid/invalid counts)

---

## Phase 1 — Smart Edit advanced + journal foundation

**Goal:** Custom ops, preview/validation UX, journal recording for smart-edit; undo/redo for smart-edit actions.

### Engine tasks

**Files:** `editing-core/*`, extend `smart-edit/state.ts`

- [ ] Create `editing-core/` with types, `buildPatchesFromTargets`, `buildRowUpdatesFromPatches`, `applyPatches`, `previewPatches`, `EditJournal`
- [ ] Add `smartEditCustomOperations` to state (name + serialized op id; runtime ops registered via grid `EditOptions` port — engine stores config only)
- [ ] Built-in custom op examples in engine tests: `power`, `bps` (basis points)
- [ ] `assertSingleColumnSelection` + tests
- [ ] 100% unit coverage on `editing-core/*.ts` (Vitest, no jsdom)

### Grid tasks

**Files:** `smart-edit/SmartEditToolbarBody.tsx`, `SmartEditPanel.tsx`, `runtime/applyEdits.ts`, new `runtime/preview.ts`

- [ ] `applyEdits.ts`: capture patches → `journal.record` → apply (inject journal from `data-change-history` activate or platform resource)
- [ ] Preview `Dialog`: table of `{ rowId, field, old, new, status }`; Apply button colours via semantic tokens (green/amber/red)
- [ ] Partial apply when `someInvalid` (apply valid patches only; journal records applied subset)
- [ ] Custom ops dropdown in toolbar when configured
- [ ] Re-select cells after apply (AdapTable repeat-op UX)
- [ ] Context menu item **Apply Smart Edit…** (optional Phase 1b if scope tight — otherwise Phase 2)

### Settings extensions (`SmartEditPanel`)

- [ ] Band **CUSTOM OPS** — enable/disable built-in custom ops list
- [ ] Band **VALIDATION** — preview required (bool), block all invalid (bool)

### Tests

- [ ] `applyEdits.test.ts` — journal record, full-row merge, partial validation apply
- [ ] `EditJournal.test.ts` — undo/redo round-trip, limit, suspend
- [ ] `SmartEditToolbarBody.test.tsx` — preview open, disabled multi-column
- [ ] `SmartEditPanel.test.tsx` — new bands

### E2E

- [ ] Extend `e2e/v2-smart-edit.spec.ts`:
  - Preview table visible before apply
  - Undo restores prior value (via history toolbar once Phase 3 lands, or journal API eval in page)
  - Single-column guard (multi-column selection disables Apply)

### Lab (incremental)

- [ ] Add profile `se-04-custom-ops` to `smartEditCatalog.ts`
- [ ] Add profile `se-05-preview-validation` with seeded validation rule (coordinate with alerts PreventEdit on a column)
- [ ] Update `help/smart-edit.md`

### Commit

- [ ] `feat(engine): editing-core journal and patch helpers`
- [ ] `feat(grid): smart-edit preview, custom ops, journal integration`

---

## Phase 2 — Bulk Update module

**Goal:** Separate AdapTable-equivalent module for replace-all-selected with same value (text, number, date).

### Engine — `bulk-update/`

**Files:** `packages/shared/engine/src/customizer/modules/bulk-update/`

```typescript
export const BULK_UPDATE_MODULE_ID = 'bulk-update';
export interface BulkUpdateSettings {
  enabled: boolean;
  confirmThreshold: number;
  showDistinctValues: boolean;  // dropdown from column distinct values
  maxDropdownValues: number;
}
```

- [ ] `collectBulkUpdateTargets(api)` — single editable column, any of string|number|date
- [ ] `applyBulkUpdate(cells, newValue)` → patches
- [ ] `resolveColumnDistinctValues(api, colId, limit)` — for dropdown
- [ ] Unit tests (mock reader)

### Grid — `bulk-update/`

- [ ] `bulkUpdateModule` shell (`code: 07`, priority 23)
- [ ] `BulkUpdatePanel.tsx` — settings bands
- [ ] `BulkUpdateToolbarBody.tsx` — value `Select` or `Input` / date picker + Apply + preview
- [ ] `widget/BulkUpdateToolbar.tsx` + `showBulkUpdateToolbar` prop (default `false`)
- [ ] `MarketsGridHost.tsx` — optional row after smart-edit row
- [ ] `grid-chrome.css` — `.ds-bulk-update-toolbar`
- [ ] Journal integration on apply
- [ ] Panel + toolbar tests; runtime tests

### E2E — `e2e/v2-bulk-update.spec.ts`

- [ ] Lab tab: select cells in `currency` column → bulk set to `EUR` → assert
- [ ] Date column bulk set (if lab columns include editable date)
- [ ] Preview + undo

### Lab

- [ ] New catalog `bulkUpdateCatalog.ts` OR extend **Editing** unified tab (see Phase 6)
- [ ] Profiles: `bu-00-curriculum`, `bu-01-text-column`, `bu-02-date-column`, `bu-03-custom-values`
- [ ] `help/bulk-update.md`
- [ ] `public/lab-profiles/bulk-update/*.json`

---

## Phase 3 — Data Change History module (undo/redo UI)

**Goal:** AdapTable monitor panel + global undo/redo; consumes journal from all editing modules.

### Engine — `data-change-history/`

```typescript
export interface DataChangeHistorySettings {
  enabled: boolean;
  maxEntries: number;
  suspended: boolean;
  unifyUndo: boolean;  // disable AG Grid undoRedoCellEditing when true
  recordSources: {
    smartEdit: boolean;
    bulkUpdate: boolean;
    plusMinus: boolean;
    shortcuts: boolean;
    cellEditor: boolean;
    stream: boolean;  // default false
  };
}
```

- [ ] Serialize/deserialize journal metadata (entries list for monitor; stacks rebuilt on session — **persist last N entry labels only**, not full undo stacks, OR persist stacks in module state for profile round-trip — document choice: **session-only stacks**, profile stores settings only)
- [ ] `EditJournal` lives on `GridPlatform.resources` scope keyed by gridId

### Grid — `data-change-history/`

- [ ] `dataChangeHistoryModule` (`code: 10`, priority 26)
- [ ] `DataChangeHistoryPanel.tsx` — monitor `Table`: time, source, label, cells, per-row Undo
- [ ] `EditHistoryToolbarBody.tsx` — Undo / Redo buttons + entry count; `showEditHistoryToolbar` prop
- [ ] `activate.ts`:
  - Attach journal to platform resources on grid ready
  - Optional `cellValueChanged` listener when `recordSources.cellEditor`
  - When `unifyUndo`: set `undoRedoCellEditing: false` via transformGridOptions (only when history enabled)
- [ ] Wire all editing runtimes to shared journal instance

### Tests

- [ ] Journal undo/redo after smart-edit apply (integration test with mock api)
- [ ] Suspend stops recording
- [ ] `cellEditor` source records single edit
- [ ] Stream ticks NOT recorded when `recordStreamUpdates: false`

### E2E — `e2e/v2-edit-history.spec.ts`

- [ ] Smart edit → undo → redo on lab Editing tab
- [ ] Monitor panel lists entry; per-entry undo
- [ ] Suspend toggle stops new entries

### Lab

- [ ] Profiles with history enabled + toolbar visible
- [ ] `help/edit-history.md`

---

## Phase 4 — Plus/Minus module (nudge rules)

**Goal:** AdapTable PlusMinus nudge rules — expression-gated, per-column step.

### Engine — `plus-minus/`

```typescript
export interface PlusMinusNudge {
  id: string;
  name: string;
  enabled: boolean;
  scope: { columnIds: string[] };
  expression?: string;  // ExpressionEngine — true to allow nudge
  incrementStep: number;
  decrementStep?: number;  // default = incrementStep
}

export interface PlusMinusState {
  settings: { enabled: boolean };
  nudges: PlusMinusNudge[];
}
```

- [ ] `resolveNudgeForCell(cell, nudges, engine)` — first matching active nudge
- [ ] `applyNudge(api, cells, direction)` → patches + apply
- [ ] Deserialize + tests

### Grid

- [ ] `plusMinusModule` (`code: 08`, priority 24)
- [ ] `PlusMinusPanel.tsx` — list + editor for nudges (mirror alerts rule list pattern)
- [ ] `runtime/activate.ts` — replace global +/- in smart-edit activate; delegate to plus-minus when module enabled (smart-edit +/- **deprecated when plus-minus enabled** — settings migration note in panel)
- [ ] Journal integration

### E2E — `e2e/v2-plus-minus.spec.ts`

- [ ] Lab profile with nudge on `quantityFace` step=1000; +/- keys move by 1000
- [ ] Expression-gated nudge: only when `side === 'Buy'`

### Lab

- [ ] Profiles: `pm-00-global-step`, `pm-01-column-rules`, `pm-02-expression-gate`
- [ ] `help/plus-minus.md`

---

## Phase 5 — Shortcuts module

**Goal:** AdapTable Shortcuts — letter key triggers operation + operand (distinct from K/M/B magnitude parsing).

### Engine — `shortcuts/`

```typescript
export interface ShortcutDefinition {
  id: string;
  name: string;
  enabled: boolean;
  shortcutKey: string;  // single letter
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  shortcutValue: number;
  scope: { columnIds: string[] };
}

export interface ShortcutsState {
  settings: { enabled: boolean };
  shortcuts: ShortcutDefinition[];
}
```

- [ ] `matchShortcut(key, columnId, shortcuts)` 
- [ ] `applyShortcut(api, cells, shortcut)` → patches
- [ ] Tests

### Grid

- [ ] `shortcutsModule` (`code: 09`, priority 25)
- [ ] `ShortcutsPanel.tsx` — CRUD list (mirror plus-minus)
- [ ] `runtime/activate.ts` — `cellKeyDown` when not editing; journal record
- [ ] **Do not conflate** with K/M/B — document in panel hint

### E2E — `e2e/v2-shortcuts.spec.ts`

- [ ] Configure shortcut `H` → multiply ×100 on qty column; press H in cell

### Lab

- [ ] Profiles: `sc-00-curriculum`, `sc-01-multiply-shortcut`, `sc-02-suspended`
- [ ] `help/shortcuts.md`

---

## Phase 6 — markets-grid-lab unified **Editing** tab (full demo)

**Goal:** One lab tab demonstrates **all** editing modules together — the primary acceptance surface.

### Approach

Replace standalone Smart Edit tab **or** rename/expand it to **Editing** tab (`tabId: 'editing'`, `gridId: 'lab-editing'`) that enables all toolbars and seeds all modules.

**Recommended:** Expand existing Smart Edit tab → **Editing** tab (keep `lab-smart-edit` gridId for profile compat OR migrate to `lab-editing` with profile aliases).

### `EDITING_FEATURE` config

```typescript
export const EDITING_FEATURE: LabFeatureConfig = {
  tabId: 'editing',
  providerId: 'mock-positions-editing',
  title: 'Editing',
  subtitle: 'Smart Edit · Bulk Update · +/- · Shortcuts · History · undo/redo',
  help: HELP.editing,  // merged help index
  gridId: 'lab-editing',
  componentName: 'EditingLab',
  profiles: EDITING_DEMO_PROFILES,
  activeProfileId: 'ed-00-full-curriculum',
  stream: { rowCount: 200, updateIntervalMs: 500, enableUpdates: false },
  getColumnDefs: () => EDITING_COLUMNS,  // qty, mid, currency, updatedAt editable
  grid: {
    showSmartEditToolbar: true,
    showBulkUpdateToolbar: true,
    showEditHistoryToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
};
```

### Profile curriculum (`editingCatalog.ts`) — minimum 12 profiles

| Profile ID | Demonstrates |
|------------|--------------|
| `ed-00-full-curriculum` | All modules on, default settings |
| `ed-01-smart-edit-only` | Only smart-edit enabled |
| `ed-02-bulk-update-text` | Bulk update on `currency` |
| `ed-03-bulk-update-date` | Bulk update on date column |
| `ed-04-plus-minus-nudges` | Two nudge rules |
| `ed-05-shortcuts` | H/M/L shortcuts seeded |
| `ed-06-history-suspend` | History on, demonstrate suspend |
| `ed-07-preview-validation` | Smart edit preview + invalid cells |
| `ed-08-custom-ops` | Power + bps ops |
| `ed-09-confirm-thresholds` | Low confirm threshold |
| `ed-10-shortcuts-off-magnitude-on` | K/M/B only |
| `ed-11-all-disabled` | Modules off — grid behaves as before P0 |

### Demo console scenarios (`scenarios.ts`)

- [ ] `editing-qty-selection` — highlights qty column
- [ ] `editing-validation-trap` — sets values that fail validation rule
- [ ] `editing-multi-column` — selects two columns to demo guard

### Help

- [ ] `help/editing.md` — master index linking sub-help
- [ ] Keep `smart-edit.md`, add `bulk-update.md`, `plus-minus.md`, `shortcuts.md`, `edit-history.md`
- [ ] Update `help/index.ts`

### JSON profiles

- [ ] `public/lab-profiles/editing/*.json`
- [ ] Update `writeLabProfileJson.ts` catalog entry

### App nav

- [ ] `App.tsx` — tab label **Editing** (replace or alias Smart Edit)
- [ ] `data-testid="lab-tab-editing"`

### Manual acceptance script

```bash
npm run dev:markets-grid-lab
```

1. Open **Editing** tab — three optional toolbar rows visible (smart edit, bulk update, history)
2. **Smart Edit:** range select qty → ×0.5 → preview → apply → **Undo** restores
3. **Bulk Update:** select `currency` cells → set `EUR` from dropdown → apply
4. **Plus/Minus:** focus qty → `+` → nudge by rule step
5. **Shortcuts:** focus qty → press `H` → multiply per shortcut config
6. **K/M/B:** double-click → type `2.5M` → Enter
7. **History panel:** Settings → Data Change History → see entries → undo one
8. **Suspend:** toggle suspend → edit → no new history entries
9. Switch to **Alerts**, **Overview**, **Live Updates** — no layout/console regression
10. Flip **dark/light** theme — all toolbars + panels + grid correct
11. Import `public/lab-profiles/editing/ed-00-full-curriculum.json`

---

## Phase 7 — Docs, gap analysis, full regression

- [ ] Update `docs/current-features.md` — all six modules + lab Editing tab
- [ ] Update `docs/MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md` §4.7 to ~85% with notes on validation UI deferral
- [ ] Run `npx turbo typecheck build test`
- [ ] Run e2e suite:

```
e2e/v2-smart-edit.spec.ts
e2e/v2-bulk-update.spec.ts
e2e/v2-edit-history.spec.ts
e2e/v2-plus-minus.spec.ts
e2e/v2-shortcuts.spec.ts
e2e/v2-alerts.spec.ts
```

- [ ] Manual: all 13 lab tabs
- [ ] Update `MarketsGrid.characterisation.test.tsx` mocks for new modules (same pattern as `smartEditModule: {}`)

---

## Test coverage requirements

| Layer | Requirement |
|-------|-------------|
| **Engine** | 100% line coverage on `editing-core/`, each module's `operations.ts`, `state.ts` deserialize, patch builders |
| **Grid runtime** | Unit tests for every `apply*.ts`, `activate.ts` with mock GridApi |
| **Grid UI** | Panel tests (render + save/discard); toolbar tests (disabled states, preview open) |
| **Integration** | Journal undo/redo round-trip through smart-edit + bulk-update |
| **E2E** | One spec file per module + extended smart-edit; all run against lab `:5300` |
| **Regression** | Existing widget characterisation tests updated with module mocks — **no behavioural change when modules disabled** |

Install `@vitest/coverage-v8` at repo root if not present; add `test:coverage` script for editing modules gate in CI (optional Phase 7b).

---

## Widget / props summary

| Prop | Default | When true |
|------|---------|-----------|
| `showSmartEditToolbar` | `false` | Smart edit toolbar row |
| `showBulkUpdateToolbar` | `false` | Bulk update toolbar row |
| `showEditHistoryToolbar` | `false` | Undo/redo chip row |
| Module `settings.enabled` | per `INITIAL_*` | Module transforms + runtime active |

**MarketsGridHost toolbar order:**

```
PrimaryToolbar
SmartEditToolbar      (if showSmartEditToolbar)
BulkUpdateToolbar     (if showBulkUpdateToolbar)
EditHistoryToolbar    (if showEditHistoryToolbar)
FormattingToolbar     (if showFormattingToolbar)
```

---

## Validation integration (defer full module; stub in Phase 1)

AdapTable validation is a separate concern. This plan **stubs** the port:

```typescript
// editing-core/validation.ts
export type EditValidator = (patch: CellPatch) => EditValidationResult;
export function defaultValidator(): EditValidator { return () => 'valid'; }
```

Phase 1 preview uses injectable validator. **Follow-on PR:** wire `alerts` PreventEdit rules as validator. Lab profile `ed-07-preview-validation` seeds an alert rule for demo.

---

## Task 0: Regression baseline (run before Phase 1)

- [ ] Record green: `npx turbo typecheck build test`
- [ ] `npx playwright test e2e/v2-alerts.spec.ts e2e/v2-smart-edit.spec.ts`
- [ ] Manual smoke: all current lab tabs
- [ ] Document baseline test counts in PR description

---

## Execution handoff

**Plan file:** `docs/superpowers/plans/2026-05-27-editing-family-full.md`

**Recommended execution order:**

1. Phase 1 (editing-core + smart-edit advanced + journal write path)
2. Phase 3 (history UI — unlock undo/redo for Phase 1 demos)
3. Phase 2 (bulk update)
4. Phase 4 (plus/minus)
5. Phase 5 (shortcuts)
6. Phase 6 (lab unified Editing tab)
7. Phase 7 (docs + full regression)

Phases 2/4/5 can parallelize after Phase 1+3 complete.

**Subagent-driven:** one subagent per phase; review gate between phases using `e2e/v2-alerts.spec.ts` + editing e2es + lab smoke.

---

## Self-review

| Requirement | Covered |
|-------------|---------|
| Modular (5 modules + editing-core) | Module map |
| Fully configurable | Per-module state + opt-in toolbars |
| Design system | shadcn + `--ds-*` + grid-chrome pattern |
| Test coverage | Per-phase tests + coverage table |
| E2E | Spec per module + regression list |
| No disruption | Non-regression contract + default false + inert when disabled |
| markets-grid-lab full demo | Phase 6 — 12 profiles + acceptance script |
| History undo/redo | Phase 1 journal + Phase 3 UI |
| AG Grid 33+ | Non-regression contract |
| No new packages | Package placement |

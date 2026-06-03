# Smart Edit Family Implementation Plan

> **Phase 0 (P0) plan.** For the **full editing family** (Bulk Update, Plus/Minus, Shortcuts, Change History, lab curriculum, e2e), see **[`2026-05-27-editing-family-full.md`](./2026-05-27-editing-family-full.md)**.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship AdapTable-equivalent **Smart Edit**, **Bulk Update**, **Plus/Minus**, and **keyboard magnitude shortcuts** as a first-class MarketsGrid customizer module — demonstrated in **markets-grid-lab** — with zero regression to existing grid behaviour.

**Architecture:** Mirror the **alerts module split** exactly: framework-agnostic logic in `@starui/engine` (`packages/shared/engine`), React surfaces in `@starui/grid` (`packages/react-grid`). No new packages, no new top-level buckets under `packages/`. Angular 21 will later consume the same `@starui/engine` exports and register an Angular panel + toolbar adapter in `@starui/grid-angular`.

**Tech Stack:** `@starui/engine`, `@starui/grid`, `@starui/ui` (shadcn only — no native inputs), AG Grid Enterprise 33+, Vitest, markets-grid-lab `LabFeatureTab`.

**Parity target:** AdapTable §4.7 Editing — **27% → ~55%** weighted.

---

## Package placement (mandatory)

All code lives inside **existing** workspace packages only:

| Package | Path | What goes here |
|---------|------|----------------|
| **`@starui/engine`** | `packages/shared/engine/` | State, deserialize, pure ops, col-def transforms, target-cell resolution helpers (no React, no DOM) |
| **`@starui/grid`** | `packages/react-grid/grid/` | Module registration, Settings panel, toolbar, hooks, runtime `activate`, widget wiring |
| **`@starui/ui`** | `packages/react-ui/ui/` | **Do not add Smart Edit–specific components** — consume existing shadcn exports (`Button`, `Input`, `Dialog`, `AlertDialog`, `Tooltip`, `Separator`) |
| **`@starui/react-core`** | `packages/react-core/` | **Optional only:** forward `showSmartEditToolbar` through `HostedMarketsGrid` if needed — no Smart Edit logic here |
| **`markets-grid-lab`** | `apps/workspace/markets-grid-lab/` | Tab, profiles, seeds, help, scenarios — **required deliverable** |

**Do NOT create:**
- New folders under `packages/` (e.g. no `packages/smart-edit/`)
- New npm workspace packages
- Duplicate logic in `react-ui` or `react-core`

### Alerts mirror (reference implementation)

```
packages/shared/engine/src/customizer/modules/alerts/
  state.ts          ← SmartEditState goes here
  evaluator.ts      ← (alerts-specific; smart-edit uses operations.ts instead)
  transforms.ts     ← applySmartEditColDefTransforms (valueParser wrap)

packages/react-grid/grid/src/customizer/modules/alerts/
  index.ts          ← Module shell + SettingsPanel
  AlertsPanel.tsx
  runtime/activate.ts
  AlertsBadge.tsx   ← Smart Edit equivalent: toolbar lives in widget/ + modules/smart-edit/
```

Future **Angular 21:** `@starui/grid-angular` imports `SMART_EDIT_MODULE_ID`, state types, `applyNumericOp`, `collectTargetCells` from `@starui/engine`; implements PrimeNG settings panel + toolbar using the same module contract.

---

## Organic integration (no regressions)

These rules are **non-negotiable** — existing MarketsGrid consumers must behave identically unless they opt in.

| Rule | Detail |
|------|--------|
| **Opt-in toolbar** | `showSmartEditToolbar` defaults to **`false`** (same as `showFormattingToolbar`) |
| **Opt-in module effects** | When `settings.enabled === false`, module is inert: no keyboard hooks, no valueParser wrap, toolbar hidden |
| **Append-only DEFAULT_MODULES** | Insert `smartEditModule` after `conditionalStylingModule`, before `alertsModule` — do not reorder existing modules |
| **Pipeline priority** | `priority: 22` — after column structure modules, before alerts (`25`) so `cellValueChanged` from edits still fires alert rules |
| **Chain transforms** | `wrapColDefWithMagnitudeParser` must **compose** existing `valueParser`, never replace |
| **No col-def mutation outside transform** | Same contract as every other module — pure `transformColumnDefs` only |
| **Profile round-trip** | Unknown keys in deserialize are dropped; missing keys fall back to `INITIAL_SMART_EDIT` |
| **Existing toolbars untouched** | PrimaryToolbar, FiltersToolbar, FormattingToolbar, AlertsBadge — add Smart Edit as a **separate optional row**, not a replacement |
| **Grid theme** | Toolbar uses `grid-chrome.css` class `.ds-smart-edit-toolbar` (new block, same token pattern as `.ds-formatting-toolbar`) |
| **Dark/light** | All colours via `--ds-*` / `--bn-*` tokens — zero hardcoded hex |
| **Regression gate** | Before merge: run full `npm test`, existing `e2e/v2-alerts.spec.ts`, and all markets-grid-lab tabs smoke manually |

---

## Theming & UI standards

### Toolbar chrome

Add to `packages/react-grid/grid/src/widget/grid-chrome.css`:

```css
/* Same structural pattern as .ds-formatting-toolbar */
.ds-smart-edit-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2, 8px);
  padding: 4px 8px;
  border-bottom: 1px solid var(--ds-border-primary);
  background: var(--ds-surface-primary);
  color: var(--ds-text-primary);
  font-size: 12px;
}
.ds-smart-edit-toolbar .ds-smart-edit-toolbar__operand {
  width: 88px;
}
.ds-smart-edit-toolbar .ds-smart-edit-toolbar__count {
  margin-left: auto;
  color: var(--ds-text-secondary);
}
```

### shadcn components (from `@starui/ui` only)

| UI need | Component |
|---------|-----------|
| Op buttons (× ÷ + −) | `Button` variant `outline` size `sm` |
| Operand field | `Input` |
| Bulk set | `Dialog` + `DialogContent` + `Input` + `Button` |
| Large-batch confirm | `AlertDialog` |
| Disabled tooltips | `Tooltip` + `TooltipContent` |
| Settings panel fields | Reuse customizer primitives: `BoolControl`, `NumberControl`, `PillToggleGroup` from `general-settings/fieldSchema.tsx` |

**Forbidden:** `<input>`, `<select>`, `<textarea>` native elements.

### AG Grid compatibility

- Use `useGridTheme()` — toolbar sits **outside** the AG Grid canvas; no AG Grid theme params needed on toolbar itself
- Cell edits use `applyTransactionAsync` — preserves AG Grid change detection + existing conditional-styling / alerts listeners
- Respect `cellSelection` from general-settings profile (lab seeds enable it)

---

## File map (all paths within existing packages)

### `@starui/engine` — `packages/shared/engine/`

| File | Responsibility |
|------|----------------|
| `src/customizer/modules/smart-edit/state.ts` | Types, `INITIAL_SMART_EDIT`, `deserializeSmartEditState` |
| `src/customizer/modules/smart-edit/operations.ts` | `applyNumericOp` |
| `src/customizer/modules/smart-edit/parseMagnitudeSuffix.ts` | K/M/B parsing |
| `src/customizer/modules/smart-edit/transforms.ts` | `applySmartEditColDefTransforms` (valueParser chain) |
| `src/customizer/modules/smart-edit/collectTargetCells.ts` | Framework-agnostic cell target resolution (accepts minimal GridApi interface) |
| `src/customizer/modules/smart-edit/*.test.ts` | Unit tests |
| `src/customizer/index.ts` | Re-export smart-edit public API |

### `@starui/grid` — `packages/react-grid/grid/`

| File | Responsibility |
|------|----------------|
| `src/customizer/modules/smart-edit/index.ts` | Module definition (`smartEditModule`) |
| `src/customizer/modules/smart-edit/SmartEditPanel.tsx` | Settings sheet panel |
| `src/customizer/modules/smart-edit/SmartEditToolbarBody.tsx` | Toolbar JSX (used by widget entry) |
| `src/customizer/modules/smart-edit/useSmartEditSelection.ts` | Selection hook |
| `src/customizer/modules/smart-edit/runtime/activate.ts` | +/- keyboard listener |
| `src/customizer/modules/smart-edit/runtime/applyEdits.ts` | Thin wrapper: engine ops + `api.applyTransactionAsync` |
| `src/customizer/modules/smart-edit/runtime/*.test.ts` | Runtime tests |
| `src/widget/SmartEditToolbar.tsx` | Thin entry (mirrors `FormattingToolbar.tsx`) |
| `src/widget/MarketsGrid.tsx` | `DEFAULT_MODULES` + prop |
| `src/widget/MarketsGridHost.tsx` | Optional toolbar row |
| `src/widget/types.ts` | `showSmartEditToolbar?: boolean` |
| `src/widget/grid-chrome.css` | `.ds-smart-edit-toolbar` |
| `src/widget/SettingsSheet.tsx` | Add module to nav (`code: '06'`, testId map entry) |
| `src/customizer/index.ts` | Public exports |

### `markets-grid-lab` — `apps/workspace/markets-grid-lab/`

| File | Responsibility |
|------|----------------|
| `src/tabs/SmartEditTab.tsx` | Re-export from `labFeatureConfigs` |
| `src/tabs/labFeatureConfigs.ts` | `smartEdit` config entry |
| `src/profiles/catalogs/smartEditCatalog.ts` | Profile curriculum |
| `src/seeds/smartEdit.ts` | First-visit seed |
| `src/help/smart-edit.md` | In-app help |
| `public/lab-profiles/smart-edit/*.json` | Importable profiles |
| `src/App.tsx` | Lazy tab + `LabTabsNav` entry |
| `src/demo/scenarios.ts` | Optional: pre-select qty column hint |

### Docs / E2E (repo root)

| File | Responsibility |
|------|----------------|
| `e2e/v2-smart-edit.spec.ts` | Lab smoke |
| `docs/current-features.md` | Feature inventory |
| `docs/MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md` | Parity bump + lab tab row |

---

## Module design

### State (`packages/shared/engine/.../state.ts`)

```typescript
export const SMART_EDIT_MODULE_ID = 'smart-edit';
export const SMART_EDIT_SCHEMA_VERSION = 1;

export type SmartEditOp = 'multiply' | 'divide' | 'add' | 'subtract' | 'set';

export interface SmartEditSettings {
  enabled: boolean;
  incrementStep: number;
  magnitudeShortcutsEnabled: boolean;
  enabledOps: SmartEditOp[];
  confirmThreshold: number;
}

export interface SmartEditState {
  settings: SmartEditSettings;
}

export const INITIAL_SMART_EDIT: SmartEditState = {
  settings: {
    enabled: true,
    incrementStep: 1,
    magnitudeShortcutsEnabled: true,
    enabledOps: ['multiply', 'divide', 'add', 'subtract', 'set'],
    confirmThreshold: 50,
  },
};
```

### Engine transform (`transforms.ts`)

```typescript
import { parseMagnitudeSuffix } from './parseMagnitudeSuffix.js';
import type { AnyColDef } from '../../../platform/types.js';

export function applySmartEditColDefTransforms(
  defs: AnyColDef[],
  magnitudeShortcutsEnabled: boolean,
): AnyColDef[] {
  if (!magnitudeShortcutsEnabled) return defs;
  return defs.map((def) => wrapWithMagnitudeParser(def));
}

function wrapWithMagnitudeParser(def: AnyColDef): AnyColDef {
  if (def.editable === false) return def;
  const prev = def.valueParser;
  return {
    ...def,
    valueParser: (params) => {
      const parsed = parseMagnitudeSuffix(String(params.newValue ?? ''));
      if (parsed !== null) return parsed;
      return typeof prev === 'function' ? prev(params) : params.newValue;
    },
  };
}
```

### React module shell (`packages/react-grid/.../index.ts`)

```typescript
import {
  SMART_EDIT_MODULE_ID,
  SMART_EDIT_SCHEMA_VERSION,
  INITIAL_SMART_EDIT,
  deserializeSmartEditState,
  applySmartEditColDefTransforms,
  type SmartEditState,
} from '@starui/engine';
import { activateSmartEdit } from './runtime/activate.js';
import { SmartEditPanel } from './SmartEditPanel.js';

export const smartEditModule: Module<SmartEditState> = {
  id: SMART_EDIT_MODULE_ID,
  name: 'Smart Edit',
  code: '06',
  schemaVersion: SMART_EDIT_SCHEMA_VERSION,
  priority: 22,
  getInitialState: () => structuredClone(INITIAL_SMART_EDIT),
  serialize: (s) => ({ settings: s.settings }),
  deserialize: deserializeSmartEditState,
  transformColumnDefs(defs, state) {
    if (!state.settings.enabled) return defs;
    return applySmartEditColDefTransforms(defs, state.settings.magnitudeShortcutsEnabled);
  },
  activate: activateSmartEdit,
  SettingsPanel: SmartEditPanel,
};
```

### Toolbar UX (opt-in row)

```
.ds-smart-edit-toolbar
  [ × ] [ ÷ ] [ + ] [ − ] [ Set… ]   Operand: [Input]   "12 cells selected"
```

Rendered in `MarketsGridHost` when **`showSmartEditToolbar && settings.enabled`**.

---

## Task 0: Regression baseline (before any code)

- [ ] Run and record green: `npx turbo typecheck build test`
- [ ] Run: `npx playwright test e2e/v2-alerts.spec.ts` — must pass after all tasks
- [ ] Manual: `npm run dev:markets-grid-lab` — click every existing tab, verify grids load

---

## Task 1: Engine — state, parser, operations, transforms

**Files:** `packages/shared/engine/src/customizer/modules/smart-edit/*`

- [ ] **Step 1:** Create `state.ts`, `parseMagnitudeSuffix.ts`, `operations.ts`, `transforms.ts` per designs above
- [ ] **Step 2:** Write tests (`parseMagnitudeSuffix.test.ts`, `operations.test.ts`, `transforms.test.ts`)
- [ ] **Step 3:** Export from `packages/shared/engine/src/customizer/index.ts`:

```typescript
export * from './modules/smart-edit/state.js';
export { applyNumericOp } from './modules/smart-edit/operations.js';
export { parseMagnitudeSuffix } from './modules/smart-edit/parseMagnitudeSuffix.js';
export { applySmartEditColDefTransforms } from './modules/smart-edit/transforms.js';
```

- [ ] **Step 4:** Run `npx vitest run packages/shared/engine/src/customizer/modules/smart-edit`
- [ ] **Step 5:** Commit `feat(engine): smart-edit state, ops, and col-def transforms`

---

## Task 2: Engine — collectTargetCells (Angular-reusable)

**Files:** `packages/shared/engine/src/customizer/modules/smart-edit/collectTargetCells.ts`

Framework-agnostic — accept a minimal interface, not `GridApi` directly:

```typescript
export interface SmartEditGridReader {
  getCellRanges(): Array<{
    columns: Array<{ getColId(): string | undefined }>;
    startRow?: { rowIndex: number };
    endRow?: { rowIndex: number };
  }> | null;
  getDisplayedRowAtIndex(index: number): { id?: string; data?: Record<string, unknown> } | undefined;
  getColumn(colId: string): { getColDef(): { editable?: boolean; field?: string; cellDataType?: string } } | null;
  getCellValue(params: { rowNode: unknown; colKey: string }): unknown;
}

export interface TargetCell {
  rowId: string;
  colId: string;
  field: string;
  value: unknown;
}

export function collectTargetCells(
  api: SmartEditGridReader,
  getRowId: (data: Record<string, unknown>) => string,
): TargetCell[] { /* ... */ }
```

- [ ] Implement + unit test with mock reader (no jsdom)
- [ ] Export from engine customizer index
- [ ] Commit

---

## Task 3: Grid — module + settings panel

**Files:** `packages/react-grid/grid/src/customizer/modules/smart-edit/`

- [ ] Create `index.ts` (module shell above)
- [ ] Create `SmartEditPanel.tsx` — bands via existing `Band` / `fieldSchema` primitives; register in `SettingsSheet` nav as **Smart Edit** (`code: 06`)
- [ ] Append `smartEditModule` to `DEFAULT_MODULES` in `MarketsGrid.tsx`
- [ ] Export from `customizer/index.ts`
- [ ] **Regression check:** existing modules still appear in Settings; profile save/load unchanged
- [ ] Commit `feat(grid): smart-edit customizer module and settings panel`

---

## Task 4: Grid — runtime (activate + applyEdits)

**Files:** `packages/react-grid/grid/src/customizer/modules/smart-edit/runtime/`

- [ ] `applyEdits.ts` — uses `applyNumericOp` + `collectTargetCells` from `@starui/engine`, calls `api.applyTransactionAsync`
- [ ] `activate.ts` — +/- keys; skip when cell editor open (`api.getEditingCells()?.length`)
- [ ] Wire `activate` on module
- [ ] Unit tests with mocked GridApi
- [ ] Commit

---

## Task 5: Grid — SmartEditToolbar + MarketsGridHost

**Files:** widget layer + chrome CSS

- [ ] `useSmartEditSelection.ts` — reuse event pattern from `formattingToolbarHooks.ts` `useActiveColumns`
- [ ] `SmartEditToolbarBody.tsx` — all `@starui/ui` shadcn; root class `ds-smart-edit-toolbar ds-sheet-v2`
- [ ] `widget/SmartEditToolbar.tsx` — thin shell (like `FormattingToolbar.tsx`)
- [ ] `MarketsGridHost.tsx` — render when `showSmartEditToolbar`:

```tsx
{showSmartEditToolbar && (
  <div className="ds-smart-edit-toolbar-row shrink-0 border-b border-[color:var(--ds-border-primary)]">
    <SmartEditToolbar />
  </div>
)}
```

Place **between** `PrimaryToolbar` and `FormattingToolbar` row (logical order: filters → smart edit → formatting).

- [ ] `types.ts` + `MarketsGrid.tsx` — prop default `false`
- [ ] Add `.ds-smart-edit-toolbar` to `grid-chrome.css`
- [ ] Toggle `[data-theme="dark"]` / `[data-theme="light"]` on `<html>` — verify toolbar tokens flip
- [ ] Commit

---

## Task 6: markets-grid-lab demo (required)

**Files:** `apps/workspace/markets-grid-lab/`

- [ ] Add `smartEditCatalog.ts` with 4 profiles (curriculum, qty-only, shortcuts-off, confirm-threshold)
- [ ] Add `seeds/smartEdit.ts` + wire in `seeds/index.ts` / `useLabDemoProfiles`
- [ ] Add `labFeatureConfigs` entry:

```typescript
{
  tabId: 'smart-edit',
  providerId: 'mock-positions-smart-edit',
  title: 'Smart Edit',
  subtitle: 'Bulk update · arithmetic · +/- · K/M/B shortcuts',
  help: HELP.smartEdit,
  gridId: 'lab-smart-edit',
  componentName: 'SmartEditLab',
  profiles: SMART_EDIT_DEMO_PROFILES,
  activeProfileId: SMART_EDIT_ACTIVE_PROFILE_ID,
  stream: { enableUpdates: false }, // paused — edits not overwritten by ticks
  getColumnDefs: () =>
    pickColumns(['cusip', 'ticker', 'quantityFace', 'midPrice', 'marketValue', 'dailyPnL']).map((col) =>
      col.field === 'quantityFace' || col.field === 'midPrice'
        ? { ...col, editable: true, cellDataType: 'number' }
        : col,
    ),
  grid: {
    showSmartEditToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: false,
    showProfileSelector: true,
    showSaveButton: true,
    showSettingsButton: true,
  },
}
```

- [ ] Seed `general-settings` with `cellSelection: true` in profile JSON
- [ ] `SmartEditTab.tsx`, `App.tsx` lazy import, `LabTabsNav` label
- [ ] `help/smart-edit.md` — step-by-step: drag-select → × → operand → apply; +/- keys; type `1.5M`
- [ ] Write JSON profiles to `public/lab-profiles/smart-edit/`
- [ ] Manual verify all **12 tabs** still work + Smart Edit tab demos all 4 profiles
- [ ] Commit `feat(markets-grid-lab): smart edit demo tab`

---

## Task 7: E2E, docs, full regression

- [ ] `e2e/v2-smart-edit.spec.ts` — navigate lab Smart Edit tab, apply multiply, assert cell value
- [ ] Update `docs/current-features.md` — smart-edit module + lab tab
- [ ] Update gap analysis §2 lab table + §4.7 scores
- [ ] Run `npx turbo typecheck build test` + `e2e/v2-alerts.spec.ts` + `e2e/v2-smart-edit.spec.ts`
- [ ] Commit `docs: smart-edit parity and e2e`

---

## Task 8 (optional): react-core passthrough

Only if `HostedMarketsGrid` consumers need the toolbar without importing `@starui/grid` directly:

- [ ] Add `showSmartEditToolbar?: boolean` to `HostedMarketsGrid` props
- [ ] Forward to `MarketsGridContainer` / inner grid
- [ ] Test in `hostedMarketsGrid.caption.test.tsx` pattern

Skip if lab and demo-react pass props directly to `MarketsGrid`.

---

## markets-grid-lab demo script (acceptance)

```bash
npm run dev:markets-grid-lab
```

1. Open **Smart Edit** tab — grid loads with toolbar row visible
2. Drag-select 5+ cells in **Quantity** column
3. Enter operand `0.5`, click **×** — values halve
4. Click **Set…**, enter `1000000`, confirm — all selected become `1,000,000`
5. Focus one qty cell (not editing), press `+` three times — value increments by `incrementStep`
6. Double-click qty cell, type `1.5M`, Enter — parses to `1500000`
7. Open **Settings → Smart Edit** — toggle magnitude shortcuts off, verify parser stops
8. Switch to **Alerts** / **Overview** tabs — no layout break, no console errors
9. Flip theme toggle in lab header — toolbar + grid both render correctly in dark and light

---

## Follow-on (separate PR)

Validation alerts on bad edits — extends `@starui/engine` alerts evaluator; demo in lab Alerts tab.

---

## Self-review

| Requirement | Covered |
|-------------|---------|
| No new packages under `packages/` | Package placement table |
| Shared = framework-agnostic | Tasks 1–2 in `@starui/engine` |
| React = UI + module shell | Tasks 3–5 in `@starui/grid` |
| Angular path documented | Alerts mirror + `SmartEditGridReader` interface |
| markets-grid-lab demo | Task 6 + acceptance script |
| Zero regression | Task 0, Task 7, organic integration rules |
| shadcn + tokens only | Theming section |
| AG Grid 33+ | `applyTransactionAsync`, `getCellRanges` |
| Dark/light | `grid-chrome.css` + `ds-sheet-v2` on toolbar |

---

## Execution handoff

Plan updated: `docs/superpowers/plans/2026-05-27-smart-edit-family.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — one subagent per task (0–7), review between tasks
2. **Inline Execution** — implement in this session; checkpoints after Tasks 3, 5, 6, 7

Which approach?

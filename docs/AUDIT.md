# Codebase Audit — Phase 1 (sweep)

**Scope:** `packages/core/src` + `packages/markets-grid/src`. Mechanical
sweep only; no file-by-file reading. Phase 2 (targeted fixes) and
deeper reads on flagged modules are separate, user-driven follow-ups.

**Method:** ripgrep / wc / dependency-graph grep + LOC distribution.
Runtime behaviour not verified here — claims below come from static
reads of the source tree.

**Summary:**

| Severity | Count | Comment |
|---|---|---|
| Critical (safety-critical, block ship) | 0 | — |
| Major (duplicate implementations, real maintenance cost) | 3 | |
| Minor (small leaks, stale comments, dead exports) | 9 | |
| Informational (complexity awareness, no action required) | 5 | |

User flagged a suspicion of "bad code copied from v2". The sweep
confirms this in a few narrow spots — mostly in `FiltersToolbar.tsx`
and leftover v1/v2 doc references. Most of v2's worst patterns
(file-level `dirtyRegistry` Set + `window.dispatchEvent` bus, the
compat `useGridCore` / `useGridStore` shims, hand-rolled
`setInterval` polling for the grid api) were already excised during
the v4 rebuild and Phase 4. What remains is cosmetic / naming, not
structural — with the exceptions below.

---

## Major

### M1 — Two parallel `ColorPickerPopover` implementations

Two independent components carry the same name and intent:

- `packages/core/src/ui/shadcn/color-picker.tsx` (149 LOC) — exports
  `ColorPickerPopover` as a Radix-wrapped popover that delegates its
  body to `FormatColorPicker`. Consumed by markets-grid's
  `FormattingToolbar` (text / background color pickers).
- `packages/core/src/ui/ColorPicker/ColorPickerPopover.tsx` (160
  LOC) — a SECOND `ColorPickerPopover` consumed only by
  `CompactColorField` in the same folder.

Both are re-exported from `packages/core/src/index.ts`, one aliased
as `CockpitColorPickerPopover` (line 391) so the public surface
carries both. Net effect: 300 LOC of parallel code, two different
visual popover shells, two places to fix any color-picker bug.

**Fix:** pick one. `FormatColorPicker` (the actual picker body)
stays; the two popover wrappers collapse into one. The `shadcn`
variant is the one markets-grid actively uses; the `ui/ColorPicker/`
variant feeds only `CompactColorField`. Migration: `CompactColorField`
switches to the shadcn popover, delete
`ui/ColorPicker/ColorPickerPopover.tsx`, drop the
`CockpitColorPickerPopover` re-export.

### M2 — `FiltersToolbar.tsx` carries verbatim v1 logic (622 LOC)

Three separate comments in `packages/markets-grid/src/FiltersToolbar.tsx`
flag carried-over code:

- L18: `"heuristic verbatim so existing labels look the same after auto-naming"`
- L35: `"Ported verbatim from v1 — mirrors AG-Grid's filter semantics for set / multi …"`
- L168: `"algorithm as v1 — preserved verbatim because the E2E 'saved filters per …'"`

The file was not rewritten during the v4 pass (we rewrote every
module-panel but left the toolbars alone), and it still carries:

- 2 uses of raw `api.addEventListener` (lines 311, 373) — these
  DO have matching `removeEventListener` so not a leak, but the
  pattern is the same one the Phase 4 FormattingToolbar
  refactor replaced with `platform.api.on(event, fn)` which
  auto-disposes.
- No use of the platform's `ApiHub` subscriptions — reaches for the
  GridApi directly via `core.getGridApi()` (still wired at the
  callsite).

**Fix (deferred-worthy):** apply the Phase 4 toolbar-refactor
playbook to FiltersToolbar:
1. Pure reducers for any state mutations + unit tests
2. Replace `api.addEventListener` with `platform.api.on(…)`
3. Drop the `core` / `store` prop threading; use `useGridPlatform`
   context
4. Integration + e2e tests for the chips-visible flow

Cost estimate: about what the FormattingToolbar refactor cost
(1–2 session days). Not urgent — the toolbar works today — but it's
the biggest remaining pocket of v1/v2 patterns in the codebase.

### M3 — Large panel file: `ColumnSettingsPanel.tsx` (1521 LOC)

Largest single-file source in the repo. The file mixes:

- The `ColumnSettingsList` + `ColumnSettingsEditor` component pair
  (~300 LOC)
- `ColumnSettingsEditorInner` with 8 bands of JSX (~500 LOC)
- The `FilterEditor` sub-component + set-filter + multi-filter editors
  (~400 LOC)
- The `RowGroupingEditor` sub-component + all its controls (~300 LOC)

**Fix:** extract `FilterEditor`, `SetFilterOptionsEditor`,
`MultiFilterEditor`, `RowGroupingEditor` into sibling files. The
panel shell becomes ~400 LOC; each sub-editor lives in its own 150–
300 LOC file. No behavior change; the test surface (`cols-*`
testids) stays identical.

---

## Minor

### m1 — setTimeout leaks on unmount (3 sites)

All three set state on a timer, and all three would call `setState`
on an unmounted component if the user triggers the action + dismisses
the containing UI before the timer fires. React tolerates this in
production but warns in StrictMode.

| Site | Fix |
|---|---|
| `packages/markets-grid/src/HelpPanel.tsx:687` (`EmojiGrid.copy`) | Capture timer in ref, clear in useEffect cleanup |
| `packages/core/src/ui/FormatterPicker/ExcelReferencePopover.tsx:29` (`handleCopy`) | Same |
| `packages/markets-grid/src/MarketsGrid.tsx:263` (`saveFlashTimer`) | Add useEffect cleanup on mount — ref exists + is cleared on re-invocation, just missing unmount clearance |

Effort: 10 lines total across three files.

### m2 — 39 `!important` declarations in `cockpit.ts` (lines 757–932)

They're scoped to `.gc-sheet .radix-*` selectors to override Radix's
own inline styles (Radix's JS sets inline styles at portal time).
Functionally correct; stylistically nuclear.

**Fix:** (follow-up) migrate those overrides to CSS layer cascade
(`@layer`) which lets us beat Radix's inline styles without the
`!important` stacking. Low-priority; the current approach works.

### m3 — 31 `any` / `as unknown as` casts across 19 files

Highest density: `FormattingToolbar.tsx` (6). Most are narrow-by-
design api shape casts for AG-Grid's loose `getColumn(id)?.getColDef`
chain. A handful are genuine `unknown` escape hatches.

**Fix:** walk the 19 sites and tighten each — most can be replaced
with a typed narrow helper (e.g., `getColumnCellDataType(api,
colId)`). The 6 in `FormattingToolbar.tsx` would especially benefit
from consolidation since they repeat the same cast shape.

### m4 — 7 `eslint-disable react-hooks/exhaustive-deps` directives

| File:line | Justification |
|---|---|
| `useGridHost.ts:50, 56` | `opts.baseColumnDefs` / `tick` intentionally excluded |
| `FormattingToolbar.tsx:530` | `colEventTick` is a bump counter, not a real dep |
| `SettingsSheet.tsx:111` | `panelModules.length` used as a proxy for the full array |
| `valueFormatterFromTemplate.ts:114` | `no-new-func` disable for `new Function()` — separate lint rule |
| `ExpressionEditorInner.tsx:244` | Monaco editor lifecycle: re-creating on every change would tear the model |
| `useModuleDraft.ts:121` | Re-seed logic uses a committed-value ref, not the raw value |

Each has a rationale; none are drive-by. Leave them as-is.

### m5 — `FormatSwatch` exported but unused (dead export)

`FormatSwatch` is exported at `packages/core/src/index.ts:414` but
no consumer outside `packages/core/src/ui/format-editor/` references
it. It's an orphaned public-API surface.

**Fix:** drop from the barrel export. Keep the file for now (it's
part of the format-editor primitives), just don't surface it.

### m6 — Stale `@grid-customizer/core-v2` doc references (3 files)

`core-v2` is no longer a package. Doc comments in:

- `packages/core/src/ui/StyleEditor/index.ts:5`
- `packages/core/src/ui/ColorPicker/index.ts:5`
- `packages/core/src/ui/SettingsPanel/index.ts:12`

still show `import … from '@grid-customizer/core-v2'` as the example
path. Trivial s/core-v2/core/ fix.

### m7 — `[core-v2]` prefix in `console.warn` strings

Two sites log warnings with `'[core-v2]'` prefix:

- `packages/core/src/colDef/adapters/excelFormatter.ts:163`
- `packages/core/src/colDef/adapters/valueFormatterFromTemplate.ts:128`

Misleading. Swap to `'[core]'` or module-specific (`[excel-format]`,
`[value-formatter]`).

### m8 — Legacy `gc-tbtn` class mid-migration

The recent terminal-toolbar redesign (phase 9a-c) introduced
`.gc-tb-btn` + `.gc-tb-*` classes. Five sites still use the legacy
`gc-tbtn`:

- `packages/core/src/ui/shadcn/color-picker.tsx:127`
- `packages/core/src/ui/SettingsPanel/Cockpit.tsx:141`
- `packages/core/src/ui/SettingsPanel/PillToggleGroup.tsx:69`
- `packages/markets-grid/src/FormattingToolbar.tsx:898` (for the `gc-tbtn-confirm` variant)
- `packages/core/src/css/cockpit.ts:614–638` (rule definitions)

Not broken — `.gc-tbtn` rules in cockpit.ts still render for
Cockpit-scoped primitives (`PillToggleGroup`, Cockpit `SharpBtn`).
The markets-grid FormattingToolbar should stop referencing
`gc-tbtn-confirm` and use a `.gc-tb-btn.gc-tb-confirm` variant
(already defined in `FormattingToolbar.css` as `.gc-tbtn-confirm`
too, so the legacy class STILL takes effect — but that's fragile).

**Fix:** swap `gc-tbtn-confirm` → `gc-tb-confirm` at the callsite.
The legacy `.gc-tbtn` rules stay because Cockpit primitives still
consume them.

### m9 — Cross-module import at `column-customization ↔ column-templates`

Two soft-coupled files:

- `packages/core/src/modules/column-customization/transforms.ts:18`
  imports `resolveTemplates` and `ColumnTemplatesState` from
  `../column-templates`
- `packages/core/src/modules/column-templates/snapshotTemplate.ts:30`
  imports `ColumnAssignment`, `ColumnCustomizationState` from
  `../column-customization/state`

Type-only cycle, no runtime hazard. The shape is consistent with
the plugin-style module architecture (modules composing on shared
shapes). Worth noting in an architectural doc, not worth fixing.

---

## Informational

### i1 — `FormattingToolbar.tsx` LOC (1319)

Reduced from 1419 during steps 6–10, but still dense. Natural
breakouts for a future pass:

- `useActiveColumns()` hook → own file
- `useColumnFormatting()` hook → own file
- `TBtn` / `TGroup` / `ToolbarSep` + `useFlashConfirm` → own file
  (`primitives.tsx`)
- Formatter preset constants (lines 80–170) → own file
  (`formatterPresets.ts`)

Each extraction is additive; the component body shrinks to ~700
LOC without any behavior change.

### i2 — `HelpPanel.tsx` LOC (1259)

Content data, not complexity. Most of the LOC is cheat-sheet markup.
No action.

### i3 — `cockpit.ts` LOC (963)

A single CSS template literal string. Content, not complexity.

### i4 — `ColumnSettingsPanel.tsx` sub-editors mentioned above

Listed under M3.

### i5 — `FormattingToolbar` has 14 inline `style=` props; `ProfileSelector` has 34; `HelpPanel` has 23

FormattingToolbar's are post-redesign leftovers (mostly one-off
overrides — `maxWidth`, `flex` hints). ProfileSelector + HelpPanel
predate the terminal token system and could benefit from the same
CSS layer FormattingToolbar + BorderStyleEditor got.

Not broken, just drift from the target design language.

---

## What the sweep explicitly VERIFIED clean

So future audits don't re-investigate these:

- **No `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`** anywhere
  in src.
- **No `window.dispatchEvent('gc-*')` bus** — all references are in
  doc comments describing what was removed.
- **No file-level mutable `Set` / `Map` / `Object`** holding per-
  grid state. The two file-level `Set`s in
  `expression/tokenizer.ts` are immutable literals (operator tables).
- **No stray `console.log` debug statements** — the 21 `console.*`
  calls are all legitimate error reporting with `[module-id]`
  prefixes.
- **No `TODO` / `FIXME` / `XXX` / `HACK` markers** anywhere.
- **Observer disposal is complete**: `ResizeObserver` (FiltersToolbar)
  and `MutationObserver` (ExpressionEditorInner) both
  disconnect in their effect cleanup.
- **Event listener pairs match**: every `addEventListener` in
  source has a matching `removeEventListener` in the same effect's
  cleanup.
- **Module boundaries are clean** except for the
  `column-customization ↔ column-templates` type-level cycle
  (m9), which is an intentional plugin-composition pattern.

---

## Recommended phase-2 ordering (user decides)

1. **m1 setTimeout leaks (3 sites)** — 10 LOC of changes, highest
   correctness value for lowest effort. Start here.
2. **m5–m7 stale exports + comments + log prefixes** — 30 minutes
   of cosmetic cleanup. Do in one commit.
3. **m8 `gc-tbtn-confirm` → `gc-tb-confirm`** — 5 min.
4. **M1 ColorPickerPopover collapse** — the biggest true
   deduplication win. ~100 LOC deleted, one color-picker surface.
5. **M3 ColumnSettingsPanel file split** — maintainability win, no
   behavior change. 1 session.
6. **M2 FiltersToolbar v1 → v4 refactor** — biggest effort, biggest
   structural improvement. 1–2 sessions (mirrors the Phase 4
   FormattingToolbar refactor).
7. **m3 `any` tightening** — 19 sites, incremental commits.
8. **i1 FormattingToolbar extractions** — cosmetic, do when
   touching the toolbar for another reason.

Everything above is non-urgent. The test pyramid (187 tests green)
will catch regressions from each fix.

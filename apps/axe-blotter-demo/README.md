# `@starui/axe-blotter-demo`

IG corporate axe blotter built on `<MarketsGrid>` — demonstrates the
**programmatic API** path. No clicks through the Cockpit settings UI;
the entire visual profile (header renames, alignment, locked columns,
calculated columns, conditional styling rules) is constructed in code
via the same pure reducers the UI itself dispatches.

Visually mirrors the single-file reference at
`marketsui-grid-edit-demo.html` — same dark-financial palette, same
sidebar with keymap + linkage rules + activity log, same five-layer
edit subsystem (PendingEditBuffer → UndoStack → EditCoordinator → commit
pipeline). The interesting difference: those orthogonal subsystems
talk to MarketsGrid through its `MarketsGridHandle`, and the styled
view is module-state, not column-def boilerplate.

## Run

```bash
# From monorepo root
npm run dev -w @starui/axe-blotter-demo
# Vite at http://localhost:5192
```

Vite + React 19 + AG-Grid 35.1 — same dep set as `apps/demo-react`.

## What it shows

| Concern | Where it lives | API surface used |
|---|---|---|
| Grid mount | [src/App.tsx](src/App.tsx) | `<MarketsGrid>` props |
| Imperative handle | [src/App.tsx](src/App.tsx) — `onReady` | `MarketsGridHandle` (`gridApi` + `platform` + `profiles`) |
| Programmatic profile | [src/buildAxeProfile.ts](src/buildAxeProfile.ts) | `applyHeaderNameReducer`, `applyAlignmentReducer`, `applyEditableReducer`, `applyColorsReducer` |
| Calculated column | [src/buildAxeProfile.ts](src/buildAxeProfile.ts) — `buildCalculatedColumns` | `platform.store.replaceModuleState(CALCULATED_COLUMNS_MODULE_ID, …)` |
| Conditional styling | [src/buildAxeProfile.ts](src/buildAxeProfile.ts) — `buildConditionalStyling` | `platform.store.replaceModuleState(CONDITIONAL_STYLING_MODULE_ID, …)` |
| Pending-edit buffer | [src/editing.ts](src/editing.ts) | Plain TypeScript — orthogonal to the grid |
| Two-tier undo | [src/editing.ts](src/editing.ts) — `UndoStack` | Working frames + committed frames + redo |
| Linkage rules | [src/data.ts](src/data.ts) — `LINKAGE` + `EditCoordinator.stage` | Pure logic; bid↔ask preserve_spread, spread→bid derive |
| Range tick | [src/editing.ts](src/editing.ts) — `tickRange` | `gridApi.getCellRanges` |
| 3-phase commit | [src/editing.ts](src/editing.ts) — `commit` | `gridApi.applyTransactionAsync` + cell refresh |
| Streaming + conflicts | [src/streaming.ts](src/streaming.ts) | `gridApi.applyTransactionAsync` + DOM tick flash |

## Five things to try

1. **Edit a Bid cell** (F2 or double-click). Notice ASK auto-shifts to
   preserve spread; both go pending (yellow ◆).
2. **Range-select 5 spreads**, hit Alt+↑ five times. Watch one undo
   reverse the whole batch (intentId grouping).
3. **Ctrl+Enter** to commit. Cells pulse, then flash green = ack from
   the simulated ViewServer.
4. **While editing**, leave the bid cell alone — peer-pricing engine
   ticks the underlying value. Conflict glyph appears (⚠).
5. **Try a 30bp move on spread** — fat-finger reject (red hatched).

## Why this matters for showcasing the API

The Cockpit settings sheet is one way to author a profile. This demo
proves the same surface area is reachable in TypeScript:

- Every reducer used in [buildAxeProfile.ts](src/buildAxeProfile.ts) is
  exported from `@starui/core` — they're the SAME functions the
  toolbar calls.
- The conditional-styling rules are the same `ConditionalRule` shape
  the Cockpit's Style Rules panel produces.
- The virtual `pnlVsModel` column is the same `VirtualColumnDef` shape
  the Calculated Columns editor saves.
- After `applyAxeProfile()`, calling `handle.profiles.saveActiveProfile()`
  would persist the result — indistinguishable from a user-built profile.

This unlocks **shipping curated profiles as code**: a desk-specific
"axe blotter" preset, a "compliance review" preset, a "risk monitor"
preset — all selectable at runtime, all driven by the same module
system the UI uses.

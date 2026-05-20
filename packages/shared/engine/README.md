# @starui/engine

Vanilla TypeScript grid engine — ported from `@starui/core` (Phase 2).

## Contents

- **GridPlatform** — module pipeline, event bus, API hub
- **ProfileManager** — storage-agnostic profile state machine
- **ExpressionEngine** — 44 built-in functions, CSP policy gate
- **Persistence** — MemoryAdapter, LocalStorageBundleAdapter
- **HistoryStack** — undo/redo
- **colDef helpers** — formatters, themed styles

## Intentionally excluded (vs legacy core)

- `openFinWindowOpener` / `isOpenFin` — moved to `@starui/host-openfin` or `@starui/grid` (phase 3/5)
- All React UI — lives in `@starui/grid` (phase 3)

## Dependencies

- `@starui/types` — `composeRowId`, `getValueByPath`
- `ssf`, `zustand`, ag-grid (peer)

## Verify

```bash
npm run build -w @starui/engine
npm run test -w @starui/engine
```

# @stargrid/engine

Vanilla TypeScript grid engine — ported from `@starui/core` (Phase 2).

## Contents

- **GridPlatform** — module pipeline, event bus, API hub
- **ProfileManager** — storage-agnostic profile state machine
- **ExpressionEngine** — 44 built-in functions, CSP policy gate
- **Persistence** — MemoryAdapter, LocalStorageBundleAdapter
- **HistoryStack** — undo/redo
- **colDef helpers** — formatters, themed styles

## Intentionally excluded (vs legacy core)

- `openFinWindowOpener` / `isOpenFin` — moved to `@stargrid/host-openfin` or `@stargrid/grid` (phase 3/5)
- All React UI — lives in `@stargrid/grid` (phase 3)

## Dependencies

- `@stargrid/types` — `composeRowId`, `getValueByPath`
- `ssf`, `zustand`, ag-grid (peer)

## Verify

```bash
npm run build -w @stargrid/engine
npm run test -w @stargrid/engine
```

# @starui/ssrm-grid

CustomSSRMGrid — AG Grid Server-Side Row Model over a main-thread RowMirror engine.

## Phase 1 (Custom only)

This package is being introduced as the StarUI framework home for **CustomSSRMGrid** (main-thread RowMirror SSRM). Phase 1 scaffolds the package; CustomSSRMGrid source migration follows in subsequent tasks.

**Perspective-backed `SSRMGrid`** remains in the external [`ssrmgrid`](../../../../ssrmgrid) repo and is re-exported temporarily via `@starui/grid` (`ssrmgrid-entry.ts`) until a `@starui/ssrm-grid/perspective` follow-up.

## Consumption

Source-consumed package (no emit), like `@starui/grid`:

```ts
import { SSRM_GRID_PACKAGE } from '@starui/ssrm-grid';
```

## Peer dependencies

- `react` / `react-dom` ^19.2.5
- `ag-grid-community` / `ag-grid-enterprise` / `ag-grid-react` ^36.0.0

No `@finos/perspective` in this package's dependency graph.

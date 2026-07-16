# `@starui/ssrm-grid`

CustomSSRMGrid — AG Grid Server-Side Row Model over a main-thread RowMirror
engine. Part of the StarUI framework (`packages/react-grid/ssrm-grid`).

**Consumed as source** (same pattern as `@starui/grid`): no build emit;
importers resolve TypeScript from `src/`.

## MarketsGrid

`@starui/grid` mounts this package when `useSSRM` is true. There is **no**
Perspective / `SSRMGrid` integration on MarketsGrid.

## Peers

- `react` / `react-dom` ^19
- `ag-grid-community` / `ag-grid-enterprise` / `ag-grid-react` ^36
- `ag-charts-enterprise` ^14 (registered via `agGrid/modules.ts`)

# mockdata-provider-starui-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `apps/demo-apps/mockdata-provider-starui-app` Vite/React app that teaches developers how to use `MockDataProvider` with `MarketsGrid` two different ways, in a dock-manager workspace with full profile/layout management per grid.

**Architecture:** Single-page Vite app. Header + `<DockManagerCore>` workspace with 4 panels (ProviderConfigPanel, DirectGridPanel, DataServicesGridPanel, StatsPanel). One `MockConfigContext` is the single source of truth for the live `MockProviderConfig`. Direct panel runs `startMock()` in-process; DataServices panel goes through the full `<DataServicesProvider>` + `useProviderStream` stack. Each grid uses a unique `gridId` per (panel × dataType) so MarketsGrid's built-in profile/layout management persists independently for every combination.

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 7.3, Tailwind 3.4, shadcn/ui via `@starui/ui`, AG-Grid 35.1 via `@starui/markets-grid`, `@starui/data-services` + `@starui/data-services-react`, `@widgetstools/react-dock-manager` 1.0.

**Reference design doc:** [`docs/superpowers/specs/2026-05-17-mockdata-provider-starui-app-design.md`](../specs/2026-05-17-mockdata-provider-starui-app-design.md).

---

## File Structure

All paths under `apps/demo-apps/mockdata-provider-starui-app/`:

| File | Responsibility |
|------|----------------|
| `index.html` | Vite entry html, fonts, root mount point |
| `package.json` | Workspace + deps (tarball file: deps + dock-manager from npm) |
| `tsconfig.json` | Extends `../../../tsconfig.base.json`, noEmit |
| `vite.config.ts` | React plugin, port 5192, sourcemap chunks |
| `tailwind.config.js` | Uses `@starui/design-system/tailwind` preset, scans `./src` + workspace packages |
| `postcss.config.js` | tailwindcss/nesting + tailwindcss + autoprefixer |
| `src/main.tsx` | `applyTheme()`, wrap `<App />` in `<DataServicesProvider>`, mount |
| `src/App.tsx` | Header (brand, theme toggle, help) + `<DockManagerCore>` initial layout |
| `src/globals.css` | Import design-system CSS, markets-grid CSS, dock-manager CSS, Tailwind layers |
| `src/dataServices.ts` | One-call `createDataServicesClient(...)` bundle |
| `src/state/MockConfigContext.tsx` | React Context with `cfg` + 4 setters + `reset` |
| `src/state/StatsContext.tsx` | React Context for grid panels to push tick events to StatsPanel |
| `src/data/positionColumns.ts` | AG-Grid column defs for `dataType='positions'` |
| `src/data/tradeColumns.ts` | AG-Grid column defs for `dataType='trades'` |
| `src/data/orderColumns.ts` | AG-Grid column defs for `dataType='orders'` (legacy mock) |
| `src/data/columnDefsByType.ts` | Lookup map: dataType → `{ columnDefs, rowIdField, defaultColDef }` |
| `src/data/applyDelta.ts` | Pure helper: merge incoming rows into snapshot by id |
| `src/panels/ProviderConfigPanel.tsx` | Controls + ConfigPreview |
| `src/panels/DirectGridPanel.tsx` | `startMock()` + MarketsGrid + StatsContext push |
| `src/panels/DataServicesGridPanel.tsx` | `useProviderStream()` + MarketsGrid + StatsContext push |
| `src/panels/StatsPanel.tsx` | Renders rolling tick stats from StatsContext |
| `src/components/Brand.tsx` | Copy from basic-starui-app, retitle |
| `src/components/HelpSheet.tsx` | 5-tab help drawer about MockDataProvider |
| `src/components/ConfigPreview.tsx` | Read-only JSON pretty-print inside `ScrollArea` |

---

## Task 0: Scaffolding & workspace registration

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/package.json`
- Create: `apps/demo-apps/mockdata-provider-starui-app/tsconfig.json`
- Create: `apps/demo-apps/mockdata-provider-starui-app/vite.config.ts`
- Create: `apps/demo-apps/mockdata-provider-starui-app/postcss.config.js`
- Create: `apps/demo-apps/mockdata-provider-starui-app/tailwind.config.js`
- Create: `apps/demo-apps/mockdata-provider-starui-app/index.html`
- Modify: `package.json` (add `dev:mockdata-provider-starui-app` script)

- [ ] **Step 0.1: Create `package.json`**

Create `apps/demo-apps/mockdata-provider-starui-app/package.json`:

```json
{
  "name": "@starui/mockdata-provider-starui-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@starui/config-service": "file:../../../libs/starui-config-service-1.0.0-d9ffa570.tgz",
    "@starui/core": "file:../../../libs/starui-core-0.1.0-7ca3bf3f.tgz",
    "@starui/data-services": "file:../../../libs/starui-data-services-0.1.0-b8784441.tgz",
    "@starui/data-services-react": "file:../../../libs/starui-data-services-react-0.1.0-6cabfb16.tgz",
    "@starui/design-system": "file:../../../libs/starui-design-system-0.1.0-09d9b5a5.tgz",
    "@starui/grid-react": "file:../../../libs/starui-grid-react-0.1.0-b922fa66.tgz",
    "@starui/icons-svg": "file:../../../libs/starui-icons-svg-1.0.0-4be1519a.tgz",
    "@starui/markets-grid": "file:../../../libs/starui-markets-grid-0.1.0-96a300e6.tgz",
    "@starui/runtime-port": "file:../../../libs/starui-runtime-port-0.1.0-420f624f.tgz",
    "@starui/shared-types": "file:../../../libs/starui-shared-types-1.0.0-f2db6906.tgz",
    "@starui/ui": "file:../../../libs/starui-ui-1.0.0-eae6ca5c.tgz",
    "@widgetstools/dock-manager-core": "^1.0.0",
    "@widgetstools/react-dock-manager": "^1.0.0",
    "ag-grid-community": "35.1.0",
    "ag-grid-enterprise": "35.1.0",
    "ag-grid-react": "35.1.0",
    "react": "~19.2.5",
    "react-dom": "~19.2.5"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "~4.5.2",
    "autoprefixer": "^10.4.27",
    "postcss": "^8.5.9",
    "tailwindcss": "3.4.1",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "~5.9.3",
    "vite": "~7.3.2"
  }
}
```

**Note:** Re-check `libs/manifest.json` before pasting — tarball SHAs may have changed since this plan was written. Replace each `starui-*-<sha>.tgz` filename with the current value from the manifest.

- [ ] **Step 0.2: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 0.3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5192, open: true },
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
});
```

Port `5192` chosen to sit immediately after `basic-starui-app`'s `5191`.

- [ ] **Step 0.4: Create `postcss.config.js`**

```js
export default {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 0.5: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../../packages/react/ui/src/**/*.{ts,tsx}',
    '../../../packages/react/widgets/**/src/**/*.{ts,tsx}',
    '../../../packages/shared/core/src/**/*.{ts,tsx}',
    './node_modules/@starui/ui/dist/**/*.{js,mjs}',
    './node_modules/@starui/markets-grid/dist/**/*.{js,mjs}',
    './node_modules/@starui/grid-react/dist/**/*.{js,mjs}',
  ],
};
```

- [ ] **Step 0.6: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StarUI — MockDataProvider Demo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="overflow-hidden">
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 0.7: Verify workspace glob already covers the new app**

Run: `grep -n "apps/demo-apps" /Users/develop/wfh/starui/package.json`
Expected: line `"apps/demo-apps/*",` is present (it is — no edit needed).

- [ ] **Step 0.8: Add convenience dev script**

Modify root `package.json` — locate the existing `dev:basic-starui-app` line and add immediately after:

```json
    "dev:mockdata-provider-starui-app": "turbo dev --filter=@starui/mockdata-provider-starui-app",
```

- [ ] **Step 0.9: Install**

```bash
npm install
```

Expected: completes cleanly. If npm complains it cannot find a tarball, re-check the filenames in step 0.1 against `libs/manifest.json` and retry. NEVER add `--legacy-peer-deps` or `--force`.

- [ ] **Step 0.10: Commit scaffolding**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/ package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(apps): scaffold mockdata-provider-starui-app

Workspace + Vite/TS config only; no source code yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Globals + main entry + theme bootstrap

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/globals.css`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/main.tsx`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/App.tsx` (stub)

- [ ] **Step 1.1: Create `src/globals.css`**

```css
@import '@starui/design-system/css';
@import '@starui/markets-grid/styles.css';
@import '@widgetstools/react-dock-manager/styles.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  * { @apply border-border; }
  html,
  body,
  #root {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
  }
  html { overflow: hidden; }
  body {
    overflow: hidden;
    background: var(--ds-surface-ground);
    color: var(--ds-text-primary);
    font-family: var(--ds-font-sans), -apple-system, sans-serif;
    font-size: var(--ds-font-size-body);
    -webkit-font-smoothing: antialiased;
  }
}
```

Import order matters: design-system tokens first → markets-grid theme → dock-manager defaults → Tailwind layers. Dock-manager CSS sits in the middle so Tailwind utility classes still win for app surfaces.

- [ ] **Step 1.2: Create stub `src/App.tsx`**

```tsx
export function App() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <span className="font-mono text-sm">mockdata-provider-starui-app — boot OK</span>
    </div>
  );
}
```

- [ ] **Step 1.3: Create `src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { App } from './App';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 1.4: Boot smoke-test**

Run: `npm run dev -w @starui/mockdata-provider-starui-app`
Expected: Vite logs `Local: http://localhost:5192/`. Open the page — the "boot OK" placeholder shows on the design-system surface (dark or light depending on persisted preference). No console errors. Stop the dev server (Ctrl+C).

- [ ] **Step 1.5: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 1.6: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — boot stub with design-system + dock CSS

Wires globals.css (design-system + markets-grid + dock-manager
stylesheets, Tailwind layers, base reset) and a minimal main.tsx that
applies the persisted theme and renders an "boot OK" placeholder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: MockConfigContext (single source of truth)

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/state/MockConfigContext.tsx`

- [ ] **Step 2.1: Implement context**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MockProviderConfig } from '@starui/shared-types';

const DEFAULT_CFG: MockProviderConfig = {
  providerType: 'mock',
  dataType: 'positions',
  rowCount: 200,
  updateIntervalMs: 750,
  enableUpdates: true,
};

interface Ctx {
  cfg: MockProviderConfig;
  setDataType: (dt: 'positions' | 'trades' | 'orders') => void;
  setRowCount: (n: number) => void;
  setUpdateIntervalMs: (ms: number) => void;
  setEnableUpdates: (on: boolean) => void;
  reset: () => void;
}

const MockConfigCtx = createContext<Ctx | null>(null);

export function MockConfigProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<MockProviderConfig>(DEFAULT_CFG);

  const setDataType = useCallback(
    (dataType: 'positions' | 'trades' | 'orders') =>
      setCfg((c) => (c.dataType === dataType ? c : { ...c, dataType })),
    [],
  );
  const setRowCount = useCallback(
    (rowCount: number) =>
      setCfg((c) => (c.rowCount === rowCount ? c : { ...c, rowCount })),
    [],
  );
  const setUpdateIntervalMs = useCallback(
    (updateIntervalMs: number) =>
      setCfg((c) =>
        c.updateIntervalMs === updateIntervalMs ? c : { ...c, updateIntervalMs },
      ),
    [],
  );
  const setEnableUpdates = useCallback(
    (enableUpdates: boolean) =>
      setCfg((c) =>
        c.enableUpdates === enableUpdates ? c : { ...c, enableUpdates },
      ),
    [],
  );
  const reset = useCallback(() => setCfg(DEFAULT_CFG), []);

  const value = useMemo<Ctx>(
    () => ({ cfg, setDataType, setRowCount, setUpdateIntervalMs, setEnableUpdates, reset }),
    [cfg, setDataType, setRowCount, setUpdateIntervalMs, setEnableUpdates, reset],
  );

  return <MockConfigCtx.Provider value={value}>{children}</MockConfigCtx.Provider>;
}

export function useMockConfig(): Ctx {
  const ctx = useContext(MockConfigCtx);
  if (!ctx) throw new Error('useMockConfig must be used inside <MockConfigProvider>');
  return ctx;
}
```

Identity guard inside each setter (`c.x === next ? c : ...`) keeps cfg reference stable so downstream `useProviderStream` does not re-attach for no-op writes.

- [ ] **Step 2.2: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 2.3: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/state/
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — MockConfigContext

Single source of truth for the live MockProviderConfig. Setters skip
no-op writes so cfg reference identity stays stable for downstream
useProviderStream / restart() dedupe.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Column defs + applyDelta helper

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/data/positionColumns.ts`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/data/tradeColumns.ts`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/data/orderColumns.ts`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/data/columnDefsByType.ts`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/data/applyDelta.ts`

- [ ] **Step 3.1: Create `applyDelta.ts`**

```ts
/**
 * Merge incoming provider rows into the current snapshot by id. Pure;
 * always returns a new array. New rows are appended at the end;
 * existing rows are replaced in place.
 */
export function applyDelta<T extends Record<string, unknown>>(
  snapshot: readonly T[],
  incoming: readonly T[],
  idField: keyof T,
): T[] {
  if (incoming.length === 0) return snapshot as T[];
  const byId = new Map<unknown, number>();
  for (let i = 0; i < snapshot.length; i++) {
    byId.set(snapshot[i][idField], i);
  }
  const next = snapshot.slice();
  for (const row of incoming) {
    const idx = byId.get(row[idField]);
    if (idx === undefined) {
      byId.set(row[idField], next.length);
      next.push(row);
    } else {
      next[idx] = row;
    }
  }
  return next;
}
```

- [ ] **Step 3.2: Create `positionColumns.ts`**

```ts
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const intl = new Intl.NumberFormat('en-US');

const fmtPx = (p: ValueFormatterParams) =>
  p.value == null ? '' : num3.format(p.value as number);
const fmtYield = (p: ValueFormatterParams) =>
  p.value == null ? '' : `${num3.format(p.value as number)}%`;
const fmtMoney = (p: ValueFormatterParams) =>
  p.value == null ? '' : intl.format(Math.round(p.value as number));
const fmtNum2 = (p: ValueFormatterParams) =>
  p.value == null ? '' : num2.format(p.value as number);

export const positionColumnDefs: ColDef[] = [
  { field: 'cusip',        headerName: 'CUSIP',    width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'ticker',       headerName: 'Tkr',      width: 80,  pinned: 'left', filter: 'agSetColumnFilter' },
  { field: 'description',  headerName: 'Description', width: 240, filter: 'agTextColumnFilter' },
  { field: 'assetClass',   headerName: 'Class',    width: 100, filter: 'agSetColumnFilter' },
  { field: 'sector',       headerName: 'Sector',   width: 120, filter: 'agSetColumnFilter' },
  { field: 'currency',     headerName: 'Ccy',      width: 70,  filter: 'agSetColumnFilter' },
  { field: 'coupon',       headerName: 'Cpn %',    width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'maturity',     headerName: 'Maturity', width: 110, filter: 'agTextColumnFilter' },
  { field: 'bidPrice',     headerName: 'Bid',      width: 90,  type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'midPrice',     headerName: 'Mid',      width: 90,  type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'askPrice',     headerName: 'Ask',      width: 90,  type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'yieldToMaturity', headerName: 'YTM',   width: 100, type: 'numericColumn', valueFormatter: fmtYield, filter: 'agNumberColumnFilter' },
  { field: 'oas',          headerName: 'OAS',      width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'duration',     headerName: 'Dur',      width: 80,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'dv01',         headerName: 'DV01',     width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'quantity',     headerName: 'Qty',      width: 100, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'marketValue',  headerName: 'MV',       width: 140, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'pnlDay',       headerName: 'P&L (D)',  width: 110, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'pnlMtd',       headerName: 'P&L (MTD)', width: 130, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'pnlYtd',       headerName: 'P&L (YTD)', width: 140, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'book',         headerName: 'Book',     width: 120, filter: 'agSetColumnFilter' },
  { field: 'trader',       headerName: 'Trader',   width: 120, filter: 'agSetColumnFilter' },
  { field: 'account',      headerName: 'Account',  width: 100, filter: 'agSetColumnFilter' },
];
```

Field names track the `PositionRow` shape emitted by `mockPosition.ts`. If `PositionRow` has renamed a field since this plan, replace the `field` value with the current one (the rest of the column def stays).

- [ ] **Step 3.3: Create `tradeColumns.ts`**

```ts
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

const num3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const intl = new Intl.NumberFormat('en-US');

const fmtPx = (p: ValueFormatterParams) =>
  p.value == null ? '' : num3.format(p.value as number);
const fmtMoney = (p: ValueFormatterParams) =>
  p.value == null ? '' : intl.format(Math.round(p.value as number));
const fmtTime = (p: ValueFormatterParams) => {
  const v = p.value as string | number | null | undefined;
  if (v == null) return '';
  return new Date(v).toLocaleTimeString('en-GB', { hour12: false });
};

export const tradeColumnDefs: ColDef[] = [
  { field: 'tradeId',     headerName: 'Trade ID',  width: 130, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'cusip',       headerName: 'CUSIP',     width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'ticker',      headerName: 'Tkr',       width: 80,  filter: 'agSetColumnFilter' },
  { field: 'side',        headerName: 'Side',      width: 80,  filter: 'agSetColumnFilter' },
  { field: 'tradeStatus', headerName: 'Status',    width: 110, filter: 'agSetColumnFilter' },
  { field: 'quantity',    headerName: 'Qty',       width: 110, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'price',       headerName: 'Price',     width: 100, type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'notional',    headerName: 'Notional',  width: 140, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'trader',      headerName: 'Trader',    width: 120, filter: 'agSetColumnFilter' },
  { field: 'counterparty', headerName: 'Cpty',     width: 130, filter: 'agSetColumnFilter' },
  { field: 'tradeDate',   headerName: 'Trade Dt',  width: 110, filter: 'agTextColumnFilter' },
  { field: 'settleDate',  headerName: 'Settle Dt', width: 110, filter: 'agTextColumnFilter' },
  { field: 'tradeTime',   headerName: 'Time',      width: 100, valueFormatter: fmtTime, filter: 'agTextColumnFilter' },
  { field: 'venue',       headerName: 'Venue',     width: 110, filter: 'agSetColumnFilter' },
  { field: 'currency',    headerName: 'Ccy',       width: 70,  filter: 'agSetColumnFilter' },
];
```

- [ ] **Step 3.4: Create `orderColumns.ts`**

```ts
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPx = (p: ValueFormatterParams) =>
  p.value == null ? '' : num2.format(p.value as number);
const fmtTime = (p: ValueFormatterParams) => {
  const v = p.value as number | null | undefined;
  if (v == null) return '';
  return new Date(v).toLocaleTimeString('en-GB', { hour12: false });
};

export const orderColumnDefs: ColDef[] = [
  { field: 'id',         headerName: 'ID',         width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'instrument', headerName: 'Symbol',     width: 110, filter: 'agSetColumnFilter' },
  { field: 'side',       headerName: 'Side',       width: 80,  filter: 'agSetColumnFilter' },
  { field: 'status',     headerName: 'Status',     width: 140, filter: 'agSetColumnFilter' },
  { field: 'quantity',   headerName: 'Qty',        width: 100, type: 'numericColumn', filter: 'agNumberColumnFilter' },
  { field: 'price',      headerName: 'Price',      width: 110, type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'timestamp',  headerName: 'Time',       width: 110, valueFormatter: fmtTime, filter: 'agTextColumnFilter' },
];
```

- [ ] **Step 3.5: Create `columnDefsByType.ts`**

```ts
import type { ColDef } from 'ag-grid-community';
import { positionColumnDefs } from './positionColumns';
import { tradeColumnDefs } from './tradeColumns';
import { orderColumnDefs } from './orderColumns';

export interface DataTypeConfig {
  columnDefs: ColDef[];
  rowIdField: string;
  defaultColDef: ColDef;
}

const defaultColDef: ColDef = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

export const columnDefsByType: Record<
  'positions' | 'trades' | 'orders',
  DataTypeConfig
> = {
  positions: { columnDefs: positionColumnDefs, rowIdField: 'cusip',   defaultColDef },
  trades:    { columnDefs: tradeColumnDefs,    rowIdField: 'tradeId', defaultColDef },
  orders:    { columnDefs: orderColumnDefs,    rowIdField: 'id',      defaultColDef },
};
```

Positions are keyed by `cusip` (one position per instrument); trades by `tradeId`; orders by `id` (the legacy generator emits `row-N`).

- [ ] **Step 3.6: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 3.7: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/data/
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — column defs + applyDelta

Three AG-Grid column-def sets matching MockProvider's emitted row
shapes (positions, trades, orders), a lookup map keyed by dataType,
and a pure applyDelta() helper that merges incoming rows into the
current snapshot by configurable id field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: dataServices.ts + DataServicesProvider wiring

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/dataServices.ts`
- Modify: `apps/demo-apps/mockdata-provider-starui-app/src/main.tsx`

- [ ] **Step 4.1: Create `src/dataServices.ts`**

```ts
import { createDataServicesClient } from '@starui/data-services';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

let bundle: ReturnType<typeof createDataServicesClient> | null = null;
let bootstrapError: Error | null = null;

try {
  bundle = createDataServicesClient({
    appName: 'mockdata-provider-starui-app',
    userId: LOGGED_IN_USER_ID,
    configServiceRestUrl: undefined,
  });
} catch (err) {
  bootstrapError = err instanceof Error ? err : new Error(String(err));
}

export const dataServices = bundle;
export const dataServicesBootstrapError = bootstrapError;
```

Wrap in try/catch so a SharedWorker failure in private browsing or
restricted contexts surfaces as a soft error in `DataServicesGridPanel`
(see Task 7) rather than blowing up the entire app at module evaluation.

- [ ] **Step 4.2: Update `src/main.tsx`**

Replace the existing file with:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { DataServicesProvider } from '@starui/data-services-react/runtime';
import { App } from './App';
import { dataServices } from './dataServices';
import { MockConfigProvider } from './state/MockConfigContext';
import './globals.css';

applyTheme(getTheme());

const root = createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <MockConfigProvider>
      {dataServices
        ? <DataServicesProvider services={dataServices}><App /></DataServicesProvider>
        : <App />}
    </MockConfigProvider>
  </React.StrictMode>,
);
```

When `dataServices` is null (bootstrap failed), the app still mounts; the DataServices panel will render an inline error instead of a grid.

- [ ] **Step 4.3: Boot smoke-test**

Run: `npm run dev -w @starui/mockdata-provider-starui-app`
Expected: page still loads to "boot OK". DevTools → Application → Service Workers / Shared Workers: a worker named with `mockdata-provider-starui-app` is registered. Console: no errors. Stop the server.

- [ ] **Step 4.4: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 4.5: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/dataServices.ts apps/demo-apps/mockdata-provider-starui-app/src/main.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — bootstrap DataServices bundle

createDataServicesClient() wrapped in try/catch so SharedWorker
failures fail soft. main.tsx mounts DataServicesProvider + the new
MockConfigProvider above <App />.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: StatsContext + StatsPanel

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/state/StatsContext.tsx`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/panels/StatsPanel.tsx`

- [ ] **Step 5.1: Create `StatsContext.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

export type StatsSource = 'direct' | 'dataservices';

export interface SourceStats {
  rowCount: number;
  ticksPerSec: number;   // rolling 5-second average
  lastTickAt: number | null;
}

interface Ring {
  ts: number[];           // tick timestamps inside the 5-second window
  lastRowCount: number;
  lastTickAt: number | null;
}

interface Ctx {
  recordTick: (source: StatsSource, ts: number, rowCount: number) => void;
  /** Read a synchronous snapshot. Called by StatsPanel on its 1Hz interval. */
  read: (source: StatsSource) => SourceStats;
}

const StatsCtx = createContext<Ctx | null>(null);
const WINDOW_MS = 5_000;

export function StatsProvider({ children }: { children: ReactNode }) {
  const ringsRef = useRef<Record<StatsSource, Ring>>({
    direct:       { ts: [], lastRowCount: 0, lastTickAt: null },
    dataservices: { ts: [], lastRowCount: 0, lastTickAt: null },
  });

  const recordTick = useCallback(
    (source: StatsSource, ts: number, rowCount: number) => {
      const r = ringsRef.current[source];
      r.ts.push(ts);
      r.lastTickAt = ts;
      r.lastRowCount = rowCount;
      const cutoff = ts - WINDOW_MS;
      while (r.ts.length > 0 && r.ts[0] < cutoff) r.ts.shift();
    },
    [],
  );

  const read = useCallback((source: StatsSource): SourceStats => {
    const r = ringsRef.current[source];
    // Filter stale timestamps if no tick has arrived recently.
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    while (r.ts.length > 0 && r.ts[0] < cutoff) r.ts.shift();
    return {
      rowCount: r.lastRowCount,
      ticksPerSec: r.ts.length / (WINDOW_MS / 1000),
      lastTickAt: r.lastTickAt,
    };
  }, []);

  const value = useMemo<Ctx>(() => ({ recordTick, read }), [recordTick, read]);

  return <StatsCtx.Provider value={value}>{children}</StatsCtx.Provider>;
}

export function useStats(): Ctx {
  const ctx = useContext(StatsCtx);
  if (!ctx) throw new Error('useStats must be used inside <StatsProvider>');
  return ctx;
}
```

Tick storage lives in a ref so `recordTick` does NOT re-render
subscribers — only the StatsPanel's 1Hz tick triggers paints.

- [ ] **Step 5.2: Create `StatsPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useStats, type SourceStats } from '../state/StatsContext';
import { useMockConfig } from '../state/MockConfigContext';
import { Badge } from '@starui/ui';
import { Activity, Cog } from 'lucide-react';

export function StatsPanel() {
  const stats = useStats();
  const { cfg } = useMockConfig();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // `tick` participates so the panel re-reads each second.
  void tick;
  const direct = stats.read('direct');
  const ds = stats.read('dataservices');

  return (
    <div className="flex h-full w-full items-center gap-6 overflow-x-auto bg-[color:var(--ds-surface-primary)] px-4 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">
      <StatsBlock label="Direct"        icon={<Activity size={12} strokeWidth={1.75} />} s={direct} />
      <Divider />
      <StatsBlock label="DataServices"  icon={<Activity size={12} strokeWidth={1.75} />} s={ds} />
      <Divider />
      <ConfigEcho cfg={cfg} />
    </div>
  );
}

function StatsBlock({ label, icon, s }: { label: string; icon: React.ReactNode; s: SourceStats }) {
  return (
    <div className="flex items-center gap-3">
      <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
        <span className="mr-1 inline-flex">{icon}</span>
        {label}
      </Badge>
      <span className="font-mono text-[11px]">
        <span className="text-[color:var(--ds-text-primary)]">{s.rowCount.toLocaleString()}</span>
        <span className="text-[color:var(--ds-text-faint)]"> rows</span>
      </span>
      <span className="font-mono text-[11px]">
        <span className="text-[color:var(--ds-text-primary)]">{s.ticksPerSec.toFixed(1)}</span>
        <span className="text-[color:var(--ds-text-faint)]"> ticks/s</span>
      </span>
      <span className="font-mono text-[11px]">
        <span className="text-[color:var(--ds-text-faint)]">last </span>
        <span className="text-[color:var(--ds-text-primary)]">{relTime(s.lastTickAt)}</span>
      </span>
    </div>
  );
}

function ConfigEcho({ cfg }: { cfg: ReturnType<typeof useMockConfig>['cfg'] }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px]">
      <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-muted,var(--ds-text-secondary))]">
        <Cog size={12} strokeWidth={1.75} className="mr-1" />
        Config
      </Badge>
      <span><span className="text-[color:var(--ds-text-faint)]">dataType </span><span className="text-[color:var(--ds-text-primary)]">{cfg.dataType}</span></span>
      <span><span className="text-[color:var(--ds-text-faint)]">rowCount </span><span className="text-[color:var(--ds-text-primary)]">{cfg.rowCount}</span></span>
      <span><span className="text-[color:var(--ds-text-faint)]">interval </span><span className="text-[color:var(--ds-text-primary)]">{cfg.updateIntervalMs}ms</span></span>
      <span><span className="text-[color:var(--ds-text-faint)]">updates </span><span className="text-[color:var(--ds-text-primary)]">{cfg.enableUpdates ? 'on' : 'off'}</span></span>
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px shrink-0 bg-[color:var(--ds-border-primary)]" />;
}

function relTime(ts: number | null): string {
  if (ts == null) return '—';
  const dms = Date.now() - ts;
  if (dms < 1000) return `${dms}ms ago`;
  if (dms < 60_000) return `${(dms / 1000).toFixed(1)}s ago`;
  return `${Math.floor(dms / 60_000)}m ago`;
}
```

- [ ] **Step 5.3: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 5.4: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/state/StatsContext.tsx apps/demo-apps/mockdata-provider-starui-app/src/panels/StatsPanel.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — StatsContext + StatsPanel

Ref-backed rolling 5-second tick ring per source so recordTick() does
not paint. StatsPanel polls at 1Hz and renders rows / ticks-per-sec /
last-tick-ago per source plus a live config echo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: DirectGridPanel

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/panels/DirectGridPanel.tsx`

- [ ] **Step 6.1: Implement panel**

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
  type MarketsGridHandle,
} from '@starui/markets-grid';
import { startMock } from '@starui/data-services';
import type { ProviderHandle } from '@starui/data-services/runtime';
import { useMockConfig } from '../state/MockConfigContext';
import { useStats } from '../state/StatsContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { applyDelta } from '../data/applyDelta';

const storage = createMarketsGridLocalStorageStorage();

export function DirectGridPanel() {
  const { cfg } = useMockConfig();
  const { recordTick } = useStats();
  const gridId = `mockdata-direct-${cfg.dataType}-v1`;
  const { columnDefs, rowIdField, defaultColDef } = columnDefsByType[cfg.dataType];

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const rowsRef = useRef<Record<string, unknown>[]>([]);
  const handleRef = useRef<ProviderHandle | null>(null);
  const gridRef = useRef<MarketsGridHandle | null>(null);

  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
    handleRef.current = startMock(cfg, (evt) => {
      if ('rows' in evt) {
        if (evt.replace) {
          rowsRef.current = [...(evt.rows as Record<string, unknown>[])];
        } else {
          rowsRef.current = applyDelta(
            rowsRef.current,
            evt.rows as Record<string, unknown>[],
            rowIdField,
          );
        }
        setRows(rowsRef.current);
        recordTick('direct', Date.now(), rowsRef.current.length);
      }
    });
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [cfg, rowIdField, recordTick]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <MarketsGrid
        key={gridId}
        ref={gridRef}
        gridId={gridId}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowIdField={rowIdField}
        storage={storage}
        showFiltersToolbar
        showFormattingToolbar
        showProfileSelector
        showSaveButton
        showSettingsButton
        componentName={`Direct · ${cfg.dataType}`}
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
            { statusPanel: 'agAggregationComponent', align: 'right' },
          ],
        }}
      />
    </div>
  );
}
```

`key={gridId}` is the remount trigger when dataType changes — MarketsGrid then re-initialises its profile bundle under the new key, and any saved layouts for that (panel × dataType) replay automatically.

- [ ] **Step 6.2: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes. If `startMock` is not exported from `@starui/data-services` root, switch the import to `'@starui/data-services/runtime/providers/transports/mock'`.

- [ ] **Step 6.3: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/panels/DirectGridPanel.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — DirectGridPanel

Subscribes to MockConfigContext, runs startMock() in-process, merges
snapshots + deltas via applyDelta, pushes tick timestamps to
StatsContext, and renders MarketsGrid with full profile/layout
management enabled. gridId is `mockdata-direct-${dataType}-v1` so
each (panel × dataType) has its own profile bundle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: DataServicesGridPanel

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/panels/DataServicesGridPanel.tsx`

- [ ] **Step 7.1: Implement panel**

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
} from '@starui/markets-grid';
import { useProviderStream } from '@starui/data-services-react/runtime';
import { useMockConfig } from '../state/MockConfigContext';
import { useStats } from '../state/StatsContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { applyDelta } from '../data/applyDelta';
import { dataServices, dataServicesBootstrapError } from '../dataServices';
import { TriangleAlert } from 'lucide-react';

const storage = createMarketsGridLocalStorageStorage();

export function DataServicesGridPanel() {
  if (!dataServices) {
    return <BootstrapErrorState />;
  }
  return <DataServicesGridInner />;
}

function DataServicesGridInner() {
  const { cfg } = useMockConfig();
  const { recordTick } = useStats();
  const gridId = `mockdata-via-ds-${cfg.dataType}-v1`;
  const providerId = `mock-${cfg.dataType}`;
  const { columnDefs, rowIdField, defaultColDef } = columnDefsByType[cfg.dataType];

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const rowsRef = useRef<Record<string, unknown>[]>([]);

  // Clear snapshot on dataType swap so the new providerId starts with
  // an empty grid instead of stale rows from the previous shape.
  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
  }, [cfg.dataType]);

  useProviderStream<Record<string, unknown>>(providerId, cfg, {
    onDelta: (incoming, replace) => {
      if (replace) {
        rowsRef.current = [...incoming];
      } else {
        rowsRef.current = applyDelta(rowsRef.current, incoming, rowIdField);
      }
      setRows(rowsRef.current);
      recordTick('dataservices', Date.now(), rowsRef.current.length);
    },
    onStatus: () => undefined,
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <MarketsGrid
        key={gridId}
        gridId={gridId}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowIdField={rowIdField}
        storage={storage}
        showFiltersToolbar
        showFormattingToolbar
        showProfileSelector
        showSaveButton
        showSettingsButton
        componentName={`DataServices · ${cfg.dataType}`}
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
            { statusPanel: 'agAggregationComponent', align: 'right' },
          ],
        }}
      />
    </div>
  );
}

function BootstrapErrorState() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[color:var(--ds-surface-ground)] p-6">
      <div className="flex max-w-md items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-4 text-[12px] text-[color:var(--ds-text-secondary)]">
        <TriangleAlert size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-[color:var(--ds-accent-warning,var(--ds-accent-info))]" />
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-primary)]">
            DataServices bootstrap failed
          </span>
          <span className="leading-relaxed">
            {dataServicesBootstrapError?.message ?? 'Unknown error'}
          </span>
          <span className="text-[color:var(--ds-text-faint)] leading-relaxed">
            SharedWorker is unavailable in this browser context (private
            tab, restricted origin, etc.). The Direct panel still works.
          </span>
        </div>
      </div>
    </div>
  );
}
```

The dataType-change `useEffect` clears the local snapshot before
`useProviderStream` re-attaches, so the user never sees stale rows
keyed against the wrong shape during the swap.

- [ ] **Step 7.2: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 7.3: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/panels/DataServicesGridPanel.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — DataServicesGridPanel

useProviderStream wired to a mock-<dataType> providerId; clears
snapshot on dataType swap so the new shape mounts empty. Soft fail
when SharedWorker bootstrap was unavailable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ConfigPreview + ProviderConfigPanel

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/components/ConfigPreview.tsx`
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/panels/ProviderConfigPanel.tsx`

- [ ] **Step 8.1: Create `ConfigPreview.tsx`**

```tsx
import { ScrollArea } from '@starui/ui';

export function ConfigPreview({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        {label}
      </span>
      <ScrollArea className="h-[160px] rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)]">
        <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">
{JSON.stringify(value, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 8.2: Create `ProviderConfigPanel.tsx`**

```tsx
import {
  Button,
  Slider,
  Switch,
  RadioGroup,
  RadioGroupItem,
  Badge,
  ScrollArea,
  Separator,
} from '@starui/ui';
import { useMockConfig } from '../state/MockConfigContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { ConfigPreview } from '../components/ConfigPreview';
import { RotateCcw, Database } from 'lucide-react';

const ROW_COUNT_CHOICES = [50, 200, 1000] as const;

export function ProviderConfigPanel() {
  const { cfg, setDataType, setRowCount, setUpdateIntervalMs, setEnableUpdates, reset } =
    useMockConfig();
  const { columnDefs } = columnDefsByType[cfg.dataType];

  return (
    <ScrollArea className="h-full w-full bg-[color:var(--ds-surface-ground)]">
      <div className="flex flex-col gap-5 p-4">
        <Header />

        <Section label="dataType">
          <RadioGroup
            value={cfg.dataType}
            onValueChange={(v) => setDataType(v as 'positions' | 'trades' | 'orders')}
            className="flex flex-col gap-2"
          >
            <RadioRow value="positions"  label="positions"  caption="~250-field bond portfolio" />
            <RadioRow value="trades"     label="trades"     caption="Trade lifecycle state machine" />
            <RadioRow value="orders"     label="orders"     caption="Legacy 7-column orders" />
          </RadioGroup>
        </Section>

        <Section label="rowCount">
          <div className="flex flex-wrap gap-2">
            {ROW_COUNT_CHOICES.map((n) => (
              <Button
                key={n}
                variant={cfg.rowCount === n ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-3 font-mono text-[11px]"
                onClick={() => setRowCount(n)}
              >
                {n.toLocaleString()}
              </Button>
            ))}
          </div>
        </Section>

        <Section label={`updateIntervalMs · ${cfg.updateIntervalMs}ms`}>
          <Slider
            min={250}
            max={3000}
            step={50}
            value={[cfg.updateIntervalMs ?? 750]}
            onValueChange={([v]) => setUpdateIntervalMs(v)}
          />
        </Section>

        <Section label="enableUpdates">
          <div className="flex items-center gap-3">
            <Switch
              checked={cfg.enableUpdates ?? true}
              onCheckedChange={setEnableUpdates}
              aria-label="Stream live updates"
            />
            <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-secondary)]">
              {cfg.enableUpdates ? 'Streaming' : 'Paused'}
            </Badge>
          </div>
        </Section>

        <Button
          variant="ghost"
          size="sm"
          className="self-start gap-1.5 text-[11px] text-[color:var(--ds-text-secondary)]"
          onClick={reset}
        >
          <RotateCcw size={12} strokeWidth={1.75} /> Reset to defaults
        </Button>

        <Separator className="bg-[color:var(--ds-border-primary)]" />

        <ConfigPreview label="MockProviderConfig" value={cfg} />
        <ConfigPreview
          label={`columnDefs (${cfg.dataType})`}
          value={columnDefs.map((c) => ({ field: c.field, headerName: c.headerName, width: c.width }))}
        />
      </div>
    </ScrollArea>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Database size={14} strokeWidth={1.75} className="text-[color:var(--ds-accent-info)]" />
      <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-primary)]">
        Mock Data Provider
      </span>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        {label}
      </span>
      {children}
    </section>
  );
}

function RadioRow({ value, label, caption }: { value: string; label: string; caption: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2 transition-colors hover:bg-[color:var(--ds-surface-raised)]">
      <RadioGroupItem value={value} className="mt-[2px]" />
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[12px] font-medium text-[color:var(--ds-text-primary)]">{label}</span>
        <span className="text-[11px] text-[color:var(--ds-text-muted)]">{caption}</span>
      </div>
    </label>
  );
}
```

- [ ] **Step 8.3: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes. If `RadioGroupItem` is not a named export from `@starui/ui`, check the package's `dist/index.d.ts` and adjust to the correct exported name (likely the value re-export from the shadcn primitive).

- [ ] **Step 8.4: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/components/ConfigPreview.tsx apps/demo-apps/mockdata-provider-starui-app/src/panels/ProviderConfigPanel.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — ProviderConfigPanel + ConfigPreview

Live editor for MockProviderConfig built entirely from @starui/ui
primitives (RadioGroup, Button, Slider, Switch, ScrollArea, Badge).
Includes a live JSON preview of the cfg and the active columnDefs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: HelpSheet (5 tabs)

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/components/HelpSheet.tsx`

- [ ] **Step 9.1: Implement HelpSheet**

```tsx
import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Badge,
  Separator,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@starui/ui';
import {
  BookOpen,
  Database,
  Columns3,
  Plug,
  Layers,
  ExternalLink,
} from 'lucide-react';

interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpSheet({ open, onOpenChange }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-ground)] p-0 sm:max-w-[680px]"
      >
        <SheetHeader className="space-y-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="flex items-center gap-2 font-mono text-[14px] tracking-tight text-[color:var(--ds-text-primary)]">
              <BookOpen size={14} strokeWidth={1.75} className="text-[color:var(--ds-accent-info)]" />
              MockDataProvider · usage guide
            </SheetTitle>
            <Badge className="border-transparent bg-[color:var(--ds-overlay-info-soft,rgba(56,189,248,0.12))] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              Demo app
            </Badge>
          </div>
          <SheetDescription className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
            Configure a synthetic provider, attach it to MarketsGrid two
            ways, and persist each grid's layout via the built-in profile
            system.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="quickstart" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-5 bg-[color:var(--ds-surface-sunken)]">
            <Trigger value="quickstart" label="Quick start" />
            <Trigger value="config"     label="Provider config" />
            <Trigger value="columns"    label="Column defs" />
            <Trigger value="wiring"     label="Wiring" />
            <Trigger value="layouts"    label="Layouts" />
          </TabsList>

          <Pane value="quickstart"><QuickStart /></Pane>
          <Pane value="config"><ProviderConfigDocs /></Pane>
          <Pane value="columns"><ColumnDocs /></Pane>
          <Pane value="wiring"><WiringDocs /></Pane>
          <Pane value="layouts"><LayoutDocs /></Pane>
        </Tabs>

        <Separator className="bg-[color:var(--ds-border-primary)]" />
        <div className="flex items-center justify-between gap-2 bg-[color:var(--ds-surface-primary)] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
            Press <Kbd>Ctrl + /</Kbd> to toggle this panel
          </span>
          <a
            href="https://github.com/nndrao/starui"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-accent-info)]"
          >
            <ExternalLink size={11} strokeWidth={1.75} />
            View on GitHub
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Trigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
    >
      {label}
    </TabsTrigger>
  );
}

function Pane({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
    >
      <ScrollArea className="flex-1 px-5 py-4">{children}</ScrollArea>
    </TabsContent>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────

function QuickStart() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="What this demo shows" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Prose>
          A four-panel workspace for learning <Code>MockDataProvider</Code>.
          The left panel edits the provider config; two MarketsGrid panels
          render the same stream wired two different ways; the bottom strip
          shows live throughput.
        </Prose>
      </Section>

      <Section title="The four panels" icon={<Layers size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Provider config" desc="Pick dataType, rowCount, updateIntervalMs, and enableUpdates. Edits propagate to both grids; the JSON preview updates live." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Direct startMock" desc="Calls startMock(cfg, emit) directly in the same module. Simplest wiring." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="via DataServices" desc="Uses useProviderStream() from <DataServicesProvider>. Production wiring." />
        <ItemRow icon={<Columns3 size={13} strokeWidth={1.75} />} name="Live stats" desc="Rolling 5-second tick rate, row count, and last-update timestamp for each grid." />
      </Section>

      <Section title="Try it" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Step n={1}>Set dataType to <Code>trades</Code> in the Provider Config panel. Both grids remount and show the trade book.</Step>
        <Step n={2}>Drag the <strong>updateIntervalMs</strong> slider to <Code>250</Code>. Watch ticks/s climb in the Stats strip.</Step>
        <Step n={3}>Open the gear icon in either grid → Conditional styling → add a rule. Hit the disk to save it as a layout. Switch dataType and back — your layout returns.</Step>
      </Section>

      <Section title="Keyboard shortcuts" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <ShortcutTable>
          <ShortcutRow keys="Ctrl + /"  label="Toggle this help drawer" />
          <ShortcutRow keys="Ctrl + ."  label="Switch theme (dark / light)" />
          <ShortcutRow keys="Ctrl + 1"  label="dataType = positions" />
          <ShortcutRow keys="Ctrl + 2"  label="dataType = trades" />
          <ShortcutRow keys="Ctrl + 3"  label="dataType = orders" />
        </ShortcutTable>
      </Section>
    </div>
  );
}

function ProviderConfigDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="MockProviderConfig" icon={<Database size={12} strokeWidth={1.75} />}>
        <Prose>
          The shape passed to <Code>startMock()</Code> or to
          <Code>useProviderStream()</Code>. All fields are optional except
          <Code>providerType</Code>.
        </Prose>
        <CodeBlock>
{`type MockProviderConfig = {
  providerType: 'mock';
  dataType?: 'positions' | 'trades' | 'orders';
  rowCount?: number;
  updateIntervalMs?: number;
  enableUpdates?: boolean;
};`}
        </CodeBlock>
      </Section>

      <Section title="Fields" icon={<Database size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="providerType: 'mock'" desc="Always 'mock'. The DataServices hub uses this to route the cfg to the mock transport." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="dataType" desc="'positions' (default, 250-field bond portfolio) · 'trades' (lifecycle state machine, joins to positions by cusip) · 'orders' (legacy 7-column generator)." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="rowCount" desc="Snapshot size. Defaults: 50 (orders), 200 (trades), full universe size (positions). Values > universe cycle the universe." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="updateIntervalMs" desc="Ticker cadence. Each tick mutates 1–4% of the snapshot (positions/trades) or 1 random row (orders)." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="enableUpdates" desc="Pause/resume the ticker without resetting the snapshot. The grid keeps the data it has." />
      </Section>
    </div>
  );
}

function ColumnDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Column defs by dataType" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          AG-Grid column defs. Each demo column-def set targets the field
          names emitted by the matching mock builder.
        </Prose>
        <CodeBlock>
{`// data/columnDefsByType.ts
export const columnDefsByType = {
  positions: { columnDefs: positionColumnDefs, rowIdField: 'cusip',   defaultColDef },
  trades:    { columnDefs: tradeColumnDefs,    rowIdField: 'tradeId', defaultColDef },
  orders:    { columnDefs: orderColumnDefs,    rowIdField: 'id',      defaultColDef },
};`}
        </CodeBlock>
      </Section>

      <Section title="rowIdField" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          MarketsGrid needs a stable id per row so deltas merge cleanly.
          Positions are unique per <Code>cusip</Code>; trades per
          <Code>tradeId</Code>; orders use the synthetic <Code>id</Code>.
        </Prose>
      </Section>

      <Section title="Formatting" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          Money fields use a thousands-grouped Intl.NumberFormat; prices use
          3 decimals; yields append <Code>%</Code>; timestamps render as
          local <Code>HH:mm:ss</Code>. All editable later from the
          formatter toolbar — these defaults exist so the grid looks
          plausible on first render.
        </Prose>
      </Section>
    </div>
  );
}

function WiringDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Path 1 — Direct startMock()" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Simplest wiring. <Code>startMock(cfg, emit)</Code> is a pure
          function that returns a <Code>ProviderHandle</Code> and pushes
          events into <Code>emit</Code>. No worker, no provider context.
        </Prose>
        <CodeBlock>
{`const handle = startMock(cfg, (evt) => {
  if ('rows' in evt) {
    if (evt.replace) rowsRef.current = [...evt.rows];
    else rowsRef.current = applyDelta(rowsRef.current, evt.rows, idField);
    setRows(rowsRef.current);
  }
});
return () => handle.stop();`}
        </CodeBlock>
      </Section>

      <Section title="Path 2 — useProviderStream()" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Production wiring. The cfg is sent to a SharedWorker hub that
          owns the provider instance and broadcasts deltas to every
          subscribed tab/window.
        </Prose>
        <CodeBlock>
{`// main.tsx
const services = createDataServicesClient({ appName, userId });
<DataServicesProvider services={services}><App /></DataServicesProvider>

// panel
useProviderStream(providerId, cfg, {
  onDelta: (rows, replace) => { /* same shape as path 1 */ },
  onStatus: () => undefined,
});`}
        </CodeBlock>
      </Section>

      <Section title="When to pick each" icon={<Plug size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick Direct when…" desc="You only need one provider in a single tab, you want zero infra, or you're embedding in a test." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick DataServices when…" desc="Multiple panels or windows share the same provider, you need provider configs to be persisted as named entities, or you want SharedWorker cross-tab broadcast." />
      </Section>

      <Section title="Lifecycle" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Every provider emits <Code>status: 'loading'</Code> immediately,
          pushes its initial snapshot with <Code>replace: true</Code>,
          transitions to <Code>status: 'ready'</Code>, then starts ticking.
          <Code>handle.stop()</Code> is idempotent.
          <Code>handle.restart(extra)</Code> overlays new fields on the
          current cfg and re-emits.
        </Prose>
      </Section>
    </div>
  );
}

function LayoutDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="One bundle per (panel × dataType)" icon={<Layers size={12} strokeWidth={1.75} />}>
        <Prose>
          Each MarketsGrid uses a <Code>gridId</Code> that encodes both
          the panel and the dataType, so its profile bundle is independent.
        </Prose>
        <CodeBlock>
{`Direct panel        →  mockdata-direct-<dataType>-v1
DataServices panel  →  mockdata-via-ds-<dataType>-v1`}
        </CodeBlock>
        <Prose>
          Six combinations → six independent <Code>localStorage</Code>
          bundles. Saving a layout in "Direct + positions" leaves
          "Direct + trades" untouched.
        </Prose>
      </Section>

      <Section title="What gets saved" icon={<Layers size={12} strokeWidth={1.75} />}>
        <Prose>
          Every formatter setting, every customizer module's state, and
          AG-Grid's column model (visibility, order, width, sort, filter
          model) are bundled into a named layout. Switching layouts via
          the dropdown replays each module's state in order; AG-Grid's
          state always runs last.
        </Prose>
      </Section>

      <Section title="Storage keys" icon={<Layers size={12} strokeWidth={1.75} />}>
        <div className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          <div>markets-grid-bundle:mockdata-direct-positions-v1</div>
          <div>markets-grid-bundle:mockdata-direct-trades-v1</div>
          <div>markets-grid-bundle:mockdata-direct-orders-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-positions-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-trades-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-orders-v1</div>
        </div>
      </Section>
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        <span className="inline-flex">{icon}</span>
        {title}
      </h3>
      <div className="flex flex-col gap-2 pl-1">{children}</div>
    </section>
  );
}

function ItemRow({ icon, name, desc }: { icon: ReactNode; name: string; desc: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2.5">
      <span className="mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] text-[color:var(--ds-text-secondary)]">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[color:var(--ds-text-primary)]">{name}</span>
        <span className="text-[11.5px] leading-relaxed text-[color:var(--ds-text-muted)]">{desc}</span>
      </div>
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">{children}</p>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold text-[color:var(--ds-accent-info)]">
        {n}
      </span>
      <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">{children}</p>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{children}</code>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">{children}</pre>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[10px] font-medium text-[color:var(--ds-text-primary)] shadow-[0_1px_0_0_var(--ds-border-primary)]">{children}</kbd>
  );
}

function ShortcutTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <table className="w-full text-[12px]">
        <tbody className="divide-y divide-[color:var(--ds-border-primary)]">{children}</tbody>
      </table>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <tr className="bg-[color:var(--ds-surface-primary)]">
      <td className="w-[110px] border-r border-[color:var(--ds-border-primary)] px-3 py-2 align-middle">
        <Kbd>{keys}</Kbd>
      </td>
      <td className="px-3 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">{label}</td>
    </tr>
  );
}
```

- [ ] **Step 9.2: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 9.3: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/components/HelpSheet.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — HelpSheet with 5 MockDataProvider tabs

Quick start · Provider config schema · Column defs · Wiring (Direct
vs DataServices) · Layouts. All shadcn primitives, all ds-* tokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Brand + App with DockManagerCore

**Files:**
- Create: `apps/demo-apps/mockdata-provider-starui-app/src/components/Brand.tsx`
- Modify: `apps/demo-apps/mockdata-provider-starui-app/src/App.tsx`

- [ ] **Step 10.1: Create `Brand.tsx`**

```tsx
export function Brand() {
  return (
    <div className="flex items-center gap-2.5 pr-3">
      <div
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-sm bg-[color:var(--ds-primary)] text-[color:var(--ds-primary-foreground)] shadow-[var(--ds-elevation-card)]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden>
          <path d="M3 12 L7 12 L10 6 L14 18 L17 12 L21 12" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
          MockDataProvider Demo
        </span>
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
          StarUI · data services
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Replace `src/App.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DockManagerCore,
  type DockManagerCoreHandle,
  type WidgetProps,
} from '@widgetstools/react-dock-manager';
import {
  type DockManagerState,
  slateDark,
  vsCodeLight,
} from '@widgetstools/dock-manager-core';
import { applyTheme, getTheme } from '@starui/design-system';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@starui/ui';
import { Sun, Moon, CircleHelp } from 'lucide-react';
import { Brand } from './components/Brand';
import { HelpSheet } from './components/HelpSheet';
import { StatsProvider } from './state/StatsContext';
import { useMockConfig } from './state/MockConfigContext';
import { ProviderConfigPanel } from './panels/ProviderConfigPanel';
import { DirectGridPanel } from './panels/DirectGridPanel';
import { DataServicesGridPanel } from './panels/DataServicesGridPanel';
import { StatsPanel } from './panels/StatsPanel';

const WIDGETS: Record<string, React.ComponentType<WidgetProps>> = {
  providerConfig:    () => <ProviderConfigPanel />,
  directGrid:        () => <DirectGridPanel />,
  dataServicesGrid:  () => <DataServicesGridPanel />,
  stats:             () => <StatsPanel />,
};

const INITIAL_LAYOUT: DockManagerState = {
  layout: {
    type: 'split',
    id: 'root',
    direction: 'vertical',
    sizes: [82, 18],
    children: [
      {
        type: 'split',
        id: 'top',
        direction: 'horizontal',
        sizes: [28, 72],
        children: [
          { type: 'tabgroup', id: 'tg-config', panels: ['providerConfig'], activePanel: 'providerConfig' },
          {
            type: 'tabgroup',
            id: 'tg-grids',
            panels: ['directGrid', 'dataServicesGrid'],
            activePanel: 'directGrid',
          },
        ],
      },
      { type: 'tabgroup', id: 'tg-stats', panels: ['stats'], activePanel: 'stats' },
    ],
  },
  panels: {
    providerConfig:   { id: 'providerConfig',   title: 'Provider Config',         widgetType: 'providerConfig',   closable: false },
    directGrid:       { id: 'directGrid',       title: 'Direct · startMock()',    widgetType: 'directGrid',       closable: false },
    dataServicesGrid: { id: 'dataServicesGrid', title: 'via DataServicesProvider', widgetType: 'dataServicesGrid', closable: false },
    stats:            { id: 'stats',            title: 'Live stats',              widgetType: 'stats',            closable: false },
  },
  floatingPanels: [],
  popoutPanels: [],
  unpinnedPanels: [],
  nextZIndex: 100,
  activePaneId: 'directGrid',
};

export function App() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    () => getTheme().theme as 'dark' | 'light',
  );
  const isDark = theme === 'dark';
  const [helpOpen, setHelpOpen] = useState(false);
  const dockRef = useRef<DockManagerCoreHandle | null>(null);
  const { setDataType, setEnableUpdates, cfg } = useMockConfig();

  const handleToggleTheme = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ theme: next });
    setThemeState(next);
  }, [isDark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === '/') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (k === '.') {
        e.preventDefault();
        handleToggleTheme();
      } else if (k === '1') {
        e.preventDefault();
        setDataType('positions');
      } else if (k === '2') {
        e.preventDefault();
        setDataType('trades');
      } else if (k === '3') {
        e.preventDefault();
        setDataType('orders');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleToggleTheme, setDataType, setEnableUpdates, cfg]);

  const dockTheme = useMemo(() => (isDark ? slateDark : vsCodeLight), [isDark]);
  const tooltipLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <StatsProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
        <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-4 pr-3">
          <Brand />
          <div className="ml-auto flex items-center gap-2">
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setHelpOpen(true)}
                    aria-label="Open help"
                    className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-raised)] hover:text-[color:var(--ds-text-primary)]"
                    data-testid="help-toggle"
                  >
                    <CircleHelp size={13} strokeWidth={1.75} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Help (Ctrl + /)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleToggleTheme}
                    aria-label={tooltipLabel}
                    className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-raised)] hover:text-[color:var(--ds-text-primary)]"
                    data-testid="theme-toggle"
                  >
                    {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]">
            <DockManagerCore
              ref={dockRef}
              initialState={INITIAL_LAYOUT}
              widgets={WIDGETS}
              theme={dockTheme}
              className="h-full w-full"
            />
          </div>
        </main>
      </div>
    </StatsProvider>
  );
}
```

- [ ] **Step 10.3: Typecheck**

Run: `npx turbo typecheck --filter=@starui/mockdata-provider-starui-app`
Expected: passes.

- [ ] **Step 10.4: Commit**

```bash
git add apps/demo-apps/mockdata-provider-starui-app/src/components/Brand.tsx apps/demo-apps/mockdata-provider-starui-app/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(apps): mockdata-provider — App.tsx with DockManagerCore layout

Header (brand, help, theme), DockManagerCore with the four panels in
vertical-then-horizontal split, theme follows StarUI design system,
keyboard shortcuts for help / theme / dataType swap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: End-to-end smoke + visual verification

**Files:** none — verification only.

- [ ] **Step 11.1: Run dev server**

Run: `npm run dev -w @starui/mockdata-provider-starui-app`
Expected: Vite serves on http://localhost:5192/ and opens the browser.

- [ ] **Step 11.2: Verify initial layout**

- Header shows the Brand on the left, two icon buttons (Help, Theme) on the right.
- Workspace shows three dock regions: Provider Config (left), tabbed grid area (right), Stats strip (bottom).
- Direct grid tab is active by default. Both grids show position rows.
- Stats strip shows "Direct: 200 rows · ~1.3 ticks/s · last <Ns> ago" and "DataServices: 200 rows ..." after a few seconds.

- [ ] **Step 11.3: Verify dataType swap (all 3)**

Change dataType radio to `trades`. Verify:
- Both grids remount with trade columns (Trade ID, Side, Status, …).
- Stats strip continues to update; tick rate may briefly drop to zero during reseed then recover.
- Repeat for `orders` (smaller column count, simpler rows).
- Switch back to `positions` — original column set returns.

- [ ] **Step 11.4: Verify live controls**

- Move `updateIntervalMs` slider to 250 — ticks/s climbs (~4/s).
- Turn `enableUpdates` off — both tick rates fall to 0 within 5 seconds; row count stays.
- Turn it back on — ticks resume.

- [ ] **Step 11.5: Verify profile/layout persistence per grid**

- In Direct grid: open the gear icon → Conditional styling → add a rule (e.g. `coupon > 4` → red text). Save the layout via the disk icon as `red-coupons`.
- In DataServices grid: do something different — open the formatter toolbar, set a column to bold. Save as `bold-rates`.
- Switch dataType to `trades` and back to `positions`. Both layouts return.
- Reload the page. Both layouts still appear in the dropdown.

- [ ] **Step 11.6: Verify HelpSheet**

- Click the Help icon → drawer slides in with the 5 tabs.
- Click each tab — content renders without overflow, code blocks scroll horizontally as needed.
- Close with the X button, then test `Ctrl + /` to toggle.

- [ ] **Step 11.7: Verify theme switch**

- Press `Ctrl + .` (or click the moon/sun icon). App and dock-manager both flip from dark → light (or vice versa). No flashes of unstyled content.

- [ ] **Step 11.8: Verify console & build**

In the same dev session, check DevTools console — no red errors. Stop the dev server.

Run: `npx turbo typecheck build test --filter=@starui/mockdata-provider-starui-app`
Expected: all three green. (`test` may report "no tests" for this app — that's fine; it shouldn't fail.)

- [ ] **Step 11.9: Commit (only if step 11.x produced fixes)**

If any verification step uncovered an issue, fix it and commit with a `fix(apps): mockdata-provider — …` message. If all green: no commit needed; skip.

---

## Task 12: Documentation + propagate

**Files:**
- Modify: `docs/IMPLEMENTED_FEATURES.md`

- [ ] **Step 12.1: Update `docs/IMPLEMENTED_FEATURES.md`**

Open `docs/IMPLEMENTED_FEATURES.md`. Add a new entry under today's date (2026-05-17) — match the existing entry style. Example:

```markdown
- **New app: `mockdata-provider-starui-app`** —
  `apps/demo-apps/mockdata-provider-starui-app/` is a dock-manager
  workspace that teaches `MockDataProvider` usage. ProviderConfigPanel
  edits the live `MockProviderConfig`; DirectGridPanel runs
  `startMock()` in-process; DataServicesGridPanel goes through
  `<DataServicesProvider>` + `useProviderStream`; StatsPanel shows
  rolling 5-second tick stats. Each grid uses a unique `gridId` per
  `(panel × dataType)` so MarketsGrid profiles persist independently
  for all six combinations. Help drawer has 5 tabs covering quick
  start, provider config, column defs, wiring, and layouts.
```

- [ ] **Step 12.2: Commit docs**

```bash
git add docs/IMPLEMENTED_FEATURES.md
git commit -m "$(cat <<'EOF'
docs: record mockdata-provider-starui-app in IMPLEMENTED_FEATURES

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12.3: Final root-level build/typecheck**

Run: `npx turbo typecheck build test`
Expected: green across the whole repo. If basic-starui-app or another app fails for an unrelated reason, ask the user before pivoting — these errors may be pre-existing.

- [ ] **Step 12.4: Done**

The branch is ready to push / open a PR. Per CLAUDE.md, conventional commit prefix used throughout; trailer line included on every commit.

---

## Self-review notes

- Tarball SHAs in Task 0.1 are read straight from the current `libs/manifest.json` — re-verify before pasting if the manifest has been re-packed in the meantime (the file mtime in manifest.json is the trigger).
- All five HelpSheet tabs implemented in Task 9 — matches spec §10's table.
- `gridId` scheme (Task 6, 7, 9 LayoutDocs, 11.5) is consistent: `mockdata-direct-${dataType}-v1` and `mockdata-via-ds-${dataType}-v1`.
- `useProviderStream` import path in Task 7 (`@starui/data-services-react/runtime`) matches the package's documented subpath export in `packages/react/providers/data-services-react/src/index.ts`.
- `startMock` import in Task 6 first tries the root barrel; Step 6.2 explicitly mentions the fallback subpath. The root entry of `@starui/data-services` re-exports `probeMock` but not `startMock` — implementer should expect to use the subpath. (Fallback path documented in step 6.2 itself.)
- StatsContext + StatsPanel polling cadence (1 Hz) does not depend on render-driven state; the ref-backed ring buffer keeps `recordTick` from triggering paints (verified by mental review of Task 5.1's implementation).
- Acceptance criterion #6 ("status: 'ready' within ~500 ms") is verified visually in step 11.2 — no explicit assert tooling needed for a demo app.

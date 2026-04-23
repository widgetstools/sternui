# CLAUDE.md

## Project Overview

**Stern Widget Framework** — A monorepo providing configurable trading platform widgets (blotters, data providers, OpenFin integration).

### Architecture

- **Monorepo**: npm workspaces with shared packages
- **Packages**:
  - `packages/ui` (`@stern/ui`) — shadcn/ui component library with Coinbase-inspired theme
  - `packages/shared-types` (`@stern/shared-types`) — TypeScript interfaces shared across apps
  - `packages/widgets` (`@stern/widgets`) — AG Grid Enterprise widget components
  - `packages/openfin-platform` (`@stern/openfin-platform`) — OpenFin desktop integration
  - `apps/reference-app` (`@stern/reference-app`) — Reference application demonstrating all features
  - `apps/server` (`@stern/server`) — Node.js configuration service (Express, SQLite/MongoDB)

### Key Technologies

- React 18, TypeScript 5.5+, Vite, Tailwind CSS
- AG Grid Enterprise v33 (via `ag-grid-community`, `ag-grid-enterprise`, `ag-grid-react`)
- shadcn/ui components (all from `@stern/ui`)
- `@stomp/stompjs` for STOMP WebSocket connections
- TanStack Query for data fetching

## Development Commands

```bash
# Build specific workspace
npm run build --workspace=@stern/reference-app

# Dev server (reference app)
npm run dev --workspace=@stern/reference-app

# Build all packages
npm run build --workspaces

# Type check
npx tsc --noEmit --workspace=@stern/reference-app
```

## Design System

**CRITICAL**: All UI components MUST follow the design system documented in `docs/DESIGN_SYSTEM.md`.

Quick reference for the most common tokens:

- **Labels**: `text-xs font-medium text-muted-foreground`
- **Inputs**: `h-8 text-sm`
- **Select triggers**: `h-8 text-sm` (always use shadcn Select, never native `<select>`)
- **Label→Input gap**: `space-y-1.5`
- **Field gap**: `space-y-4`
- **Section cards**: `rounded-lg border border-border bg-muted/30 p-4`
- **Section headers**: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- **Helper text**: `text-[11px] text-muted-foreground`
- **Footer buttons**: Always `size="sm"` with `gap-2`
- **Footer bar**: `border-t bg-card px-4 py-3`

See `docs/DESIGN_SYSTEM.md` for the full specification including toolbars, tree views, badges, empty states, and AG Grid configuration.

## Import Conventions

```typescript
// UI components — always from @stern/ui
import { Button, Input, Label, Select, ... } from '@stern/ui';

// Types — always from @stern/shared-types
import type { StompProviderConfig, ColumnDefinition } from '@stern/shared-types';

// Icons — from lucide-react
import { Plus, Trash2, Search } from 'lucide-react';

// AG Grid
import { ModuleRegistry, type ColDef } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';
```

## Key Directories

```
apps/reference-app/src/
  components/provider/          — Data provider forms (STOMP, REST, WebSocket, etc.)
  components/provider/stomp/    — STOMP-specific: ConnectionTab, FieldsTab, ColumnsTab, hooks/
  openfin/                      — OpenFin integration (DockConfigurator, platform provider)
  services/providers/           — Data provider service classes
  hooks/                        — React Query hooks

packages/ui/src/
  components/                   — shadcn/ui components
  styles/stern-theme.css        — Coinbase-inspired CSS variables (light + dark)
```

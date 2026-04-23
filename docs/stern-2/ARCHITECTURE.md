# Stern Widget Framework — Architecture

## Overview

The Stern Widget Framework is a monorepo-based platform for building configurable trading applications. It replaces 40+ duplicate blotter applications with a single, unified widget system powered by hierarchical configuration, slot-based extensibility, and multi-protocol data providers.

## Monorepo Structure

```
stern-2/
├── packages/
│   ├── shared-types        @stern/shared-types    — Type definitions and constants
│   ├── widget-sdk           @stern/widget-sdk      — Widget runtime SDK
│   ├── ui                   @stern/ui              — Design system (shadcn/ui + Tailwind)
│   ├── widgets              @stern/widgets         — Trading widget components
│   └── openfin-platform     @stern/openfin-platform — OpenFin desktop integration
├── apps/
│   ├── server               @stern/server          — REST Configuration Service
│   └── reference-app        @stern/reference-app   — Example application
└── docs/                    Documentation
```

### Dependency Graph

```
shared-types  (no deps — leaf package)
     │
     ├── widget-sdk     (depends on: shared-types, react-query)
     │       │
     │       ├── widgets          (depends on: shared-types, widget-sdk, ui, ag-grid)
     │       │
     │       └── openfin-platform (depends on: shared-types, widget-sdk, @openfin/*)
     │
     └── ui             (depends on: radix-ui, tailwindcss, sonner, recharts)

Apps:
  server          (depends on: shared-types, express, sql.js/mongodb)
  reference-app   (depends on: all packages above)
```

## Core Architecture Patterns

### 1. Widget Lifecycle (`useWidget`)

Every widget component uses the `useWidget(configId)` hook which provides:

```
useWidget(configId)
├── Config fetching (React Query)     → widget.config
├── Layout management                 → widget.layouts, widget.saveLayout(), widget.loadLayout()
├── Lifecycle hooks                   → widget.onSave(), widget.onDestroy()
├── Hierarchy operations              → widget.forkConfig(), widget.promoteConfig()
├── Communication                     → widget.broadcast(), widget.subscribe(), widget.open()
└── Settings                          → widget.openSettings()
```

The hook fetches configuration from the server via `ConfigClient`, manages layouts as child configs, and exposes platform-agnostic lifecycle and communication APIs.

### 2. Configuration Hierarchy

Configurations support inheritance through a tree hierarchy:

```
Organization
├── Region: APAC
│   ├── Desk: Equity Trading    → has blotter config (inherited by users below)
│   │   ├── User: trader1       → uses inherited config
│   │   └── User: trader2       → has own forked config (customized)
│   └── Desk: FX Trading
└── Region: EMEA
```

- **Resolution**: `ResolutionService` walks up the tree to find the nearest config
- **Fork**: Users can fork an inherited config to create their own copy
- **Promote**: Admins can promote a user's config to a higher level

### 3. Dependency Injection (Blotter)

The blotter widget system uses a provider-based DI pattern:

```tsx
<BlotterProvider dataProvider={stompProvider} actionRegistry={registry}>
  <SimpleBlotter configId="orders-blotter" />
</BlotterProvider>
```

- `IBlotterDataProvider` — interface for data streaming (snapshot, update, error events)
- `IActionRegistry` — interface for toolbar action execution
- `useBlotterDI()` — hook to access injected dependencies

This allows swapping data sources (Mock, STOMP, REST, WebSocket) without changing widget code.

### 4. Slot-Based Extensibility

Widgets support composition through named slots:

```tsx
<SimpleBlotter
  configId="orders"
  slots={{
    header: <CustomHeader />,
    beforeToolbar: <AlertBanner />,
    afterToolbar: <FilterBar />,
    statusBar: <ConnectionStatus />,
    footer: <AuditTrail />,
    emptyState: <OnboardingGuide />,
  }}
/>
```

Slots receive a `BlotterSlotContext` with `{ widget, gridApi, selectedRows }`.

### 5. Platform Abstraction

The `PlatformAdapter` interface abstracts browser vs OpenFin:

```
PlatformAdapter
├── BrowserAdapter     — default for web browsers
│   ├── getInstanceId()     → UUID
│   ├── openWidget()        → window.open()
│   ├── broadcast()         → BroadcastChannel
│   └── subscribe()         → BroadcastChannel listener
│
└── OpenFinAdapter     — for OpenFin runtime
    ├── getInstanceId()     → fin.me.identity.name
    ├── openWidget()        → fin.Platform.createView()
    ├── broadcast()         → IAB publish
    └── subscribe()         → IAB subscribe
```

## Package Details

### @stern/shared-types

Shared TypeScript interfaces and constants used by all packages.

| File | Contents |
|------|----------|
| `configuration.ts` | `UnifiedConfig`, `ConfigurationFilter`, `COMPONENT_TYPES`, `COMPONENT_SUBTYPES` |
| `dataProvider.ts` | `DataProviderConfig`, `ProviderConfig` (STOMP/REST/WS/SocketIO/Mock/AppData), `PROVIDER_TYPES`, validation, defaults |
| `simpleBlotter.ts` | `SimpleBlotterConfig`, `SimpleBlotterLayoutConfig`, toolbar/formatting/editing types |
| `widget.ts` | `WidgetRouteEntry`, `LayoutInfo` |

### @stern/widget-sdk

Runtime SDK providing hooks, providers, and services.

| Module | Purpose |
|--------|---------|
| `useWidget(configId)` | Main hook — config, layouts, lifecycle, communication |
| `useSettingsScreen()` | Hook for settings panel integration |
| `WidgetHost` | Top-level provider (wraps QueryClientProvider) |
| `ConfigClient` | REST client for configuration CRUD |
| `BrowserAdapter` | Default PlatformAdapter for web |
| `WidgetRegistry` | Widget type registration system |
| `renderSlot()` | Slot rendering helper |
| `createExtendedWidget()` | Widget extension factory |

### @stern/ui

Design system built on shadcn/ui with Coinbase-inspired theming.

- **50+ components**: Button, Card, Dialog, Tabs, Select, Input, Table, ScrollArea, AlertDialog, Badge, Switch, Separator, Alert, Toast, etc.
- **Custom components**: `CollapsibleToolbar`, `ToolbarContainer`, `VirtualizedList`
- **Theme provider**: Dark/light mode with `ThemeProvider` and `useTheme()`
- **CSS**: `stern-theme.css` with CSS custom properties for all design tokens
- **Exports**: `@stern/ui` (components), `@stern/ui/styles` (CSS), `@stern/ui/tailwind-config` (shared Tailwind config)

### @stern/widgets

Trading widget components with AG Grid Enterprise integration.

| Component | Purpose |
|-----------|---------|
| `SimpleBlotter` | Main widget — columns from config, data connection, toolbar, layouts, slots |
| `BlotterGrid` | AG Grid wrapper with enterprise features |
| `BlotterToolbar` | Action bar with layout selector and custom buttons |
| `LayoutSelector` | Dropdown for switching between saved grid states |
| `BlotterProvider` | DI provider for `IBlotterDataProvider` and `IActionRegistry` |

| Hook | Purpose |
|------|---------|
| `useBlotterDataConnection` | Connects grid to data provider (snapshot/update/error) |
| `useGridStateManager` | Captures and applies grid state (columns, filters, sorts) |

### @stern/openfin-platform

Desktop platform integration for OpenFin.

| Module | Purpose |
|--------|---------|
| `OpenFinAdapter` | PlatformAdapter implementation for OpenFin views/windows |
| `OpenfinIABService` | Inter-Application Bus wrapper for pub/sub messaging |
| `menuLauncher` | `launchMenuItem()` — opens dock menu items as views or windows |
| `openfinThemePalettes` | Light/dark theme palettes for OpenFin workspace |
| `urlHelper` | `buildUrl()`, `initializeBaseUrlFromManifest()` |
| `useOpenfinTheme` | Hook to sync OpenFin theme with React |
| `useOpenFinEvents` | Hook for OpenFin event subscriptions |

### @stern/server

Node.js REST API for configuration management.

| Layer | Files | Purpose |
|-------|-------|---------|
| Routes | `configurations.ts`, `hierarchy.ts` | Express route handlers |
| Services | `ConfigurationService.ts`, `HierarchyService.ts`, `ResolutionService.ts` | Business logic |
| Storage | `SqliteStorage.ts`, `SqliteHierarchyStorage.ts`, `StorageFactory.ts` | Dual-database abstraction |
| Utils | `logger.ts`, `validation.ts` | Winston logging, Joi validation |

**API Endpoints:**
- `GET/POST /api/v1/configurations` — list/create
- `GET/PUT/DELETE /api/v1/configurations/:id` — CRUD by ID
- `GET /api/v1/configurations/by-user/:userId` — user's configs
- `GET /api/v1/configurations/by-parent/:parentId` — child configs
- `GET /api/v1/configurations/lookup` — composite key lookup
- `GET /api/v1/configurations/resolved` — hierarchy-aware resolution
- `POST /api/v1/configurations/:id/clone` — clone config
- `POST /api/v1/configurations/:id/fork` — fork to user
- `POST /api/v1/configurations/:id/promote` — promote to higher level
- `GET/POST/PUT/DELETE /api/v1/hierarchy/nodes` — hierarchy CRUD

## Data Provider Architecture

### Provider Types

| Type | Protocol | Config Interface | Use Case |
|------|----------|-----------------|----------|
| STOMP | WebSocket + STOMP | `StompProviderConfig` | Real-time market data streaming |
| REST | HTTP polling | `RestProviderConfig` | API endpoint data fetching |
| WebSocket | Native WS | `WebSocketProviderConfig` | Low-latency streaming |
| Socket.IO | Socket.IO | `SocketIOProviderConfig` | Event-based communication |
| Mock | In-memory | `MockProviderConfig` | Development and testing |
| AppData | Variables | `AppDataProviderConfig` | Application variable storage |

### Data Flow

```
DataProviderConfig (stored in server as UnifiedConfig)
    │
    ▼
IBlotterDataProvider implementation
    │
    ├── connect(providerId)    → establish connection
    ├── onSnapshot(callback)   → initial data load
    ├── onUpdate(callback)     → delta updates (add/update/remove)
    ├── onError(callback)      → error handling
    └── disconnect()           → cleanup
    │
    ▼
useBlotterDataConnection hook
    │
    ▼
AG Grid (via transactions for real-time updates)
```

## OpenFin Integration

### Dock Architecture

```
OpenfinProvider.tsx (provider window — hidden after init)
    │
    ├── init() with theme palettes + custom actions
    ├── dock.register() + dock.show()
    └── close-requested → platform quit sequence
    │
    ▼
openfinDock.ts (dock module)
    │
    ├── Applications dropdown    → DockMenuItem[] → launchMenuItem()
    ├── Theme toggle button      → toggle-theme action → JS injection + IAB broadcast
    └── Tools dropdown           → Data Providers, Reload, DevTools, Provider Window
```

### Theme Synchronization

```
toggle-theme action
    ├── JS injection into all views (immediate CSS class update)
    ├── IAB broadcast: stern-platform:theme-change
    ├── setSelectedScheme() on platform
    └── updateAllDockIcons()

useOpenFinThemeSync hook (in each view)
    ├── On mount: reads DOM class (synchronous, no flash)
    ├── Fallback: queries platform.Theme.getSelectedScheme()
    ├── IAB listener: updates on theme-change events
    └── Calls next-themes setTheme() + sets body dataset for AG Grid
```

## Configuration Schema

All configurations are stored as `UnifiedConfig`:

```typescript
interface UnifiedConfig {
  configId: string;           // UUID
  appId: string;              // Application identifier
  userId: string;             // Owner
  parentId?: string;          // Parent config (for layouts)
  nodeId?: string;            // Hierarchy node
  componentType: string;      // 'simple-blotter', 'data-provider', 'dock', etc.
  componentSubType?: string;  // 'stomp', 'rest', 'orders', etc.
  name: string;
  description?: string;
  config: Record<string, unknown>;  // Type-specific config payload
  settings: ConfigSetting[];
  activeSetting: string;
  tags?: string[];
  isDefault?: boolean;
  isShared?: boolean;
  isLocked?: boolean;
  createdBy: string;
  lastUpdatedBy: string;
  creationTime: Date;
  lastUpdated: Date;
  deletedAt?: Date;           // Soft delete
}
```

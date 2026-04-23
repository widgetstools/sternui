# MarketsUI Design Document
**UI Framework for Capital Markets**
Version 2.0 | March 2026 | CONFIDENTIAL

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository Structure](#2-repository-structure)
3. [Package Architecture](#3-package-architecture)
4. [Reference Applications](#4-reference-applications)
5. [MarketsUI MCP Server](#5-marketsui-mcp-server)
6. [Config Service & Database Schema](#6-config-service--database-schema)
7. [Data Provider Layer](#7-data-provider-layer)
8. [Blotter & Column Group Specification](#8-blotter--column-group-specification)
9. [Config Editor Tool](#9-config-editor-tool)
10. [OpenFin Integration](#10-openfin-integration)
11. [Implementation Plan](#11-implementation-plan)
12. [Design Language (MDL)](#12-design-language-mdl)
13. [Key Decisions Log](#13-key-decisions-log)
14. [Appendix](#14-appendix)

---

## 1. Executive Summary

MarketsUI is a **configuration-driven UI framework** for capital markets trading applications hosted in **OpenFin Workspace** browser windows. It provides configurable, reusable components — starting with an AG-Grid blotter — that can be deployed without writing component code from scratch for every new trading desk or product line.

### The Four Parts of the Ecosystem

| Part | Repository | Description |
|------|-----------|-------------|
| **Packages monorepo** | `marketsui-packages` | 12 published npm packages — 7 shared TypeScript (no UI), 3 framework-specific (React + Angular), 1 Lit primitives, 1 platform bootstrap |
| **Reference React app** | `marketsui-reference-react` | Full working trading application demonstrating every feature of every package |
| **Reference Angular app** | `marketsui-reference-angular` | Same reference application in Angular, demonstrating framework parity |
| **MCP server** | `marketsui-mcp` | MCP server that reads both reference apps and scaffolds new MarketsUI projects for developers |

### Core Design Principles

- **Configuration over code** — every component behaviour is driven by JSON config, not hardcoded logic
- **React first, Angular later** — validate the architecture once, then translate
- **Shared TypeScript, framework-specific UI** — all logic packages are pure TS; only rendering is framework-specific
- **Offline-first** — Dexie IndexedDB is the primary read path; REST is write target when available
- **OpenFin native** — workspace save/restore, theme switching, and inter-app messaging are first-class
- **Zero config loss** — every change is persisted immediately, not just on workspace save
- **Reference apps as living docs** — reference apps serve as documentation, integration tests, and MCP source simultaneously

---

## 2. Repository Structure

### 2.1 Three Repositories

```
marketsui-packages/          → publishes @marketsui/* to Artifactory
marketsui-reference-react/   → reference React app (read by MCP server)
marketsui-reference-angular/ → reference Angular app (read by MCP server)
marketsui-mcp/               → MCP server (published as npx marketsui-mcp)
```

> **Key relationship:** The reference apps are **not** starters to be copied. They are living documentation that the MCP server reads at runtime to extract scaffolding templates. Scaffolded code is always current — never stale template strings.

### 2.2 marketsui-packages Monorepo Layout

```
marketsui-packages/
├── packages/
│   ├── tokens/                    @marketsui/tokens
│   ├── config-schemas/            @marketsui/config-schemas
│   ├── expression-engine/         @marketsui/expression-engine
│   ├── data-providers/            @marketsui/data-providers
│   ├── config-service/            @marketsui/config-service
│   ├── user-service/              @marketsui/user-service
│   ├── platform/                  @marketsui/platform
│   │   ├── src/bootstrap/         ← platform team only
│   │   └── src/view/              ← content teams
│   ├── core/                      @marketsui/core  (Lit primitives)
│   ├── react/                     @marketsui/react
│   ├── config-editor-react/       @marketsui/config-editor-react
│   ├── angular/                   @marketsui/angular
│   └── config-editor-angular/     @marketsui/config-editor-angular
├── apps/
│   ├── platform-app/              OpenFin platform shell (one per env)
│   └── admin/                     Lit admin tools
└── package.json                   npm workspaces root
```

---

## 3. Package Architecture

### 3.1 All 12 Packages

#### Shared TypeScript Packages (7) — Zero UI, Zero Framework Dependency

| Package | Layer | Key Exports | Used By |
|---------|-------|-------------|---------|
| `@marketsui/tokens` | CSS only | `mdl.css`, `dark.css`, `light.css`, trading semantic tokens | All packages and apps |
| `@marketsui/config-schemas` | Shared TS | `BlotterConfig`, `ColumnGroupDef`, `StyleRule`, `ExpressionDef`, `ColumnGroupResolver`, `ConfigBindingResolver`, Zod schemas | Both frameworks |
| `@marketsui/expression-engine` | Shared TS | `ExpressionEngine`, `parse()`, `evaluate()`, `validate()`, `getCompletions()`, 60+ functions | Both frameworks |
| `@marketsui/data-providers` | Shared TS | `IDataProvider`, `DataProviderRegistry`, `SocketIOProvider`, `StompProvider`, `AMPSProvider`, `SolaceProvider`, `RestProvider`, `AppDataProvider` | Both frameworks |
| `@marketsui/config-service` | Shared TS | `ConfigManager`, `DexieAdapter`, `RestAdapter`, all 5 DB tables, `PENDING_SYNC` queue | Via platform |
| `@marketsui/user-service` | Shared TS | `UserService`, `PermissionsService`, `AppUser`, `Role`, `Permission` | Both frameworks |
| `@marketsui/platform` | Shared TS | `/bootstrap`: `bootstrapPlatform`, `configManager`, `WorkspaceOverride`, `DockBuilder` — `/view`: `resolveInstanceId`, `AppContext`, `ThemeService` | Platforms + content teams |

#### Framework-Specific Packages (4)

| Package | Framework | Key Exports |
|---------|-----------|-------------|
| `@marketsui/react` | React | `useMarketsUI()`, `useComponentConfig()`, `useTheme()`, `useOpenFin()`, `useDataProvider()`, `usePermissions()`, `useSubscription()`, `useLiveQuery()`, `MarketsUIProvider`, `ComponentToolbar`, `BlotterComponent` |
| `@marketsui/config-editor-react` | React | All 8 config editor panels, `ExpressionEditorReact` (Monaco), `ColumnGroupEditor` |
| `@marketsui/angular` | Angular | `MarketsUIBase`, `MarketsUIService`, `ComponentConfigService`, `OpenFinService`, `ThemeService`, `DataProviderService`, `PermissionsService`, `ViewServerService`, `BlotterComponent`, `provideMarketsUI()` |
| `@marketsui/config-editor-angular` | Angular | All 8 config editor panels (Angular templates), `ExpressionEditorAngular` (Monaco) |

#### Shared Lit Primitives (1)

| Package | Contents | Constraint |
|---------|----------|------------|
| `@marketsui/core` | `<mui-button>`, `<mui-badge>`, `<mui-spinner>`, `<mui-status-dot>`, `<mui-pill>` | **String/boolean props only.** No complex objects. No framework-specific events. Complex config editor UI is always framework-native. |

> **Why not Lit for config editors?** React synthetic event system cannot listen to DOM events dispatched by Lit components. Angular's `CUSTOM_ELEMENTS_SCHEMA` opts out of all type checking for custom element names. Both are unacceptable for deeply stateful config editor panels passing complex objects.

### 3.2 Package Dependency Graph

```
@marketsui/tokens                    (no deps — CSS only)
    └── @marketsui/config-schemas    (tokens)
            ├── @marketsui/expression-engine
            ├── @marketsui/data-providers
            └── @marketsui/config-service
                    └── @marketsui/user-service
                            └── @marketsui/platform
                                    ├── /bootstrap  (platform team only)
                                    └── /view       (content teams)

@marketsui/core                      (tokens)

@marketsui/react                     (platform/view, data-providers, core)
    └── @marketsui/config-editor-react  (react, expression-engine, config-schemas)

@marketsui/angular                   (platform/view, data-providers, core)
    └── @marketsui/config-editor-angular (angular, expression-engine, config-schemas)
```

**Rules:** Dependencies flow strictly downward. No circular dependencies. Shared TS packages have no UI dependency and no framework dependency.

### 3.3 Import Boundary — Critical Rule

`@marketsui/platform` has two entry points:

```typescript
// /bootstrap — platform-app ONLY. Never import from a content view.
import { bootstrapPlatform, configManager, WorkspaceOverride, DockBuilder }
  from '@marketsui/platform/bootstrap';

// /view — content teams (React and Angular views)
import { resolveInstanceId, AppContext, ThemeService }
  from '@marketsui/platform/view';
```

The React and Angular starters' `package.json` never list `/bootstrap` as a dependency. The boundary is **enforced at npm module resolution** — not convention.

---

## 4. Reference Applications

### 4.1 Purpose

The reference applications serve **three purposes simultaneously:**

1. **Developer documentation** — definitive guide showing correct usage of every package, hook, service, and config pattern
2. **Integration test suite** — every package feature exercised in a real OpenFin environment with real data
3. **MCP server source** — the MCP server reads both reference apps at runtime and extracts patterns when scaffolding projects

### 4.2 marketsui-reference-react

#### Features demonstrated

| Feature Area | What Is Demonstrated |
|-------------|---------------------|
| OpenFin bootstrap | Full platform-app setup, manifest config, Dock registration, workspace override, theme toggle wiring |
| Component lifecycle | `resolveInstanceId`, fresh launch, workspace restore, clone detection — all three paths with live OpenFin |
| ConfigService dual mode | Dev manifest (Dexie only) and prod manifest (REST+mirror) — switching modes, `PENDING_SYNC` drain |
| All DataProviders | `SocketIOProvider` → ViewServer, `StompProvider`, `RestProvider` for reference data, `AppDataProvider` with `{{binding}}` syntax |
| AG-Grid Blotter | Full `BlotterComponent` with live data, all 8 config editor panels open and functional |
| Column groups | Nested hierarchy, all three styling levels, conditional styles, open/closed state persistence |
| Expression engine | Calculated columns, conditional styling, named queries, flash rules — all using `ExpressionEditorReact` |
| Profiles | Save, load, export, import. Load from remote URL. |
| AppDataProvider | `UserSettings` panel sets `deskId` — Credit Blotter and Risk Heatmap both react via `{{UserSettings.deskId}}` |
| Theme switching | Dock toggle switches all components simultaneously via `ThemeService` |
| Permissions | `usePermissions()` gating column editing and config editor access by role |

#### Directory structure

```
marketsui-reference-react/
├── apps/
│   └── platform-app/
│       ├── manifests/
│       │   ├── dev.fin.json           configService.enabled: false
│       │   └── prod.fin.json          configService.enabled: true
│       └── src/main.ts                bootstrapPlatform() only
├── views/
│   ├── credit-blotter/                Full blotter — all features exercised
│   ├── rates-blotter/                 Second blotter — different DataProvider
│   ├── risk-heatmap/                  Chart component using AppDataProvider
│   ├── user-settings/                 Panel that writes to AppDataProvider
│   └── order-ticket/                  Form with entitlement rules
├── shared/
│   ├── mock-data/                     Dev-mode mock data for Dexie seeding
│   └── fi-queries/                    FI_QUERIES templates for ViewServer
├── docs/
│   └── feature-index.md              Maps features → file locations (read by MCP)
└── package.json
```

#### Credit blotter view — internal structure

```
views/credit-blotter/
├── CreditBlotter.tsx              Root — useMarketsUI(), MarketsUIProvider
├── config/
│   ├── baseConfig.ts              Template BlotterConfig (isTemplate: true)
│   ├── columnDefs.ts              All column definitions (flat array by colId)
│   ├── columnGroups.ts            Market Data, Risk & P&L, Trade Info groups
│   ├── styleRules.ts              P&L color rules, risk threshold rules
│   ├── flashRules.ts              Bid/ask price flash rules
│   └── calculatedCols.ts          Spread, duration-weighted DV01
├── providers/
│   └── viewServerConfig.ts        SocketIOProvider DataProviderConfig
└── __tests__/
    └── CreditBlotter.test.tsx
```

#### Correct React component pattern (drawn from reference app)

```typescript
// Every React MarketsUI view starts with useMarketsUI()
function CreditBlotter() {
  const {
    instanceId,    // resolved from OpenFin customData
    config,        // typed BlotterConfig from ConfigService
    saveConfig,    // debounced write — Dexie + REST
    isSaved,       // derived: does APP_CONFIG row exist?
    theme,         // 'dark' | 'light' — live from ThemeService
    dataProvider,  // IDataProvider — connected transport
    permissions,   // string[] — from UserService
    isLoading,     // true until config + identity resolved
  } = useMarketsUI<BlotterConfig>();

  const { data, status } = useSubscription<CreditPosition>(
    config.dataProvider.topic
  );

  if (isLoading) return <mui-spinner />;

  return (
    <MarketsUIProvider>
      <ComponentToolbar
        title={config.displayText}
        instanceId={instanceId}
        providerStatus={status}
      />
      <AgGridReact
        rowData={data}
        columnDefs={config.columnDefs}
        theme={theme === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}
        onColumnMoved={() => saveConfig({
          ...config,
          columnState: gridApi.getColumnState()
        })}
      />
      <ConfigEditorPanel
        config={config}
        onSave={saveConfig}
        permissions={permissions}
      />
    </MarketsUIProvider>
  );
}
```

### 4.3 marketsui-reference-angular

#### React → Angular equivalence map

| React pattern | Angular equivalent |
|---------------|-------------------|
| `useMarketsUI()` hook | `MarketsUIBase` abstract class + `inject()` |
| `MarketsUIProvider` context | `provideMarketsUI()` in `app.config.ts` |
| `useSubscription(topic)` | `ViewServerService.subscribe(topic)` → Observable |
| `useTheme()` | `toSignal(themeService.theme$)` — OnPush compatible |
| `usePermissions()` | `PermissionsService.can(action)` injectable |
| `<BlotterComponent />` | `BlotterComponent` with `@Input/@Output`, OnPush + Signals |
| `BlotterConfigEditor` panel | `BlotterConfigEditorComponent` with Angular CDK overlay |
| `ExpressionEditorReact` (Monaco) | `ExpressionEditorAngular` — same Monaco, `ViewContainerRef` mounting |

#### Correct Angular component pattern

```typescript
@Component({
  selector: 'app-credit-blotter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isLoading()) {
      <mui-spinner />
    } @else {
      <mui-toolbar [title]="config()!.displayText" />
      <ag-grid-angular
        [rowData]="data$ | async"
        [columnDefs]="config()!.columnDefs"
        [class]="theme() === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'"
        (columnMoved)="onColumnMoved($event)"
      />
      <mui-config-editor [config]="config()!" (save)="saveConfig($event)" />
    }
  `
})
class CreditBlotterComponent extends MarketsUIBase<BlotterConfig> {
  private vsService = inject(ViewServerService);
  data$ = this.vsService.subscribe<CreditPosition>(
    computed(() => this.config()?.dataProvider.topic ?? '')
  );
  onColumnMoved(e: ColumnMovedEvent) {
    this.saveConfig({ columnState: e.api.getColumnState() });
  }
}
```

---

## 5. MarketsUI MCP Server

### 5.1 Purpose

The `marketsui-mcp` server enables AI-assisted coding tools (Claude, Cursor, Copilot, Windsurf) to scaffold new MarketsUI projects by reading the reference apps at runtime.

**Key design decision:** The MCP server does **not** maintain its own template strings. It reads the actual reference app source files, extracts relevant sections, and assembles them for the developer. Scaffolded code is always in sync with the latest packages.

### 5.2 Installation

```json
// claude_desktop_config.json (or equivalent MCP client config)
{
  "mcpServers": {
    "marketsui": {
      "command": "npx",
      "args": ["marketsui-mcp"]
    }
  }
}
```

### 5.3 All 12 MCP Tools

#### Write tools (scaffolding)

| Tool | Description |
|------|-------------|
| `scaffold_project` | Scaffold a complete new MarketsUI project — React or Angular — with chosen components, DataProviders, and OpenFin manifests |
| `scaffold_component` | Add a new component view to an existing MarketsUI project with correct lifecycle wiring |
| `scaffold_blotter_config` | Generate a `BlotterConfig` for a specific desk — columnDefs, columnGroups with styling, style rules, DataProvider config |

#### Read tools (documentation + validation)

| Tool | Description |
|------|-------------|
| `get_package_docs` | API reference for any `@marketsui/*` package — hook signatures, service methods, type definitions, usage examples |
| `get_lifecycle_guide` | Component lifecycle — `resolveInstanceId`, fresh launch vs restore, `saveConfig` debounce, workspace save |
| `get_config_schema` | Full TypeScript schema for any config type — `BlotterConfig`, `ColumnGroupDef`, `StyleRule`, `DataProviderConfig` |
| `get_expression_functions` | Expression engine function library with signatures, descriptions, and examples by category |
| `get_dataprovider_guide` | Configuration guide for a specific DataProvider type — SocketIO, STOMP, AMPS, Solace, REST, AppDataProvider |
| `get_column_group_guide` | Column group configuration guide — schema, styling options, cascade rules, AG-Grid mapping |
| `search_reference_code` | Search reference apps for code examples by feature query — returns file path, code section, explanation |
| `validate_blotter_config` | Validate a `BlotterConfig` JSON against Zod schema — returns field-level errors with paths and fix suggestions |
| `list_components` | List all available components with `componentType`, `componentSubType`, and reference implementation links |

### 5.4 scaffold_project Input Parameters

```typescript
interface ScaffoldProjectParams {
  framework:             'react' | 'angular';
  projectName:           string;              // e.g. "rates-trading-ui"
  appId:                 string;              // e.g. "RATES_PROD"
  components:            ComponentSpec[];     // [{ componentType, componentSubType, dataProvider }]
  dataProviders:         DataProviderSpec[];
  configServiceEnabled:  boolean;             // true = prod manifest, false = dev manifest
  includeConfigEditor:   boolean;             // include @marketsui/config-editor-* package
}
```

#### What scaffold_project generates

- Complete project directory with `package.json`, `tsconfig.json`, `vite.config.ts` or `angular.json`
- OpenFin manifest files (dev and prod) pre-configured with `appId` and `configService` flag
- Main entry point — `MarketsUIProvider` bootstrap / `provideMarketsUI()` wiring
- One view file per component — drawn from reference app with correct lifecycle
- Base config files — `columnDefs`, `columnGroups`, `styleRules` pre-populated for the desk type
- DataProvider configuration files for each specified provider
- `README.md` with setup instructions, manifest URLs, and links to docs

### 5.5 MCP Server Architecture

```
marketsui-mcp/
├── src/
│   ├── index.ts                     MCP server entry — stdio transport
│   ├── tools/
│   │   ├── scaffold.ts              scaffold_project, scaffold_component, scaffold_blotter_config
│   │   ├── docs.ts                  get_package_docs, get_lifecycle_guide, get_config_schema
│   │   ├── expressions.ts           get_expression_functions
│   │   ├── search.ts                search_reference_code
│   │   └── validate.ts              validate_blotter_config
│   ├── readers/
│   │   ├── ReferenceAppReader.ts    Reads reference app source files by feature
│   │   ├── SchemaReader.ts          Reads @marketsui/config-schemas types
│   │   └── FeatureIndex.ts          Indexes feature-index.md → file paths
│   ├── assemblers/
│   │   ├── ProjectAssembler.ts      Assembles scaffolded project from parts
│   │   └── ConfigAssembler.ts       Builds BlotterConfig for a desk spec
│   └── templates/
│       ├── manifests/               dev.fin.json and prod.fin.json templates
│       └── package-templates/       package.json, tsconfig, build configs
├── reference-apps/                  git submodules (read-only)
│   ├── react/                       → marketsui-reference-react
│   └── angular/                     → marketsui-reference-angular
└── package.json
```

#### ReferenceAppReader API

```typescript
class ReferenceAppReader {
  getComponentTemplate(type: string, subtype: string, framework: 'react' | 'angular'): string;
  getBaseConfig(type: string, subtype: string): BlotterConfig;
  getHookUsageExample(hookName: string): string;
  getDataProviderExample(providerType: string): string;
  searchByFeature(query: string): FeatureMatch[];
}
```

### 5.6 Example Developer Conversations

| Developer says | MCP server does |
|---------------|----------------|
| "Scaffold a credit blotter React view for the RATES desk using ViewServer SocketIO" | `scaffold_component` — reads `CreditBlotter.tsx` from reference app, adapts for RATES desk, returns complete view file |
| "Show me how to configure nested column groups with conditional styling" | `get_column_group_guide` + `search_reference_code("conditional group styling")` — schema + reference app excerpt |
| "Create a new MarketsUI Angular project for the MBS desk" | `scaffold_project(framework: 'angular')` — complete Angular project drawn from Angular reference app |
| "Validate this BlotterConfig JSON" | `validate_blotter_config` — Zod validation, field-level errors with fix suggestions |
| "What does useMarketsUI return?" | `get_package_docs("@marketsui/react")` — hook signature + return type + reference app usage |

---

## 6. Config Service & Database Schema

### 6.1 Dual-Mode Design

Controlled by a single manifest flag: `configService.enabled`.

| Aspect | `enabled: false` (dev) | `enabled: true` (prod) |
|--------|----------------------|----------------------|
| Read path | Dexie IndexedDB — instant, offline | Dexie IndexedDB mirror — instant, offline |
| Write path | Dexie only | REST immediately + Dexie as write-through cache |
| Backend required | No | Yes (Spring Boot) |
| `PENDING_SYNC` | Not used | Queues failed remote writes, drains every 10s |
| Crash safety | Full — Dexie is durable | Full — config written on every change (debounced 300ms) |

**Zero code changes** in any component when switching modes.

### 6.2 APP_CONFIG Table

Primary config table. One row per component instance or template.

```typescript
interface AppConfigRow {
  configId:         string;    // PK — instanceId for instances, templateId for templates
  appId:            string;    // FK → APP_REGISTRY
  displayText:      string;    // human label in toolbar
  componentType:    string;    // "GRID" | "CHART" | "HEATMAP" | "ORDERTICKET"
  componentSubType: string;    // "CREDIT" | "RATES" | "MBS" | "CMBS"
  isTemplate:       boolean;   // true = base config, false = user instance
  config:           JSON;      // full BlotterConfig / ChartConfig / etc.
  createdBy:        string;    // userId
  updatedBy:        string;    // userId
  createdAt:        timestamp; // ISO
  updatedAt:        timestamp; // ISO — used for conflict resolution
}
```

### 6.3 All Database Tables

| Table | Key Fields |
|-------|-----------|
| `APP_CONFIG` | `configId PK`, `appId FK`, `displayText`, `componentType`, `componentSubType`, `isTemplate`, `config JSON`, `createdBy`, `updatedBy`, timestamps |
| `APP_REGISTRY` | `appId PK`, `displayName`, `manifestUrl`, `configServiceEnabled`, `environment` |
| `USER_PROFILE` | `userId PK`, `appId FK`, `roleId FK`, `displayName` |
| `ROLES` | `roleId PK`, `permissions[] JSON` |
| `WORKSPACE_SNAPSHOT` | `snapshotId PK`, `appId`, `instanceIds[]` — list of open component instanceIds |
| `PENDING_SYNC` | `id auto PK`, `operation (upsert\|delete)`, `configId`, `payload JSON`, `createdAt`, `retries` |

### 6.4 Component Lifecycle — 6 Steps

```
Step 1: OpenFin delivers customData
  { instanceId, templateId, componentType, componentSubType }
  → No config blob. Minimal identity only.

Step 2: resolveInstanceId() runs
  configManager.exists(instanceId)?
  → No row  = fresh launch  → clone template config, write APP_CONFIG immediately
  → Row exists = workspace restore → load existing config

Step 3: Config fetched from Dexie
  → Instant, offline-capable. Dexie is always the read path.

Step 4: DataProvider connects
  config.dataProvider.id → DataProviderRegistry → connects transport
  → Snapshot + delta stream begins flowing

Step 5: Component renders
  isLoading = false. Toolbar + grid + config panel mount.
  AG-Grid column group state restored from config.

Step 6: User changes config
  saveConfig(newConfig) → debounced 300ms → Dexie write → REST write (if enabled)
  → Config durable before any workspace save.
```

### 6.5 Identity — Three Cases

| Case | Detection | Action |
|------|-----------|--------|
| Fresh launch | `windowName === instanceId`, no `APP_CONFIG` row | Clone template config, write to `APP_CONFIG` immediately. `isSaved = false` (derived). |
| Workspace restore | `windowName === instanceId`, `APP_CONFIG` row exists | Load config from `APP_CONFIG`. `isSaved = true` (derived). |
| Clone | `windowName !== instanceId` | New `instanceId` via uuid. Clone base config from `templateId`. Write new `APP_CONFIG` row. Update `customData`. |

---

## 7. Data Provider Layer

### 7.1 IDataProvider Interface

```typescript
interface IDataProvider {
  connect(config: DataProviderConfig): Promise<void>;
  subscribe<T>(topic: string, handler: (data: T) => void): Unsubscribe;
  publish<T>(topic: string, payload: T): Promise<void>;
  query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
  disconnect(): void;
  status$: Observable<'connected' | 'reconnecting' | 'error'>;
}
```

All data sources implement this interface. Components never reference a specific transport.

### 7.2 Transport Adapters

| Adapter | Transport | Use Case |
|---------|-----------|---------|
| `SocketIOProvider` | Socket.io | ViewServer — primary real-time data source for all trading blotters |
| `StompProvider` | WebSocket/STOMP | ActiveMQ, RabbitMQ — alternative message broker backends |
| `AMPSProvider` | AMPS | AMPS delta-stream with SQL-based subscriptions |
| `SolaceProvider` | Solace PubSub+ | Solace-based market data and event feeds |
| `RestProvider` | HTTP / SSE | Reference data, slower-changing datasets |
| `AppDataProvider` | In-memory / IAB | **Shared application state between components** |

> **Note on ViewServer:** ViewServer is a backend service that MarketsUI connects to via `SocketIOProvider` or `StompProvider`. It is not a separate package — it is a configured transport adapter. Components never know they are talking to ViewServer specifically.

### 7.3 AppDataProvider — Shared State Bus

Enables cross-component data sharing through **configuration, not code**.

#### Binding syntax

Any string field in a component config can bind to any AppDataProvider key:

```json
{
  "filterModel": { "deskId": "{{UserSettings.deskId}}" },
  "riskThreshold": "{{DeskConfig.alertThresholds.credit}}",
  "groupHeaderColor": "{{DeskTheme.riskGroupColor}}"
}
```

The `ConfigBindingResolver` (in `@marketsui/config-schemas`) walks the config tree, finds `{{X.Y}}` patterns, resolves them against `DataProviderRegistry`, and subscribes to changes.

#### Scope

| Scope | Storage | Behaviour |
|-------|---------|-----------|
| `window` | In-memory | State in that OpenFin view only. Fast, isolated. |
| `app` | OpenFin IAB channel | State broadcast to all OpenFin views. Changes in a settings panel propagate to all blotters in all windows. |

#### Use cases

- `UserSettings` — `deskId`, `defaultCurrency`, `riskLimit` drive filters and thresholds across all blotters
- `DeskTheme` — group header colors, highlight colors driven by desk-level configuration
- `AppContext` — `environment`, `featureFlags`, `appVersion` shared across all components
- `TraderContext` — active trader, active book — set by a context panel, consumed by order tickets and blotters

---

## 8. Blotter & Column Group Specification

### 8.1 BlotterConfig Schema

```typescript
interface BlotterConfig {
  displayText:      string;                    // label in toolbar
  dataProvider:     DataProviderConfig;        // transport + topic
  columnDefs:       ColumnConfig[];            // flat array keyed by colId
  columnGroups:     ColumnGroupDef[];          // group tree (separate from columns)
  columnGroupState: ColumnGroupState[];        // open/closed per group — persisted on every toggle
  styleRules:       StyleRule[];               // conditional cell/row styling
  flashRules:       FlashRule[];               // cell/row flash conditions
  calculatedCols:   CalculatedColumn[];        // virtual columns via expressions
  namedQueries:     NamedQuery[];              // saved filter combinations (OR combined)
  entitlements:     EntitlementRule[];         // cell editing rules
  profiles:         ConfigProfile[];           // named config snapshots
  gridOptions:      Partial<GridOptions>;      // AG-Grid gridOptions overrides
}
```

> **Critical design:** `columnDefs` and `columnGroups` are **separate arrays**. Columns are keyed by `colId`. Groups reference columns by `colId`. This allows independent editing of column config and group structure. `ColumnGroupResolver` merges them into AG-Grid's nested `ColGroupDef` format at render time.

### 8.2 ColumnGroupDef — Full Schema

```typescript
interface ColumnGroupDef {
  // Identity
  groupId:                string;              // unique ID e.g. "grp-market-data"
  headerName:             string;              // display label
  headerTooltip?:         string;

  // Membership
  colIds:                 string[];            // ordered column members
  children?:              ColumnGroupDef[];    // nested sub-groups (unlimited depth)
  parentGroupId?:         string;              // null = top-level

  // State
  openByDefault:          boolean;
  lockOpen?:              boolean;             // prevent collapse
  lockClosed?:            boolean;             // prevent expand
  marryChildren?:         boolean;             // keep columns together
  suppressStickyLabel?:   boolean;
  columnGroupShow?:       'open' | 'closed';

  // Styling
  headerStyle?:           GroupHeaderStyle;
  groupCellStyle?:        GroupCellStyle;
  conditionalHeaderStyles?: ConditionalGroupStyle[];
  groupColumnDefaults?:   Partial<ColumnConfig>;
}
```

### 8.3 GroupHeaderStyle Fields

All color fields support three value formats:
- **Literal:** `"#1D3A5C"`
- **MDL CSS variable:** `"var(--mdl-group-risk)"` (theme-aware, auto dark/light)
- **AppDataProvider binding:** `"{{DeskTheme.riskColor}}"` (live, changes at runtime)

```typescript
interface GroupHeaderStyle {
  backgroundColor?:   string;    // three formats above
  color?:             string;    // text color
  fontWeight?:        'normal' | '500' | 'bold';
  fontStyle?:         'normal' | 'italic';
  fontSize?:          string;    // e.g. "12px"
  fontFamily?:        string;
  textAlign?:         'left' | 'center' | 'right';
  textTransform?:     'uppercase' | 'capitalize' | 'none';
  letterSpacing?:     string;
  borderBottom?:      string;    // e.g. "2px solid #0D2840"
  borderLeft?:        string;
  borderRight?:       string;
  paddingLeft?:       string;
  paddingRight?:      string;
  cssClass?:          string;    // custom CSS class — appended
}
```

### 8.4 GroupCellStyle Fields

Applies a visual band to all data cells under the group. Overridden by per-column `cellStyle`.

```typescript
interface GroupCellStyle {
  backgroundColor?:   string;    // background tint for all cells in group
  color?:             string;    // text color override
  fontWeight?:        string;
  borderLeft?:        string;    // left boundary (first column of group)
  borderRight?:       string;    // right boundary (last column of group)
  cssClass?:          string;
}
```

### 8.5 ConditionalGroupStyle

```typescript
interface ConditionalGroupStyle {
  expression:   string;           // ExpressionEngine expression evaluated per row
  headerStyle?: GroupHeaderStyle; // override when expression is true
  cellStyle?:   GroupCellStyle;
  priority:     number;           // higher wins when multiple match
}
```

### 8.6 Style Cascade (Highest to Lowest Priority)

```
1. Per-column explicit cellStyle        (Column Config tab — always wins)
2. Conditional group cellStyle          (when ConditionalGroupStyle expression = true)
3. Static group cell band style         (groupCellStyle)
4. Group column defaults                (groupColumnDefaults — baseline)
```

### 8.7 AG-Grid API Mapping

| MarketsUI field | AG-Grid equivalent | Notes |
|----------------|-------------------|-------|
| `groupId` | `groupId` | Direct pass-through |
| `headerName` | `headerName` | Direct pass-through |
| `openByDefault` | `openByDefault` | Direct pass-through |
| `marryChildren` | `marryChildren` | Direct pass-through |
| `lockOpen` | `columnGroupShow: 'open'` | Prevents collapse |
| `lockClosed` | `columnGroupShow: 'closed'` | Prevents expand |
| `headerStyle.backgroundColor` (literal) | `headerStyle.backgroundColor` | Inline style |
| `headerStyle.backgroundColor` (CSS var) | `headerClass` | `ColumnGroupResolver` generates scoped CSS class |
| `headerStyle.cssClass` | `headerClass` | Appended to class list |
| `groupCellStyle` | `defaultColDef.cellStyle` (group-scoped) | Via `groupColumnDefaults` |
| `conditionalHeaderStyles` | `headerClassRules` | ExpressionEngine evaluates per row |
| `columnGroupState[].open` | `gridApi.setColumnGroupState()` | Restored on mount; saved on `columnGroupOpened` event |

### 8.8 Column Group State Lifecycle

```typescript
// On mount — restore saved state
useEffect(() => {
  if (gridApi && config.columnGroupState.length > 0) {
    gridApi.setColumnGroupState(config.columnGroupState);
  }
}, [gridApi]);

// On toggle — persist immediately
const onColumnGroupOpened = (event: ColumnGroupOpenedEvent) => {
  const newGroupState = gridApi.getColumnGroupState();
  saveConfig({ columnGroupState: newGroupState });
  // debounced 300ms → Dexie → REST
};
```

---

## 9. Config Editor Tool

### 9.1 Eight Editor Panels

| # | Panel | What Is Configured |
|---|-------|--------------------|
| 1 | General Settings | Grid theme, row height, selection mode, pagination, undo/redo, locale, performance, `defaultColDef` overrides |
| 2 | Column Config | Per-column header/cell styling, value formatters (standard + Excel-like), value getters, cell editors, cell renderers, conditional editing, dropdown data sources, per-column flashing |
| 3 | Column Groups | Group structure and hierarchy, column membership and ordering, header styling, cell band styling, conditional group styling, state (open/lock/marryChildren) |
| 4 | Conditional Styling | Row and cell style rules via `ExpressionEditor` or visual builder. Font, background, foreground, border, CSS class. |
| 5 | Calculated Columns | Virtual columns via `ExpressionEditor`. Full 60+ function library. |
| 6 | Named Queries | Create/save filter combinations via expression editor or by saving current grid filters. Multiple queries combined with OR. |
| 7 | Flash & Entitlements | Cell/row flash conditions, flash style (color, duration, animation). Editing entitlements based on row values or REST responses. |
| 8 | Profiles | Save entire config as named profiles. Load, delete, export to JSON, import from JSON, load from remote URL. |

### 9.2 Expression Engine Function Library

| Category | Functions |
|----------|-----------|
| Mathematical | `ABS`, `ROUND`, `FLOOR`, `CEIL`, `SQRT`, `POW`, `MOD`, `LOG`, `EXP`, `SIGN` |
| Statistical | `AVG`, `MEDIAN`, `STDEV`, `VARIANCE`, `PERCENTILE`, `CORREL`, `MIN`, `MAX` |
| Aggregation | `SUM`, `COUNT`, `DISTINCT_COUNT`, `FIRST`, `LAST`, `RANGE` |
| String | `CONCAT`, `UPPER`, `LOWER`, `TRIM`, `SUBSTRING`, `REPLACE`, `LEN`, `STARTSWITH`, `ENDSWITH`, `CONTAINS`, `SPLIT` |
| Date | `DATE_DIFF`, `DATE_ADD`, `NOW`, `TODAY`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `FORMAT_DATE`, `IS_WEEKEND` |
| Logical | `IF`, `ISNULL`, `ISEMPTY`, `AND`, `OR`, `NOT`, `XOR`, `SWITCH`, `COALESCE` |
| Operators | `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, `NOT IN`, `BETWEEN`, `LIKE`, ternary `(?:)` |

### 9.3 Column Group Editor — Wizard Flow

| Step | Name | What the User Does |
|------|------|-------------------|
| 1 | Structure | Add, rename, delete, nest groups. Drag-and-drop to reorder. |
| 2 | Membership | Drag columns from ungrouped list into groups. Set column order within groups. |
| 3 | Header style | Set background, text color, font weight, alignment, borders. Color picker supports hex, MDL var, and AppDataProvider binding. |
| 4 | Cell band style | Set background tint and boundary borders for data cells under the group. |
| 5 | Conditional styling | Add expression-based style rules. Set override styles for header and cell band. |
| 6 | State & behaviour | Set `openByDefault`, `lockOpen`, `lockClosed`, `marryChildren`, `suppressStickyLabel`, `columnGroupShow`. |

---

## 10. OpenFin Integration

### 10.1 Platform Architecture

| Concern | Design |
|---------|--------|
| Platform ownership | One `platform-app` per environment. React and Angular teams build content views — never the platform. |
| Workspace save override | Platform intercepts snapshot. Stores only `instanceId` references in `WORKSPACE_SNAPSHOT`. Config already durable. |
| Theme switching | Dock toggle → `fin.Theme` event → `ThemeService.applyTheme()` → `data-theme` on `<html>` → all MDL vars flip → AG-Grid theme class toggled. |
| `customData` contents | `{ instanceId, templateId, componentType, componentSubType }` only. No config blob. |
| Clone detection | `windowName !== instanceId` → clone → new `instanceId` via uuid → clone base config → update `customData`. |

### 10.2 Platform Instances by Environment

| appId | Environment | ConfigService mode |
|-------|------------|-------------------|
| `CREDIT_PROD` | Production — Credit desk | `enabled: true` — REST + Dexie mirror |
| `RATES_PROD` | Production — Rates desk | `enabled: true` — REST + Dexie mirror |
| `CREDIT_UAT` | UAT | `enabled: true` — UAT REST endpoint |
| `DEV` | Developer local | `enabled: false` — Dexie only, no backend |

### 10.3 Angular Bootstrap Pattern

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideMarketsUI(),     // registers all MarketsUI services
    provideViewServer(),    // registers ViewServerService
    provideRouter(routes),
    provideAnimations(),
  ]
};
```

---

## 11. Implementation Plan

### 11.1 Four Phases

| Phase | Name | Duration | Key Milestone | Exit Criteria |
|-------|------|----------|--------------|---------------|
| 1 | Shared TS packages | 3–4 weeks | All 7 shared packages published | React starter can import all packages |
| 2 | React implementation | 6–8 weeks | Reference React app live, all 8 config editor panels | Full blotter functional in OpenFin |
| 3 | Production validation | 4–6 weeks | React blotter in UAT on Credit desk | Workspace save/restore proven in production |
| 4 | Angular port + MCP | 6–8 weeks | Angular reference app + MCP server published | Angular starter ships with feature parity |

### 11.2 Phase 1 — Shared TypeScript Packages

| Deliverable | Priority | Key Outputs |
|------------|----------|------------|
| `@marketsui/tokens` | P0 — day 1 | `mdl.css`, `dark.css`, `light.css`, trading semantic tokens |
| `@marketsui/config-schemas` | P0 — week 1 | `BlotterConfig`, `ColumnGroupDef`, all types, Zod schemas, `ColumnGroupResolver`, `ConfigBindingResolver` |
| `@marketsui/config-service` | P0 — week 1 | Dexie schema, 5 tables, dual-mode `ConfigManager`, `PENDING_SYNC` queue |
| `@marketsui/data-providers` | P1 — week 2 | `IDataProvider`, `DataProviderRegistry`, `SocketIOProvider`, `StompProvider`, `AppDataProvider` |
| `@marketsui/expression-engine` | P1 — week 2–3 | Parser, AST, evaluator, 60+ functions, autocomplete, validation |
| `@marketsui/user-service` | P2 — week 3 | `UserService`, `PermissionsService`, all types |
| `@marketsui/platform/view` | P2 — week 4 | `resolveInstanceId`, `AppContext`, `ThemeService`, `ComponentCustomData` |

### 11.3 Phase 2 — React Implementation

| Deliverable | Timeline | Key Outputs |
|------------|----------|------------|
| `@marketsui/platform/bootstrap` | Week 5 | `bootstrapPlatform`, `WorkspaceOverride`, `DockBuilder`, `StorageSync` |
| `@marketsui/react` — hooks | Week 5–6 | `useMarketsUI`, `useComponentConfig`, `useTheme`, `useOpenFin`, `useDataProvider`, `useSubscription`, `useLiveQuery` |
| `@marketsui/react` — components | Week 6 | `MarketsUIProvider`, `ComponentToolbar`, `BlotterComponent` |
| `@marketsui/config-editor-react` | Week 7–12 | All 8 config editor panels, `ColumnGroupEditor`, `ExpressionEditorReact` |
| `marketsui-reference-react` | Week 8–13 | Full reference app — all views, all providers, `feature-index.md` |

### 11.4 Phase 4 — Angular Port and MCP Server

| Deliverable | Notes |
|------------|-------|
| `@marketsui/angular` | `MarketsUIBase`, all services — direct Angular translation of React hooks |
| `@marketsui/config-editor-angular` | All 8 panels — same logic from shared TS, Angular template syntax |
| `marketsui-reference-angular` | Full reference app — identical features to React reference |
| `marketsui-mcp` | All 12 tools. Reads both reference apps as git submodules. Published as `npx marketsui-mcp`. |

### 11.5 React → Angular Translation Map

| React | Angular |
|-------|---------|
| `useMarketsUI()` | `MarketsUIBase` abstract class |
| `useComponentConfig()` | `ComponentConfigService` injectable |
| `useTheme()` | `toSignal(themeService.theme$)` |
| `useOpenFin()` | `OpenFinService.resolveIdentity()` |
| `useDataProvider()` | `DataProviderService` injectable |
| `MarketsUIProvider` context | `provideMarketsUI()` + Angular DI |
| `<BlotterComponent />` | `BlotterComponent` with `@Input/@Output`, OnPush + Signals |
| `BlotterConfigEditor` (React) | `BlotterConfigEditorComponent` (Angular templates, same logic) |
| `ExpressionEditorReact` (Monaco) | `ExpressionEditorAngular` (same Monaco, `ViewContainerRef` mounting) |

---

## 12. Design Language (MDL)

### 12.1 Token Architecture

- **Primitive tokens** — Tailwind color scale as CSS custom properties (`--mdl-blue-500` etc.)
- **Semantic tokens** — purpose-driven: `--mdl-bid`, `--mdl-ask`, `--mdl-flash-up`, `--mdl-flash-down`, `--mdl-pnl-positive`, `--mdl-pnl-negative`
- **Group tokens** — `--mdl-group-market`, `--mdl-group-risk`, `--mdl-group-pnl`, `--mdl-group-trade`
- **Theme switching** via `data-theme="dark|light"` on `<html>` — all vars flip atomically
- **Typography** — JetBrains Mono for all numeric cell data

### 12.2 Trading Semantic Tokens

| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `--mdl-bid` | Blue — buyer price | Light blue |
| `--mdl-ask` | Red — seller price | Light red |
| `--mdl-flash-up` | Green — price increase | Bright green |
| `--mdl-flash-down` | Red — price decrease | Bright red |
| `--mdl-pnl-positive` | Green | Bright green |
| `--mdl-pnl-negative` | Red | Bright red |
| `--mdl-group-risk` | Dark amber | Amber |
| `--mdl-group-market` | Dark blue | Blue |

### 12.3 Lit Primitives Compatibility

| Component | React | Angular |
|-----------|-------|---------|
| `<mui-button>` | Direct JSX | `CUSTOM_ELEMENTS_SCHEMA` |
| `<mui-badge>` | Direct JSX | `CUSTOM_ELEMENTS_SCHEMA` |
| `<mui-spinner>` | Direct JSX | `CUSTOM_ELEMENTS_SCHEMA` |
| `<mui-status-dot>` | Direct JSX | `CUSTOM_ELEMENTS_SCHEMA` |
| `<mui-pill>` | Direct JSX | `CUSTOM_ELEMENTS_SCHEMA` |

**All config editor panels are framework-native — never Lit.**

---

## 13. Key Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | React first, Angular second | Validate architecture once. Angular port is mechanical once React is proven and reference app is complete. |
| D2 | Lit only for simple stateless primitives | React synthetic event system and Angular `CUSTOM_ELEMENTS_SCHEMA` type-safety loss make Lit unsuitable for complex config editor UI. |
| D3 | Shared TypeScript, not shared Lit | Logic reuse via pure TypeScript has zero framework friction. Lit UI reuse has significant framework-specific friction for complex components. |
| D4 | Reference apps as MCP source, not template strings | Reference apps are living documentation. MCP server reads them at runtime — scaffolded code is always current, never stale. |
| D5 | `columnDefs` and `columnGroups` separate | Allows independent editing. `ColumnGroupResolver` merges at render time. |
| D6 | Config written on every change, not on workspace save | Crash-safe from first launch. Workspace save is a pure OpenFin layout operation. |
| D7 | `AppDataProvider` as shared state bus | `{{ProviderName.KeyName}}` syntax enables cross-component data sharing via config — no code-level coupling between components. |
| D8 | Dexie as primary read path | Instant reads, offline-capable. REST is write target only. Zero code change between dev and prod modes. |
| D9 | `@marketsui/platform` split `/bootstrap` and `/view` | Content teams cannot accidentally import platform bootstrap code. Boundary enforced at npm module resolution — not convention. |
| D10 | MCP server uses git submodules for reference apps | MCP always reads latest reference app code. No manual template synchronisation. Reference apps are the single source of truth. |

---

## 14. Appendix

### 14.1 Package Dependency Matrix

| Package | Depends On | React | Angular |
|---------|-----------|-------|---------|
| `@marketsui/tokens` | nothing | yes | yes |
| `@marketsui/config-schemas` | tokens | yes | yes |
| `@marketsui/expression-engine` | config-schemas | yes | yes |
| `@marketsui/data-providers` | config-schemas | yes | yes |
| `@marketsui/config-service` | config-schemas | via platform | via platform |
| `@marketsui/user-service` | config-service | yes | yes |
| `@marketsui/platform/view` | config-service, user-service | yes | yes |
| `@marketsui/platform/bootstrap` | platform/view | platform-app only | platform-app only |
| `@marketsui/core` | tokens | direct JSX | CUSTOM_ELEMENTS_SCHEMA |
| `@marketsui/react` | platform/view, data-providers, core | yes | no |
| `@marketsui/config-editor-react` | react, expression-engine, config-schemas | yes | no |
| `@marketsui/angular` | platform/view, data-providers, core | no | yes |
| `@marketsui/config-editor-angular` | angular, expression-engine, config-schemas | no | yes |

### 14.2 MCP Tools Quick Reference

| Tool | Type | When to Use |
|------|------|------------|
| `scaffold_project` | write | Starting a new MarketsUI project from scratch |
| `scaffold_component` | write | Adding a new component view to an existing project |
| `scaffold_blotter_config` | write | Generate a `BlotterConfig` for a specific desk |
| `get_package_docs` | read | API reference for any `@marketsui/*` package |
| `get_config_schema` | read | TypeScript schema for any config type |
| `get_expression_functions` | read | Expression engine function library |
| `get_dataprovider_guide` | read | DataProvider configuration guide |
| `get_column_group_guide` | read | Column group configuration guide |
| `search_reference_code` | read | Find code examples in reference apps |
| `validate_blotter_config` | read | Validate a `BlotterConfig` JSON |
| `list_components` | read | List all available components |
| `get_lifecycle_guide` | read | Component lifecycle documentation |

### 14.3 Starter Project Dependencies

#### marketsui-react-starter `package.json` dependencies

```json
{
  "dependencies": {
    "@marketsui/react": "latest",
    "@marketsui/tokens": "latest",
    "@marketsui/config-editor-react": "latest",
    "@marketsui/data-providers": "latest",
    "@marketsui/config-schemas": "latest"
  }
}
```

Note: `@marketsui/platform/view` is imported in code but resolved via `@marketsui/react` peer dependency. `@marketsui/platform/bootstrap` is **never** in a starter's dependencies.

#### marketsui-angular-starter `package.json` dependencies

```json
{
  "dependencies": {
    "@marketsui/angular": "latest",
    "@marketsui/tokens": "latest",
    "@marketsui/config-editor-angular": "latest",
    "@marketsui/data-providers": "latest",
    "@marketsui/config-schemas": "latest"
  }
}
```

### 14.4 Glossary

| Term | Definition |
|------|-----------|
| `instanceId` | Unique ID for a specific component instance e.g. `"GRID_CREDIT_abc123"` |
| `templateId` | ID of the base config template a component was cloned from e.g. `"tpl-credit-blotter-a1b2"` |
| `componentType` | Category of component e.g. `"GRID"`, `"CHART"`, `"HEATMAP"` |
| `componentSubType` | Desk/product line e.g. `"CREDIT"`, `"RATES"`, `"MBS"`, `"CMBS"` |
| `isSaved` | Derived boolean — `true` if `APP_CONFIG` row exists for this `instanceId` |
| `AppDataProvider` | Special `IDataProvider` implementation that stores key-value application state reactively |
| `ConfigBindingResolver` | Utility in `@marketsui/config-schemas` that resolves `{{X.Y}}` bindings in config JSON |
| `ColumnGroupResolver` | Utility in `@marketsui/config-schemas` that merges flat `columnDefs` + `columnGroups` into AG-Grid nested `ColGroupDef` |
| `PENDING_SYNC` | Dexie table that queues failed remote writes and drains to REST every 10 seconds |
| `feature-index.md` | File in each reference app mapping feature names to source file paths — read by MCP server |
| `ReferenceAppReader` | MCP server class that reads reference app source files by feature name |
| MDL | MarketsUI Design Language — CSS token system built on Tailwind color scale |

---

*MarketsUI v2.0 — Confidential — March 2026*

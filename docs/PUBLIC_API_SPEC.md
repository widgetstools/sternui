---
title: "StarUI Platform — Public API Specification"
subtitle: "The consumer-facing contract any implementation must honour"
date: "2026-05-18"
status: "Authoritative — supersedes inferred behaviour in source"
---

# Foreword

This document captures the **public API surface** of the StarUI
Platform — every type, component, hook, function, and configuration
shape that an application developer touches.

It exists because:

1. The codebase has grown iteratively over three years. ~1,200 files
   implement a contract that fits in this one document.
2. A future rewrite (smaller, faster, cleaner) needs a precise spec to
   honour. This is that spec.
3. Today, the contract is *implicit* — scattered across READMEs,
   docstrings, and source code. New consumers have to read code to
   learn the API. That's bad. This file fixes that.

**What this is:** the contract.  Every implementation — current or
future — must honour the signatures, behaviours, and guarantees
documented here. If reality diverges from this document, this
document wins; reality is a bug.

**What this is not:** an internal architecture guide. For "how is
this implemented" see [`ARCHITECTURE_GUIDE.md`](./ARCHITECTURE_GUIDE.md).
For "what features exist" see [`FEATURE_INVENTORY.md`](./FEATURE_INVENTORY.md).

**TypeScript signatures are normative.** Where this document shows
`interface X { ... }`, an implementation must export exactly that
type from the named package.

---

# 1. Top-level entrypoints

## 1.1 `<StarUIApp>` — declarative application root

The single declarative root that mounts the platform. Replaces the
4-deep provider stack (`AppShell → DataServicesProvider →
ConfigServiceProvider → HostWrapper`).

```ts
// Package: @starui/app
import { StarUIApp } from "@starui/app";

interface StarUIAppProps {
  /** App identifier. Required. Used as the appId scope for every
   *  ConfigService read/write. Cannot be empty. */
  readonly appId: string;
  /** Top-level configuration. Every field optional with sensible
   *  defaults. */
  readonly config?: StarUIAppConfig;
  /** Optional plugins (e.g. [openfin]) that may provide a Runtime
   *  and/or run bootstrap hooks. */
  readonly plugins?: ReadonlyArray<StarUIPlugin>;
  /** Render while bootstrap is in progress. Default: null. */
  readonly loading?: ReactNode;
  /** Render if bootstrap fails. Receives the error. */
  readonly fallback?: (error: Error) => ReactNode;
  readonly children: ReactNode;
}

interface StarUIAppConfig {
  readonly data?: {
    /** SharedWorker entry URL. If omitted, DataServices is not
     *  mounted (apps that only use local storage skip it). */
    readonly workerUrl?: URL | string;
    /** App name passed to bootstrapDataServices. Defaults to appId. */
    readonly appName?: string;
  };
  readonly config?: {
    /** "auto" reads VITE_CONFIG_SERVICE_URL or manifest customSettings;
     *  "local" forces local-only; explicit string uses that URL. */
    readonly rest?: "auto" | "local" | string;
    /** Identity override. Defaults to { appId, userId }. */
    readonly identity?: AppIdentity;
    /** Seed JSON URL for first-boot auth-table bootstrap. */
    readonly seedUrl?: string;
  };
  /** Custom RuntimePort instance. Bypasses plugin auction. */
  readonly runtime?: RuntimePort;
  /** Override user id. Defaults to the platform's "dev1" pin until SSO. */
  readonly userId?: string;
}
```

### Behaviour

1. **Bootstrap is async.** Children do not render until the runtime,
   ConfigManager, and (if configured) DataServices are ready.
2. **Runtime selection auction.** Each plugin's `provideRuntime()` is
   called in registration order. First non-null wins. Falls back to
   `BrowserRuntime`.
3. **Plugin hooks are isolated.** Errors in any `provideRuntime` /
   `onBootstrap` / `onShutdown` are logged and swallowed. One bad
   plugin does not block app boot.
4. **Cancellation-safe.** Unmount during bootstrap cancels pending
   work and still runs `onShutdown` hooks in reverse order.
5. **Validates `appId` is a non-empty string.** Throws otherwise
   (programmer error).
6. **Logs through `createLogger("starui:app")`.**

## 1.2 `StarUIPlugin` — extension contract

```ts
// Package: @starui/app/plugin
interface StarUIPlugin {
  /** Unique plugin identifier. Used in log output. Required. */
  readonly name: string;
  /** Optionally provide a custom RuntimePort. Return null if not
   *  applicable in the current environment. */
  readonly provideRuntime?: () =>
    | RuntimePort
    | Promise<RuntimePort | null>
    | null;
  /** Run after runtime + identity are resolved. */
  readonly onBootstrap?: (ctx: StarUIPluginContext) => void | Promise<void>;
  /** Run on app unmount in reverse registration order. */
  readonly onShutdown?: (ctx: StarUIPluginContext) => void | Promise<void>;
}

interface StarUIPluginContext {
  readonly appId: string;
  readonly userId: string;
  readonly runtime: RuntimePort;
  readonly customSettings: Readonly<Record<string, unknown>>;
  readonly log: {
    info: (msg: string, ctx?: unknown) => void;
    warn: (msg: string, ctx?: unknown) => void;
    error: (msg: string, ctx?: unknown) => void;
  };
}

function isStarUIPlugin(value: unknown): value is StarUIPlugin;
```

## 1.3 `createLogger` — package-tagged logger

```ts
// Package: @starui/app/log
function createLogger(prefix: string): Logger;

interface Logger {
  info:  (message: string, context?: unknown) => void;
  warn:  (message: string, context?: unknown) => void;
  error: (message: string, context?: unknown) => void;
}

function setSilenced(value: boolean): void;
```

### Behaviour

- Emits to `console.{info,warn,error}` with a `[<prefix>]` tag.
- `setSilenced(true)` mutes `info` only.
- Never throws — `console.*` failures are caught.
- Safe in SSR / non-browser contexts (probes `typeof console`).

---

# 2. The Grid Widget

## 2.1 `<MarketsGrid>`

The flagship trader-grade grid. Configurable, profile-aware,
multi-instance, optionally cloud-synced.

```ts
// Package: @starui/grid
import { MarketsGrid, type MarketsGridHandle } from "@starui/grid";

interface MarketsGridProps<TData extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable per-grid identifier. Required. */
  readonly gridId: string;
  /** Row data. */
  readonly rowData: TData[];
  /** AG-Grid column definitions. */
  readonly columnDefs: ColDef<TData>[];

  /** Per-instance identifier (different from gridId). Falls back to
   *  gridId. Used by storage to scope rows. */
  readonly instanceId?: string;
  /** Identity overrides — fall back to surrounding <StarUIApp>. */
  readonly appId?: string;
  readonly userId?: string;

  /** Override the default 9 grid modules.  Module order is determined
   *  by each module's `priority` field. */
  readonly modules?: ReadonlyArray<Module<unknown>>;

  /** Storage factory. Required for persistence. Default: in-memory
   *  with a dev-mode warning. */
  readonly storage?: StorageAdapterFactory;

  /** Composite row-id keys. */
  readonly rowIdField?: string | ReadonlyArray<string>;

  /** AppData provider snapshot for `{{name.key}}` template
   *  resolution inside cell values. */
  readonly appData?: AppDataLookup;

  /** Chrome visibility flags (all default true). */
  readonly showToolbar?: boolean;
  readonly showFiltersToolbar?: boolean;
  readonly showFormattingToolbar?: boolean;
  readonly showSaveButton?: boolean;
  readonly showSettingsButton?: boolean;
  readonly showProfileSelector?: boolean;

  /** AG-Grid sidebar + status bar customisations. */
  readonly sideBar?: SideBarDef | string | string[] | boolean;
  readonly statusBar?: { statusPanels: StatusPanelDef[] };

  /** AG-Grid base config (overridden by modules). */
  readonly defaultColDef?: ColDef<TData>;
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;

  /** Autosave debounce. Default: autosave disabled (Save button only). */
  readonly autoSaveDebounceMs?: number;

  /** Admin entries (Tools dropdown). */
  readonly adminActions?: ReadonlyArray<AdminAction>;

  /** Grid-level data persistence (data-provider selections, captions). */
  readonly gridLevelData?: unknown;
  readonly onGridLevelDataLoad?: (data: unknown) => void;

  /** Display label shown in chrome (e.g. when OpenFin tab is hidden). */
  readonly componentName?: string;
  readonly caption?: string;
  readonly tabsHidden?: boolean;
  readonly onCaptionChange?: (next: string) => void;

  /** Header-extras slot. */
  readonly headerExtras?: ReactNode;

  /** Imperative-handle callback fired after AG-Grid ready + platform
   *  mount + active profile applied. */
  readonly onReady?: (handle: MarketsGridHandle) => void;

  /** Save-state callback for chrome indicators. */
  readonly onSavingChange?: (isSaving: boolean) => void;

  readonly onGridReady?: (params: GridReadyEvent) => void;
}

/** Imperative handle exposed via forwardRef + onReady. */
interface MarketsGridHandle {
  readonly gridApi: GridApi;
  readonly platform: GridPlatform;
  readonly profiles: UseProfileManagerResult;
  saveAll(): Promise<void>;
  /** Only present when storage factory is the local-storage bundle factory. */
  getConfig?(): MarketsGridLocalStorageConfig;
  setConfig?(config: MarketsGridLocalStorageConfig): void;
}
```

### Behaviour

1. **Profile-aware.** Every state mutation flips an internal dirty flag.
   Save button (top right of chrome) is the canonical write path.
2. **Default 9 modules** are registered in priority order: general-settings(0),
   column-templates(5), column-customization(10), calculated-columns(15),
   column-groups(18), conditional-styling(20), grid-state(200),
   toolbar-visibility(1000), saved-filters(1001).
3. **`storage` not provided** → falls back to in-memory; warns once in dev.
4. **`onReady` fires exactly once** per mount after AG-Grid is ready, the
   platform is constructed, and the active profile is applied.
5. **`maintainColumnOrder` is forced true** so user-dragged order survives
   columnDefs re-derivation.
6. **`storage.appId` and `storage.userId` are auto-injected** from the
   surrounding `<StarUIApp>` if available; otherwise required as props.

## 2.2 `StorageAdapter` and `StorageAdapterFactory`

The persistence boundary.

```ts
// Package: @starui/core
interface StorageAdapter {
  load(profileId: string): Promise<ProfileSnapshot | null>;
  save(profileId: string, snapshot: ProfileSnapshot): Promise<void>;
  list(): Promise<ProfileMeta[]>;
  remove(profileId: string): Promise<void>;
  readActiveId(): Promise<string | null>;
  writeActiveId(profileId: string | null): Promise<void>;
}

interface ProfileSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Module-versioned envelope: { [moduleId]: { schemaVersion, state } } */
  readonly state: Record<string, { schemaVersion: number; state: unknown }>;
}

interface ProfileMeta {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

type StorageAdapterFactory = (opts: {
  readonly instanceId: string;
  readonly appId: string;
  readonly userId: string;
  readonly gridId: string;
}) => StorageAdapter;
```

### Behaviour

- `load(profileId)` returns `null` if the id does not exist (never
  throws for missing).
- `save` is upsert.
- `list` returns the meta of every profile the adapter can reach.
- `readActiveId` / `writeActiveId` are the source of truth for the
  per-instance active selection. Implementations may delegate to a
  pluggable `ActiveIdSource` (e.g. OpenFin per-view profile reads
  from `customData.activeProfileId`).

## 2.3 Three concrete `StorageAdapterFactory` implementations

```ts
// Package: @starui/core
const MemoryAdapter: StorageAdapter; // singleton; for tests
class LocalStorageBundleAdapter implements StorageAdapter {
  constructor(opts: { gridId: string });
}

// Package: @starui/grid
function createMarketsGridLocalStorageStorage(): StorageAdapterFactory;
// Sole bundle key:  `markets-grid-bundle:${gridId}`
// Mirrors active id at:  `gc-active-profile:${gridId}`

// Package: @starui/config  (the ConfigService-backed one)
function createConfigServiceStorage(opts: {
  readonly configManager: ConfigManager;
  readonly appId: string;
  readonly userId: string;
}): StorageAdapterFactory;
// Writes one AppConfigRow per (instanceId, appId, userId) with
// componentType: "markets-grid-profile-set" and payload.profiles[]
```

## 2.4 Grid `Module` contract

```ts
// Package: @starui/core
interface Module<TState> {
  /** Stable module identifier. Required. */
  readonly id: string;
  /** Sort key for the pipeline. Lower runs first. */
  readonly priority: number;
  /** Required. Bumped on breaking schema changes. */
  readonly schemaVersion: number;

  /** Default state for a fresh profile. */
  readonly initialState: () => TState;

  /** Serialize state for persistence. Defaults to identity. */
  readonly serialize?: (state: TState) => unknown;
  /** Deserialize from persisted form. Defaults to identity. Receives
   *  `fromVersion` when migrating from an older schema. */
  readonly deserialize?: (raw: unknown, fromVersion: number) => TState;
  /** Optional schema migration. */
  readonly migrate?: (raw: unknown, fromVersion: number) => unknown;

  /** Optional pipeline hooks. */
  readonly transformColumnDefs?:  (ctx: TransformContext, defs: AnyColDef[])  => AnyColDef[];
  readonly transformGridOptions?: (ctx: TransformContext, opts: GridOptions) => GridOptions;
  readonly activate?:             (api: GridApi, ctx: TransformContext) => Unsubscribe | void;

  /** Optional React panel surfaces (rendered inside the SettingsSheet). */
  readonly ListPane?:   React.ComponentType<ListPaneProps<TState>>;
  readonly EditorPane?: React.ComponentType<EditorPaneProps<TState>>;
  readonly SettingsPanel?: React.ComponentType<SettingsPanelProps<TState>>;
}

interface TransformContext {
  /** Read another module's state at transform time. */
  getModuleState<S>(moduleId: string): S | undefined;
  /** The expression engine bound to this grid. */
  expression(): ExpressionEngine;
  /** AppData lookup snapshot. */
  appData?: AppDataLookup;
  /** Inject a CSS rule scoped to this grid. */
  cssHandle: CssHandle;
}
```

### The 9 shipped modules

The platform must register these 9 modules by default (overrideable
via the `modules` prop):

| Module id | Priority | Schema | What it owns |
|---|---|---|---|
| `general-settings` | 0 | 3 | 60 grid-level options across 8 bands |
| `column-templates` | 5 | 1 | Reusable override bundles |
| `column-customization` | 10 | 9 | Per-column header/layout/style/format/filter/grouping |
| `calculated-columns` | 15 | 1 | Expression-driven virtual columns |
| `column-groups` | 18 | 1 | Nestable header groups |
| `conditional-styling` | 20 | 1 | Expression-driven row/cell painting + flash + indicators |
| `grid-state` | 200 | 3 | Native AG-Grid state (column order/pinning/sort/filter/...) |
| `toolbar-visibility` | 1000 | 1 | Which toolbars are visible |
| `saved-filters` | 1001 | 2 | Filter-pill carousel |

### Stream-safe floating filters

The widget must ship three custom AG-Grid floating filter
implementations:

```ts
// Package: @starui/grid
const streamSafeFloatingFilter:        AgGridFloatingFilterConstructor; // text
const streamSafeNumberFloatingFilter:  AgGridFloatingFilterConstructor; // number with operators
const streamSafeDateFloatingFilter:    AgGridFloatingFilterConstructor; // date with grammar
```

Behaviour: each must (1) survive live data updates without losing
focus or cursor position; (2) parse the documented grammar
(operators `>`, `>=`, `<`, `<=`, `=`; ranges `a-b`, `a to b`;
compound `>a and <b`; comma-separated lists); (3) expose a clear
button; (4) auto-detect `MM/DD` vs `DD/MM` from input shape (date
filter only).

---

# 3. Grid customizer surfaces (consumed indirectly via `<MarketsGrid>`)

These ship as part of `@starui/grid` but consumers rarely import them
directly. Documented because the rewrite must preserve them and
custom modules may use them.

## 3.1 Settings sheet primitives

```ts
// Package: @starui/grid/primitives
// "Cockpit" primitive kit — shared by every module's panel.
const PanelChrome, Band, FigmaPanelSection, SubLabel, ObjectTitleRow,
      TitleInput, ItemCard, PairRow, IconInput, PillToggleGroup,
      PillToggleBtn, SharpBtn, Stepper, TGroup, TBtn, TDivider,
      MetaCell, GhostIcon, DirtyDot, LedBar, Caps, Mono, TabStrip,
      SummaryChip, SettingsRow, CockpitList, CockpitListItem;
```

These are intentionally compact React components scoped to a
`.gc-sheet-v2` CSS namespace. Token-driven via `--ck-*` and
`--ds-*` CSS variables.

## 3.2 Style + format editors

```ts
// Package: @starui/grid/primitives
interface StyleEditorValue {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: "left" | "center" | "right";
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  backgroundColor?: string;
  backgroundAlpha?: number;
  borders?: BorderSpec;
  valueFormatter?: ValueFormatterTemplate;
}

function StyleEditor(props: {
  value: StyleEditorValue;
  onChange: (next: StyleEditorValue) => void;
  sections?: ReadonlyArray<"text" | "color" | "border" | "format">;
  dataType?: ColumnDataType;
}): JSX.Element;

function FormatterPicker(props: {
  value?: ValueFormatterTemplate;
  onChange: (next: ValueFormatterTemplate) => void;
  variant?: "default" | "compact" | "inline";
  dataType?: ColumnDataType;
}): JSX.Element;

function ExpressionEditor(props: {
  value: string;
  onChange?: (next: string) => void;
  onCommit?: (next: string) => void;
  columnSuggestions?: ReadonlyArray<{ id: string; name: string }>;
}): JSX.Element;
```

### `ValueFormatterTemplate`

```ts
type ValueFormatterTemplate =
  | { kind: "preset"; preset: PresetId }
  | { kind: "expression"; source: string }    // gated by ExpressionPolicy
  | { kind: "excelFormat"; pattern: string }
  | { kind: "tick"; tick: TickToken };

type PresetId =
  | "integer" | "decimal2" | "decimal4"
  | "parensNeg" | "redParensNeg"
  | "greenRedNoSign" | "greenRedDollar"
  | "scientific" | "basisPoints"
  | "currencyUSD" | "currencyEUR" | "currencyGBP"
  | "currencyJPY" | "currencyINR" | "currencyCHF"
  | "date" | "dateTime" | "time";

type TickToken = "TICK32" | "TICK32_PLUS" | "TICK64" | "TICK128" | "TICK256";
```

Behaviour:
- `kind: "expression"` is gated by `configureExpressionPolicy()` (see §6.4).
- `[Red]` / `[Green]` color tags inside `excelFormat` patterns produce
  a per-value `cellStyle` resolver.
- Date values arriving as ISO-8601 strings are coerced to `Date`
  before formatting.

---

# 4. ConfigService

## 4.1 `ConfigClient` — framework-agnostic surface

```ts
// Package: @starui/config
function createConfigClient(opts: {
  readonly baseUrl?: string;
  readonly db?: Dexie;
}): ConfigClient;

interface ConfigClient {
  // Generic ops
  getConfig(filter: ConfigFilter): Promise<AppConfigRow | null>;
  saveConfig(row: AppConfigRow, opts?: SaveConfigOptions): Promise<AppConfigRow>;
  listConfigs(filter: ConfigFilter, page?: PageOptions): Promise<PaginatedResult<AppConfigRow>>;
  deleteConfig(filter: ConfigFilter): Promise<void>;
  bulkUpdate(updates: ReadonlyArray<BulkUpdateEntry>): Promise<BulkUpdateResult>;
  bulkDelete(filters: ReadonlyArray<ConfigFilter>): Promise<BulkDeleteResult>;

  // Sub-ops (auth tables — see §4.5)
  readonly roles:        RoleOps;
  readonly permissions:  PermissionOps;
  readonly userProfiles: UserProfileOps;
  readonly appRegistry:  AppRegistryOps;

  health(): Promise<HealthStatus>;
}

interface ConfigFilter {
  configId?: string;
  componentType?: string;
  componentSubType?: string;
  appId?: string;
  userId?: string;
  isTemplate?: boolean;
  isPublic?: boolean;
}
```

Three concrete implementations:
- `LocalConfigClient` (Dexie-backed) — created when `baseUrl` omitted
- `RestConfigClient` (HTTP) — created when `baseUrl` provided
- `createConfigClient()` (dispatcher) — picks based on opts

## 4.2 `AppConfigRow` — the bundle row schema

```ts
// Package: @starui/types
interface AppConfigRow {
  readonly configId: string;
  readonly appId: string;
  readonly userId: string;
  readonly componentType: string;       // kebab-case, e.g. "markets-grid-profile-set"
  readonly componentSubType: string;
  readonly displayText?: string;
  readonly isTemplate: boolean;
  readonly isPublic?: boolean;
  readonly payload: unknown;            // shape varies by componentType
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly creationTime: number;
  readonly updatedTime: number;
  readonly __v?: number;                // optimistic-lock version
}

const COMPONENT_TYPES: {
  readonly MARKETS_GRID_PROFILE_SET: "markets-grid-profile-set";
  readonly DOCK_CONFIG:               "dock-config";
  readonly COMPONENT_REGISTRY:        "component-registry";
};
```

## 4.3 `ConfigManager` — the live database wrapper

```ts
// Package: @starui/config
function createConfigManager(opts: {
  readonly identity: AppIdentity;
  readonly appId: string;
  readonly seedConfigUrl?: string;
  readonly configServiceRestUrl?: string;
  readonly dataServices?: DataServices;
}): ConfigManager;

interface ConfigManager {
  init(): Promise<void>;
  dispose(): Promise<void>;
  publishApplicationContext(ctx: ApplicationContext): Promise<void>;

  // ConfigClient surface re-exposed
  readonly client: ConfigClient;
  readonly profiles: ProfilesNamespace;

  // Audit + visibility
  getEffectiveUser(): EffectiveUser;
  isVisible(row: AppConfigRow): boolean;
}

interface ProfilesNamespace {
  load(gridId: string, scope: ProfilesScope): Promise<ProfileSetRow | null>;
  save(gridId: string, scope: ProfilesScope, snapshots: ProfileSnapshot[],
       opts?: ProfilesSaveOptions): Promise<void>;
  remove(gridId: string, scope: ProfilesScope): Promise<void>;
  subscribe(gridId: string, scope: ProfilesScope,
            onChange: (snapshots: ProfileSnapshot[]) => void): Unsubscribe;
}
```

Behaviour requirements:
- `init()` must be idempotent across React StrictMode remounts.
- `dispose()` must close any open Dexie connection.
- `init()` aborted by `dispose()` must resolve quietly (no Dexie
  `DatabaseClosedError` leak).
- `publishApplicationContext` upserts a single AppData row via one
  `upsertConfig` call (not N `set` round-trips).
- An optimistic-lock conflict on `saveConfig` throws
  `ProfileSetVersionConflictError`.

## 4.4 React + Angular providers

```ts
// Package: @starui/config/react
function ConfigServiceProvider(props: {
  readonly identity: AppIdentity;
  readonly appId: string;
  readonly seedUrl?: string;
  readonly restUrl?: string;
  readonly children: ReactNode;
}): JSX.Element;

function useConfigService(): ConfigServiceContextValue;

interface ConfigServiceContextValue {
  readonly configManager: ConfigManager;
  readonly storage: StorageAdapterFactory;
  readonly appId: string;
  readonly userId: string;
  readonly applicationContext: ApplicationContext;
}
```

```ts
// Package: @starui/config/angular
function provideConfigService(opts: ConfigServiceOptions): EnvironmentProviders;

@Injectable({ providedIn: "root" })
class ConfigServiceClient {
  readonly appId: string;
  readonly userId: string;
  get applicationContext(): ApplicationContext;
  init(): Promise<void>;
}
```

## 4.5 Auth-table sub-ops

Each `ConfigClient.<table>` namespace exposes:

```ts
interface RoleOps {
  list(filter?: RoleFilter): Promise<RoleRow[]>;
  get(roleId: string): Promise<RoleRow | null>;
  create(row: Omit<RoleRow, "createdBy" | "updatedBy" | "creationTime" | "updatedTime">): Promise<RoleRow>;
  update(roleId: string, patch: Partial<RoleRow>, opts?: UpdateConfigOptions): Promise<RoleRow>;
  delete(roleId: string): Promise<void>;
}
// Same shape for PermissionOps, UserProfileOps, AppRegistryOps
```

---

# 5. DataServices

## 5.1 Bootstrap

```ts
// Package: @starui/data
function bootstrapDataServices(opts: {
  readonly appName: string;
  readonly userId: string;
  readonly configServiceRestUrl?: string;
  readonly worker?: SharedWorker | Worker;
}): DataServices;

interface DataServices {
  readonly client: SharedWorkerDataServicesClient;
  readonly appData: AppDataMirror;
  readonly configStore: DataProviderConfigStore;
  readonly configManager: ConfigManager;
  readonly ready: Promise<void>;
}
```

`bootstrapDataServices` is idempotent by `appName`. Multiple calls
with the same appName return the same instance.

## 5.2 The SharedWorker client surface

```ts
// Package: @starui/data
class SharedWorkerDataServicesClient {
  attach(opts: AttachOpts): SubId;
  detach(subId: SubId): Promise<void>;
  stop(providerId: string): Promise<void>;
}

interface AttachOpts {
  readonly subId: SubId;
  readonly providerId: string;
  readonly cfg?: ProviderConfig;
  readonly mode: "data" | "stats";
  readonly extra?: unknown;
  readonly onDelta?: (rows: ReadonlyArray<unknown>, replace?: boolean) => void;
  readonly onStatus?: (status: ProviderStatus, error?: Error) => void;
  readonly onStats?: (stats: ProviderStats) => void;
  readonly onError?: (error: Error) => void;
}

type SubId = string & { __subId: true };
type ProviderStatus = "loading" | "ready" | "error";
```

Behaviour:
- `attach` is configure-or-attach (no race window between configure
  and subscribe).
- The first event back is a guaranteed `{rows, replace: true}` plus
  the current status.
- Stream providers auto-tear-down on the last detach; keyed-resource
  providers do not.

## 5.3 Provider transports

```ts
// Package: @starui/data
function registerProvider(type: string, factory: ProviderFactory): void;
function startProvider(cfg: ProviderConfig, emit: ProviderEmit): ProviderHandle;

type ProviderFactory = (cfg: ProviderConfig, emit: ProviderEmit) => ProviderHandle;
type ProviderEmit = (event: ProviderEmitEvent) => void;
type ProviderEmitEvent =
  | { kind: "rows"; rows: ReadonlyArray<unknown>; replace?: boolean }
  | { kind: "status"; status: ProviderStatus; error?: Error }
  | { kind: "byteSize"; bytes: number };

interface ProviderHandle {
  stop(): void;
  restart?(extra?: unknown): void;
}
```

The platform ships four transports (`stomp`, `rest`, `mock`,
`appdata`).  Adding a new transport is a single `registerProvider`
call.

## 5.4 React hooks

```ts
// Package: @starui/data/react
function DataServicesProvider(props: {
  readonly services?: DataServices;
  readonly connect?: { url: URL | string; name: string };
  readonly mode?: "lazy" | "eager";
  readonly userId?: string;
  readonly children: ReactNode;
}): JSX.Element;

function useDataServices(): DataServices;
function useAppDataStore(): { store: AppDataStore; version: number; loaded: boolean };
function useAppData<T>(providerName: string): {
  values: Readonly<Record<string, T>>;
  loaded: boolean;
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => Promise<void>;
  setMany: (values: Record<string, T>) => Promise<void>;
};

function useDataProviderConfig(providerId: string): {
  cfg: ProviderConfig | null;
  loading: boolean;
  error: Error | null;
};

function useDataProvidersList(opts?: {
  subtype?: string;
  includeAppData?: boolean;
}): {
  configs: ReadonlyArray<DataProviderConfig>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};

function useResolvedCfg(cfg: ProviderConfig | null): ProviderConfig | null;

function useProviderStream<TRow>(
  providerId: string,
  cfg: ProviderConfig | null,
  listener: ProviderStreamListener<TRow>,
): { status: ProviderStatus; error: Error | null; refresh: (extra?: unknown) => void };

function useProviderStats(
  providerId: string,
  listener: (stats: ProviderStats) => void,
): void;
```

## 5.5 Template resolution rules

```ts
// Package: @starui/data
function resolveTemplate(str: string, lookup: AppDataLookup): string;
function resolveCfg<T>(cfg: T, lookup: AppDataLookup): T;
function resolveBracketCfg<T>(cfg: T, cache: BracketCache): T;
type BracketCache = Map<string, string>;
```

Behaviour:
- `{{name.key}}` resolves on the main thread against an
  `AppDataLookup` snapshot. Substituted before the cfg is sent to
  the worker.
- `[token]` resolves in the worker against a per-attach
  `BracketCache`. Same `[name]` resolves identically across every
  field of one config; different `[name]` resolves to a different
  12-char alphanumeric ID. On stop + re-attach, the cache is fresh.
- Grammar: `[A-Za-z_][A-Za-z0-9_-]*`. Non-matching tokens
  (e.g. JSON arrays `[1,2,3]`) are left untouched.

## 5.6 Provider config shapes

```ts
// Package: @starui/types
type ProviderConfig =
  | StompProviderConfig
  | RestProviderConfig
  | WebSocketProviderConfig
  | SocketIOProviderConfig
  | MockProviderConfig
  | AppDataProviderConfig;

interface StompProviderConfig {
  readonly providerType: "stomp";
  readonly websocketUrl: string;
  readonly listenerTopic: string;
  readonly requestMessage?: string;
  readonly requestBody?: string;
  readonly snapshotEndToken?: string;     // default "success"
  readonly keyColumn: string;
  readonly variables?: TemplateVariables;
}
interface RestProviderConfig {
  readonly providerType: "rest";
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly intervalMs?: number;
  readonly keyColumn?: string;
  readonly variables?: TemplateVariables;
}
// ... WebSocket, SocketIO, Mock, AppData similar
```

---

# 6. Runtime

## 6.1 The interface

```ts
// Package: @starui/runtime
interface RuntimePort {
  readonly name: "browser" | "openfin";
  resolveIdentity(): Promise<IdentitySnapshot>;
  openSurface(spec: SurfaceSpec): Promise<SurfaceHandle>;
  getTheme(): Theme;
  setTheme(t: Theme): void;
  onThemeChanged(fn: (t: Theme) => void): Unsubscribe;
  onWindowShown(fn: () => void): Unsubscribe;
  onWindowClosing(fn: () => void | Promise<void>): Unsubscribe;
  onCustomDataChanged(fn: (cd: unknown) => void): Unsubscribe;
  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe;
  dispose(): void;
}

interface IdentitySnapshot {
  readonly instanceId: string;
  readonly appId: string;
  readonly userId: string;
  readonly componentType?: string;
  readonly componentSubType?: string;
  readonly isTemplate?: boolean;
  readonly singleton?: boolean;
  readonly roles?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
  readonly customData?: Readonly<Record<string, unknown>>;
}

type Theme = "light" | "dark";
type SurfaceKind = "popout" | "modal" | "inpage";

const LOGGED_IN_USER_ID = "dev1";              // single-user pin until SSO
const THEME_STORAGE_KEY = "starui:theme";
const THEME_BROADCAST_CHANNEL = "starui:theme";
```

## 6.2 Two implementations

```ts
// Package: @starui/runtime
class BrowserRuntime implements RuntimePort { constructor(opts?: BrowserRuntimeOptions); }

// Package: @starui/openfin
class OpenFinRuntime implements RuntimePort {
  static create(opts?: OpenFinRuntimeOptions): Promise<OpenFinRuntime>;
}
function isOpenFin(): boolean;
```

`OpenFinRuntime` lives in `@starui/openfin` so apps that don't
import that package carry zero `@openfin/core` in their bundle.

## 6.3 React + Angular host wrappers

```ts
// Package: @starui/runtime/react
function HostWrapper(props: {
  readonly runtime: RuntimePort | Promise<RuntimePort>;
  readonly configManager: ConfigClient | Promise<ConfigClient>;
  readonly configUrl?: string;
  readonly loading?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element;
function useHost(): HostContextValue;

// Package: @starui/runtime/angular
function provideHostWrapper(opts: { runtime: RuntimePort; configManager: ConfigClient }): EnvironmentProviders;
@Injectable({ providedIn: "root" })
class HostService { /* mirror of useHost(); see §6.4 */ }
```

## 6.4 `HostContextValue`

```ts
interface HostContextValue extends IdentitySnapshot {
  readonly runtime: RuntimePort;
  readonly configManager: ConfigClient;
  readonly theme: Theme;
  readonly configUrl?: string;
  setTheme(t: Theme): void;
  onThemeChanged(fn: (t: Theme) => void): Unsubscribe;
  onWindowShown(fn: () => void): Unsubscribe;
  onWindowClosing(fn: () => void | Promise<void>): Unsubscribe;
  onCustomDataChanged(fn: (cd: unknown) => void): Unsubscribe;
  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe;
}
```

---

# 7. Hosted wrappers (`@starui/widgets`)

The `<Hosted*>` family — flat-props wrappers that resolve identity
from the surrounding `<StarUIApp>` and mount the underlying view.

```ts
// Package: @starui/widgets
function HostedMarketsGrid(props: HostedMarketsGridProps): JSX.Element;
function HostedDataProviderEditor(props: HostedDataProviderEditorProps): JSX.Element;
function HostedConfigBrowser(props: HostedConfigBrowserProps): JSX.Element;
function HostedWorkspaceSetup(props: HostedWorkspaceSetupProps): JSX.Element;
function HostedConfigEditorUI(props: HostedConfigEditorUIProps): JSX.Element;

interface HostedCommonProps {
  readonly instanceId?: string;
  readonly appId?: string;
  readonly userId?: string;
  readonly loading?: ReactNode;
}
```

Each wrapper must:

1. Resolve identity from `useConfigService()`. Render an `alert`-role
   error banner (not throw) if mounted outside `<StarUIApp>`.
2. Wire the underlying view's provider stack internally.
3. Forward `instanceId` / `appId` / `userId` overrides.
4. Show `loading` until the underlying provider context is ready.

---

# 8. Admin tools (`@starui/widgets`)

## 8.1 `<DataProviderEditor>`

```ts
function DataProviderEditor(props: {
  readonly initialProviderId?: string;
  readonly onSaved?: (id: string) => void;
  readonly onClose?: () => void;
}): JSX.Element;
```

Requires a surrounding `<DataServicesProvider>`. Four tabs
(Connection / Fields / Columns / Behaviour) plus Diagnostics when
editing an existing provider. Transport forms ship for STOMP, REST,
Mock, AppData.

## 8.2 `<ConfigBrowserPanel>`

```ts
function ConfigBrowserPanel(): JSX.Element;
function createConfigBrowserAction(opts: {
  readonly launch: () => void;
  readonly id?: string;
  readonly label?: string;
  readonly description?: string;
  readonly visible?: boolean;
}): AdminAction;
```

Browses all six ConfigService tables (`appConfig`, `appRegistry`,
`userProfile`, `roles`, `permissions`, `pendingSync`). Theme syncs
with OpenFin's `theme-changed` IAB event.

## 8.3 `<WorkspaceSetup>`

```ts
function WorkspaceSetup(): JSX.Element;
function ImportConfig(): JSX.Element;
function useDockEditor(opts?: { scope?: ConfigScope }): UseDockEditorResult;
function useRegistryEditor(opts?: { scope?: ConfigScope }): UseRegistryEditorResult;
```

The unified 3-pane editor (Components catalog → Dock layout →
Inspector). Supersedes the legacy Dock Editor + Registry Editor
windows.

## 8.4 Auth-table editors

```ts
function RolesEditor():       JSX.Element;
function PermissionsEditor(): JSX.Element;
function UserProfileEditor(): JSX.Element;
function AppRegistryEditor(): JSX.Element;
function PermissionMatrix(props: PermissionMatrixProps):       JSX.Element;
function RoleAssignmentMatrix(props: RoleAssignmentMatrixProps): JSX.Element;
function ConfigEditorProvider(props: { client: ConfigClient; children: ReactNode }): JSX.Element;
```

---

# 9. OpenFin integration (`@starui/openfin`)

The OpenFin plugin is the *only* package that may import
`@openfin/core`. Importing it makes a `<StarUIApp>` OpenFin-aware.

## 9.1 Default plugin export

```ts
// Package: @starui/openfin
const openfin: StarUIPlugin;          // default export
export default openfin;

// Companion helpers
function isOpenFinEnvironment(): boolean;
function isProviderWindow(): boolean;

// Subpaths
// @starui/openfin/runtime      — OpenFinRuntime, identity helpers
// @starui/openfin/workspace    — initWorkspace, dock, registry, custom actions
// @starui/openfin/config       — side-effect-free subset
```

## 9.2 Workspace platform

```ts
// Package: @starui/openfin/workspace
function initWorkspace(config?: WorkspaceConfig): Promise<void>;
function launchApp(appId: string): Promise<void>;
function launchRegisteredComponent(entryId: string,
                                   opts?: { asWindow?: boolean }): Promise<void>;
```

## 9.3 IAB topic + custom action constants

```ts
const IAB_DOCK_CONFIG_UPDATE:       "dock-config-update";
const IAB_RELOAD_AFTER_IMPORT:      "reload-after-import";
const IAB_THEME_CHANGED:            "theme-changed";
const IAB_REGISTRY_CONFIG_UPDATE:   "registry-config-update";

const ACTION_LAUNCH_COMPONENT:      "launch-component";
const ACTION_OPEN_REGISTRY_EDITOR:  "open-registry-editor";
const ACTION_OPEN_CONFIG_BROWSER:   "open-config-browser";
const ACTION_OPEN_DOCK_EDITOR:      "open-dock-editor";
const ACTION_TOGGLE_THEME:          "toggle-theme";
const ACTION_RENAME_VIEW_TAB:       "rename-view-tab";
const ACTION_IMPORT_CONFIG:         "import-config";
const ACTION_EXPORT_CONFIG:         "export-config";
const ACTION_RELOAD_DOCK:           "reload-dock";
const ACTION_TOGGLE_PROVIDER:       "toggle-provider";
```

## 9.4 Save Tab As… contract

Right-click a view tab → "Save Tab As…" must:

1. Open `/rename-view-tab` (or equivalent) as a frameless child window
   with `customData = { view, currentTitle }`.
2. On confirm, run **both**:
   - `view.executeJavaScript("document.title = '" + escaped + "'")` —
     immediate tabstrip update.
   - `view.updateOptions({ customData: { ..., savedTitle } })` —
     captured into the workspace snapshot.
3. On next workspace load, `OpenFinRuntime.applySavedViewTitle()`
   reads `customData.savedTitle` and reapplies to `document.title`,
   with a 3-second `MutationObserver` guard so the page's own
   `useEffect(() => { document.title = ... }, [])` can't clobber it.

---

# 10. Expression engine

## 10.1 Surface

```ts
// Package: @starui/core
class ExpressionEngine {
  parse(source: string): ParsedExpression;
  evaluate(expr: ParsedExpression, ctx: EvaluationContext): unknown;
  parseAndEvaluate(source: string, ctx: EvaluationContext): unknown;
  tryCompileToAgString(source: string): string | null;
  validate(source: string): ValidationResult;
  registerFunction(def: FunctionDefinition): void;
  getFunctions(): ReadonlyArray<FunctionDefinition>;
  getFunctionsByCategory(): Readonly<Record<string, FunctionDefinition[]>>;
}

interface FunctionDefinition {
  readonly name: string;
  readonly category: "Math" | "Stats" | "Aggregation" | "String" | "Date" | "Logical";
  readonly description: string;
  readonly signature: string;
  readonly minArgs: number;
  readonly maxArgs: number;
  /** If true, a direct `[col]` arg is expanded to the full column
   *  array before the function runs (cross-row aggregation). */
  readonly aggregateColumnRefs?: boolean;
  readonly evaluate: (args: unknown[], ctx: EvaluationContext) => unknown;
}
```

## 10.2 The 44 built-in functions

```
Math (11):    ABS, ROUND, FLOOR, CEIL, SQRT, POW, MOD, LOG, EXP, MIN, MAX
Stats (4):    AVG, MEDIAN, STDEV, VARIANCE
Aggregation (3): SUM, COUNT, DISTINCT_COUNT
String (11):  CONCAT, UPPER, LOWER, TRIM, SUBSTRING, REPLACE, LEN,
              STARTS_WITH, ENDS_WITH, CONTAINS, REGEX_MATCH
Date (8):     NOW, TODAY, YEAR, MONTH, DAY, IS_WEEKDAY, DATE_DIFF, DATE_ADD
Logical (7):  IF, IFS, SWITCH, CASE, ISNULL, ISNOTNULL, ISEMPTY
```

Cross-row aggregation: 9 functions carry `aggregateColumnRefs: true`
(`SUM`, `COUNT`, `DISTINCT_COUNT`, `AVG`, `MEDIAN`, `STDEV`,
`VARIANCE`, `MIN`, `MAX`). `SUM([price])` sums every row's `price`,
not the current row's scalar.

## 10.3 Security policy

```ts
function configureExpressionPolicy(opts: {
  readonly mode: "allow" | "warn" | "strict";
  readonly onViolation?: (v: ExpressionPolicyViolation) => void;
}): void;
function getExpressionPolicy(): ExpressionPolicy;
```

Three modes:
- `"allow"` (default) — `kind: "expression"` formatters compile via
  `new Function`.
- `"warn"` — compiles, but fires `onViolation` + one-shot
  `console.warn` per unique expression.
- `"strict"` — adapter returns an identity formatter; profile import
  rejects payloads with expression-kind templates (unless `sanitize:
  true` is passed).

---

# 11. Per-theme styling

Every style override stores its values under a theme-keyed wrapper:

```ts
type ThemedCellStyleOverrides = {
  readonly dark?: CellStyleOverrides;
  readonly light?: CellStyleOverrides;
};

function getActiveTheme(): Theme;              // reads [data-theme] on <html>
function resolveActiveStyle<T>(themed: { dark?: T; light?: T },
                               mode: Theme): T | undefined;
function patchActiveStyle<T>(themed: { dark?: T; light?: T },
                             mode: Theme, next: T): { dark?: T; light?: T };
function mergeThemedStyle<T>(a: { dark?: T; light?: T },
                             b: { dark?: T; light?: T },
                             mergeOne: (a: T, b: T) => T): { dark?: T; light?: T };
function migrateThemedStyle<T>(value: unknown): { dark?: T; light?: T };
```

Behaviour:
- Theme writes target the active theme slot only.
- Transforms emit CSS for **both** slots scoped by
  `html[data-theme="dark"]` / `html[data-theme="light"]`. Theme
  switching is a pure CSS cascade event — no colDef rebuild.

---

# 12. Profile lifecycle contract

```ts
// Package: @starui/core
class ProfileManager {
  boot(): Promise<void>;
  load(profileId: string): Promise<void>;
  save(opts?: { skipFlush?: boolean }): Promise<void>;
  discard(): Promise<void>;
  create(opts: { name: string }): Promise<string>;
  remove(profileId: string): Promise<void>;
  rename(profileId: string, name: string): Promise<void>;
  clone(profileId: string, name?: string): Promise<string>;
  export(profileId?: string): Promise<ExportedProfilePayload>;
  import(payload: ExportedProfilePayload, opts?: { sanitize?: boolean }): Promise<ProfileMeta>;
  subscribe(fn: (state: ProfileManagerState) => void): Unsubscribe;
  dispose(): Promise<void>;
}

interface ProfileManagerOptions {
  readonly storage: StorageAdapter;
  readonly disableAutoSave?: boolean;       // default true
  readonly autoSaveDebounceMs?: number;
  readonly activeIdSource?: ActiveIdSource;
}

interface ActiveIdSource {
  read(): Promise<string | null>;
  write(profileId: string | null): Promise<void>;
}
```

### State machine

```
BOOT → CLEAN ⇄ DIRTY → SAVING → CLEAN
                ↓
              SWITCH (while dirty)  →  SAVING | CLEAN | (cancel)
```

Behaviour requirements:
- Save button is the canonical write path. Module state mutations
  flip an internal `isDirty` flag; the live store does NOT auto-flush
  unless `disableAutoSave: false`.
- `beforeunload` warning is registered only while `isDirty === true`.
- New profile starts blank — `createProfile` calls `resetAll()` before
  snapshotting.
- Delete cancels pending auto-save before erasing and falls back to
  Default with `skipFlush: true`.
- Cross-instance sync via `ChangeNotifier` (BroadcastChannel).

---

# 13. Grid-state capture contract

The `grid-state` module (priority 200) must capture and replay:

- Column order, widths, pinning, sort order, filter model
- Column group open/close state
- Pagination state
- Sidebar open/close + active tab
- Focused cell + selection
- Row-group expansion state
- Viewport scroll anchor + `quickFilterText`

Captured **only** on explicit Save (not on every keystroke). Replayed
on `onGridReady` and on `profile:loaded`. Schema v3.

---

# 14. Behavioural guarantees (cross-cutting)

These hold across every package:

1. **`userId` is hard-pinned to `LOGGED_IN_USER_ID` (= `"dev1"`)** at
   every identity resolution point until SSO. Override hooks exist but
   the production value is fixed.
2. **`AppConfigRow.componentType` is kebab-case** everywhere
   (`"markets-grid-profile-set"`, `"dock-config"`, etc.). Legacy
   uppercase rows are still readable but rewritten on next save.
3. **OpenFin import-boundary**: only `@starui/openfin` and
   `@starui/runtime` (via the OpenFin plugin) import `@openfin/core`.
4. **CSS tokens are unified `--ds-*`**. Legacy `--bn-*` / `--fi-*` /
   `--gc-*` / `--ck-*` are gone. The lint script
   `tools/scripts/check-ds-tokens.ts` (or equivalent) enforces this.
5. **Module pipeline ordering**: priority is a strict ordering. Cross-
   module reads must go through `ctx.getModuleState<T>(moduleId)` — no
   direct imports between module files.
6. **Logging convention**: every package uses `createLogger("starui:<pkg>")`.
   Severity matches §1.3.

---

# 15. Non-negotiable constraints for a rewrite

Any new implementation must:

1. **Cover every section in `FEATURE_INVENTORY.md`** by file path or
   by deliberate "feature dropped" entry in the rewrite's release notes.
2. **Honour every signature in this document, exactly.** Type
   compatibility is the public-API contract.
3. **Preserve the storage schemas** at the persistence boundary:
   - `AppConfigRow` shape unchanged
   - `componentType: "markets-grid-profile-set"` payload shape unchanged
     (`{ profiles: ProfileSnapshot[], activeId, __v }`)
   - Per-module `schemaVersion` lineage unchanged (existing user data
     deserialises without migration)
4. **Preserve the IAB topic names + custom action ids** from §9.3.
5. **Preserve the expression-engine function catalogue** from §10.2
   (44 functions in 6 categories with exact names + signatures).
6. **Preserve the Excel format token set + tick token set** from §3.2.
7. **Preserve the URL routes the OpenFin reference shell uses**:
   `/platform/provider`, `/blotters/marketsgrid`, `/dataproviders`,
   `/config-browser`, `/workspace-setup`, `/rename-view-tab`.

---

# 16. Latitude — what a rewrite IS free to change

A rewrite may freely:

1. **Reorganize files.** Collapse `state.ts` + `transforms.ts` +
   `reducers.ts` into one file per module if that's clearer.
2. **Drop internal abstractions.** Cockpit primitives may consolidate
   to fewer files. `cn`, micro-utility functions, etc. may merge.
3. **Drop legacy code paths** that are no longer reachable
   (`widget-sdk`, the original `BlotterGrid`, `SimpleBlotter`,
   the multi-deep `HostedComponent` chain, etc.).
4. **Drop Angular packages** entirely if Angular is not a production
   target — re-add later under the `runtime/angular`, `config/angular`
   pattern.
5. **Use any CSS-in-JS / Tailwind / vanilla approach** as long as
   the public CSS tokens and theme contract (§14.4, §11) hold.
6. **Refactor internal module-state reducers** as long as the
   serialised shape on disk doesn't change.
7. **Replace the SharedWorker bootstrap mechanism** as long as the
   protocol envelope shape and the multiplex-one-connection-per-provider
   guarantee hold.

The boundary between "must preserve" (§15) and "free to change" (§16)
is the difference between *user-facing semantics* and *implementation
detail*. Hold the former, refactor the latter freely.

---

*Authored 2026-05-18.  Living document — every API addition or breaking
change must update this file in the same PR.*

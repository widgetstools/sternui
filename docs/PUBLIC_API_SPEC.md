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
  /** Explicit userId override. When set, completely bypasses identity
   *  resolution (§1.4). Tests use this; production code MUST NOT.
   *  See §1.4 for the standard identity-resolution chain. */
  readonly userId?: string;
}
```

### Behaviour

1. **Bootstrap is async.** Children do not render until the runtime,
   identity, ConfigManager, and (if configured) DataServices are
   ready.
2. **Identity resolves through the bootstrap chain** documented in
   §1.4. There is no hardcoded default user id. A bootstrap that
   cannot resolve an identity halts with a recoverable error
   (rendered through `fallback`).
3. **Runtime selection auction.** Each plugin's `provideRuntime()` is
   called in registration order. First non-null wins. Falls back to
   `BrowserRuntime`.
4. **Plugin hooks are isolated.** Errors in any `provideRuntime` /
   `onBootstrap` / `onShutdown` are logged and swallowed. One bad
   plugin does not block app boot.
5. **Cancellation-safe.** Unmount during bootstrap cancels pending
   work and still runs `onShutdown` hooks in reverse order.
6. **Validates `appId` is a non-empty string.** Throws otherwise
   (programmer error).
7. **Logs through `createLogger("starui:app")`.**

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

### Prefix convention

Every package obtains its logger with a stable prefix of the form
`starui:<pkg-short>`. Examples:

| Package | Prefix |
|---|---|
| `@starui/app`     | `starui:app` |
| `@starui/grid`    | `starui:grid` |
| `@starui/config`  | `starui:config` |
| `@starui/data`    | `starui:data` |
| `@starui/openfin` | `starui:openfin` |
| `@starui/runtime` | `starui:runtime` |
| `@starui/widgets` | `starui:widgets` |

Console output is filterable by typing `starui:` into devtools'
filter box. Cross-package narrowing is `starui:grid`.

### Severity guidance

| Level | Meaning | Example |
|---|---|---|
| `info`  | Routine, expected events the operator may want to know happened. | "plugin registered: openfin" |
| `warn`  | Unusual but recoverable. The system continued; a degraded path was taken. | "missing optional prop, falling back to default" |
| `error` | Broken state. Something the user can see or that compromises correctness. | "storage factory threw — falling back to in-memory store" |

`debug` and `trace` are deliberately NOT in the interface. Code that
needs deep tracing uses a per-feature opt-in flag on `globalThis`
(e.g. `globalThis.__CS_TIMED_TRACE__`) plus a local helper that
guards on the flag — never a global `console.log`.

### Non-negotiable: no bare `console.*`

Every diagnostic emit goes through a `Logger` obtained from
`createLogger(...)`. Bare `console.log` / `console.warn` /
`console.error` / `console.info` / `console.debug` / `console.trace`
calls outside the logger module, test files, CLI scripts, and ESLint
rule sources are a contract violation (§15 #12).

The `@starui/eslint-plugin` package ships a `no-bare-console` rule
that enforces this — see §15 #12 + the
[lint-config-plan](./plans/lint-config-plan.md) for the roll-out.

### Logger placement constraints

- Each module obtains its logger **once at module scope**, not per
  call site:
  ```ts
  // packages/grid/src/foo.ts
  import { createLogger } from "@starui/app/log";
  const log = createLogger("starui:grid");

  export function doThing() {
    log.warn("thing didn't go", { reason });
  }
  ```
  This is enforced by convention, not lint — the cost of
  per-call-site `createLogger("…")` is real (object allocation per
  call) but the lint cost-benefit doesn't justify a rule for it.

- The logger module itself uses bare `console.*` (it has to —
  someone has to call console). The eslint rule's default
  `allowFiles` covers `/log.ts` and `/log.tsx`.

- Test files use bare `console.*` freely. Production code paths
  do not.

## 1.4 Identity resolution — the bootstrap chain

There is no hardcoded user id anywhere in the platform. Identity
resolves through a four-stage chain at bootstrap. Stages run in
order; the first that yields a `userId` wins:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Stage 1: Explicit override                                      │
│   <StarUIApp userId="…"> wins over everything below.            │
│   Production code MUST NOT set this. Tests + Storybook may.     │
├─────────────────────────────────────────────────────────────────┤
│ Stage 2: Manifest / config-file                                 │
│   OpenFin: manifest.customSettings.starui.userId                │
│   Web app: /starui.config.json → { userId: "…" }                │
│   Empty string / missing → fall through to Stage 3.             │
├─────────────────────────────────────────────────────────────────┤
│ Stage 3: Enterprise redirect handshake                          │
│   Bootstrap navigates to                                        │
│     config.auth.redirectUrl?return=<encoded-current-url>        │
│   IdP authenticates, redirects back with #token=…&userId=…      │
│   StarUIApp reads the hash, stores token in memory, uses userId.│
├─────────────────────────────────────────────────────────────────┤
│ Stage 4: Failure                                                │
│   None of the above yielded a userId. Bootstrap halts; the      │
│   <StarUIApp fallback={…}> renders with an IdentityError.       │
└─────────────────────────────────────────────────────────────────┘
```

Once a `userId` is resolved, `ConfigService` is called to fetch the
matching `UserProfile`, `Role[]`, and `Permission[]` rows. The
resulting `IdentitySnapshot` (§6.1) carries all four — `userId`,
`roles`, `permissions`, plus the `customData` from manifest /
config-file (e.g. `desk`, `region`).

### `StarUIAppConfig.auth` — opt-in for the redirect flow

```ts
interface StarUIAppConfig {
  // …existing fields…
  readonly auth?: {
    /** Enterprise IdP URL. Browser navigates here when no userId is
     *  resolved from Stage 1 or 2. The URL is expected to honour a
     *  `?return=<encoded-url>` query parameter and redirect back to
     *  the application with `#token=…&userId=…` in the URL hash. */
    readonly redirectUrl: string;
    /** Optional storage key for the in-memory token. Default:
     *  "starui:auth:token". The token is never written to localStorage
     *  or sessionStorage — it lives in module-scope memory only. */
    readonly tokenStorageKey?: string;
  };
}
```

When `auth.redirectUrl` is absent **and** stages 1–2 yield no userId,
bootstrap fails with `IdentityError` rather than attempting Stage 3.

### Manifest / config-file schema

```jsonc
// OpenFin manifest — app.fin.json
{
  "platform": { "uuid": "…" },
  "customSettings": {
    "starui": {
      "userId": "anand.nandanwar",        // empty/missing → Stage 3
      "configServerUrl": "http://localhost:3000",
      "dockVersion": "v2",
      "auth": {                            // optional
        "redirectUrl": "https://auth.intranet/login"
      }
    }
  }
}
```

```jsonc
// Web app — /starui.config.json
{
  "appId": "fx-blotter",
  "userId": "",                            // empty → Stage 3
  "configServerUrl": "/config",
  "auth": {
    "redirectUrl": "https://auth.intranet/login"
  }
}
```

The web-app config file is fetched at bootstrap (`/starui.config.json`
by convention; overridable via `StarUIAppProps.config.configFileUrl`).
A 404 is non-fatal — bootstrap proceeds with Stage 3 if `auth` is
configured at the React level via props, or fails otherwise.

### Token handling

The token returned from Stage 3 (and any token attached via Stage 2
in OpenFin manifests that include one) lives in **module-scope
memory** within `@starui/app`. It is:

- **Not** persisted to `localStorage` or `sessionStorage`.
- **Not** written into any ConfigService row.
- Attached to every outgoing REST request to the StarUI Config
  Server as `Authorization: Bearer <token>`.

The token's `sub` claim is the authoritative `userId` server-side.
Any client-supplied userId is **ignored** by the prod-mode Config
Server (see §15 #13 and §4 in Commit 3 of this sequence).

### Dev / prod identity-trust boundary

The "manifest can specify userId" convenience is **dev-only safety
critical**. The hard boundary lives server-side:

- The StarUI Config Server runs in one of two modes:
  - `dev`: accepts requests without a token; uses the client-supplied
    `userId` (header, query, or body) as authoritative.
  - `prod`: refuses any request without a valid JWT; derives `userId`
    from the token's `sub` claim; **ignores** any client-supplied
    userId.
- The mode is a server-startup flag, **not** a configurable property
  per-request. The prod binary refuses to start in dev mode without
  an explicit `--i-know-this-is-dev` flag.

§15 #13 makes this non-negotiable. `UX_NUANCES.md` §N34 documents
the trust boundary as a classification-Architectural decision — not a
workaround, this is how the dev/prod separation has to work.

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

## 2.5 Nested fields — `nestedField()` factory + path accessors

Every ColDef whose data path contains a dot **MUST** be authored
through `nestedField()`. Bare `field: "x.y.z"` literals are a
contract violation (see §15 #11). Rationale and design in
[`./plans/nested-fields-design.md`](./plans/nested-fields-design.md).

```ts
// Package: @starui/shared (foundation leaf — vanilla TS)

/** Returns a cached closure that reads `path` from a row.
 *  Semantics: literal-flat-key priority on the root, then null-safe
 *  dot-walk. Cached by `path` string so identity is stable. */
export function getPathAccessor(path: string): (row: unknown) => unknown;

/** Returns a cached closure that writes `value` to `path` on a row,
 *  creating intermediate plain-object segments as needed.
 *  Returns `true` if the write changed the value, `false` if no-op. */
export function getPathSetter(path: string): (row: unknown, value: unknown) => boolean;
```

```ts
// Package: @starui/grid

interface NestedFieldOptions {
  /** Dot-notation path. Also the default colId — be deliberate
   *  because colId is the persistence key. */
  readonly path: string;
  /** Override the column id. Use when v1 state used a different id. */
  readonly colId?: string;
  /** Sort comparator. Default: null-safe numeric/string comparator. */
  readonly comparator?: ColDef['comparator'];
  /** Change-detection equals. Default: `Object.is`. */
  readonly equals?: ColDef['equals'];
  /** When false, the column is read-only and AG-Grid rejects in-place
   *  edits. Default: true. */
  readonly writable?: boolean;
}

export function nestedField(opts: NestedFieldOptions): Partial<ColDef>;
```

Hooks the factory MUST populate:

| Hook | Contract |
|---|---|
| `field`              | Set to `opts.path`. AG-Grid's group/pivot/aggregation auto-features use it. |
| `colId`              | `opts.colId ?? opts.path`. Stable persistence key. |
| `valueGetter`        | `(p) => getPathAccessor(opts.path)(p.data)`. Routes every read (sort, filter, render, tooltip, export) through the compiled closure. |
| `valueSetter`        | `(p) => getPathSetter(opts.path)(p.data, p.newValue)` when `writable !== false`; omitted when `writable === false`. |
| `comparator`         | `opts.comparator ?? defaultNullSafeComparator`. |
| `equals`             | `opts.equals ?? Object.is`. |
| `tooltipValueGetter` | Stringifies the current value via the compiled accessor. |
| `headerTooltip`      | `opts.path`. |

### Usage

```ts
{
  headerName: 'Last Price',
  ...nestedField({ path: 'trade.price.last' }),
  cellClass: 'numeric',
}
```

### Runtime dev safety net

`GridPlatform` MUST walk the registered ColDefs at startup in dev
builds and emit a `console.warn('[starui:grid] bare nested field "<path>" — use nestedField()')`
for any ColDef whose `field` contains `.` but does not appear to
have been authored through `nestedField()` (heuristic:
`!valueGetter && !valueSetter` while `field.includes('.')`). Zero
production cost.

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

ConfigService ships **two completely independent implementations** of
the same `ConfigClient` interface. An app picks exactly one at boot;
they are **never used together**, there is no dispatcher, and there
is no sync / write-through / reconciliation between them.

| Environment | Implementation | Storage backend | Bundle cost |
|---|---|---|---|
| **Development** | `DexieConfigClient` | Browser IndexedDB (Dexie) | Dexie + impl, ~20 KB gzipped |
| **Production**  | `RestConfigClient`  | MongoDB (or any) via REST API | impl only, ~3 KB gzipped |

```ts
// Package: @starui/config
// Shared interface — both impls expose exactly this surface.
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

  // Orphan reclamation (see §4.6)
  markAlive(args: MarkAliveArgs): Promise<void>;
  listOrphans(args?: OrphanQuery): Promise<OrphanReport>;
  purgeOrphans(args?: OrphanQuery & { readonly dryRun?: boolean }): Promise<PurgeReport>;

  health(): Promise<HealthStatus>;
}
```

### Two construction paths

```ts
// PROD path — REST against the deployed server (MongoDB-backed today,
// any document store tomorrow).  Production bundles import only this.
// Package: @starui/config
function createRestConfigClient(opts: {
  readonly baseUrl: string;                  // required
  readonly fetch?: typeof fetch;             // override for testing
  readonly headers?: Record<string, string>; // e.g. { Authorization: "Bearer …" }
  readonly retry?: { attempts: number; backoffMs: number };
}): ConfigClient;
```

```ts
// DEV path — Dexie/IndexedDB.  Lives at a SEPARATE subpath so prod
// bundles tree-shake it out (bundlers see `@starui/config/dev` is
// never imported in production code paths → Dexie + impl drops out).
// Package: @starui/config/dev
function createDexieConfigClient(opts: {
  /** Dexie database name. Default: "starui-config". */
  readonly dbName?: string;
  /** Seed JSON for first-boot bootstrap (auth tables). */
  readonly seedUrl?: string;
}): ConfigClient;
```

### Selection at `<StarUIApp>` boot

The app picks exactly one based on its `config.backend`:

```ts
interface StarUIConfigConfig {
  /** "rest" for production (with restUrl required) or "dev" for
   *  Dexie-backed local development. No default — apps must pick. */
  readonly backend: "rest" | "dev";
  /** REST endpoint. Required when backend === "rest". */
  readonly restUrl?: string;
  /** Auth header builder for REST mode. */
  readonly auth?: () => Promise<{ token: string }>;
  /** Optional seed JSON URL — applies in both modes on a fresh DB. */
  readonly seedUrl?: string;
  /** Identity override. */
  readonly identity?: AppIdentity;
}
```

### Behaviour requirements

1. **One client per app, full stop.** No code path runs both. No
   write-through. No queued offline sync. No `pendingSync` table.
2. **Dev → Prod is a redeploy, not a migration.** When promoting an
   environment from dev (Dexie) to prod (REST), profiles live in
   different stores. The platform makes no attempt to sync them. Users
   exporting profiles for cross-machine transfer use the existing
   `ProfileManager.export` / `import` JSON-payload flow.
3. **No browser-side authority in prod.** `RestConfigClient` does not
   maintain a local read cache that survives reloads. The server is the
   source of truth; reads are HTTP. (Per-session in-memory memoisation
   for repeated reads within a single page load is fine.)
4. **Optimistic locking lives on the server in prod.** `__v` is
   incremented server-side; the client surfaces `ProfileSetVersionConflictError`
   when the server returns 409. In dev (Dexie), the same logic runs
   in the browser.
5. **Tree-shakeable boundary.** Production builds importing only from
   `@starui/config` (no `/dev` subpath) must bundle zero Dexie code.

### What is intentionally NOT in this spec

- A "dual-mode" dispatcher (was `createConfigClient` in v1; **dropped**).
- A `pendingSync` table or offline-write queue (**dropped**).
- A `migrateLegacyProfilesIfNeeded` step in production (Dexie is a
  dev concern; prod never sees it). The function may remain in
  `@starui/config/dev` for upgrades from older dev environments.
- Write-through-both semantics inside `ConfigManager` (**dropped**).

```ts
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
  /** Last time a runtime plugin reported this row's instanceId as
   *  reachable from a saved workspace.  `null` / `undefined` means the
   *  row has never been observed alive — i.e. it is a candidate
   *  orphan once `neverAliveOlderThan` elapses.  See §4.6. */
  readonly lastAliveAt?: number | null;
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

## 4.6 Orphan reclamation

### The problem this section solves

A `Hosted*` widget calls `configClient.saveConfig(...)` the moment it
mounts with an `instanceId`. Whether that `instanceId` ever ends up
*referenced* from a saved workspace state is a completely separate
event, owned by the runtime (OpenFin layouts, browser-tab session
state, custom shells).

The configClient cannot determine reachability on its own — the
graph of "which instanceIds are live" lives in the runtime, not in
the config store. Without explicit reclamation, every component
instance the user ever opened lingers in the database forever.

Three life states exist for every row:

| State | Definition | Typical cause |
|---|---|---|
| **Never alive** | `lastAliveAt == null`, row older than `neverAliveOlderThan` | User opened a widget, closed the app without saving the workspace. |
| **Stale** | `lastAliveAt` exists but is older than `olderThan` | User removed the view from layout and saved. |
| **Alive** | `lastAliveAt` within `olderThan`, or row is within `neverAliveOlderThan` of creation | Currently reachable from a saved workspace. |

### Surface

```ts
// Package: @starui/config
interface MarkAliveArgs {
  /** Stable identifier for the workspace whose state is being saved.
   *  In OpenFin, this is the workspace/page id. In a browser-only
   *  app, this is whatever the runtime plugin uses to keep workspaces
   *  distinct (often the URL or a fixed "default" sentinel). */
  readonly workspaceId: string;
  /** Every instanceId reachable from this workspace's saved state.
   *  The set MUST be exhaustive — anything not in it for this
   *  workspaceId becomes a stale-reference candidate. */
  readonly liveInstanceIds: readonly string[];
}

interface OrphanQuery {
  /** ISO 8601 duration. Rows whose `lastAliveAt` is older than this
   *  threshold are stale candidates. Default: "P30D" (30 days). */
  readonly olderThan?: string;
  /** ISO 8601 duration. Rows where `lastAliveAt` is null AND the row
   *  is older than this threshold are never-alive candidates.
   *  Default: "P7D" (7 days). */
  readonly neverAliveOlderThan?: string;
  /** Narrow the sweep to one componentType. */
  readonly componentType?: string;
}

interface OrphanReport {
  readonly orphans: readonly OrphanEntry[];
  readonly thresholds: { readonly olderThan: string; readonly neverAliveOlderThan: string };
  readonly scannedAt: number;            // Unix epoch ms
}

interface OrphanEntry {
  readonly configId: string;
  readonly componentType: string;
  readonly componentSubType: string;
  readonly displayText?: string;
  readonly creationTime: number;
  readonly lastAliveAt: number | null;
  readonly reason: "never-alive" | "stale-reference";
}

interface PurgeReport extends OrphanReport {
  readonly deleted: number;              // 0 when dryRun: true
  readonly dryRun: boolean;
}
```

### Behaviour requirements

1. **`markAlive` is idempotent and additive.** Two calls with the
   same `(workspaceId, instanceId)` pair are equivalent to one. The
   row's `lastAliveAt` is set to the call's server / client clock.
2. **`markAlive` is non-destructive.** Rows absent from the call are
   NOT deleted. Reclamation is a separate explicit step
   (`purgeOrphans`).
3. **`listOrphans` is pure.** No row mutation, no side effects.
4. **`purgeOrphans({ dryRun: true })` is mandatory.** Implementations
   MUST honour the flag and return the report without deleting.
5. **Multi-workspace scoping.** A row is alive if ANY workspace's
   `markAlive` call has referenced its `instanceId` within
   `olderThan`. Implementations track `lastAliveAt` as the max
   across all workspaces, not per-workspace.
6. **Dev (Dexie) vs prod (REST).** Dexie executes the three methods
   locally. REST exposes them as endpoints
   (`POST /config/mark-alive`, `GET /config/orphans`,
   `POST /config/orphans/purge`). In prod, a scheduled cron job
   (frequency at operator discretion) typically calls `purgeOrphans`
   server-side with operator-chosen thresholds — the framework does
   not mandate the cadence.
7. **Auth-table rows are exempt.** Roles, permissions, userProfile,
   appRegistry rows are not subject to reclamation — they don't
   correspond to component instances. Only rows whose
   `componentType` is in the set of known instance-bearing types
   (`markets-grid-profile-set`, future widget profile-sets) are
   eligible. The exact set is server-defined; clients pass
   `componentType` if they want to narrow further.

### How the runtime triggers reclamation

`RuntimePort.onWorkspaceSave` already exists (§6.1). A runtime
plugin's responsibility on workspace save is:

```ts
runtime.onWorkspaceSave(async () => {
  const liveInstanceIds = await runtime.enumerateLiveInstances();
  await configClient.markAlive({
    workspaceId: runtime.currentWorkspaceId(),
    liveInstanceIds,
  });
});
```

`enumerateLiveInstances()` and `currentWorkspaceId()` are added to
`RuntimePort` — see §6.1.

### Admin surface

`<ConfigBrowserPanel>` (§8.2) gains an **Orphans** tab that calls
`listOrphans()` on mount, shows the report grouped by `reason`, and
exposes a **Purge with dry-run preview** action that calls
`purgeOrphans({ dryRun: true })` first, surfaces the result, then
calls `purgeOrphans({ dryRun: false })` on operator confirm.

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
  /** Consult the bootstrap chain (§1.4) and return the resolved
   *  identity. MUST NOT return a hardcoded fallback userId. If the
   *  chain yields no userId, throws `IdentityError`. */
  resolveIdentity(): Promise<IdentitySnapshot>;
  openSurface(spec: SurfaceSpec): Promise<SurfaceHandle>;
  getTheme(): Theme;
  setTheme(t: Theme): void;
  onThemeChanged(fn: (t: Theme) => void): Unsubscribe;
  onWindowShown(fn: () => void): Unsubscribe;
  onWindowClosing(fn: () => void | Promise<void>): Unsubscribe;
  onCustomDataChanged(fn: (cd: unknown) => void): Unsubscribe;
  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe;

  /** Stable identifier for the workspace whose state would be saved
   *  by the next `onWorkspaceSave` event. In OpenFin: the active
   *  workspace/page id. In the browser runtime: a fixed sentinel
   *  (typically `"default"`) unless the host runtime overrides it. */
  currentWorkspaceId(): string;

  /** Best-effort enumeration of every `instanceId` reachable from
   *  the currently-saved workspace state. Used by orphan
   *  reclamation (§4.6).  The browser runtime returns an empty
   *  array unless an embedding host provides an implementation. */
  enumerateLiveInstances(): Promise<readonly string[]>;

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

// No hardcoded user id. Identity resolves through the bootstrap
// chain documented in §1.4 (explicit override → manifest/config-file
// → enterprise redirect → fail). Any legacy literal like "dev1" is
// a contract violation. The v1 LOGGED_IN_USER_ID constant is
// retired; v1's continued use of it is captured as workaround-class
// technical debt in UX_NUANCES.md §N34.
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
  currentWorkspaceId(): string;
  enumerateLiveInstances(): Promise<readonly string[]>;
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

Browses the ConfigService tables (`appConfig`, `appRegistry`,
`userProfile`, `roles`, `permissions`). Theme syncs with OpenFin's
`theme-changed` IAB event. An **Orphans** tab surfaces the orphan
reclamation API from §4.6 — `listOrphans` on mount, with a
**Purge (dry-run preview)** action.

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

## 9.5 Dock — version selection, renderer mapping, persistence

The OpenFin plugin supports both Dock V3 (legacy, menu items in a
content menu opened from the dock button) and Dock V2 (current,
menu items rendered as dropdowns on the dock itself). The version
is selected per-application via the OpenFin manifest. The dock
configuration data model — same one the in-app dock-editor UI
produces — drives both renderers; only the renderer differs.

### Manifest selector

```jsonc
// app.fin.json
{
  "platform": { "uuid": "…", "icon": "…", "autoShow": false },
  "customSettings": {
    "starui": {
      "dockVersion": "v2"      // "v2" (default) | "v3"
    }
  }
}
```

- **Default** is `"v2"`. The plugin treats omission and `"v2"`
  identically.
- `"v3"` is the explicit opt-out for installs that need the
  content-menu surface (e.g. legacy deployments where deep
  nesting plus arbitrary actions has been tuned to the V3 paint).

The plugin reads `manifest.customSettings.starui.dockVersion` at
bootstrap. The choice is **immutable per workspace launch** —
flipping versions requires restart. Rationale: the persisted dock
config is shape-compatible across both, but the OpenFin runtime's
`Dock.register({...})` call commits to one renderer; runtime swap
would require unregister-and-reregister with the workspace-platform
provider, which is fragile and operator-confusing.

### Internal data model — same for both

The dock-editor UI emits and the ConfigService persists a single
recursive tree:

```ts
// Package: @starui/openfin/workspace
type DockEntry =
  | DockLeafEntry
  | DockFolderEntry;

interface DockLeafEntry {
  readonly type: "item";
  readonly id: string;                  // stable; used as action id
  readonly label: string;
  readonly tooltip?: string;
  readonly iconUrl?: string;
  readonly actionId: string;            // resolves through CustomActionsMap
  readonly customData?: Readonly<Record<string, unknown>>;
}

interface DockFolderEntry {
  readonly type: "folder";
  readonly id: string;
  readonly label: string;
  readonly tooltip?: string;
  readonly iconUrl?: string;
  readonly children: ReadonlyArray<DockEntry>;   // RECURSIVE — folders nest
}

interface DockConfig {
  readonly entries: ReadonlyArray<DockEntry>;
  readonly workspaceComponents?: ReadonlyArray<
    "home" | "notifications" | "store" | "switchWorkspace"
  >;
  readonly disableUserRearrangement?: boolean;
}
```

`DockFolderEntry.children` is recursive — folders may contain
folders. Both renderers honour the full tree depth.

### V2 renderer — `Dock.register` with recursive `CustomDropdownConfig`

```ts
// Conceptual mapping (pseudo):

function toV2(entry: DockEntry): DockButton {
  if (entry.type === "item") {
    return {
      id: entry.id,
      tooltip: entry.tooltip ?? entry.label,
      iconUrl: entry.iconUrl,
      action: { id: entry.actionId, customData: entry.customData },
    };
  }
  // folder → dropdown
  return {
    id: entry.id,
    type: DockButtonNames.DropdownButton,
    tooltip: entry.tooltip ?? entry.label,
    iconUrl: entry.iconUrl,
    options: entry.children.map(toV2Option),
  };
}

function toV2Option(entry: DockEntry): CustomButtonConfig | CustomDropdownConfig {
  if (entry.type === "item") {
    return {
      tooltip: entry.tooltip ?? entry.label,
      iconUrl: entry.iconUrl,
      action: { id: entry.actionId, customData: entry.customData },
    };
  }
  // nested folder → nested dropdown (CustomDropdownConfig)
  return {
    tooltip: entry.tooltip ?? entry.label,
    iconUrl: entry.iconUrl,
    options: entry.children.map(toV2Option),
  };
}
```

The `CustomDropdownConfig.options` type allows arbitrary
recursion (`(CustomButtonConfig | CustomDropdownConfig)[]`).

### V3 renderer — legacy content-menu entries

Unchanged from v1's existing behaviour. The plugin maps the same
`DockEntry[]` tree to `ContentMenuEntryType[]` and registers the
single dock button whose right-click handler opens the content
menu. v1's `dock.ts` is the reference. The renderer continues to
honour the full tree depth via the menu's native sub-submenu
support.

### Persistence

Dock configuration persists as a single `AppConfigRow`:

```ts
{
  componentType: "dock-config",   // already in COMPONENT_TYPES (§4.2)
  componentSubType: "",
  configId: "<userId>:<appId>:dock",
  payload: DockConfig,            // the recursive tree above
  // …standard AppConfigRow fields
}
```

The OpenFin plugin wires this into the workspace platform via
`WorkspacePlatformProvider.getDockProviderConfig` and
`.saveDockProviderConfig` overrides — both serialise/deserialise
against the same `DockConfig` shape, with version-specific encoding
(V2: `DockButton[]`; V3: `ContentMenuEntryType[]`) computed at
load/save time from the persisted recursive tree. The recursive
tree is the source of truth; the version-specific encodings are
ephemeral.

### Custom actions

Action ids in `DockLeafEntry.actionId` resolve through the
`CustomActionsMap` registered with `workspace-platform.init({
customActions })`. The reserved action ids in §9.3 (e.g.
`ACTION_LAUNCH_COMPONENT`, `ACTION_OPEN_REGISTRY_EDITOR`,
`ACTION_OPEN_DOCK_EDITOR`) are wired by the plugin. App-defined
actions add to the map via `StarUIPlugin.onBootstrap`.

### Behaviour requirements

1. **Both renderers honour arbitrary nesting.** A folder containing
   a folder containing items must render correctly under both V2
   (recursive `CustomDropdownConfig.options`) and V3 (nested
   content-menu submenus).
2. **Switching `dockVersion` MUST NOT mutate the persisted
   `DockConfig`.** The recursive tree is renderer-agnostic;
   flipping the manifest flag changes only how the tree is
   painted on next launch.
3. **The dock-editor UI is renderer-agnostic.** It edits
   `DockEntry[]` directly. No conditional UI based on
   `dockVersion`.
4. **`disableUserRearrangement` and `workspaceComponents`** propagate
   into the appropriate V2 / V3 config shape unchanged.

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

## 10.3 Bracket-reference syntax — nested paths + old/new

`[…]` references inside an expression accept dot-notation paths and
two reserved suffixes for delta access. Full design in
[`./plans/nested-fields-design.md`](./plans/nested-fields-design.md).

### Path resolution

```text
[trade.price.last]        // current value at trade.price.last
[trade.price.last.old]    // prior value (from the conditional-styling diff cache)
[trade.price.last.new]    // current value (synonym for [trade.price.last] in delta contexts)
```

Resolution rules:

1. The reference path is canonicalised by stripping a trailing
   `.old` or `.new` suffix if present.
2. The canonical path compiles to a closure via `getPathAccessor`
   (§2.5) — shared cache with ColDef accessors.
3. At evaluation time the engine looks up the literal reference
   string (e.g. `"trade.price.last.old"`) on the supplied scope
   first. Hits resolve through the prototype-chain trick documented
   in `UX_NUANCES.md` §N32. Misses fall through to the compiled
   accessor on `params.data`.
4. **Trigger registration uses the canonical path.** An expression
   `[a.b.c.old] > [a.b.c.new]` registers one trigger on `a.b.c`, not
   two. The cross-column trigger pre-filter (§4 of conditional-
   styling design) consults the trigger set against the row's
   `changedKeys` so untouched rows skip evaluation entirely.

### `prev([…])` function — cross-field delta

For cross-field delta comparisons where suffix syntax has no
expression:

```text
prev([trade.price.last]) > [trade.cost.last]
```

`prev` is a reserved function registered in the catalogue. Its
single argument MUST be a bracket reference (compile-time error
otherwise). Behaviour:

- Resolves to `rowDiffs.get(canonicalPath).oldValue` when a diff
  entry exists for the path on the current row.
- Falls back to the current value when no diff entry exists (e.g.
  first observation of the row).
- Registers the canonical path as a trigger, identical to a bare
  `[…]` reference.

The suffix form and `prev()` form share semantics for the
single-field case — `[a.b.c.old]` is functionally equivalent to
`prev([a.b.c])`. Authors use whichever reads better in the
expression.

## 10.4 Security policy

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

1. **`userId` resolves through the §1.4 bootstrap chain** —
   explicit prop → manifest/config-file → enterprise redirect → fail.
   No hardcoded fallback. The legacy `LOGGED_IN_USER_ID = "dev1"`
   constant is retired; v1's continued use of it is documented as
   workaround-class debt in `UX_NUANCES.md` N34, and any new code
   carrying such a literal is a §15 #13 contract violation.
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
8. **Production deployments use REST exclusively.** The framework
   provides **no** offline-first behaviour, no IndexedDB-to-REST
   synchronisation, no `pendingSync` queue, no conflict reconciliation,
   no dual-write logic. Dev (`@starui/config/dev`, Dexie) and prod
   (`@starui/config`, REST + MongoDB) are two independent
   implementations of the same `ConfigClient` interface. Switching from
   dev to prod is a redeploy with a different `backend:` selector, not
   a runtime migration. Authority for conflict resolution and
   optimistic locking lives server-side in prod; the browser is a
   thin client.
9. **Orphan reclamation is part of the public contract.**
   `ConfigClient` MUST expose `markAlive`, `listOrphans`, and
   `purgeOrphans` with the semantics in §4.6. `RuntimePort` MUST
   expose `currentWorkspaceId()` and `enumerateLiveInstances()`.
   Every runtime plugin that owns workspace persistence MUST wire
   `onWorkspaceSave` → `enumerateLiveInstances` → `markAlive`.
   `purgeOrphans({ dryRun: true })` MUST be a real preview — no
   row may be deleted while `dryRun` is true.
10. **Every nuance in `docs/UX_NUANCES.md` must be preserved.** A
    rewrite that passes the API contract in this document but
    fails any catalogued nuance is **incomplete**. The nuance
    catalogue is the contract for behaviours that don't appear
    in type signatures: cross-window portal targeting, theme-
    switch flash avoidance, focus restoration, keyboard
    shortcuts, animation timing, and so on. See §17 for the
    binding mechanism. Visual parity is verified against
    `docs/visual-reference/` per the acceptance criterion in
    that directory's README.
11. **Nested fields go through `nestedField()`.** Every ColDef
    whose `field` contains a `.` MUST be authored via the
    `nestedField()` factory documented in §2.5. Bare
    `field: "x.y.z"` string literals in ColDef objects are a
    contract violation regardless of whether they "work" with
    AG-Grid's built-in dot-walk — they bypass the compiled
    accessor cache, the consistent `valueSetter`, the stable
    `colId`, and the runtime dev safety net. Implementations
    MUST expose `getPathAccessor` and `getPathSetter` from
    `@starui/shared` as documented in §2.5, share the accessor
    cache between ColDef reads and expression-engine `[…]`
    reference resolution, and canonicalise `.old` / `.new`
    suffixes to one trigger entry as documented in §10.3.
12. **No bare `console.*` in production source.** Every
    diagnostic emit MUST go through a `Logger` obtained from
    `createLogger("starui:<pkg>")` as documented in §1.3. Bare
    `console.log` / `console.warn` / `console.error` /
    `console.info` / `console.debug` / `console.trace` outside
    the logger module, test files, CLI scripts, and ESLint rule
    sources are a contract violation. Logger prefix MUST match
    the `starui:<pkg-short>` convention listed in §1.3. The
    `@starui/eslint-plugin` package's `no-bare-console` rule
    enforces this at lint time.
13. **No hardcoded user id; hard dev/prod identity-trust boundary.**
    The platform MUST NOT carry any hardcoded user id constant
    (the v1 `LOGGED_IN_USER_ID = "dev1"` is retired). Identity
    MUST resolve through the four-stage bootstrap chain in §1.4.
    Server-side, the StarUI Config Server (§4, Commit 3) runs in
    exactly one of two modes: **`dev`** accepts client-supplied
    userId without a token; **`prod`** ignores any client-supplied
    userId and derives identity from the JWT `sub` claim only.
    The mode is a server-startup flag, not a per-request setting.
    Production binaries MUST refuse to start in `dev` mode without
    an explicit `--i-know-this-is-dev` flag. This boundary is the
    single difference between "convenient developer experience"
    and "shippable privilege-escalation hole" — it is
    non-negotiable.

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
8. **Drop the `pendingSync` table** from any ConfigService schema.
   No sync queue exists in either dev or prod paths.
9. **Drop `migrateLegacyProfilesIfNeeded`** from the prod path. Legacy
   in-place migration was a v1 bridge for users who had local Dexie
   profiles before the REST backend existed. The prod path starts from
   a server-authoritative store; there is nothing to migrate from.
10. **Drop write-through-both / dual-write logic.** A `ConfigClient`
    talks to exactly one backend for its lifetime.
11. **Drop Dexie from the prod bundle.** `@starui/config` (default
    import) must tree-shake `dexie` to zero bytes in production.
    Dexie is only reachable via the explicit `@starui/config/dev`
    subpath.
12. **Drop the dispatching `createConfigClient(opts)` factory** that
    chose between Dexie and REST at runtime. Replaced by two
    independent factories: `createRestConfigClient` (prod) and
    `createDexieConfigClient` (dev, behind the `/dev` subpath).
13. **Orphan-reclamation scheduling, batching, and storage strategy
    are latitude.** The framework mandates the surface (§4.6) and
    the trigger (§6.1's `onWorkspaceSave` hook); it does not
    mandate:
    - Cron cadence in prod (operator-chosen; suggested default
      daily).
    - Whether `purgeOrphans` issues a hard `DELETE` or a soft-delete
      with a `deletedAt` tombstone column. Both satisfy the
      contract as long as `listOrphans` no longer reports the row
      afterward.
    - Whether the REST server uses an aggregation pipeline, a
      cursor sweep, or a materialised orphan view to compute the
      report.
    - Whether `markAlive` writes per-call, debounces in-memory, or
      coalesces by `workspaceId`. The user-visible guarantee is
      eventual consistency before the next `listOrphans` scan, not
      synchronous write.
    - The exact set of `componentType` values treated as
      reclamation-eligible (server-defined; clients narrow with
      `OrphanQuery.componentType` if needed).

The boundary between "must preserve" (§15) and "free to change" (§16)
is the difference between *user-facing semantics* and *implementation
detail*. Hold the former, refactor the latter freely.

---

# 17. Visual + behavioural contract

This document specifies the **API**. It does not — and cannot —
specify the per-component behavioural nuances and visual conventions
that a trading-floor user has internalised over three years of daily
use. Those live in two companion artifacts:

| Artifact | Captures |
|---|---|
| [`UX_NUANCES.md`](./UX_NUANCES.md) | Numbered nuance catalogue (`N1`, `N2`, …). Each entry names a surface, the symptom-if-missing, the root cause, the implementation note, and the v1 file locations. |
| [`visual-reference/`](./visual-reference/) | Screenshots of every screen and component-state, captured against the demo apps, with naming convention and Playwright-driven capture workflow documented in `visual-reference/README.md`. |

These artifacts are **part of the contract**, not supplementary
material. §15 #10 makes preserving every catalogued nuance a
non-negotiable. A rewrite is accepted only when:

1. Every signature, behaviour, and guarantee in §§1–14 of this
   document is implemented exactly.
2. Every nuance entry in `UX_NUANCES.md` (currently N1–N9 fully
   documented, N10–N30 stubbed) is preserved — verified by
   reproducing the documented symptom-absent behaviour.
3. Every screenshot in `visual-reference/` has a matching capture
   from the rewrite's demo, within the per-test pixel-diff
   threshold defined in that directory's README.

**Living catalogue.** When a UX-affecting fix lands during the
rewrite — or any time afterwards — the same PR adds a numbered
entry to `UX_NUANCES.md` and (where applicable) updates the
screenshots in `visual-reference/`. The catalogue grows
monotonically; entries are never deleted, only superseded (with the
superseding entry referenced inline).

**Fix taxonomy — not every nuance is created equal.** Each
catalogue entry carries a **Classification** tag from this set:
`Root-cause fix`, `Architectural decision`, `Defensive guard`,
`Workaround`, `Layered workaround`. The first three should be
preserved verbatim. The last two flag fixes that paper over a
deeper problem — a rewrite is encouraged to re-investigate the
underlying cause and replace the workaround with a root-cause fix
where possible. Layered workarounds in particular (workarounds
piled on workarounds, e.g. the Monaco key-routing chain
N31.4 → N31.5 → N31.6) are signals that the surface they cover is
overdue for an event-model rethink rather than another patch.
**Preservation is the floor, not the ceiling.** A rewrite that
simplifies the workaround chain — provably, with the catalogued
symptoms still failing to reproduce — is preferred over one that
copies every layer faithfully.

**Why this separation.** The type signatures in this document
catch contract violations at compile time. The nuance catalogue
catches behavioural regressions that no type system can see — the
formatter dialog that pops out but renders its dropdowns on the
wrong window, the grid that flashes white during a theme swap, the
profile rename that loses focus mid-edit. Without the catalogue,
each of these regressions would be re-discovered through user pain
in production. With the catalogue, the rewrite has a checklist to
hold itself accountable against.

---

*Authored 2026-05-18.  Living document — every API addition or breaking
change must update this file in the same PR.*

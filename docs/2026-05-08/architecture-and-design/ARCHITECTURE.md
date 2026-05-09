# Architecture

## Principle

**Every component is an app.** It joins a larger app by sharing
`appId`. It must run identically across:

|     | React | Angular |
|---|---|---|
| OpenFin runtime | ✓ | ✓ |
| Browser runtime (standalone) | ✓ | ✓ |

across persistence backends:

- REST `ConfigManager` (config-service-server)
- IndexedDB `ConfigManager` (single-machine)
- localStorage `ConfigManager` (zero-backend / standalone)
- Memory `ConfigManager` (tests)

The component code is identical across every combination. Adapters
inject the differences.

## Layered model

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 5  Runtime adapter:  OpenFin shell  |  Browser shell  │  swappable
├──────────────────────────────────────────────────────────────┤
│  Layer 4  Framework adapter:  React        |  Angular        │  swappable
├──────────────────────────────────────────────────────────────┤
│  Layer 3  Component domain:                                  │
│            MarketsGrid, DataProvider, Profile,               │
│            ConfigBrowser, DataProviderEditor,                │  agnostic
│            WorkspaceSetup                                    │
├──────────────────────────────────────────────────────────────┤
│  Layer 2  Platform helpers:                                  │
│            ConfigManager (4 backends), HostWrapper identity, │
│            fieldInference, templateResolver, AppDataStore,   │  agnostic
│            RuntimePort                                       │
├──────────────────────────────────────────────────────────────┤
│  Layer 1  Foundations:                                       │
│            design-system (tokens), ui (shadcn primitives),   │  agnostic
│            icons, shared-types, widget-sdk                   │
└──────────────────────────────────────────────────────────────┘
```

Layers 1–3 are runtime-agnostic and (with framework-specific shells
in Layer 4) framework-agnostic.

## The two seams

Two thin adapter layers concentrate every cross-cutting concern:

### Seam #1 — `RuntimePort`

```typescript
interface RuntimePort {
  resolveIdentity(): IdentitySnapshot;        // from customData OR URL OR mount props
  openSurface(spec: SurfaceSpec): Promise<SurfaceHandle>;  // popout | modal | inpage
  onThemeChanged(fn): Unsubscribe;
  onWindowShown(fn): Unsubscribe;
  onWindowClosing(fn): Unsubscribe;
  onCustomDataChanged(fn): Unsubscribe;
}

class OpenFinRuntime implements RuntimePort { /* fin.* */ }
class BrowserRuntime implements RuntimePort { /* URL params, prefers-color-scheme, window.open / in-page modal */ }
```

Component code never imports `@openfin/core` directly.

### Seam #2 — `HostWrapper` (the only component-side seam)

The single component that lives between the runtime and the hosted
component. Resolves identity + platform services from the
`RuntimePort`, exposes via context, renders the hosted component.

```typescript
function HostWrapper({ children }: { children: ReactNode }) {
  const ctx = useResolvedHostContext();   // pulls identity, configManager, theme, runtime events
  return <HostContext.Provider value={ctx}>{children}</HostContext.Provider>;
}

interface HostContext {
  // Identity (resolved by RuntimePort)
  instanceId: string;
  appId: string;
  userId: string;
  componentType: string;
  componentSubType: string;
  isTemplate: boolean;
  singleton: boolean;
  roles: string[];
  permissions: string[];

  // Platform services
  configManager: ConfigManager;     // any backend
  theme: 'light' | 'dark';
  configUrl?: string;

  // Runtime delegations
  onThemeChanged(fn): Unsubscribe;
  onWindowShown(fn): Unsubscribe;
  onWindowClosing(fn): Unsubscribe;
  onCustomDataChanged(fn): Unsubscribe;
}
```

Hosted components consume `useHost()` (React) or
`inject(HostService)` (Angular) — never `fin`, `localStorage`,
or routing directly.

## Modular component shape

Every major component (MarketsGrid, DataProviderEditor, ConfigBrowser,
WorkspaceSetup) follows the same shape:

```
@starui/<thing>                     ← agnostic logic (TS only)
  ├ src/core/                       ← orchestrator + shared state
  ├ src/modules/<module>/           ← per-module agnostic logic
  └ subpath exports per module

@starui/<thing>-react               ← React shell + UI panels
  ├ src/<Thing>.tsx                 ← main component
  ├ src/modules/<module>/           ← React panel for that module
  └ subpath exports

@starui/<thing>-angular             ← Angular shell (placeholder until React parity)
```

Subpath exports per module mean a panel imports its own logic from
`@starui/markets-grid/modules/conditional-styling` — *not* a separate
package per module. Discipline via convention; less ceremony.

## Data plane (Sweep #4 architecture)

Reshape of the v2 data plane. The `DataProvider<T>` is a domain
object with a simple, classical API:

```typescript
interface DataProvider<TRow = unknown> {
  setConfig(cfg: ProviderConfig): void;
  getColumnDefs(): ColumnDefinition[];

  start(): void;
  stop(): void;
  restart(): void;

  getSnapshot(): Promise<readonly TRow[]>;
  getStats(): ProviderStats;

  onSnapshot(fn): Unsubscribe;
  onUpdate(fn): Unsubscribe;
  onStats(fn): Unsubscribe;
  onStatus(fn): Unsubscribe;
}
```

Two implementations of the interface:

- `InProcessStompDataProvider`, `…RestDataProvider`,
  `…MockDataProvider`, `…AppDataProvider` — for single-window apps and
  tests.
- `SharedDataProvider` — proxy to a shared instance running in a
  SharedWorker (multi-window socket sharing).

Same interface; consumer code is identical. The platform's value-add
(SharedWorker hosting, cache, late-joiner replay, stats sampler,
template resolver) lives **around** the provider, not inside it.

## Persistence (Sweep #3 architecture)

```
ConfigManager (interface)            ← what every component consumes
   ├─ RestConfigManager              ← config-service-server
   ├─ IndexedDbConfigManager         ← Dexie
   ├─ LocalStorageConfigManager      ← zero-backend
   └─ MemoryConfigManager            ← tests
```

`HostWrapper` accepts an optional `configManager` prop overriding the
context default — a third-party widget can bring its own scoped
manager.

## Opinionated route table

Every app uses the canonical mapping:

```
/c/<componentType>[/<subType>]   →   <HostWrapper><Component /></HostWrapper>
```

Routes derive from registry data (no second source of truth). Every
route file is ~5 lines.

## Import boundary rules

- Foundation packages (`design-system`, `ui`, `icons-svg`, `tokens-primeng`,
  `shared-types`) import only from each other.
- `runtime-port` is foundational; runtime implementations
  (`runtime-openfin`, `runtime-browser`) only import `runtime-port` +
  their respective platform.
- Only `runtime-openfin` and `apps/*` may import `@openfin/core`.
- Component domain packages (`markets-grid`, `data-services`, etc.)
  do NOT import their `-react` siblings, and vice versa.
- `*-react` packages only import their own agnostic core +
  foundation + helpers.

ESLint enforcement is a follow-up; convention enforcement comes first.

## Folder layout

Packages are bucketed by framework, then by role inside each framework
(per [`plans/plan-2026-05-07/code-organization.md`](./plans/plan-2026-05-07/code-organization.md)):

```
packages/
├── shared/                    vanilla TS — framework-agnostic
│   ├── core/                  grid platform (vanilla)
│   ├── foundation/            pure leaves; no internal deps allowed
│   │   ├── shared-types/
│   │   ├── design-system/
│   │   ├── icons-svg/
│   │   └── tokens-primeng/
│   ├── runtime/               runtime abstraction layer
│   │   ├── runtime-port/      (interface)
│   │   ├── runtime-browser/   (impl)
│   │   └── runtime-openfin/   (impl)
│   ├── services/              vanilla services consumed by framework adapters
│   │   ├── config-service/
│   │   ├── data-services/
│   │   └── component-host/
│   └── platform/              runtime shells
│       └── openfin-platform/
├── react/                     peer-depends on react/react-dom
│   ├── ui/                    shadcn primitives (no twin → no -react)
│   ├── sdk/
│   │   └── widget-sdk/        widget contract (no twin → no -react)
│   ├── widgets/               end-user UI components
│   │   ├── markets-grid/
│   │   ├── grid-react/        ← extracted from core/{ui,hooks,modules}
│   │   └── widgets-react/
│   ├── hosts/
│   │   └── host-wrapper-react/
│   ├── providers/             Provider + hook shells around shared/services
│   │   └── data-services-react/
│   └── tools/                 dev/operator UIs
│       ├── config-browser-react/
│       └── workspace-setup-react/   ← extracted from dock-editor-react
└── angular/                   peer-depends on @angular/core (parity catching up)
    ├── hosts/
    │   └── host-wrapper-angular/
    ├── providers/             provideDataServices() + DI/RxJS/Signal shells around shared/services
    │   └── data-services-angular/
    ├── tools/
    │   └── config-browser-angular/
    └── widgets/
        └── widgets-angular/
```

**Bucket rules** (enforced by convention; ESLint follow-up):

- `foundation/` packages must not import from any other package.
- `runtime/`, `services/`, `platform/` may depend on `foundation/` and
  on each other within the same bucket.
- No package in `shared/` may import React, Angular, or any
  framework-coupled library.
- `core` is its own package at the root of `shared/` (NOT inside
  `platform/`) — a framework-agnostic grid platform, distinct from the
  OpenFin platform shell.

## Reference apps

`apps/reference-react` and (later) `apps/reference-angular` are the
canonical scaffolder targets. Each has exactly one `HostWrapper`,
one route table at `/c/...`, one runtime adapter selection, one
persistence selection. See [`REFERENCE_APP_LAYOUT.md`](./REFERENCE_APP_LAYOUT.md).

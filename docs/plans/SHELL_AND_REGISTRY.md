# Plan: Shell, Registry, and App Instantiation

> **Status:** draft · **Owner:** platform · **Est:** 2-3 weeks (Phases 2+3 of the unblocked roadmap, partially overlapping) · **Blocked by:** DATA_PLANE.md Week 1 for context types · **Unblocks:** MarketsGrid HOC refactor, Angular shell (Phase 4)

Covers three intertwined topics: how apps are instantiated on top of MarketsUI, how components are registered and launched, and how the OpenFin wrapper provides a framework-agnostic host context.

## 1. App instantiation — workspace siblings, not npm consumers

**Decision:** every MarketsUI-based app lives as a workspace sibling under `apps/` inside this monorepo. No published CLI; no `npx create-marketsui-app`. Consumers are WF internal teams who already have repo access.

```
apps/
├── demo-react/                     reference React demo (canonical)
├── demo-angular/                   reference Angular demo
├── tradingApp1/                    sample internal app (NEW — scaffolded via script)
├── tradingApp2/                    …
└── markets-ui-{react,angular}-reference/   pre-existing reference scenarios
```

Each `tradingAppN/`:

```
apps/tradingApp1/
├── package.json                    "@marketsui/app-tradingApp1", workspace deps
├── openfin/
│   ├── manifest.json               OpenFin manifest with customData (§2)
│   ├── platform-provider.html      OpenFin platform provider shell
│   └── assets/                     icons, splash
├── src/
│   ├── main.tsx                    React entry (or main.ts for Angular)
│   ├── App.tsx                     mounts <MarketsUIShell> with app config
│   ├── registry.json               this app's component registry (seed)
│   └── routes.ts                   route map consumed by the dock editor
├── vite.config.ts
└── tsconfig.json
```

### Scaffolding script

```bash
node tools/scripts/scaffold-app.mjs tradingApp1 --framework=react
```

Behavior:

1. `cp -r apps/markets-ui-react-reference apps/tradingApp1`
2. Rewrite `package.json` name to `@marketsui/app-tradingApp1`
3. Rewrite `openfin/manifest.json` → `customData.appId = "tradingApp1"`, new window title, fresh UUID
4. Clear `src/registry.json` + `src/routes.ts` to empty templates
5. Append to root `package.json` `workspaces` array (via AST rewrite to preserve ordering)
6. `npm install --legacy-peer-deps` (ensures lockfile is valid)
7. Print next-step hint: "Run `npm run dev -w @marketsui/app-tradingApp1`"

```typescript
// tools/scripts/scaffold-app.mjs  — sketch

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const [name, ...flags] = process.argv.slice(2);
const framework = flags.find(f => f.startsWith('--framework='))?.split('=')[1] ?? 'react';
if (!name) throw new Error('usage: scaffold-app <name> [--framework=react|angular]');

const src = `apps/markets-ui-${framework}-reference`;
const dst = `apps/${name}`;
await fs.cp(src, dst, { recursive: true });

const pkg = JSON.parse(await fs.readFile(`${dst}/package.json`, 'utf8'));
pkg.name = `@marketsui/app-${name}`;
await fs.writeFile(`${dst}/package.json`, JSON.stringify(pkg, null, 2));

const manifest = JSON.parse(await fs.readFile(`${dst}/openfin/manifest.json`, 'utf8'));
manifest.customData = { ...(manifest.customData ?? {}), appId: name };
manifest.platform.uuid = `marketsui-${name}-${Date.now()}`;
await fs.writeFile(`${dst}/openfin/manifest.json`, JSON.stringify(manifest, null, 2));

// …clear registry + routes, update root workspaces, run npm install
```

Maintenance-free. Discoverable. No publishing story needed.

## 2. OpenFin manifest — `customData` schema

```jsonc
// apps/tradingApp1/openfin/manifest.json  (relevant slice)
{
  "platform": { "uuid": "marketsui-tradingApp1-…", "applicationIcon": "…" },
  "customData": {
    "schemaVersion": 1,
    "appId": "tradingApp1",
    "configServiceUrl": "https://config.internal.example/api/v1",
    "externalAppCreds": {
      // keyed by foreign appId (§4) — bearer tokens for external ConfigService calls
      "riskApp": { "apiKey": "…" }
    },
    "featureFlags": {
      "dataPlane.sharedWorker": true,
      "dock.experimentalLinking": false
    }
  }
}
```

**Contract:** the wrapper reads `customData` at mount time via `fin.me.getOptions()`. Missing `appId` or `configServiceUrl` = fatal: render an error boundary with "app not configured". `schemaVersion` is checked — if the shell's expected version is higher than what the manifest declares, the shell runs migrators against the live `customData` before proceeding. Migrators live in `@marketsui/component-host/src/manifest-migrations/`.

## 3. Launch env — query string + customData duplication

When the dock launches a component, the resulting OpenFin window receives both:

**Query string** (for debugging / URL inspection):
```
?instanceId=…&appId=tradingApp1&configServiceUrl=https%3A%2F%2Fconfig.internal%2F…
```

**`customData` on the spawned window** (authoritative; survives workspace save/restore):
```jsonc
{
  "instanceId": "…",
  "appId": "tradingApp1",
  "configServiceUrl": "…",
  "componentRef": "blotter-v2",     // registry ID
  "componentParams": { … }           // arbitrary per-instance config
}
```

Wrapper reads `customData` first; falls back to query string if `customData.instanceId` is missing (dev-mode browser tabs without OpenFin). Redundancy is deliberate — it survives more restore paths.

## 4. Registry schema v2

Current `@marketsui/widget-sdk` has a thin `RegistryEntry`. Expand it:

```typescript
// packages/widget-sdk/src/registry/types.ts

export interface RegistryEntry {
  // ── Identity ────────────────────────────────────────────────
  id: string;                         // "blotter-v2" — stable, used as componentRef
  schemaVersion: 2;
  name: string;                       // human-readable
  version: string;                    // semver of the widget
  description?: string;

  // ── Sourcing ────────────────────────────────────────────────
  type: 'internal' | 'external';
  entry: string;                      // route (internal) or URL (external)
  appId?: string;                     // REQUIRED when type === 'external'
  configServiceUrl?: string;          // REQUIRED when type === 'external'

  // ── Lifecycle ───────────────────────────────────────────────
  singleton: boolean;                 // focus-or-spawn vs always-spawn
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };

  // ── Presentation ────────────────────────────────────────────
  icon: string;                       // ref into @marketsui/icons-svg or URL
  category: string;                   // for dock grouping
  tags?: string[];

  // ── Security ────────────────────────────────────────────────
  requiredPermissions: string[];      // checked against user's perms from ConfigService
  trustedOrigins?: string[];          // external components — CSP allowlist

  // ── Data plane (optional) ───────────────────────────────────
  dataPlane?: {
    providerId: string;               // what data plane provider(s) this component needs
    autoSubscribe?: string[];         // keys to subscribe to at mount
  };
}
```

**Schema migration:** `widget-sdk/src/registry/migrations/v1-to-v2.ts` upgrades any persisted v1 registry on first read. Pure function; tested.

**Validation:** zod schema co-located with the type. The registry editor validates on save; the dock launcher validates on launch (defense in depth).

## 5. Registry editor UI changes

`packages/registry-editor-react` + `packages/registry-editor-angular` gain new form sections:

- **Source** section (`type` radio + conditional `entry / appId / configServiceUrl` inputs)
- **Lifecycle** section (`singleton` toggle, `defaultSize` / `minSize` numeric inputs)
- **Security** section (`requiredPermissions` multi-select against ConfigService perms, `trustedOrigins` list)
- **Data plane** section (optional; providerId picker + key tags for autoSubscribe)

Existing "Name / Icon / Description / Category" fields stay.

**Live-instance banner:** when editing a registry entry with currently-live instances (queried from OpenFin platform state), show a persistent banner: "Changes apply to new launches only. N live instance(s) will keep their current config until reopened."

**Deletion gate:** deleting an entry with live instances shows a confirm modal. On confirm, the entry is marked `deleted: true` in ConfigService (soft delete; audit trail preserved), new launches are blocked, and a system toast in live instances suggests "this component has been retired; please reopen from the dock".

## 6. Dock integration — launch contract

`@marketsui/dock-editor-*` wires each menu item to a registry entry. Click behaviour:

```typescript
// simplified dispatcher — lives in @marketsui/component-host
async function launch(entry: RegistryEntry, params: Record<string, unknown> = {}) {
  // 1. Permission gate
  const user = await configServiceClient.currentUser();
  const missing = entry.requiredPermissions.filter(p => !user.permissions.includes(p));
  if (missing.length) throw new LaunchDenied('MISSING_PERMISSIONS', missing);

  // 2. Singleton resolution
  if (entry.singleton) {
    const existing = await fin.Platform.getCurrentSync().getWindowsByName(`mui-${entry.id}`);
    if (existing.length) { await existing[0].focus(); return; }
  }

  // 3. Build launch env
  const instanceId = crypto.randomUUID();
  const customData = {
    instanceId,
    appId,                              // host app
    configServiceUrl,                   // host app's config service
    componentRef: entry.id,
    componentParams: params,
  };

  // 4. Spawn
  const url = entry.type === 'internal'
    ? `${entry.entry}?${encode(customData)}`
    : entry.entry;                      // external owns its own URL

  await fin.Platform.getCurrentSync().createView({
    name: `mui-${entry.id}${entry.singleton ? '' : `-${instanceId}`}`,
    url,
    customData,
    defaultWidth:  entry.defaultSize.width,
    defaultHeight: entry.defaultSize.height,
    // …
  });
}
```

**External components** spawn with only the host app's `appId` + `configServiceUrl` injected; the external URL is responsible for reading its own `entry.appId` / `entry.configServiceUrl` and authenticating via `customData.externalAppCreds[entry.appId].apiKey`.

## 7. The Shell — `OpenFinHostContext`

Framework-agnostic contract lives in `@marketsui/component-host`:

```typescript
// packages/component-host/src/types.ts

export interface OpenFinHostContext {
  // ── Immutable launch env ────────────────────────────────────
  readonly instanceId: string;
  readonly appId: string;
  readonly configServiceUrl: string;
  readonly componentRef: string;          // registry entry id
  readonly componentParams: Readonly<Record<string, unknown>>;
  readonly schemaVersion: number;

  // ── Theme ───────────────────────────────────────────────────
  theme(): 'light' | 'dark';
  onThemeChange(cb: (t: 'light' | 'dark') => void): Unsubscribe;

  // ── Lifecycle (normalized across OpenFin events) ────────────
  onLifecycle(
    event: 'page-save' | 'page-load' | 'workspace-save' | 'workspace-load' | 'before-close',
    cb: (payload: LifecyclePayload) => void | Promise<void>,
  ): Unsubscribe;

  // ── Persistence (page-scoped k/v) ───────────────────────────
  savePageState<T>(key: string, state: T): Promise<void>;
  loadPageState<T>(key: string): Promise<T | null>;

  // ── Services — each usable independently ────────────────────
  readonly iab: IabService;
  readonly linking: LinkingService;       // FDC3 + custom channels
  readonly dataPlane: DataPlaneClient;    // from @marketsui/data-plane
  readonly config: ConfigServiceClient;
}

export type Unsubscribe = () => void;

export interface LifecyclePayload {
  kind: 'page-save' | 'page-load' | 'workspace-save' | 'workspace-load' | 'before-close';
  /** The shell invokes savers/loaders automatically; this payload is for observability + cancel. */
  state?: unknown;
  cancel?(reason: string): void;          // only valid for `before-close`
}
```

### React wrapper

```typescript
// packages/react/src/OpenFinHostProvider.tsx

export const OpenFinHostContext = createContext<OpenFinHostContext | null>(null);

export const OpenFinHostProvider: FC<PropsWithChildren<{ fallback?: ReactNode }>> = ({ children, fallback }) => {
  const [ctx, setCtx] = useState<OpenFinHostContext | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => { initializeHost().then(setCtx, setError); }, []);

  if (error) return <HostBootError err={error} />;
  if (!ctx)  return fallback ?? <LoadingShell />;
  return <OpenFinHostContext.Provider value={ctx}>{children}</OpenFinHostContext.Provider>;
};

export const useOpenFinHost = (): OpenFinHostContext => {
  const ctx = useContext(OpenFinHostContext);
  if (!ctx) throw new Error('useOpenFinHost outside OpenFinHostProvider');
  return ctx;
};

// Per-service hooks — preferred over useOpenFinHost() destructuring.
export const useDataPlane = () => useOpenFinHost().dataPlane;
export const useLinking   = () => useOpenFinHost().linking;
export const useIab       = () => useOpenFinHost().iab;
export const useConfig    = () => useOpenFinHost().config;
```

### Angular wrapper

```typescript
// packages/angular/src/openfin-host.service.ts

@Injectable({ providedIn: 'root' })
export class OpenFinHostService implements OpenFinHostContext {
  readonly instanceId!: string;
  readonly appId!: string;
  // … populated by APP_INITIALIZER; see below

  readonly iab       = inject(IabService);
  readonly linking   = inject(LinkingService);
  readonly dataPlane = inject(DATA_PLANE);
  readonly config    = inject(CONFIG_SERVICE);

  // …
}

// Separate DI tokens — consumers can inject just what they need.
export const DATA_PLANE     = new InjectionToken<DataPlaneClient>('dataPlane');
export const CONFIG_SERVICE = new InjectionToken<ConfigServiceClient>('configService');

// In app.config.ts:
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (host: OpenFinHostService) => () => host.initialize(),
      deps: [OpenFinHostService],
    },
    { provide: DATA_PLANE, useFactory: () => connect(/* worker URL */) },
    // …
  ],
};
```

## 8. ConfigService seeding

Goal: let a fresh `apps/config-service-server` come up with enough fixture data to run the demo apps without a real backend.

```
apps/config-service-server/
└── src/
    └── seed/
        ├── fixture.ts              exported typed seed object
        ├── seed.ts                 idempotent writer (upsert, never truncate)
        └── README.md
```

**Opt-in.** `SEED_DB=1 npm run start -w @marketsui/config-service-server`. Default = don't mutate. Prevents surprise overwrites when pointed at a real DB.

**Seed shape** (matches existing `AppUser / Role / Permission / ConfigRow`):

```typescript
export const fixture = {
  apps: [
    { id: 'tradingApp1', name: 'Trading App 1', owner: 'platform' },
  ],
  users: [
    { id: 'dev-alice', email: 'alice@dev.local', displayName: 'Alice' },
    { id: 'dev-bob',   email: 'bob@dev.local',   displayName: 'Bob' },
  ],
  roles: [
    { id: 'trader', permissions: ['blotter.view', 'blotter.edit'] },
    { id: 'platform-admin', permissions: ['registry.edit', '*'] },
  ],
  assignments: [
    { userId: 'dev-alice', appId: 'tradingApp1', roleId: 'trader' },
    { userId: 'dev-bob',   appId: 'tradingApp1', roleId: 'platform-admin' },
  ],
  registry: /* seed with blotter, chart, heatmap v2 entries */,
};
```

## 9. External component trust

When `type: 'external'`:

- The foreign app's ConfigService receives requests with `Authorization: Bearer <externalAppCreds[foreignAppId].apiKey>`.
- The foreign app validates the key + records the caller's `appId` for audit.
- Bearer keys are long-lived; rotation goes through a separate admin ticket (out of scope here).
- **No anonymous external components.** If a component ships without creds, it cannot be registered.

The registry editor's "Source: External" section surfaces a key-presence indicator pulled from `customData.externalAppCreds`; surfaces a warning if the required creds are missing.

## 10. Sequencing

**Week 1 — schema + migrations + scaffold script**
- `widget-sdk/src/registry/types.ts` v2 types + zod schema
- `widget-sdk/src/registry/migrations/v1-to-v2.ts` + tests
- `tools/scripts/scaffold-app.mjs` + doc
- `component-host/src/manifest-migrations/` skeleton

**Week 2 — wrapper + lifecycle**
- `component-host/src/types.ts` — `OpenFinHostContext` final shape
- `component-host/src/lifecycle.ts` — normalize page/workspace events
- `packages/react/` — new package, OpenFinHostProvider + per-service hooks
- `packages/angular/` — fill in OpenFinHostService + DI tokens + APP_INITIALIZER glue

**Week 3 — registry editor + dock dispatcher**
- `registry-editor-react` — new form sections (source / lifecycle / security / data plane)
- `registry-editor-angular` — same
- `component-host/src/dock-launcher.ts` — singleton resolution + permission gating
- `config-service-server/src/seed/` — fixture + opt-in flag
- E2E (demo-react + demo-angular): scaffold an app, register a component, launch from dock, confirm singleton focus behaviour

## 11. Open questions

1. **APP_INITIALIZER vs zone-less boot.** Angular 21 supports zone-less; we're using zones for now. The `APP_INITIALIZER` path above works either way but readers will need to know which one the reference app uses.
2. **Manifest migrations in production.** Running migrators against live `customData` is safe in dev; in prod, does the OpenFin admin tool expect manifests to be static? May need a migration runner that rewrites the manifest file on the wire rather than mutating in-memory.
3. **Permission wildcards.** `'*'` = all permissions works in the seed but opens `requiredPermissions.every(...)` check to surprises. Prefer a flat set of perms + a separate `isPlatformAdmin: boolean` flag?
4. **Bearer key rotation.** Out of scope for this plan but should not be deferred indefinitely — blocks production deployment.

## 12. Non-goals

- **No plugin marketplace.** Registry is org-internal.
- **No drag-to-install from URL.** Registrations go through the editor + ConfigService, audited.
- **No federated module loading.** External components are first-class OpenFin views; no Module Federation / dynamic import story yet.
- **No approval workflows.** Audit log is enough for now.

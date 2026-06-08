# Platform bootstrap config

How browser and OpenFin apps resolve **`appId`**, **`userId`**, and config-service settings before `ensurePlatformReady()` spawns the SharedWorker hub.

**Design spec:** [`../superpowers/specs/2026-05-28-data-services-hub-idataprovider-design.md`](../superpowers/specs/2026-05-28-data-services-hub-idataprovider-design.md)

---

## Unified shape

Every runtime resolves the same TypeScript interface (`PlatformBootstrapConfig` from `@starui/host-data`):

| Field | Required | Purpose |
|-------|----------|---------|
| `appId` | yes | SharedWorker name `mkt-data-services:${appId}` — **one value per deployment** |
| `userId` | yes | Session user for AppData, profiles, private provider rows |
| `useRest` | no | When `true`, enable REST config service (requires URL) |
| `configServiceRestUrl` | no | REST API base URL when `useRest === true` |
| `seedConfigUrl` | no | Seed JSON for empty Dexie (dev/demo). Seeds the auth/registry tables; if it also carries an `appConfig` array it restores the app's full component state (data providers, component registry, dock, workspaces, profile-sets). A Config Browser "Export ALL" bundle is a drop-in full-restore seed. Runs only against an empty DB. |
| `appDataBootstrap` | no | Declarative AppData hook ids + run policy (see below) |

---

## AppData bootstrap hooks

Seed AppData providers (entitlements, `SessionContext`, desk defaults) **after** the hub is ready. Hooks run on the **main thread** — implement them in a standard app file and reference stable ids from config.

### App registry — `src/platform/appDataBootstrap.ts`

```typescript
import type { AppDataBootstrapHookRegistry } from '@starui/host-data';

export const appDataBootstrapHooks: AppDataBootstrapHookRegistry = {
  'session-context': async (ctx) => {
    await ctx.upsertAppData({
      name: 'SessionContext',
      values: { userId: ctx.userId, entitlements: ['desk-a'] },
    });
  },
};
```

### Manifest — `app-config.json`

```json
{
  "appId": "stomp-marketsgrid-minimal",
  "userId": "dev1",
  "appDataBootstrap": {
    "onHubReady": ["session-context"],
    "runPolicy": "if-missing",
    "targets": { "session-context": ["SessionContext"] }
  }
}
```

| `runPolicy` | Behavior |
|-------------|----------|
| `if-missing` (default) | Skip hook when all `targets[hookId]` AppData providers exist with keys |
| `always` | Run on every trigger |
| `once-per-session` | Run at most once per browser tab session |

### Wire at bootstrap

```typescript
import { appDataBootstrapHooks } from './platform/appDataBootstrap.js';

const platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
  appDataBootstrapHooks,
});
```

Only **hook ids** are stored in JSON — never executable code.

**Interactive demo:** [`apps/demos/platform-hooks-demo`](../../apps/demos/platform-hooks-demo/) — `npm run dev:platform-hooks-demo` ([full testing guide](./platform-hooks-demo.md)).

---

## Web browser — `app-config.json`

Place at **`public/app-config.json`** (served as `/app-config.json`):

```json
{
  "appId": "markets-ui-dev",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "/seed-config.json"
}
```

### Loader

```typescript
import {
  resolvePlatformBootstrapFromJson,
  ensurePlatformReady,
} from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';

const config = await resolvePlatformBootstrapFromJson('/app-config.json');
export const platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
});
```

For tests or inline config, use `resolvePlatformBootstrapFromObject(raw)`.

### Rules

- **`appId` and `userId` must be stable** across every tab/window in the deployment.
- **`useRest`** gates REST mode (same semantics as OpenFin manifest — URL alone does not enable REST).
- Per-grid **`instanceId`** stays in route props / URL params — not in this file.

---

## OpenFin — manifest `customSettings`

Platform **`manifest.fin.json` → `customSettings`** (deployment-wide — same for every view):

```json
"customSettings": {
  "appId": "markets-ui-react-reference",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "http://localhost:5174/seed-config.json"
}
```

| Field | Scope | Notes |
|-------|--------|-------|
| `appId` | Platform | **Required** — SharedWorker name; must match across all views |
| `userId` | Session | Dev: manifest pin. **Prod:** SSO → platform provider forwards via `customData` on child spawns |
| `useRest` / `configServiceRestUrl` | Environment | Same gate as today (`resolveRestUrl`) |
| `seedConfigUrl` | Environment | Optional Dexie seed |

View **`customData`** carries per-window `instanceId` only — **not** hub `appId`.

### Loader

```typescript
import { resolvePlatformBootstrapFromManifest } from '@starui/openfin-platform/config';
import { ensurePlatformReady } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';

const config = await resolvePlatformBootstrapFromManifest();
export const platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
});
```

Outside OpenFin (plain browser import), `resolvePlatformBootstrapFromManifest()` returns `DEV_PLATFORM_BOOTSTRAP` without throwing.

Pure helper for tests: `resolvePlatformBootstrapFromCustomSettings(customSettings)`.

---

## Dev fallback

Tests and local harnesses may use `DEV_PLATFORM_BOOTSTRAP` from `@starui/host-data`:

```typescript
import { DEV_PLATFORM_BOOTSTRAP } from '@starui/host-data';
// { appId: 'TestApp', userId: 'dev1', useRest: false }
```

Replace hardcoded `LOGGED_IN_USER_ID` / `DEFAULT_APP_ID` literals as apps migrate (Phase 6). **`useHostedIdentity`** and **`DataHubProvider`** now expose bootstrap `appId` / `userId` via React context; `LOGGED_IN_USER_ID` in `@starui/types` is deprecated.

---

## Validation

`validatePlatformBootstrapConfig(config)` returns `{ valid, errors, warnings }`:

- **Errors:** empty `appId` or `userId` (blocks bootstrap)
- **Warnings:** `useRest: true` without `configServiceRestUrl`

Loaders throw `PlatformBootstrapConfigError` when validation fails.

---

## Pilot app — `apps/demos/markets-grid-lab`

Reference wiring (PR1b):

| File | Role |
|------|------|
| `public/app-config.json` | Web bootstrap config (`appId: markets-grid-lab`) |
| `src/platformBootstrap.ts` | `resolvePlatformBootstrapFromJson` → `ensurePlatformReady` |
| `src/main.tsx` | Async init, then `<DataHubProvider platform={platform} userId={config.userId}>` |

SharedWorker name: `mkt-data-services:markets-grid-lab` (from `app-config.json` `appId`).

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
| `seedConfigUrl` | no | Seed JSON for empty Dexie (dev/demo) |

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

See the same guide section in Session 5 (`resolvePlatformBootstrapFromManifest`). Platform `manifest.fin.json` carries deployment-wide identity; view `customData` carries per-window `instanceId` only.

---

## Dev fallback

Tests and local harnesses may use `DEV_PLATFORM_BOOTSTRAP` from `@starui/host-data`:

```typescript
import { DEV_PLATFORM_BOOTSTRAP } from '@starui/host-data';
// { appId: 'TestApp', userId: 'dev1', useRest: false }
```

Replace hardcoded `LOGGED_IN_USER_ID` / `DEFAULT_APP_ID` literals as apps migrate (Phase 6).

---

## Validation

`validatePlatformBootstrapConfig(config)` returns `{ valid, errors, warnings }`:

- **Errors:** empty `appId` or `userId` (blocks bootstrap)
- **Warnings:** `useRest: true` without `configServiceRestUrl`

Loaders throw `PlatformBootstrapConfigError` when validation fails.

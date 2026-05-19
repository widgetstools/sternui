# @stargrid/host-openfin (Phase 5 stub)

Optional OpenFin plugin — workspace, dock, registry, per-view profile.

## Planned API

```ts
import { openfinHostPlugin } from '@stargrid/host-openfin';

// Registered via @stargrid/app
<StarGridApp plugins={[openfinHostPlugin]} />
```

## Responsibilities

- `OpenFinRuntime` implementing `RuntimePort`
- Workspace init, dock persistence, tab rename
- `onWorkspaceSave` bridge for HostedMarketsGrid flush hooks
- **No exports consumed unless plugin is imported**

## Source

- `../../packages/shared/runtime/runtime-openfin/`
- `../../packages/shared/platform/openfin-platform/`
- OpenFin-specific code removed from `@stargrid/engine` and `@stargrid/grid`

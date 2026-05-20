# @starui/host-openfin (Phase 5 stub)

Optional OpenFin plugin — workspace, dock, registry, per-view profile.

## Planned API

```ts
import { openfinHostPlugin } from '@starui/host-openfin';

// Registered via @starui/app
<StarGridApp plugins={[openfinHostPlugin]} />
```

## Responsibilities

- `OpenFinRuntime` implementing `RuntimePort`
- Workspace init, dock persistence, tab rename
- `onWorkspaceSave` bridge for HostedMarketsGrid flush hooks
- **No exports consumed unless plugin is imported**

## Source

- Legacy parent-monorepo sources (pre-port reference):
  - `../../../../packages/shared/runtime/runtime-openfin/`
  - `../../../../packages/shared/platform/openfin-platform/`
- OpenFin-specific code removed from `@starui/engine` and `@starui/grid`

# Plan: Extract OpenFin Workspace into a Shared Package

## Goal
Move all OpenFin workspace initialization logic into `packages/openfin-workspace` so any app can call:
```ts
import { initWorkspace } from "@markets/openfin-workspace";
await initWorkspace({ appId: "my-app" });
```

## Current State
`apps/workspace/src/platform/` contains 7 files (Provider.tsx, dock.ts, home.ts, store.ts, launch.ts, notifications.ts, shapes.ts) totaling ~250 lines of OpenFin-specific initialization code tightly coupled to the workspace app.

## Package Structure

```
packages/openfin-workspace/
├── package.json          # @markets/openfin-workspace
├── tsconfig.json         # extends ../../tsconfig.base.json
├── src/
│   ├── index.ts          # public API: initWorkspace(), launchApp, types
│   ├── workspace.ts      # main orchestrator (init platform + components + teardown)
│   ├── dock.ts           # moved from apps/workspace/src/platform/dock.ts
│   ├── home.ts           # moved from apps/workspace/src/platform/home.ts
│   ├── store.ts          # moved from apps/workspace/src/platform/store.ts
│   ├── launch.ts         # moved from apps/workspace/src/platform/launch.ts
│   ├── notifications.ts  # moved from apps/workspace/src/platform/notifications.ts
│   └── types.ts          # shapes + WorkspaceConfig interface
```

## Public API

```ts
// packages/openfin-workspace/src/types.ts
export interface WorkspaceConfig {
  /** Theme palette override */
  theme?: {
    brandPrimary?: string;
    brandSecondary?: string;
    backgroundPrimary?: string;
  };
  /** Which components to enable (defaults to all) */
  components?: {
    home?: boolean;    // default true
    store?: boolean;   // default true
    dock?: boolean;    // default true
    notifications?: boolean; // default true
  };
  /** Progress callback for UI status updates */
  onProgress?: (message: string) => void;
}

// packages/openfin-workspace/src/index.ts
export { initWorkspace } from "./workspace";
export { launchApp } from "./launch";
export type { WorkspaceConfig, PlatformSettings, CustomSettings } from "./types";
```

### `initWorkspace(config?)` does:
1. Reads manifest custom settings (id, title, icon, apps)
2. Calls `init()` from `@openfin/workspace-platform` with theme + custom actions
3. Waits for `platform-api-ready`
4. Registers Home, Store, Dock, Notifications (based on `config.components`)
5. Shows Home
6. Registers `close-requested` teardown handler
7. Calls `config.onProgress?.()` at each step

No React dependency — pure async function.

## Changes to `apps/workspace`

### Before (Provider.tsx ~154 lines):
```tsx
// 70 lines of React UI + 80 lines of init logic
import { register as registerDock } from "./dock";
// ... manual orchestration
```

### After (Provider.tsx ~40 lines):
```tsx
import { initWorkspace } from "@markets/openfin-workspace";

function Provider() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    initWorkspace({ onProgress: setMessage });
  }, []);
  // ... just the UI card
}
```

- Delete `apps/workspace/src/platform/dock.ts`
- Delete `apps/workspace/src/platform/home.ts`
- Delete `apps/workspace/src/platform/store.ts`
- Delete `apps/workspace/src/platform/launch.ts`
- Delete `apps/workspace/src/platform/notifications.ts`
- Delete `apps/workspace/src/platform/shapes.ts`
- Simplify `apps/workspace/src/platform/Provider.tsx` to just UI + `initWorkspace()` call

## Monorepo Changes

### Root `package.json`
Add `packages/*` to workspaces:
```json
"workspaces": ["apps/*", "packages/*"]
```

### `apps/workspace/package.json`
Add dependency:
```json
"@markets/openfin-workspace": "*"
```
Remove direct `@openfin/workspace` and `@openfin/workspace-platform` deps (they come from the package).

## Build
The package uses TypeScript with `"composite": true` for project references. No bundler needed — apps import the source directly via the workspace resolution (`"main": "src/index.ts"`).

## Steps
1. Create `packages/openfin-workspace/` with package.json + tsconfig
2. Move platform files from `apps/workspace/src/platform/` → `packages/openfin-workspace/src/`
3. Create `workspace.ts` orchestrator with `initWorkspace()`
4. Create `index.ts` public API barrel
5. Update `types.ts` with `WorkspaceConfig` interface
6. Update root `package.json` workspaces
7. Update `apps/workspace/package.json` to depend on `@markets/openfin-workspace`
8. Rewrite `apps/workspace/src/platform/Provider.tsx` to use `initWorkspace()`
9. Delete old platform files from `apps/workspace/`
10. Run `npm install` to link the workspace package

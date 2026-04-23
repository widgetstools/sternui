# Markets React OpenFin Starter — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Reference:** [built-on-openfin/frontend-framework-starter/frameworks/react](https://github.com/built-on-openfin/frontend-framework-starter/tree/main/frameworks/react)

## Overview

An exact replication of all 4 React sub-projects from the OpenFin frontend-framework-starter, with two changes:
1. **Vite** instead of CRA for container and workspace (web and WPS already use Vite)
2. **shadcn/ui components** instead of the original's custom CSS utility classes

All OpenFin APIs, FDC3 patterns, manifest structures, and application logic are replicated exactly as-is.

## Decisions

| Decision | Choice |
|---|---|
| Build tool | Vite (all 4 apps) |
| UI components | shadcn/ui (Tailwind-based) |
| Project structure | npm workspaces monorepo |
| View content | Exact match to original (View1/View2/View3 with same FDC3 demos) |
| OpenFin API usage | Identical to original |

---

## 1. Project Structure

```
markets/
├── package.json                    # npm workspaces root
├── tsconfig.base.json              # shared TS config
├── .gitignore
├── apps/
│   ├── container/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── launch.mjs
│   │   ├── public/
│   │   │   └── platform/manifest.fin.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── index.css
│   │       ├── App.tsx
│   │       ├── platform/
│   │       │   ├── Provider.tsx
│   │       │   └── WithScript.tsx
│   │       ├── views/
│   │       │   ├── View1.tsx
│   │       │   ├── View2.tsx
│   │       │   └── View3.tsx
│   │       ├── types/
│   │       │   ├── fin.d.ts
│   │       │   └── fdc3.d.ts
│   │       ├── components/ui/       # shadcn components
│   │       └── lib/
│   │           └── utils.ts         # cn() helper
│   ├── workspace/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── launch.mjs
│   │   ├── public/
│   │   │   ├── platform/manifest.fin.json
│   │   │   └── views/
│   │   │       ├── view1.fin.json
│   │   │       └── view2.fin.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── index.css
│   │       ├── App.tsx
│   │       ├── platform/
│   │       │   ├── Provider.tsx
│   │       │   ├── shapes.ts
│   │       │   ├── home.ts
│   │       │   ├── store.ts
│   │       │   ├── dock.ts
│   │       │   ├── notifications.ts
│   │       │   └── launch.ts
│   │       ├── views/
│   │       │   ├── View1.tsx
│   │       │   └── View2.tsx
│   │       ├── types/
│   │       │   ├── fin.d.ts
│   │       │   └── fdc3.d.ts
│   │       ├── components/ui/
│   │       └── lib/
│   │           └── utils.ts
│   ├── web/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── iframe-broker.html
│   │   ├── public/
│   │   │   ├── default.layout.fin.json
│   │   │   └── manifest.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── index.css
│   │       ├── config.ts
│   │       ├── provider.ts
│   │       ├── iframe-broker.ts
│   │       ├── components/ui/
│   │       └── lib/
│   │           └── utils.ts
│   └── workspace-platform-starter/
│       ├── package.json
│       ├── vite.config.ts
│       ├── rollup.config.mjs
│       ├── tsconfig.json
│       ├── index.html
│       ├── public/
│       │   ├── manifest.fin.json
│       │   ├── apps.json
│       │   └── splash.html
│       ├── openfin/
│       │   ├── framework/            # WPS framework (external, gitignored)
│       │   └── modules/              # Custom OpenFin modules
│       └── src/
│           ├── main.tsx
│           ├── app.tsx
│           ├── index.css
│           ├── Provider.tsx
│           ├── hooks/
│           │   ├── useOpenFin.tsx
│           │   ├── usePlatformState.tsx
│           │   └── useRaiseIntent.tsx
│           ├── views/
│           │   ├── View1.tsx
│           │   └── View2.tsx
│           ├── components/ui/
│           └── lib/
│               └── utils.ts
└── docs/
```

Each app has its own `components/ui/` and `lib/utils.ts` for shadcn (standard shadcn project structure). No shared package needed — each app is self-contained like the original.

---

## 2. Container App (`apps/container/`)

Exact replica of `frameworks/react/container/`. Basic platform init, FDC3 context sharing, notifications.

### Entry Point (`src/main.tsx`)

React Router routes (identical to original):
- `/` → `App` (landing page with instructions to run `npm run client`)
- `/views/view1` → `View1` wrapped with `WithScript` (loads Anywhere shim)
- `/views/view2` → `View2` wrapped with `WithScript`
- `/views/view3` → `View3` (no shim)
- `/platform/provider` → `Provider` (lazy loaded)

### `src/App.tsx`
Landing page displaying instructions. Uses shadcn `Card` and `Button` instead of raw HTML.

### `src/platform/Provider.tsx`
- Calls `fin.Platform.init({})` on mount
- Displays runtime version from `fin.System.getRuntimeInfo()`
- Uses shadcn `Card` for layout

### `src/platform/WithScript.tsx`
HOC that dynamically injects `<script>` tag into DOM head. Loads the Anywhere shim URL: `https://built-on-openfin.github.io/web-starter/web/v23.0.0/web-client-api/js/shim.api.bundle.js`. Identical logic to original.

### `src/views/View1.tsx` — FDC3 Broadcaster
- `broadcastFDC3Context()` — broadcasts `fdc3.instrument` (MSFT) via `fdc3.broadcast()`
- `broadcastFDC3ContextAppChannel()` — broadcasts on `"CUSTOM-APP-CHANNEL"` with AAPL instrument via `fdc3.getOrCreateChannel()`
- Uses shadcn `Button`, `Card`, `Badge` instead of raw styled buttons

### `src/views/View2.tsx` — FDC3 Listener
- `listenForFDC3Context()` — `fdc3.addContextListener(null, callback)` for user channel
- `listenForFDC3ContextAppChannel()` — listens on `"CUSTOM-APP-CHANNEL"` app channel
- Displays received context as formatted JSON
- Uses shadcn `Card`, `Button`, `ScrollArea`

### `src/views/View3.tsx` — Notifications
- `Notifications.register()` on mount, listens for `notification-action`
- `showNotification()` creates transient toast with a button
- Uses shadcn `Button`, `Card`

### Type Declarations
- `src/types/fin.d.ts` — declares global `fin` from `@openfin/core`
- `src/types/fdc3.d.ts` — declares global `fdc3` from `@finos/fdc3`

### OpenFin Manifest (`public/platform/manifest.fin.json`)
- Runtime: `43.142.101.2`, security realm `react-container-starter`
- UUID: `react-container-starter`
- Provider URL: `http://localhost:5173/platform/provider`
- Snapshot: single window with 3 stacked views (view1, view2, view3) in a row layout
- All views: `fdc3InteropApi: "2.0"`, `currentContextGroup: "green"`

### `launch.mjs`
Node script using `@openfin/node-adapter` (`connect`/`launch`). Identical to original.

### Styling
- `src/index.css` — Tailwind base + shadcn CSS variables for dark/light theme
- OpenFin theme integration: CSS variables map `--theme-*` fallbacks alongside Tailwind variables
- The original's `.row`, `.col`, `.fill`, `.gap10` etc. replaced with Tailwind utility classes

---

## 3. Workspace App (`apps/workspace/`)

Exact replica of `frameworks/react/workspace/`. Full workspace platform with Home, Store, Dock, Notifications.

### Entry Point (`src/main.tsx`)

React Router routes:
- `/` → `App`
- `/views/view1` → `View1` (no WithScript — runs natively in OpenFin)
- `/views/view2` → `View2`
- `/platform/provider` → `Provider`

### `src/App.tsx`
Landing page (same pattern as container). shadcn Card.

### `src/platform/Provider.tsx`
1. Reads `customSettings` from OpenFin manifest via `fin.Application.getCurrent().getManifest()`
2. Initializes workspace platform via `@openfin/workspace-platform init()`:
   - Default window options (icon, favicon, pages)
   - Theme: `brandPrimary: '#0A76D3'`, `backgroundPrimary: '#1E1F23'` (same as original)
   - Custom `"launch-app"` action handler
3. On `platform-api-ready`: `registerHome()` + `Home.show()`, `registerStore()`, `registerDock()`, `registerNotifications()`
4. On `close-requested`: deregisters all components, quits

### `src/platform/shapes.ts`
```typescript
interface CustomSettings { apps?: App[] }
interface PlatformSettings { id: string; title: string; icon: string }
```

### `src/platform/home.ts`
- `HomeProvider` with `onUserInput` mapping apps to `HomeSearchResult[]` via `CLITemplate.SimpleText`
- `onResultDispatch` launches selected app
- Supports manifest types: view, snapshot, manifest, external

### `src/platform/store.ts`
- Navigation: single "Apps" → "All Apps" section
- Landing page with top row grid
- Footer with platform icon and title
- `launchApp` callback

### `src/platform/dock.ts`
- `Dock.register()` with workspace components: home, store, notifications, switchWorkspace
- "Apps" dropdown button with app icons

### `src/platform/notifications.ts`
`Notifications.register()` from `@openfin/workspace/notifications`

### `src/platform/launch.ts`
App launcher supporting all manifest types:
- `AppManifestType.Snapshot` → `platform.applySnapshot()`
- `AppManifestType.View` → `platform.createView()`
- `AppManifestType.External` → `fin.System.launchExternalProcess()`
- Default → `fin.Application.startFromManifest()`

### `src/views/View1.tsx` — Notifications + FDC3 Broadcaster
- Notifications: register, listen for actions, create transient toast (uses `@openfin/notifications` directly)
- FDC3 broadcast on user channel (MSFT instrument)
- FDC3 broadcast on app channel `"CUSTOM-APP-CHANNEL"` (AAPL instrument)
- shadcn `Button`, `Card`, `Badge`

### `src/views/View2.tsx` — FDC3 Listener
- `fdc3.addContextListener()` for user channel
- `fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL").addContextListener()` for app channel
- Displays received context as JSON
- shadcn `Card`, `Button`, `ScrollArea`

### Manifests
- `public/platform/manifest.fin.json`: Runtime 43.142.101.2, UUID `react-workspace-starter`, `preventQuitOnLastWindowClosed: true`, `customSettings.apps` with view1 and view2 app definitions
- `public/views/view1.fin.json`: FDC3 2.0, context group green
- `public/views/view2.fin.json`: FDC3 2.0, context group green

---

## 4. Web App (`apps/web/`)

Exact replica of `frameworks/react/web/`. Browser-only via `@openfin/core-web`.

### Build Configuration (`vite.config.ts`)
- `vite-plugin-static-copy` copies `shared-worker.js` from `@openfin/core-web/out/shared-worker.js` to `dist/assets/`
- Multi-page build via rollup input: `index.html` + `iframe-broker.html`

### `src/config.ts`
```typescript
export const SHARED_WORKER_URL = '/assets/shared-worker.js';
export const BROKER_URL = '/iframe-broker.html';
export const LAYOUT_URL = '/default.layout.fin.json';
```

### `src/provider.ts`
1. Fetches `default.layout.fin.json` as `WebLayoutSnapshot`
2. Gets `#layout_container` DOM element
3. `connect()` from `@openfin/core-web`:
   - `connectionInheritance: "enabled"`
   - `brokerUrl` → iframe-broker
   - `interopConfig`: providerId `"web-layout-basic"`, contextGroup `"green"`
   - `platform: { layoutSnapshot }`
4. `fin.Interop.init("web-layout-basic")`
5. `fin.Platform.Layout.init({ container })`

### `src/iframe-broker.ts`
`initBrokerConnection()` from `@openfin/core-web/iframe-broker` with shared worker URL.

### `src/main.tsx`
Calls `init()` from provider, renders `<App />`. Imports `@openfin/core-web/styles.css`.

### `src/App.tsx`
Header + `<main id="layout_container" />`. Uses shadcn for the header.

### Layout (`public/default.layout.fin.json`)
2x2 grid of views, each loading `https://example.com`. Each view has `web.frameName` to disable interop inheritance. `showMaximiseIcon: true`.

### PWA Manifest (`public/manifest.json`)
Interop config: sharedWorkerUrl, brokerUrl, providerId, defaultContextGroup.

---

## 5. Workspace Platform Starter App (`apps/workspace-platform-starter/`)

Exact replica of `frameworks/react/workspace-platform-starter/`. WPS framework wrapper with custom React hooks.

### Build
- `vite.config.ts`: Port 8080, path alias `workspace-platform-starter` → `./openfin/framework`
- `rollup.config.mjs`: Builds 30+ OpenFin module bundles from `./openfin/modules/*`

### Entry (`src/main.tsx` + `src/app.tsx`)
React Router:
- `/` → `Provider`
- `/view1` → `View1`
- `/view2` → `View2`

### `src/Provider.tsx`
Calls `useOpenFin()` hook. Displays platform provider message. shadcn Card.

### Custom React Hooks

**`src/hooks/useOpenFin.tsx`**
1. Opens splash screen via `platformSplashProvider.open()`
2. Creates logger via `createLogger("Provider")`
3. Gets platform sync: `fin.Platform.getCurrentSync()`
4. On `platform-api-ready`, calls `bootstrap()` + `initializePlatform()` from WPS framework
5. Closes splash on completion
6. `useRef` prevents double init in StrictMode

**`src/hooks/usePlatformState.tsx`**
- Creates/joins FDC3 app channel by topic name
- Broadcasts `"workspace.platformState"` context with payload
- Listens for changes, returns `[value, setValue]` tuple
- Cleans up on unmount

**`src/hooks/useRaiseIntent.tsx`**
Memoized callback: `window.fdc3.raiseIntent(intentName, context)`

### `src/views/View1.tsx`
Three buttons (shadcn Button + Card):
- "View Contact" → `raiseIntent('ViewContact', { type: 'fdc3.contact', ... })`
- "View Quote" → `raiseIntent('ViewQuote', { type: 'custom.instrument', ... })`
- "Set global state" → `usePlatformState` broadcasts "Hello World!" on "demo" channel

### `src/views/View2.tsx`
Displays current value from `usePlatformState("demo")`. shadcn Card.

### Manifests
- `public/apps.json`: Two inline-view apps (view-1, view-2), FDC3 2.0
- `public/manifest.fin.json` (~500 lines): Full WPS manifest — same structure as original with UUID `workspace-platform-starter-react-wrapper`
- `public/splash.html`: Splash screen with `fin.InterApplicationBus.Channel.connect()` for progress

### OpenFin Framework (`openfin/`)
- `framework/` — WPS framework (external, gitignored)
- `modules/` — Custom modules built by rollup

---

## 6. Dependencies

### Root `package.json`
```json
{
  "name": "markets",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:container": "npm run dev -w apps/container",
    "dev:workspace": "npm run dev -w apps/workspace",
    "dev:web": "npm run dev -w apps/web",
    "dev:wps": "npm run dev -w apps/workspace-platform-starter",
    "build": "npm run build --workspaces",
    "client:container": "npm run client -w apps/container",
    "client:workspace": "npm run client -w apps/workspace"
  }
}
```

### `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

### Per-App Dependencies

**All apps share:**
- React 19.x, React DOM 19.x
- TypeScript 5.8+
- Vite 6.x
- `@finos/fdc3@2.0.3`
- Tailwind CSS 4.x
- `tailwind-merge`, `clsx`, `class-variance-authority` (for shadcn)
- `lucide-react` (shadcn icons)

**Container:**
- `@openfin/core@43.101.2`
- `@openfin/workspace@23.0.20`
- `@openfin/notifications@2.13.1`
- `@openfin/node-adapter@43.101.2`
- `react-router-dom@7.x`
- shadcn components: Button, Card, Badge, ScrollArea

**Workspace:**
- `@openfin/core@43.101.2`
- `@openfin/workspace@23.0.20`
- `@openfin/workspace-platform@23.0.20`
- `@openfin/notifications@2.13.1`
- `@openfin/node-adapter@43.101.2`
- `react-router-dom@7.x`
- shadcn components: Button, Card, Badge, ScrollArea

**Web:**
- `@openfin/core-web@0.43.113`
- shadcn components: Button, Card

**WPS:**
- `@openfin/workspace@23.0.20`
- `@openfin/workspace-platform@23.0.20`
- `@openfin/cloud-interop@0.43.113`
- `@openfin/openid-connect@1.0.0`
- `@openfin/snap-sdk@1.3.4`
- `react-router-dom@7.x`
- shadcn components: Button, Card, Badge

---

## 7. shadcn/ui Integration

Each app uses shadcn/ui components initialized per-app (standard shadcn setup):
- `components/ui/` — generated shadcn components
- `lib/utils.ts` — `cn()` helper using `clsx` + `tailwind-merge`
- `index.css` — Tailwind directives + shadcn CSS variables

The original's custom CSS utilities (`.row`, `.col`, `.fill`, `.gap10`, `.pad10`, etc.) are replaced with Tailwind equivalents:
- `.row` → `flex flex-row`
- `.col` → `flex flex-col`
- `.fill` → `flex-1`
- `.gap10` → `gap-2.5`
- `.pad10` → `p-2.5`
- `.middle` → `items-center`
- `.spread` → `justify-between`

The original's themed CSS variables (`--theme-*` fallback pattern) are preserved in each app's `index.css` alongside shadcn's CSS variable system, so OpenFin theming still works.

---

## 8. Error Handling

Identical to original:
- Views wrap OpenFin API calls in try/catch
- Platform providers handle initialization failures
- FDC3 operations check `typeof fin !== 'undefined'` and `typeof fdc3 !== 'undefined'`

---

## 9. Out of Scope

- Testing infrastructure (original has none)
- CI/CD
- Trading-themed content (exact match to original demos)
- Shared package (each app is self-contained like original)

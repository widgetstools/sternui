# Consumer apps: SharedWorker + Tailwind pitfalls

Reference for apps under `apps/*` that consume `@starui/*` bucket tarballs via Vite
(`staruiConsumerVite.mjs`, `staruiConsumerAliases.mjs`, `tailwindContentGlobs.mjs`).

This documents issues hit in `markets-ui-react-reference` (OpenFin workspace) after the
repo flatten and bucket-tarball migration, and the patterns that prevent recurrence.

---

## SharedWorker (`@starui/host-data`)

### Symptoms

| Console / behaviour | Likely cause |
|---|---|
| `Failed to fetch a worker script` | Worker URL points at a prebundled `.vite/deps/` chunk or tarball `dist/` path Vite cannot serve as a worker entry |
| `[@starui/host-data] SharedWorker error event` | Worker script failed to load or threw during boot |
| Blank page / infinite loading on routes using data services | `appData.ready()` never resolves → `ConfigManager.init()` hangs → `StarGridApp` returns `null` |
| `useDataServices must be inside <DataServicesProvider>` | Duplicate `@starui/host-data-react` module from Vite prebundle (broken React context) |

### Root causes (there were three)

#### 1. Worker URL must be constructed at the **app call site**

Vite's worker plugin only recognises the literal pattern:

```ts
new SharedWorker(new URL('./sharedWorker/entry.ts', import.meta.url), {
  type: 'module',
  name: 'mkt-data-services:<app-id>',
});
```

**Do not** use `createDataServicesClient()` from `@starui/host-data` in Vite apps. That
factory lives inside the library; once Vite prebundles `@starui/host-data` into
`node_modules/.vite/deps/`, `import.meta.url` resolves to the deps chunk and the worker
URL 404s.

**Do** follow the mockdata demo pattern:

- `src/dataServices.ts` (or `dataServices.mainThread.ts`) — construct `SharedWorker` + call
  `bootstrapDataServices({ worker, configManager, ... })`
- `src/sharedWorker/entry.ts` — app-local worker entry that calls `installSharedWorkerHub`

See:

- `apps/markets-ui-react-reference/src/dataServices.mainThread.ts`
- `apps/markets-ui-react-reference/src/sharedWorker/entry.ts`
- `apps/demo-apps/mockdata-provider-starui-app/src/dataServices.ts`

Pass REST config to the worker via query param on the script URL (main thread reads
OpenFin manifest once; worker reads `self.location.search`):

```ts
const workerUrl = new URL('./sharedWorker/entry.ts', import.meta.url);
if (configServiceRestUrl) {
  workerUrl.searchParams.set('configServiceRestUrl', configServiceRestUrl);
}
```

#### 2. Worker boot race — register `onconnect` before any `await`

When the main thread runs `new SharedWorker(...)`, the browser fires `connect`
immediately. If the worker entry does:

```ts
await configManager.init();
await installSharedWorkerHub({ configManager }); // onconnect registered here — TOO LATE
```

…the first port is **dropped**. Main thread sends `appdata-attach`; hub never receives it;
`appData.ready()` hangs forever.

**Fix (app worker entry):**

```ts
const configManager = createConfigManager({ ... });
const installed = installSharedWorkerHub({ configManager }); // sync: registers onconnect
await configManager.init();
await installed;
```

**Fix (library — `@starui/host-data`):** `installSharedWorkerHub` registers `onconnect`
synchronously and queues ports until `hydrateAppData()` completes. After changing
`packages/data/host-data`, run `npm run propagate -- data` so installed tarballs pick up
the new `dist/`.

#### 3. Vite `optimizeDeps` must exclude host-data packages

Prebundling breaks worker URLs **and** duplicates React context for `host-data-react`.

In `scripts/staruiConsumerAliases.mjs` → `staruiOptimizeDeps().exclude`:

- `@starui/host-data`, `@starui/host-data/runtime`
- `@starui/host-data-react`, `@starui/host-data-react/runtime`
- Bucket paths: `@starui/data/host-data`, `@starui/data/host-data-react`, etc.

Apps must pass `{ worker: true }` to `staruiConsumerViteConfig`:

```ts
const staruiPartial = staruiConsumerViteConfig(appDir, { worker: true });
```

### Route layout (OpenFin tool windows)

Tool routes (`/dataproviders`, `/config-browser`, `/workspace-setup`, …) should **not**
be wrapped in `<StarGridApp>`. They only need `<DataServicesProvider>`.

Grid/workspace views (`/blotters/marketsgrid`, `/views/view1`, …) keep the
`StarGridApp` shell.

### Checklist — new app using data services

1. [ ] `vite.config.ts` uses `staruiConsumerViteConfig(appDir, { worker: true })`
2. [ ] App-local `src/sharedWorker/entry.ts` (not library `createDataServicesClient`)
3. [ ] `new SharedWorker(new URL('./sharedWorker/entry.ts', import.meta.url), …)` in app code
4. [ ] Worker entry calls `installSharedWorkerHub()` **before** `await configManager.init()`
5. [ ] Stable worker `name`: `mkt-data-services:<app-id>` (same app → same worker)
6. [ ] After library changes: `npm run propagate -- data` + clear `.vite` cache
7. [ ] Tool routes outside `StarGridApp`; single `<DataServicesProvider>` ancestor for editors

### Debugging

**Browser / Vite dev**

```bash
rm -rf apps/<app>/node_modules/.vite
npm run dev --workspace=apps/<app>
```

Network tab: worker script should be something like  
`http://localhost:5174/src/sharedWorker/entry.ts` — **not** `.vite/deps/chunk-*.js`.

**OpenFin** (see `apps/markets-ui-react-reference/public/platform/manifest.fin.json`)

- Remote debugging: `--remote-debugging-port=9090` + `devtools_port: 9090`
- Chrome → `chrome://inspect` → configure `localhost:9090`
- Look for SharedWorker named `mkt-data-services:<app-id>`
- Worker console should log `ConfigManager initialised` and `hub waiting for ports`

**Quick sanity check**

```ts
await dataServices.ready; // must resolve, not hang
```

---

## Tailwind CSS

### Symptoms

| Symptom | Likely cause |
|---|---|
| PostCSS / Tailwind config load error mentioning `import.meta` | ESM-only code imported from `tailwind.config.js` (jiti cannot evaluate it) |
| Library UI unstyled (missing utilities in `@starui/ui`, grids, widgets) | `content` globs don't scan tarball paths under `node_modules/@starui/...` |
| Styles worked before flatten/tarball migration, broken after | Stale relative paths (e.g. old `starui-platform/packages/...`) in `content` |
| Vite warning: `duration-[120ms] is ambiguous` | Harmless Tailwind 3.x warning; escape as `duration-&lsqb;120ms&rsqb;` or ignore |

### Root cause: PostCSS loads Tailwind config through jiti

Tailwind 3 loads `tailwind.config.js` via PostCSS → **jiti**, which does **not** support
`import.meta` or other ESM-only constructs in the config graph.

**Do**

- Keep `postcss.config.cjs` as **CommonJS** (`.cjs` extension).
- Import static content globs from `scripts/tailwindContentGlobs.mjs` (relative paths
  only — no runtime `import.meta.url` resolution in the config file itself).
- Use `platformAppTailwindContent` / `demoAppTailwindContent` from that file.

**Don't**

- Import `staruiConsumerAliases.mjs` or anything that uses `import.meta` from
  `tailwind.config.js`.
- Use dynamic glob builders that rely on `import.meta.url` inside Tailwind config.

Example (`apps/markets-ui-react-reference/tailwind.config.js`):

```js
import { tailwindPreset } from '@starui/design-system/tailwind';
import { platformAppTailwindContent } from '../../scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...platformAppTailwindContent,
  ],
};
```

`postcss.config.cjs` should include `tailwindcss/nesting` before `tailwindcss` when Monaco
/ nested CSS is pulled in (see `apps/markets-ui-react-reference/postcss.config.cjs`).

### Root cause: tarball installs change where source lives

Apps depend on bucket tarballs (`file:../../libs/starui-react-ui-….tgz`). Tailwind must
scan **both**:

1. Monorepo workspace paths (`packages/react-ui/ui/src/...`) — for dev against source
2. Installed bucket paths (`node_modules/@starui/react-ui/ui/src|dist/...`) — for tarball
   layout

`scripts/tailwindContentGlobs.mjs` lists both. When adding a new package with Tailwind
classes:

1. Add workspace glob under `packages/...`
2. Add matching `node_modules/@starui/<bucket>/<member>/...` globs (src **and** dist when
   the package ships compiled JS)

For dynamic resolution (optional), `scripts/staruiTailwindContent.cjs` builds absolute
globs from the app directory — **CommonJS only**, safe for PostCSS.

### Checklist — Tailwind in a consumer app

1. [ ] `tailwind.config.js` uses `tailwindPreset` from `@starui/design-system/tailwind`
2. [ ] `content` includes `./src/**` + `platformAppTailwindContent` (or `demoAppTailwindContent`)
3. [ ] `postcss.config.cjs` (not `.js` with `"type": "module"` pitfalls)
4. [ ] No `import.meta` in the Tailwind config import graph
5. [ ] After adding/changing a UI package: update `scripts/tailwindContentGlobs.mjs`
6. [ ] After `npm run propagate`: restart dev server (Tailwind caches file scans in dev)

### After structural changes (flatten, tarball migration, path moves)

1. Search for stale paths: `starui-platform/`, wrong `../` depth in tailwind globs
2. Clear Vite cache: `rm -rf apps/<app>/node_modules/.vite`
3. Restart dev server on the port OpenFin manifest expects (`5174` for reference app)
4. Verify a known utility from `@starui/ui` (e.g. shadcn `border-border`) appears in
   compiled CSS in DevTools

---

## Related scripts

| Script | Purpose |
|---|---|
| `scripts/staruiConsumerVite.mjs` | Shared Vite partial; pass `{ worker: true }` for SharedWorker apps |
| `scripts/staruiConsumerAliases.mjs` | Tarball aliases, React dedupe, `optimizeDeps.exclude` |
| `scripts/tailwindContentGlobs.mjs` | Static Tailwind `content` globs (PostCSS-safe) |
| `scripts/staruiTailwindContent.cjs` | Dynamic absolute globs (CJS; optional) |
| `npm run propagate -- <bucket>` | Repack tarball after library changes |

---

## Quick recovery command block

When either SharedWorker or Tailwind behaves oddly after a big repo change:

```bash
# Repack libraries you changed
npm run propagate -- data react-core

# Clean Vite prebundle (fixes worker URL + duplicate React context)
rm -rf apps/markets-ui-react-reference/node_modules/.vite

# Single dev server on the manifest port
lsof -ti :5174 | xargs kill -9 2>/dev/null || true
npm run dev:openfin:markets-react
```

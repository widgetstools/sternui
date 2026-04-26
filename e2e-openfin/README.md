# `e2e-openfin/` — OpenFin-driven end-to-end tests

True end-to-end tests for the OpenFin platform layer of marketsui-platform.
Each spec launches a real OpenFin runtime via `@openfin/node-adapter`,
connects to a running dev server, and drives platform APIs to assert
behaviour observable from outside the runtime.

This is a different stratum from the Vitest integration tests inside each
package (e.g. `packages/openfin-platform/src/workspace-persistence.test.ts`):

| Layer | Where | Runtime | Speed | Coverage |
|---|---|---|---|---|
| Integration | `packages/*/src/*.test.ts` | Node + jsdom, OpenFin stubbed | <2s for full suite | Logic of one module against real-shape inputs |
| **E2E (this folder)** | `e2e-openfin/specs/*.e2e.spec.ts` | Real OpenFin runtime | 30–60s per spec | The override is wired to OpenFin's public API and round-trips through ConfigService |

These specs are intentionally NOT part of the default `npm test` run — see
"CI implications" below.

---

## Pre-requisites

1. **Markets-UI dev server reachable at `http://localhost:5174`.** In a
   separate terminal run:
   ```
   npm run dev -w @marketsui/markets-ui-react-reference
   ```
   The dev server installs the test bridge (`apps/markets-ui-react-reference/src/test-bridge/install.ts`) only when `import.meta.env.DEV === true`, so this flow doesn't apply to production builds.

2. **OpenFin runtime.** `@openfin/node-adapter` auto-downloads the runtime
   binary (~100MB) on first launch. After that it's cached under
   `%LOCALAPPDATA%/OpenFin` (Windows) or `~/.openfin` (macOS/Linux).

3. **A display.** OpenFin doesn't run headless. On Linux CI you need
   `xvfb-run` or similar; on Windows runners you need `windows-latest`
   with desktop session enabled. macOS GUI runners work directly.

4. Workspace install up to date:
   ```
   npm ci --legacy-peer-deps
   ```

## Running

From the repo root:

```
npm run test:e2e:openfin
```

…which is shorthand for `npm test -w @marketsui/e2e-openfin`. To target a
non-default manifest URL:

```
MUI_MANIFEST_URL=http://localhost:5174/platform/manifest.fin.json npm run test:e2e:openfin
```

Each spec runs sequentially (`pool: 'forks'`, `singleFork: true` in
`vitest.config.ts`) — multiple OpenFin platforms racing for ports and
shared Dexie DBs would just confuse each other.

## How it works

1. Spec `beforeAll` calls `launchPlatform(manifestUrl)` from `helpers/platform.ts`.
2. `launchPlatform` invokes `@openfin/node-adapter`'s `launch()` to boot
   the runtime against the supplied manifest, then `connect()` to obtain
   a `fin` proxy over a local websocket.
3. The provider window loads `/platform/provider`, which calls `initWorkspace()`. In dev mode it then dynamically imports
   `apps/markets-ui-react-reference/src/test-bridge/install.ts` which
   creates an OpenFin Channel named `marketsui-test-bridge`.
4. The helper's `BridgeClient` connects to that channel and exposes
   typed methods (`saveWorkspace`, `getWorkspaces`, `getWorkspace`,
   `deleteWorkspace`, `ping`).
5. Each spec calls those methods, which the bridge proxies into
   `WorkspacePlatform.getCurrentSync().Storage.*` — these route through
   the override in `packages/openfin-platform/src/workspace-persistence.ts`
   which writes/reads ConfigService rows.
6. `afterAll` quits the platform.

## CI implications

These tests are **not** part of the default CI build. The existing
[`.github/workflows/`](../.github/workflows/) pipelines run unit tests
and Playwright (against `apps/demo-react`); they don't have OpenFin
runtime, a display, or a markets-ui dev server alive.

If you want to wire these into CI:

- Use `windows-latest` (or macOS) runners with desktop session enabled
- Install OpenFin runtime ahead of time (or accept the first-launch
  download cost in your CI time budget)
- Spin up the markets-ui dev server (`npm run dev -w @marketsui/markets-ui-react-reference &`) and `wait-on http://localhost:5174`
- Then run `npm run test:e2e:openfin`
- Expect 1–2 minute runtimes per spec file; cache the OpenFin runtime
  download between runs

## Adding a new spec

1. Drop a file at `specs/<your-name>.e2e.spec.ts`.
2. Use `launchPlatform()` in `beforeAll` and `quit()` in `afterAll`.
3. If you need new bridge actions, add them to
   `apps/markets-ui-react-reference/src/test-bridge/install.ts` AND
   `e2e-openfin/helpers/platform.ts`'s `BridgeClient` interface.

## Files

```
e2e-openfin/
├── README.md                          (this file)
├── package.json                       (workspace; test script + node-adapter dep)
├── vitest.config.ts                   (long timeouts, sequential, node env)
├── helpers/
│   └── platform.ts                    (launchPlatform + BridgeClient typed wrapper)
└── specs/
    └── workspace-persistence.e2e.spec.ts  (Phase 1 — workspace round-trip)
```

The bridge's in-app side lives at:
```
apps/markets-ui-react-reference/src/test-bridge/install.ts
```

…installed lazily from `Provider.tsx` only when `import.meta.env.DEV` is
true (the dev server). Never present in production bundles.

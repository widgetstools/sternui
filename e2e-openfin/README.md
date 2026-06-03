# `@starui/e2e-openfin`

OpenFin e2e harness — Playwright runner attached over CDP to an
OpenFin runtime spawned via `@openfin/node-adapter`.

Replaces the legacy Vitest+bridge-channel harness now archived at
[`apps/tarball/e2e-openfin-vitest/`](../apps/tarball/e2e-openfin-vitest/).
Same test-runner API (Playwright) as the browser e2e suite so fixtures
and helpers can flow between the two over time.

## Run

```bash
# Local — spawns apps/tarball/e2e-openfin-workspace dev server on :5181
# then launches OpenFin against the e2e manifest variant.
npm run test:e2e:openfin

# Headed (provider window visible)
npm --prefix e2e-openfin run test:e2e:headed
```

## How it works

1. Playwright's `webServer` block boots
   [`@starui/e2e-openfin-workspace`](../apps/tarball/e2e-openfin-workspace/) on
   port 5181 (Vite dev). `reuseExistingServer: true` so an already-
   running dev session is reused.
2. The `launchOpenFin` fixture calls
   [`@openfin/node-adapter`'s `launch()`](https://developer.openfin.co/)
   with `MANIFEST_URL` pointing at
   `http://localhost:5181/platform/manifest.e2e.fin.json`.
3. The e2e manifest's `runtime.arguments` declares
   `--remote-debugging-port=9191`. The fixture polls
   `http://127.0.0.1:9191/json/version` until the runtime is ready,
   then attaches Playwright via `chromium.connectOverCDP()`.
4. The fixture finds the blotter view's tab and produces a Playwright
   `Page` for it. Specs receive that page via the `blotterPage`
   fixture.

## Env overrides

| Var | Default | Purpose |
|---|---|---|
| `OPENFIN_MANIFEST_URL` | `http://localhost:5181/platform/manifest.e2e.fin.json` | Override to point at a different deployment |
| `OPENFIN_CDP_PORT` | `9191` | Must match the manifest's `--remote-debugging-port` |

## Adding a spec

```ts
import { test, expect } from '../fixtures/launchOpenFin';

test('something useful', async ({ blotterPage }) => {
  await expect(blotterPage.getByTestId('openfin-workspace-blotter')).toBeVisible();
});
```

The `blotterPage` is a regular Playwright `Page` — same API as the
browser harness uses against `apps/tarball/e2e-browser-blotter`. Helpers from
`/e2e/helpers/` (profile manipulation, settings sheet) work against
either.

## Concurrency

`workers: 1` in `playwright.config.ts` and the platform fixture is
worker-scoped — one OpenFin runtime serves every test in the run.
Parallel CDP attachments to the same OpenFin runtime are not
supported, so don't lift this constraint.

# OpenFin E2E — Research notes

> **Status (2026-05-19):** Implemented in `e2e-openfin/`. See [`e2e-openfin/README.md`](../e2e-openfin/README.md).

## Core constraint

OpenFin runtime is Chromium under the hood, so Playwright connects to
it via `chromium.connectOverCDP()` — same as Electron / Chrome remote
debugging.

Since OpenFin v13+, Chromedriver no longer pre-assigns the debugging
port. You must launch OpenFin **before** the test starts on a chosen
debugging port and then connect to that port. Same constraint applies
to Playwright.

Reference: <https://github.com/testable/openfin-wdio-testable-example>

## Three-step flow

1. Launch OpenFin via RVM/CLI with `--remote-debugging-port=9090`
   baked into the manifest's `runtime.arguments` (see
   `apps/markets-ui-react-reference/public/platform/manifest.fin.json`).
2. Poll `http://localhost:9090/json/version` until the CDP endpoint
   is up — implemented in `e2e-openfin/helpers/cdp.ts`.
3. `chromium.connectOverCDP('http://localhost:9090')` — then iterate
   `browser.contexts()[0].pages()` to find the platform provider,
   your views, and the dock. Covered by `specs/cdp-smoke.e2e.spec.ts`.

## Decisions (resolved)

| Question | Decision |
|---|---|
| Where does the suite live? | `e2e-openfin/` workspace (`@starui/e2e-openfin`), separate from browser Playwright `e2e/`. |
| Launch strategy | **Primary:** `@openfin/node-adapter` + IAB test bridge (`marketsui-test-bridge`). **Secondary:** Playwright CDP attach for multi-window UI specs. |
| Manifest | Use dev manifest URL `http://localhost:5174/platform/manifest.fin.json`; `--remote-debugging-port=9090` already set. |
| Dev server | `globalSetup.ts` auto-starts `@starui/markets-ui-react-reference` if port 5174 is down. |
| Bridge polling | `Channel.connect()` blocks until the channel exists — each attempt is raced with 750ms timeout (see `helpers/platform.ts`). |
| CI | Not in default CI (needs display + OpenFin runtime). Use `windows-latest` or macOS GUI + `xvfb-run` on Linux. |
| Test bridge location | `@starui/host-wrapper-react/test-bridge` (installed from `Provider.tsx` when `import.meta.env.DEV`). |

## Reference implementations

- **`openfin/hello-openfin-selenium-example`** — launch script pattern for `--remote-debugging-port`
- **`testable/openfin-wdio-testable-example`** — multi-window enumeration
- **Playwright Electron tests** — multi-context patterns for platform + views + dock

## Remaining work

- Cross-window specs (parent + popout + dock) via Playwright CDP
- Visual reference capture under OpenFin (or keep browser-only)
- Wire `test:e2e:openfin` into CI with cached OpenFin runtime download

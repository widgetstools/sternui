# Building the StarUI monorepo

Step-by-step guide for a **fresh machine**. See also [README.md](../README.md#getting-started) and [LIBS.md](./LIBS.md).

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | 10.x (`npm ci` — not yarn/pnpm) |
| Git | any recent |

Optional for e2e: Chromium (Playwright installs via `npx playwright install`).

---

## Build matrix (three layers)

There are **three separate build surfaces**. Run them in order when validating a full consumer release.

| Layer | What | Command (repo root) | Output |
|-------|------|---------------------|--------|
| **1. Packages** | `@starui/*` libraries under `packages/` | `npm run build:packages` | `packages/*/*/dist/` (and grid consumed as source) |
| **2. Tarballs** | Architecture-bucket `.tgz` under `libs/` | `npm run propagate` | `libs/starui-*.tgz` (gitignored) |
| **3a. Apps — installed mode** | Consumer / publish parity (`apps/demos/*`) | `npm run build:apps` | `apps/demos/<app>/dist/` |
| **3b. Apps — source mode** | Live `packages/` source, `STARUI_DEV_SOURCE=1` (`apps/demos/*`) | `npm run build:apps-source` | `apps/demos/<app>/dist/` |

Apps live **once** under `apps/demos/*`; "installed" vs "source" is a build
**mode** (which script runs), not a separate folder. See
[apps/README.md](../apps/README.md).

**Install apps** (nested workspace) after `libs/` exists:

```bash
npm run install:apps    # npm ci --prefix apps
```

`npm run install:apps` alone **fails** on a fresh clone until `libs/` exists.

---

## 1. Build packages (libraries)

From repo root:

```bash
npm ci
npm run build:packages
```

Equivalent inside `npm run install:all` / `bootstrap` (step 1).

**Unit tests (packages only):**

```bash
npm test
# or: npm run test:packages
```

**Typecheck libraries only:**

```bash
npm run typecheck:packages
```

---

## 2. Pack tarballs (`libs/`)

`libs/` is **not** in git. Generate it locally:

```bash
npm run build:packages
npm run propagate
```

`propagate` builds buckets, writes `libs/*.tgz`, runs `sync:app-deps` (updates every `apps/demos/*` `file:libs/…` dep), and refreshes installs.

Force rebuild:

```bash
npm run bootstrap -- --force
```

---

## 3a. Build apps — installed mode (CI / consumer parity)

Validates that apps work like external consumers (Artifactory / MCP) — `@starui/*`
resolved from the installed `file:libs/*.tgz` tarballs.

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run build:apps
```

**CI-equivalent one-liner:**

```bash
npm run verify:consumer
```

(`verify:consumer` = packages build → propagate → `install:apps` → **installed-mode app production builds**.)

**Typecheck apps (optional):**

```bash
npm run typecheck:apps
```

App `tsc` may report duplicate `@types/react` errors when TypeScript resolves `@starui/grid` via the **root** workspace link instead of the installed bucket tarball. Production **`vite build` / `ng build`** is the supported consumer check; library types are covered by `npm run typecheck:packages`.

---

## 3b. Build apps — source mode (live `packages/` source)

Builds the same `apps/demos/<app>/` with `STARUI_DEV_SOURCE=1` (same Vite aliases as `npm run dev:*`).

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run build:apps-source
```

**Typecheck apps — source mode (optional):**

```bash
npm run typecheck:apps-source
```

**Run a dev server (source mode):**

```bash
npm run dev:demo-react          # @starui/demo-react (dev:source)
npm run dev:markets-grid-lab    # @starui/markets-grid-lab (dev:source)
```

See [apps/demos/README.md](../apps/demos/README.md).

---

## App modes (one folder)

| Mode | Resolves `@starui/*` from | Per-app script | Root `npm run dev:*` |
|------|---------------------------|----------------|----------------------|
| **Installed** | `file:libs/*.tgz` (consumer parity) | `dev` / `build` | — |
| **Source** | `packages/` via `STARUI_DEV_SOURCE=1` | `dev:source` / `build:source` | uses this |

Every app lives once under `apps/demos/<app>/` with the clean consumer name
(`@starui/demo-react`, …). Angular (`demo-angular`) and the node
`stomp-view-server` are installed-only (no Vite source mode).

---

## Fresh clone (full setup)

```bash
git clone <repo-url> starui
cd starui
npm run install:all
```

Runs **`bootstrap`**: `npm ci` → `build:packages` → `propagate` → `npm ci --prefix apps`.

If `libs/` already exists, bootstrap **skips** rebuild unless:

```bash
npm run bootstrap -- --force
```

### Packages only (faster)

```bash
npm ci
npm run build:packages
npm test
```

Add apps later:

```bash
npm run propagate
npm run install:apps
```

---

## After changing `packages/`

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

Commit `apps/package-lock.json` and any `apps/**/package.json` touched by propagate. Do **not** commit `libs/`.

---

## Build everything

```bash
npm run build:all
```

Runs `build:consumer` (packages + propagate + install apps) then **`build:apps`** (installed) and **`build:apps-source`**.

---

## Clean reinstall

```bash
npm run clean
npm run install:all
```

---

## Quick reference

| Goal | Commands |
|------|----------|
| Fresh clone, everything | `npm run install:all` |
| Libraries only | `npm ci` → `npm run build:packages` → `npm test` |
| Consumer CI (installed) | `npm run verify:consumer` |
| App bundles — installed mode | `npm run build:apps` |
| App bundles — source mode | `npm run build:apps-source` |
| Run demo (dev, source mode) | `npm run dev` (`@starui/demo-react` via `dev:source`) |
| Refresh tarballs | `npm run build:packages` → `npm run propagate` → `npm run install:apps` |

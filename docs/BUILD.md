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
| **3a. Tarball apps** | Consumer install path (`apps/tarball/*`) | `npm run build:apps-tarball` | `apps/tarball/<app>/dist/` |
| **3b. Workspace apps** | Dev track (`apps/workspace/*`) | `npm run build:apps-workspace` | `apps/workspace/<app>/dist/` |

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

`propagate` builds buckets, writes `libs/*.tgz`, runs `sync:app-deps` (updates **both** `apps/tarball/*` and `apps/workspace/*` `file:libs/…` deps), and refreshes installs.

Force rebuild:

```bash
npm run bootstrap -- --force
```

---

## 3a. Build tarball apps (CI / consumer parity)

Validates that apps work like external consumers (Artifactory / MCP), using **`apps/tarball/<app>/`** only.

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run build:apps-tarball
```

**CI-equivalent one-liner:**

```bash
npm run verify:consumer
```

(`verify:consumer` = packages build → propagate → `install:apps` → **tarball app production builds**.)

**Typecheck tarball apps (optional):**

```bash
npm run typecheck:apps-tarball
```

App `tsc` may report duplicate `@types/react` errors when TypeScript resolves `@starui/grid` via the **root** workspace link instead of the installed bucket tarball. Production **`vite build` / `ng build`** is the supported consumer check; library types are covered by `npm run typecheck:packages`.

---

## 3b. Build workspace apps (dev track)

Validates production bundles for **`apps/workspace/<app>/`** with `STARUI_DEV_SOURCE=1` (same Vite aliases as `npm run dev:*`).

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run build:apps-workspace
```

**Typecheck workspace apps (optional):**

```bash
npm run typecheck:apps-workspace
```

**Run a dev server (workspace track):**

```bash
npm run dev:demo-react          # @starui/demo-react-workspace
npm run dev:markets-grid-lab    # @starui/markets-grid-lab-workspace
```

See [apps/workspace/README.md](../apps/workspace/README.md).

---

## App tracks (folder layout)

| Track | Path | `propagate` reinstall | Root `npm run dev:*` |
|-------|------|------------------------|----------------------|
| **Tarball** | `apps/tarball/<app>/` | Yes | No (use workspace) |
| **Workspace** | `apps/workspace/<app>/` | Skipped for install churn | Yes |

Pair names: e.g. `@starui/demo-react` (tarball) vs `@starui/demo-react-workspace` (workspace). Special case: `@starui/e2e-openfin-workspace` (tarball) vs `@starui/e2e-openfin-workspace-ws` (workspace).

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

Runs `build:consumer` (packages + propagate + install apps) then **`build:apps-tarball`** and **`build:apps-workspace`**.

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
| Tarball consumer CI | `npm run verify:consumer` |
| Tarball app bundles | `npm run build:apps-tarball` |
| Workspace app bundles | `npm run build:apps-workspace` |
| Both app tracks | `npm run build:apps` |
| Run demo (dev) | `npm run dev` (workspace `@starui/demo-react-workspace`) |
| Refresh tarballs | `npm run build:packages` → `npm run propagate` → `npm run install:apps` |

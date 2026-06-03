# Building the StarUI monorepo

Step-by-step guide for a **fresh machine**. See also [README.md](../README.md#getting-started) and [LIBS.md](./LIBS.md).

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | 10.x (`npm ci` — not yarn/pnpm) |
| Git | any recent |

Optional for e2e: Chromium (Playwright installs via `npx playwright install`).

## 1. Clone

```bash
git clone <repo-url> sternui
cd sternui
```

`libs/` is **not** in git. You will generate it locally (step 2).

## 2. Install dependencies

### Full install (libraries + all demo apps) — recommended

```bash
npm run install:all
```

Runs `bootstrap`: `npm ci` (packages) → `build:packages` → `propagate` (creates `libs/*.tgz`) → `npm ci --prefix apps`.

If `libs/` already exists, bootstrap **skips** rebuild/propagate. After changing `packages/`, refresh tarballs and apps:

```bash
npm run bootstrap -- --force
```

## App tracks (tarball vs workspace)

Mirrors `tutorials-tarball/` vs `tutorials-workspace/`:

| Track | Paths | Purpose |
|-------|--------|---------|
| **Tarball** | `tutorials-tarball/*`, `consumer-tarball/*`, `legacy/*`, `e2e/*`, top-level consumer apps | Installs `file:libs/*.tgz`; **CI** (`build:apps-tarball`); `propagate` syncs these only |
| **Workspace** | `tutorials-workspace/*`, `consumer-workspace/*` | Dev with `STARUI_DEV_SOURCE=1`; **skipped** by propagate reinstall/sync |

Daily UI work: `npm run build:packages -- --filter=@starui/design-system` then  
`STARUI_DEV_SOURCE=1 npm run dev:…` under `consumer-workspace/` (no propagate / no `npm ci --prefix apps`).

Tarball validation (before release): `npm run build:consumer` or propagate + `npm run build:apps-tarball`.

| Phase | What happens |
|-------|----------------|
| Root `npm ci` | ~687 packages — `packages/*`, tooling |
| `propagate` | Packs buckets into gitignored `libs/` |
| Apps `npm ci` | ~762 packages — demos from those tarballs |

### Packages only (no demos, faster)

```bash
npm ci
```

Add demos later:

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

`npm run install:apps` alone **fails** on a fresh clone until `libs/` exists.

## 3. Build libraries

```bash
npm run build:packages
```

(Already run by `install:all` / `bootstrap`.)

## 4. Run unit tests (libraries)

```bash
npm test
```

## 5. Run a demo app

Requires full install (step 2).

```bash
npm run dev
```

Default: `@starui/demo-react` at http://localhost:5190.

## 6. Build demo apps (production bundles)

```bash
npm run install:all
npm run build:apps
```

Or CI-equivalent:

```bash
npm ci
npm run verify:consumer
```

(`verify:consumer` runs `build:packages`, `propagate`, `install:apps`, then builds/typechecks apps.)

## 7. After changing code under `packages/`

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

Commit `apps/package-lock.json` and any `apps/**/package.json` touched by propagate. Do **not** commit `libs/`.

## 8. Rebuild `libs/` only

```bash
npm run bootstrap -- --force
```

## 9. Clean reinstall

```bash
npm run clean
npm run install:all
```

## Quick reference

| Goal | Commands |
|------|----------|
| Fresh clone, everything | `npm run install:all` |
| Libraries only | `npm ci` → `npm run build:packages` → `npm test` |
| Run demo | `npm run install:all` → `npm run dev` |
| CI parity | `npm ci` → `npm run verify:consumer` |
| Refresh tarballs | `npm run build:packages` → `npm run propagate` → `npm run install:apps` |

# Building the StarUI monorepo

Step-by-step guide for a **fresh machine**. See also [README.md](../README.md#getting-started).

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

You should see `libs/*.tgz` and `libs/manifest.json` in the tree (committed artifacts).

## 2. Install dependencies

### Full install (libraries + all demo apps)

```bash
npm run install:all
```

| Step | Command | Result |
|------|---------|--------|
| Root | `npm ci` | ~687 packages — `packages/*`, tooling, `e2e-openfin` |
| Apps | `npm ci --prefix apps` | ~762 packages — demos from `libs/*.tgz` |

### Packages only (faster — no demos)

```bash
npm ci
```

Add apps later with `npm run install:apps`.

## 3. Build libraries

```bash
npm run build:packages
```

Compiles every package under `packages/` (Turbo, respects `^build` order).

## 4. Run unit tests (libraries)

```bash
npm test
```

## 5. Run a demo app

Requires step 2 **full install** (or `npm run install:apps` after `npm ci`).

```bash
npm run dev
```

Default: `@starui/demo-react` at http://localhost:5190.

Other entry points: `npm run dev:markets-grid-lab`, `npm run dev:platform-hooks-demo`, etc. (see root `package.json` `dev:*` scripts).

## 6. Build demo apps (production bundles)

```bash
npm run install:all
npm run build:apps
```

Or CI-equivalent:

```bash
npm run verify:consumer
```

## 7. After changing code under `packages/`

Apps consume **bucket tarballs**, not live workspace links (unless `STARUI_DEV_SOURCE=1` in dev).

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

Commit:

- `libs/` (updated `.tgz` + `manifest.json`)
- `package-lock.json` (root, if propagate touched it)
- `apps/package-lock.json`
- Any `apps/**/package.json` rewritten by propagate

## 8. Repair broken install

Missing tarballs or stale `libs/`:

```bash
npm run bootstrap -- --force
```

## 9. Clean reinstall

```bash
npm run clean
npm run install:all
npm run build:packages
```

## Quick reference

| Goal | Commands |
|------|----------|
| Fresh clone, everything | `npm run install:all` |
| Libraries only | `npm ci` → `npm run build:packages` → `npm test` |
| Run demo | `npm run install:all` → `npm run dev` |
| CI parity | `npm run install:all` → `npm run verify:consumer` |
| Refresh consumer tarballs | `npm run build:packages` → `npm run propagate` → `npm run install:apps` |

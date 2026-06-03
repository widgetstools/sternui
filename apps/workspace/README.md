# Apps — workspace (dev) track

Each app here is the **daily development** copy. Production bundles use the same `file:libs/*.tgz` dependencies as tarball apps, but **`npm run dev`** sets `STARUI_DEV_SOURCE=1` so Vite resolves `@starui/*` from live **`packages/`** source (after `npm run build:packages`).

## Build (from repo root)

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run build:apps-workspace
```

`build:apps-workspace` runs `vite build` / `ng build` in each folder here with `STARUI_DEV_SOURCE=1`.

## Dev servers

Root scripts point at workspace package names (usually `*-workspace`):

```bash
npm run dev:demo-react
npm run dev:markets-grid-lab
npm run dev:tutorial-basic
```

Full list: root [`package.json`](../../package.json) `dev:*` scripts.

## Pairing

Every folder here mirrors [`../tarball/<same-name>/`](../tarball/) for CI. See [`../README.md`](../README.md).

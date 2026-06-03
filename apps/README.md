# Consumer apps (`apps/`)

Every demo app exists in **two tracks**:

| Track | Folder | npm name pattern | Purpose |
|-------|--------|------------------|---------|
| **Workspace** | [`workspace/<app>/`](./workspace/) | often `*-workspace` suffix | Day-to-day dev — `STARUI_DEV_SOURCE=1` resolves `@starui/*` from `packages/` |
| **Tarball** | [`tarball/<app>/`](./tarball/) | unsuffixed consumer name | CI / external parity — installs `file:../../../libs/starui-*.tgz` |

Root scripts target the **workspace** copy for `npm run dev:*`. CI and `npm run verify:consumer` build the **tarball** copy.

See **[`docs/BUILD.md`](../docs/BUILD.md)** for the full build matrix (packages → libs → apps).

## Quick commands (from repo root)

```bash
# 1) Libraries
npm run build:packages

# 2) Bucket tarballs + sync app package.json deps
npm run propagate
npm run install:apps          # or: npm install --prefix apps (after lockfile drift)

# 3) Production bundles
npm run build:apps-tarball    # CI track — apps/tarball/*
npm run build:apps-workspace  # dev track — apps/workspace/* (STARUI_DEV_SOURCE=1)

# 4) CI parity (tarball build only)
npm run verify:consumer
```

## Nested workspace

[`apps/package.json`](./package.json) declares `workspace/*` and `tarball/*`. Install with:

```bash
npm ci --prefix apps
```

Commit **`apps/package-lock.json`** when propagate updates `file:libs/*.tgz` paths. Do **not** commit `libs/`.

## Utilities

| Path | Role |
|------|------|
| [`grid-config/`](./grid-config/) | Shared grid profile JSON (not an npm package) |
| [`../scripts/build-app-track.mjs`](../scripts/build-app-track.mjs) | Runs `build` / `typecheck` per app under one track |

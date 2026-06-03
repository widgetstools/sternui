# `libs/` — committed bucket tarballs

Demo and tutorial apps install StarUI as **architecture-bucket tarballs**
(`file:../../libs/starui-*.tgz`), not workspace `"*"`. This folder is **tracked
in git** so `npm ci` at the repo root works on a fresh clone.

| File | Role |
|------|------|
| `manifest.json` | Maps `@starui/<bucket>` → tarball filename + member packages |
| `starui-*-<sha8>.tgz` | One packed bundle per bucket under `packages/` |

## Install layout

- **Root** `npm ci` — `packages/*`, `tools/mcp-scaffold`, `e2e-openfin` only (~700 packages).
- **Apps** `npm run install:apps` — `npm ci` in `apps/` using `apps/package-lock.json` (~760 packages).
- **Both** `npm run install:all` from the repo root.

## Refresh after package changes

```bash
npm run build:packages
npm run propagate          # or: npm run build:consumer (includes install:apps)
git add libs/ package-lock.json apps/package-lock.json apps/**/package.json
```

CI runs `npm run check:tarballs` to fail when committed tarballs are stale
relative to `packages/` build output.

## Repair local install

If `libs/` was deleted locally:

```bash
npm run bootstrap -- --force
```

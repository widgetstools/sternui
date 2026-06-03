# `libs/` — committed bucket tarballs

Demo and tutorial apps install StarUI as **architecture-bucket tarballs**
(`file:../../libs/starui-*.tgz`), not workspace `"*"`. This folder is **tracked
in git** so `npm ci` at the repo root works on a fresh clone.

| File | Role |
|------|------|
| `manifest.json` | Maps `@starui/<bucket>` → tarball filename + member packages |
| `starui-*-<sha8>.tgz` | One packed bundle per bucket under `packages/` |

## Refresh after package changes

```bash
npm run build:packages
npm run propagate          # or: npm run build:consumer
git add libs/ package-lock.json apps/**/package.json
```

CI runs `npm run check:tarballs` to fail when committed tarballs are stale
relative to `packages/` build output.

## Repair local install

If `libs/` was deleted locally:

```bash
npm run bootstrap -- --force
```

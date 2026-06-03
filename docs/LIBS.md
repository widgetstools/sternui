# `libs/` — local bucket tarballs (not in git)

Demo apps under `apps/` install StarUI as **architecture-bucket tarballs**
(`file:../../libs/starui-*.tgz`). The `libs/` directory is **gitignored**;
generate it locally with `npm run propagate` or `npm run bootstrap`.

| File | Role |
|------|------|
| `manifest.json` | Maps `@starui/<bucket>` → tarball filename + member packages |
| `starui-*-<sha8>.tgz` | One packed bundle per bucket under `packages/` |

## Generate on a fresh clone

```bash
npm ci
npm run bootstrap
```

Or manually:

```bash
npm ci
npm run build:packages
npm run propagate
npm run install:apps
```

## After package changes

```bash
npm run build:packages
npm run propagate
npm run install:apps
```

Commit `apps/package-lock.json` and any `apps/**/package.json` updated by propagate.
Do **not** commit `libs/` (ignored).

# `libs/` — local bucket tarballs (not in git)

Demo apps under `apps/` install StarUI as **architecture-bucket tarballs**
(`file:../../libs/starui-*.tgz`). The `libs/` directory is **gitignored**;
generate it locally with `npm run propagate` or `npm run bootstrap`.

| File | Role |
|------|------|
| `manifest.json` | Maps `@starui/<bucket>` → tarball filename + member packages |
| `starui-<bucket>.tgz` | One packed bundle per bucket under `packages/` (stable name, no version/hash) |

## Generate on a fresh clone

```bash
npm install
npm run bootstrap
```

Or manually:

```bash
npm install
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

Nothing tarball-related needs committing: `libs/` is ignored, the app
`package.json` `file:` pins are stable (they don't change across re-packs),
and **lockfiles are not committed** (each environment regenerates its own on
`npm install`).

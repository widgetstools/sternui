# Apps — tarball (consumer) track

Each app here installs StarUI from **`file:../../../libs/starui-*.tgz`**, matching external consumers and MCP scaffolds. **`propagate`** syncs these `package.json` deps and refreshes `node_modules` after packs.

## Build (from repo root)

```bash
npm run build:packages
npm run propagate
npm run install:apps
npm run build:apps-tarball
```

This is what **`npm run verify:consumer`** runs (CI parity).

## Typecheck (optional)

```bash
npm run typecheck:apps-tarball
```

Prefer **`build:apps-tarball`** for release gates; app-level `tsc` can conflict with the root workspace `@starui/grid` link. Library typing is enforced via `npm run typecheck:packages`.

## Pairing

Every folder here mirrors [`../workspace/<same-name>/`](../workspace/) for local dev. See [`../README.md`](../README.md).

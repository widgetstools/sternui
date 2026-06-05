# Consumer / reference apps (`apps/`)

These are **demo / reference apps only** — they are never deployed; only the
`packages/*` get published. Each app lives **once** under
[`demos/<app>/`](./demos/) and runs in either of **two modes** (same folder,
chosen by which script you run):

| Mode | Command | How `@starui/*` resolves |
|------|---------|--------------------------|
| **Installed** (consumer / publish parity) | `npm run dev` · `npm run build` | from the installed `file:../../../libs/starui-*.tgz` tarballs — what a real consumer (future artifactory) sees |
| **Source** (day-to-day dev) | `npm run dev:source` · `npm run build:source` | `STARUI_DEV_SOURCE=1` → Vite aliases `@starui/*` straight to `packages/` source |

The mode is a single env var (`STARUI_DEV_SOURCE`) consumed by
[`../scripts/staruiConsumerAliases.mjs`](../scripts/staruiConsumerAliases.mjs);
both modes share the same `file:libs/*.tgz` deps, so nothing in `package.json`
changes between them. Angular (`demo-angular`) and the node `stomp-view-server`
have no Vite source mode — they run installed-only.

Root `npm run dev:*` scripts use **source** mode. CI and
`npm run verify:consumer` build the **installed** mode.

See **[`docs/BUILD.md`](../docs/BUILD.md)** for the full build matrix (packages → libs → apps).

## Quick commands (from repo root)

```bash
# 1) Libraries
npm run build:packages

# 2) Bucket tarballs + sync app package.json deps + install apps
npm run propagate
npm run install:apps          # or: npm install --prefix apps (after lockfile drift)

# 3) Production bundles
npm run build:apps            # installed mode (consumer parity) — apps/demos/*
npm run build:apps-source     # source mode (STARUI_DEV_SOURCE=1)  — apps/demos/*

# 4) CI parity (installed build)
npm run verify:consumer
```

## Nested workspace

[`apps/package.json`](./package.json) declares `demos/*`. Install with:

```bash
npm install --prefix apps
```

Lockfiles aren't committed (each environment regenerates its own on `npm install`),
and the app `file:libs/*.tgz` pins are stable across re-packs — so propagate
leaves nothing to commit here. Do **not** commit `libs/`.

## Utilities

| Path | Role |
|------|------|
| [`grid-config/`](./grid-config/) | Shared grid profile JSON (not an npm package) |
| [`../scripts/build-app-track.mjs`](../scripts/build-app-track.mjs) | Runs `build` / `typecheck` for every app in one mode (`installed` \| `source`) |

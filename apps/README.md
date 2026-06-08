# Consumer / reference apps (`apps/`)

Demo and reference apps only — never deployed; only `packages/*` get published.
Each app lives **once** under [`demos/<app>/`](./demos/).

**Source mode is the default** (Vite aliases `@starui/*` to live `packages/`).
**Tarball mode** (`STARUI_USE_TARBALLS=1` or `*:installed` scripts) matches
what external consumers see from `file:libs/*.tgz`.

Full instructions (root + in-app commands): **[`../README.md` — Running apps](../README.md#running-apps--source-mode-vs-tarball-mode)**.

## Quick reference

### Setup (once)

```bash
# from repo root
npm run install:all
# or: npm install && npm run build:packages && npm run propagate && npm run install:apps
```

### Source mode (default)

| Where | Dev | Build |
|-------|-----|-------|
| **Repo root** | `npm run dev:demo-react` · `npm --prefix apps run dev -w @starui/demo-react` | `npm run build:apps` |
| **App folder** | `cd apps/demos/demo-react && npm run dev` | `npm run build` |

### Tarball mode (consumer parity)

| Where | Dev | Build |
|-------|-----|-------|
| **Repo root** | `npm --prefix apps run dev:installed -w @starui/demo-react` | `npm run build:apps:installed` |
| **App folder** | `cd apps/demos/demo-react && npm run dev:installed` | `npm run build:installed` |

CI: `npm run verify:consumer` from repo root.

## Nested workspace

[`apps/package.json`](./package.json) declares `demos/*`. Install from root with
`npm run install:apps`. Lockfiles are gitignored — do **not** commit `libs/`.

## Utilities

| Path | Role |
|------|------|
| [`grid-config/`](./grid-config/) | Shared grid profile JSON (not an npm package) |
| [`../scripts/build-app-track.mjs`](../scripts/build-app-track.mjs) | Runs `build` / `typecheck` for every app in one mode (`source` \| `installed`) |

See **[`docs/BUILD.md`](../docs/BUILD.md)** for the full build matrix.

# Demo apps (`apps/demos/`)

Each folder is one consumer/reference app. Apps install StarUI from
`file:../../../libs/starui-*.tgz` (synced by `npm run propagate`).

## Running an app

**Source mode (default)** — `@starui/*` from live `packages/`:

```bash
cd apps/demos/demo-react
npm run dev
npm run build
```

**Tarball mode** — `@starui/*` from installed bucket tarballs:

```bash
cd apps/demos/demo-react
npm run dev:installed
npm run build:installed
```

From the **repo root**, use `npm run dev:demo-react` (source) or
`npm --prefix apps run dev:installed -w @starui/demo-react` (tarball).

Full guide: **[`../../README.md` — Running apps](../../README.md#running-apps--source-mode-vs-tarball-mode)**.

## CI parity

From repo root:

```bash
npm run verify:consumer
```

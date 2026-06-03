# Consumer apps — workspace (dev) track

Apps here use **`STARUI_DEV_SOURCE=1`** on `npm run dev`. Vite resolves `@starui/*` from
`packages/` source after `npm run build:packages` — **propagate does not reinstall** these
apps when bucket tarballs change.

Tarball-validation copies of the same demos belong under `consumer-tarball/` (or `legacy/`
until migrated). CI consumer builds use the tarball track only (`npm run build:apps-tarball`).

## Apps

| App | Script (from repo root) |
|-----|-------------------------|
| `markets-grid-lab` | `npm run dev:markets-grid-lab` |
| `stomp-marketsgrid-minimal` | `npm run dev:stomp-marketsgrid-minimal` |

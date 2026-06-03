# Consumer apps — tarball track

Apps here install StarUI from **`file:../../../libs/starui-*.tgz`** (same as MCP / Artifactory
consumers). Use this folder for demos that must prove the packed buckets work.

`npm run propagate` and `npm run sync:app-deps` only rewrite **tarball-track** apps (this
folder, `tutorials-tarball/`, `legacy/`, `e2e/`, and top-level tarball apps).

## Migration

Move or copy a demo from `legacy/` (or the apps root) into `consumer-tarball/<name>/` when
you need a CI-gated tarball install path. Keep the daily dev copy under `consumer-workspace/`
with `STARUI_DEV_SOURCE=1`, mirroring `tutorials-tarball` vs `tutorials-workspace`.

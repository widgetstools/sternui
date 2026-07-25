/**
 * Vendor bridge — the ONLY module that imports `@finos/perspective`'s
 * shipped TypeScript engine sources. The package publishes its server
 * engine solely as (a) the prebundled `dist/cdn/perspective-server.worker.js`
 * (side-effect worker script, no exports) and (b) the raw `src/ts/*`
 * sources exposed through the `"./src/*"` exports map — so hosting the
 * server inside OUR SharedWorker means bundling (b).
 *
 * This file is plain JS on purpose: `scripts/buildWorker.mjs` (esbuild)
 * resolves and bundles the vendor `.ts` files; the package `tsc` build
 * must NOT try to compile them (they need `allowImportingTsExtensions`
 * and vendor-internal ambient types). The sibling `perspectiveVendor.d.mts`
 * gives tsc an accurate typed surface instead.
 *
 * Bundled by esbuild only — never imported from tsc-emitted dist code
 * except via the worker asset bundle.
 */

// Server engine (WASM host classes) — see vendor src/ts/wasm/engine.ts.
export {
  PerspectiveServer,
  PerspectivePollThread,
} from '@finos/perspective/src/ts/wasm/engine.ts';

// Emscripten compile of perspective-server.wasm.
export { compile_perspective } from '@finos/perspective/src/ts/wasm/emscripten_api.ts';

// Stage-0 self-extracting-wasm decompression (both shipped .wasm
// binaries are pro_self_extracting_wasm payloads).
export { load_wasm_stage_0 } from '@finos/perspective/src/ts/wasm/decompress.ts';

// The wasm-bindgen client glue (Client/Table/View classes + init).
// The worker uses it for its LOCAL loopback client — the same
// class/wasm pair a window read-client uses, wired to an in-process
// server session exactly like vendor perspective.node.ts SYNC_CLIENT.
export * as perspectiveClient from '@finos/perspective/dist/wasm/perspective-js.js';

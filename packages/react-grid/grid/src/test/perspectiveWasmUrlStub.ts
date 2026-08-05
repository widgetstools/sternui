/**
 * Stands in for `@perspective-dev/client/dist/wasm/perspective-js.wasm?url`
 * under test.
 *
 * `loadPerspectiveClient.ts` imports the wasm binary through Vite's `?url`
 * suffix, which resolves to a served asset path in a build. Under vitest that
 * id is outside the project root and Vite refuses it —
 * `Denied ID .../perspective-js.wasm?url` — failing the whole module graph at
 * COLLECTION time rather than in any one test.
 *
 * It reaches these tests transitively and unavoidably: `MarketsGrid` imports
 * `CustomSSRMGrid` from `@starui/ssrm-grid`, which imports `agGrid/modules.ts`,
 * whose graph reaches the Perspective client. None of the widget tests touches
 * Perspective, so a URL string is the entire fidelity required — and
 * `perspective-grid`'s own `loadPerspectiveClient.test.ts` stubs it to exactly
 * this shape.
 *
 * Aliased in `vitest.config.ts` rather than mocked per file so a new test that
 * happens to import the widget does not have to know Perspective exists.
 */
export default '/assets/perspective-js.wasm';

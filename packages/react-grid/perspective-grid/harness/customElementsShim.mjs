/**
 * Makes `@perspective-dev/client` usable inside a SharedWorker.
 *
 * MEASURED cause of the "worker() throws `customElements is not defined`"
 * blocker: it is not deep DOM coupling, it is ONE line. `get_client()` in
 * `src/ts/perspective.browser.ts` opens with
 *
 *     const viewer_class = customElements.get("perspective-viewer");
 *
 * — an unguarded bare identifier. In a window `customElements` exists; in a
 * WorkerGlobalScope it is not defined at all, so the lookup is a
 * ReferenceError before the `if` ever runs. Everything after that line is
 * worker-safe: it falls through to the wasm module `init_client()` stored.
 *
 * So the fix is to make the lookup return nothing rather than throw. Nothing
 * else in the library is patched, and in a window this module is a no-op.
 *
 * MUST be imported BEFORE `@perspective-dev/client` — ES module evaluation
 * order follows import order, and this file's side effect has to be in place
 * before any perspective code runs.
 */
if (typeof globalThis.customElements === 'undefined') {
  globalThis.customElements = {
    /** No custom elements can be defined here — always "not registered". */
    get: () => undefined,
    define: () => {},
    whenDefined: () => Promise.resolve(undefined),
  };
}

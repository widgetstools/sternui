/**
 * Typed surface for `perspectiveVendor.mjs` — hand-maintained against
 * `@finos/perspective` 3.8.x:
 *   • engine classes: vendor `dist/esm/wasm/engine.d.ts`
 *   • compile/decompress: vendor `src/ts/wasm/{emscripten_api,decompress}.ts`
 *   • client glue: vendor `dist/wasm/perspective-js.d.ts`
 *
 * tsc typechecks the worker against THIS file; esbuild bundles the
 * real vendor sources via the sibling `.mjs`. Keep the two in lockstep
 * when bumping the perspective dep.
 */

/** Opaque emscripten module handle for perspective-server.wasm. */
export interface PerspectiveServerModule {
  readonly HEAPU8: Uint8Array;
}

export interface PerspectiveServerOptions {
  on_poll_request?: (server: PerspectiveServer) => Promise<void>;
}

export declare class PerspectiveSession {
  handle_request(view: Uint8Array): Promise<void>;
  close(): void;
}

export declare class PerspectiveServer {
  constructor(module: PerspectiveServerModule, options?: PerspectiveServerOptions);
  /**
   * `client_id -> response callback`, populated by `make_session`. Public
   * because the vendor reads it with a non-null assertion in three
   * places (`engine.ts:98`, `:134`, `:151`); we substitute a hardened Map
   * so an unknown id can never throw out of `decode_api_responses`.
   */
  clients: Map<number, (buffer: Uint8Array) => Promise<void>>;
  make_session(callback: (buffer: Uint8Array) => Promise<void>): PerspectiveSession;
  poll(): Promise<void>;
  delete(): void;
}

export declare class PerspectivePollThread {
  constructor(server: PerspectiveServer);
  on_poll_request(): Promise<void>;
}

/** Compile the (stage-0-extracted) perspective-server.wasm binary. */
export declare function compile_perspective(
  wasmBinary: ArrayBuffer,
): Promise<PerspectiveServerModule>;

/** Extract a pro_self_extracting_wasm payload to raw wasm bytes. */
export declare function load_wasm_stage_0(
  wasm: ArrayBuffer | Response | WebAssembly.Module | (() => Promise<ArrayBuffer>),
): Promise<Uint8Array>;

// ─── Client glue (perspective-js.js wasm-bindgen module) ──────────
// Structurally re-declared: the vendor d.ts sits beside a .js file
// this JS bridge re-exports as a namespace object, which tsc cannot
// see through. Only the members the SSRM worker touches.

export interface PerspectiveTableInitOptions {
  index?: string;
  limit?: number;
  name?: string;
  format?: 'json' | 'columns' | 'csv' | 'arrow' | 'ndjson';
}

export interface PerspectiveUpdateOptions {
  port_id?: number;
  format?: 'json' | 'columns' | 'csv' | 'arrow' | 'ndjson';
}

export interface PerspectiveTable {
  size(): Promise<number>;
  schema(): Promise<Record<string, string>>;
  columns(): Promise<string[]>;
  clear(): Promise<void>;
  replace(input: unknown): Promise<void>;
  update(input: unknown, options?: PerspectiveUpdateOptions): Promise<void>;
  remove(value: unknown, options?: { port_id?: number }): Promise<void>;
  delete(options?: { lazy?: boolean }): Promise<void>;
  get_index(): Promise<string | undefined>;
  get_name(): string;
}

export interface PerspectiveClient {
  handle_response(value: unknown): Promise<void>;
  handle_error(error: string, reconnect?: (() => void) | null): Promise<void>;
  table(
    value: string | ArrayBuffer | Record<string, unknown> | Record<string, unknown>[],
    options?: PerspectiveTableInitOptions | null,
  ): Promise<PerspectiveTable>;
  open_table(entity_id: string): Promise<PerspectiveTable>;
  get_hosted_table_names(): Promise<string[]>;
  terminate(): void;
}

/** The wasm-bindgen module namespace (`export * as perspectiveClient`). */
export interface PerspectiveClientModule {
  /** wasm-bindgen default init — instantiate the client wasm. */
  default(module_or_path: {
    module_or_path: ArrayBuffer | Uint8Array | WebAssembly.Module | Response;
  }): Promise<unknown>;
  /** Post-instantiation runtime init (vendor calls it after default()). */
  init(): void;
  Client: new (
    send_request: (msg: Uint8Array) => Promise<void>,
    close?: (() => Promise<void>) | null,
  ) => PerspectiveClient;
}

export declare const perspectiveClient: PerspectiveClientModule;

/**
 * Production `connect` for {@link PerspectiveAttachHandler} — binds the real
 * `@finos/perspective` client over a transferred `psp-attach` port.
 *
 * WASM payloads are fetched as **siblings of the provider worker bundle**
 * (`buildWorker.mjs` copies `perspective-js.wasm` / `perspective-server.wasm`
 * into `dist/assets` next to `provider-worker.mjs`), so the worker needs no
 * bundler-specific `?url` imports and no CDN.
 *
 * ## Stage-0 extraction
 *
 * Perspective 3.x ships both WASM artifacts as **self-extracting bundles**
 * (`pro_self_extracting_wasm`): a small stage-0 module whose custom sections
 * carry the compressed real module. `@finos/perspective`'s own `init_client` /
 * `init_server` extract before use; we replicate that here (the ~25-line
 * extractor is inlined below) because we must initialise the **standalone**
 * `dist/wasm/perspective-js.js` module — the root bundle inlines a private
 * copy of that glue, so initialising the root while constructing `Client`
 * from the standalone module leaves this module's WASM state empty and every
 * call dies in `__wbindgen_*`.
 */

import pspClientInit, {
  Client,
  init as pspModuleInit,
} from '@finos/perspective/dist/wasm/perspective-js.js';
import {
  connectPerspectivePort,
  type ConnectPerspectivePortOpts,
} from './connectPerspectivePort.js';
import type { AttachClient } from './PerspectiveAttachHandler.js';

type WasmAssets = { clientWasm: ArrayBuffer; serverWasm: ArrayBuffer };

/**
 * Unwrap a `pro_self_extracting_wasm` stage-0 bundle (ported from that
 * package's `extract.mjs`, Apache-2.0). Returns the input unchanged when it
 * is not stage-0 wrapped — same fallback `load_wasm_stage_0` uses upstream.
 */
async function extractStage0(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const bin = await WebAssembly.instantiate(buffer);
    const [payload] = WebAssembly.Module.customSections(bin.module, 'psp-runtime');
    const [rawLenView] = WebAssembly.Module.customSections(bin.module, 'psp-len');
    if (!payload || !rawLenView) return buffer;
    const inst = bin.instance.exports as {
      resize(byteLength: number): number;
      compile(byteLength: number, rawLength: number): number;
      memory: WebAssembly.Memory;
    };
    const rawLength = new DataView(rawLenView).getUint32(0, true);
    const ptr = inst.resize(payload.byteLength);
    new Uint8Array(inst.memory.buffer).set(new Uint8Array(payload), ptr);
    const offset = inst.compile(payload.byteLength, rawLength);
    return new Uint8Array(inst.memory.buffer).slice(offset, rawLength + offset)
      .buffer as ArrayBuffer;
  } catch {
    return buffer;
  }
}

async function fetchWasm(url: URL): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `[perspective] failed to fetch ${url.href}: HTTP ${resp.status}`,
    );
  }
  return extractStage0(await resp.arrayBuffer());
}

export interface CreateProviderPerspectiveConnectOpts {
  /**
   * Base URL the WASM assets are siblings of — the provider worker bundle
   * URL (`import.meta.url` inside the worker entry).
   */
  baseUrl: string;
  /** Handshake timeout override (see `PERSPECTIVE_HANDSHAKE_TIMEOUT_MS`). */
  timeoutMs?: number;
}

/**
 * Build the attach-handler `connect`. Lazily fetches + caches the WASM the
 * first time a window performs the hand-off, so provider workers that never
 * serve a pull consumer never pay for it.
 */
export function createProviderPerspectiveConnect(
  opts: CreateProviderPerspectiveConnectOpts,
): (port: MessagePort) => Promise<AttachClient> {
  let assets: Promise<WasmAssets> | null = null;
  let clientInited = false;

  const loadAssets = (): Promise<WasmAssets> => {
    assets ??= (async () => {
      const [clientWasm, serverWasm] = await Promise.all([
        fetchWasm(new URL('perspective-js.wasm', opts.baseUrl)),
        fetchWasm(new URL('perspective-server.wasm', opts.baseUrl)),
      ]);
      return { clientWasm, serverWasm };
    })();
    return assets;
  };

  // wasm-bindgen init is module-global; a second call would re-instantiate.
  // Guard it here rather than in connectPerspectivePort so injected fakes in
  // tests keep seeing every call. Mirrors `compilerize` in
  // perspective.browser.ts: __wbg_init(extracted) then module init().
  const pspOnce: ConnectPerspectivePortOpts['perspective'] = {
    init_client: async (wasm) => {
      if (clientInited) return;
      clientInited = true;
      await pspClientInit({ module_or_path: wasm as BufferSource });
      pspModuleInit();
    },
  };

  return async (port) => {
    const { clientWasm, serverWasm } = await loadAssets();
    return connectPerspectivePort(port, {
      perspective: pspOnce,
      ClientCtor: Client as never,
      clientWasm,
      serverWasm,
      timeoutMs: opts.timeoutMs,
    });
  };
}

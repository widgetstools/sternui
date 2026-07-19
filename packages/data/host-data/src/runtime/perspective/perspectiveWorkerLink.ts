/**
 * Link between the provider SharedWorker and the Perspective engine
 * SharedWorker (ADR-ssrm-worker-hosted-engine.md — separate-worker option).
 *
 * ## Why a port hand-off rather than a direct connection
 *
 * Chromium does not expose the `SharedWorker` constructor inside worker
 * scopes, so `starui-provider:*` cannot connect to `starui-psp:*` on its own.
 * A window therefore performs the *introduction* and then leaves the data
 * path entirely:
 *
 * ```text
 *   window: new SharedWorker(psp)      → port
 *   window: provider.postMessage({kind:'psp-attach'}, [port])   ← transfer
 *   ────────── main thread is now OUT of the data path ──────────
 *   provider ──── rows (Perspective protocol) ────► psp worker
 *   windows  ──── getRows / on_update      ───────► psp worker
 * ```
 *
 * `MessagePort` is transferable, so once handed over the provider worker owns
 * it and rows never touch a main thread. The window keeps its own separate
 * connection to the same named SharedWorker for reads.
 *
 * Only the FIRST window needs to perform the hand-off; later windows find the
 * provider already linked and skip it. The provider worker ignores duplicate
 * attaches so a racing second window is harmless.
 */

/** Engine worker name — one Perspective server per provider, per app. */
export function perspectiveSharedWorkerName(
  appId: string,
  providerId: string,
): string {
  return `starui-psp:${appId}:${providerId}`;
}

/** Parse `starui-psp:{appId}:{providerId}` back into its parts. */
export function parsePerspectiveWorkerName(
  workerName: string,
): { appId: string; providerId: string } | null {
  const prefix = 'starui-psp:';
  if (!workerName.startsWith(prefix)) return null;
  const rest = workerName.slice(prefix.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  const appId = rest.slice(0, sep).trim();
  const providerId = rest.slice(sep + 1).trim();
  if (!appId || !providerId) return null;
  return { appId, providerId };
}

/** Hand-off message: carries the transferred port to the provider worker. */
export interface PerspectiveAttachRequest {
  kind: 'psp-attach';
  appId: string;
  providerId: string;
  /** Table name to create/open — the dataset id used by the SSRM engine. */
  dataset: string;
  /** Key column; becomes the Perspective table `index`. */
  keyColumn: string;
  /**
   * Column → Perspective type for table creation. Optional: when omitted the
   * provider worker infers the schema from the first cached rows (waiting for
   * the snapshot if the link raced it).
   */
  schema?: Record<string, string>;
}

/** Provider worker → window, once the link is live (or already was). */
export interface PerspectiveAttachAck {
  kind: 'psp-attach-ok';
  providerId: string;
  /** False when this provider was already linked by an earlier window. */
  linked: boolean;
  error?: string;
}

export function isPerspectiveAttachRequest(
  msg: unknown,
): msg is PerspectiveAttachRequest {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { kind?: unknown }).kind === 'psp-attach'
  );
}

export function isPerspectiveAttachAck(
  msg: unknown,
): msg is PerspectiveAttachAck {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { kind?: unknown }).kind === 'psp-attach-ok'
  );
}

/** Minimal SharedWorker surface — injectable for tests. */
export interface SharedWorkerLike {
  port: MessagePort;
}

export interface LinkProviderToPerspectiveOpts {
  appId: string;
  providerId: string;
  dataset: string;
  keyColumn: string;
  /** Optional creation schema (see {@link PerspectiveAttachRequest.schema}). */
  schema?: Record<string, string>;
  /** Bundled Perspective server worker asset URL. */
  workerScriptUrl: string;
  /** Port to the provider SharedWorker — the hand-off is posted here. */
  providerPort: {
    postMessage(message: unknown, transfer?: Transferable[]): void;
  };
  /** Injected for tests; defaults to `new SharedWorker(url, {name})`. */
  createWorker?: (url: string, name: string) => SharedWorkerLike;
}

/**
 * Create (or join) the engine SharedWorker for one provider and transfer a
 * port to the provider worker so it can write rows directly.
 *
 * Returns a SECOND connection to the same named worker for this window's own
 * reads — the transferred port belongs to the provider worker now and must
 * not be used here.
 */
export function linkProviderToPerspective(
  opts: LinkProviderToPerspectiveOpts,
): { readPort: MessagePort } {
  const name = perspectiveSharedWorkerName(opts.appId, opts.providerId);
  const create =
    opts.createWorker ??
    ((url: string, workerName: string) =>
      new SharedWorker(url, { type: 'module', name: workerName }));

  // Connection #1 — handed to the provider worker for writes.
  const writeSide = create(opts.workerScriptUrl, name);
  const writePort = writeSide.port;

  const request: PerspectiveAttachRequest = {
    kind: 'psp-attach',
    appId: opts.appId,
    providerId: opts.providerId,
    dataset: opts.dataset,
    keyColumn: opts.keyColumn,
    ...(opts.schema ? { schema: opts.schema } : {}),
  };
  opts.providerPort.postMessage(request, [writePort]);

  // Connection #2 — this window's own reads. Same named worker, so it is the
  // same server and the same table; only the port differs.
  const readSide = create(opts.workerScriptUrl, name);
  return { readPort: readSide.port };
}

/**
 * Resolve the Perspective server worker asset as a sibling of the host-data
 * worker bundle, matching `resolveFanOutWorkerUrl`'s convention.
 */
export function resolvePerspectiveWorkerUrl(baseUrl: string): URL {
  return new URL('perspective-server.worker.mjs', baseUrl);
}

/**
 * One in-flight map per port, and the rule that every call settles.
 *
 * The synchronous engine could not leak a request; across a port it can, and
 * the consequences are not symmetrical. AG Grid's `outboundRequests` is
 * grid-global, decremented only in `success`/`fail`, with a default limit of 2 —
 * so two calls that never come back stop the grid permanently and no purge
 * recovers it. Every path out of this module therefore ends in a settled
 * promise:
 *
 * | how a reply can be lost | what happens here |
 * |---|---|
 * | the worker throws | it answers `{ok:false, error}` — the handler is wrapped |
 * | the worker's RESULT will not clone | `postMessage` throws in the worker; it answers with that instead of dropping the frame |
 * | the CALL's params will not clone | `postMessage` throws in the window, synchronously, and the promise rejects |
 * | a frame arrives that will not deserialise | `messageerror` — every in-flight call is rejected |
 * | the worker never answers at all | the timeout rejects it |
 *
 * The last row is the one the hand-rolled engine evaluated in July did not
 * have, and it was filed as this defect class. A timeout that FAILS the call is
 * strictly better than a pending promise: AG paints a failed block and the user
 * can scroll away from it, where a wedged grid is dead until reload.
 */
import {
  isPushFrame,
  isRequestFrame,
  isResponseFrame,
  SSRM_RPC_TIMEOUT_MS,
  type SsrmPushFrame,
  type SsrmResponseFrame,
  type SsrmRpcMethod,
} from './protocol.js';

export type SsrmRpcErrorCode = 'timeout' | 'closed' | 'remote' | 'clone';

export class SsrmRpcError extends Error {
  readonly code: SsrmRpcErrorCode;
  constructor(message: string, code: SsrmRpcErrorCode) {
    super(message);
    this.name = 'SsrmRpcError';
    this.code = code;
  }
}

export interface SsrmRpcClientOptions {
  /** Per-call ceiling. See {@link SSRM_RPC_TIMEOUT_MS} for why it is this large. */
  timeoutMs?: number;
  /** A write that landed in the worker, or any other unsolicited frame. */
  onPush?(frame: SsrmPushFrame): void;
  /** A worker-side failure with no call to attach it to. */
  onFault?(error: SsrmRpcError): void;
}

/**
 * Counters, so a stuck or lossy port is visible instead of inferred.
 *
 * `late` in particular: a reply that arrives after its timeout has no in-flight
 * entry to settle, and silently dropping it would make a slow worker look like
 * a dead one. A non-zero `late` with a non-zero `timedOut` means the timeout is
 * too short, which is a different problem from a worker that never answers.
 */
export interface SsrmRpcStats {
  pending: number;
  timedOut: number;
  late: number;
  sent: number;
}

export interface SsrmRpcClient {
  call<T>(method: SsrmRpcMethod, params: unknown): Promise<T>;
  stats(): SsrmRpcStats;
  dispose(reason?: string): void;
}

interface Pending {
  method: SsrmRpcMethod;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

export function createSsrmRpcClient(
  port: MessagePort,
  options: SsrmRpcClientOptions = {},
): SsrmRpcClient {
  const timeoutMs = options.timeoutMs ?? SSRM_RPC_TIMEOUT_MS;
  const inflight = new Map<number, Pending>();
  let nextId = 1;
  let sent = 0;
  let timedOut = 0;
  let late = 0;
  let closed: SsrmRpcError | null = null;

  const rejectAll = (error: SsrmRpcError) => {
    for (const [id, pending] of inflight) {
      inflight.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  };

  port.onmessage = (event: MessageEvent) => {
    const frame: unknown = event.data;
    if (isPushFrame(frame)) {
      if (frame.push === 'fault') options.onFault?.(new SsrmRpcError(frame.error, 'remote'));
      else options.onPush?.(frame);
      return;
    }
    if (!isResponseFrame(frame)) return;
    const pending = inflight.get(frame.id);
    if (pending === undefined) {
      late += 1;
      return;
    }
    inflight.delete(frame.id);
    clearTimeout(pending.timer);
    if (frame.ok) pending.resolve(frame.result);
    else pending.reject(new SsrmRpcError(frame.error ?? 'the worker gave no reason', 'remote'));
  };

  /**
   * A frame the window could not deserialise. Its id is unreadable — the
   * failure IS the deserialisation — so there is no way to know which call it
   * belonged to, and the only safe answer is to fail them all. Leaving them
   * pending is the wedge this module exists to prevent.
   */
  port.onmessageerror = () => {
    rejectAll(new SsrmRpcError('the worker sent a frame this window could not read', 'clone'));
  };

  port.start();

  return {
    call<T>(method: SsrmRpcMethod, params: unknown): Promise<T> {
      if (closed !== null) return Promise.reject(closed);
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!inflight.delete(id)) return;
          timedOut += 1;
          reject(new SsrmRpcError(`'${method}' did not answer within ${timeoutMs} ms`, 'timeout'));
        }, timeoutMs);
        inflight.set(id, { method, resolve: resolve as (value: unknown) => void, reject, timer });
        try {
          port.postMessage({ id, method, params });
          sent += 1;
        } catch (error) {
          // Uncloneable params throw HERE, synchronously and loudly. One of the
          // few failures on this path that announces itself.
          inflight.delete(id);
          clearTimeout(timer);
          reject(new SsrmRpcError(`'${method}' params could not be cloned: ${String(error)}`, 'clone'));
        }
      });
    },

    stats: () => ({ pending: inflight.size, timedOut, late, sent }),

    dispose(reason = 'the client was disposed') {
      closed = new SsrmRpcError(reason, 'closed');
      rejectAll(closed);
      port.onmessage = null;
      try {
        port.close();
      } catch {
        /* already gone */
      }
    },
  };
}

export type SsrmRpcHandler = (method: SsrmRpcMethod, params: unknown) => unknown | Promise<unknown>;

/** What a caught value should be called on the wire. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * The worker half. Answers every request exactly once, including the requests
 * it cannot answer.
 */
export function serveSsrmRpc(port: MessagePort, handle: SsrmRpcHandler): () => void {
  const post = (frame: SsrmResponseFrame) => {
    try {
      port.postMessage(frame);
    } catch (error) {
      // The RESULT would not clone. Dropping it here costs the caller a full
      // timeout for a failure that is known right now, so say so instead.
      try {
        port.postMessage({
          id: frame.id,
          ok: false,
          error: `result could not be cloned: ${describeError(error)}`,
        } satisfies SsrmResponseFrame);
      } catch {
        /* the port is gone — there is nowhere left to report it */
      }
    }
  };

  port.onmessage = (event: MessageEvent) => {
    const frame: unknown = event.data;
    if (!isRequestFrame(frame)) return;
    void (async () => {
      try {
        const result = await handle(frame.method, frame.params);
        post({ id: frame.id, ok: true, result });
      } catch (error) {
        post({ id: frame.id, ok: false, error: describeError(error) });
      }
    })();
  };

  port.onmessageerror = () => {
    // A request that did not deserialise carries no id, so no promise can be
    // settled from here — the client's timeout is what covers it. Reported as a
    // fault so it is at least attributable, because a SharedWorker's console
    // reaches nobody.
    try {
      port.postMessage({
        push: 'fault',
        error: 'a window sent a frame the worker could not read',
      } satisfies SsrmPushFrame);
    } catch {
      /* nothing further to do */
    }
  };

  port.start();

  return () => {
    port.onmessage = null;
    try {
      port.close();
    } catch {
      /* already gone */
    }
  };
}

/**
 * The wire between a window and the worker that holds the book.
 *
 * Three frame shapes, distinguished by which discriminant field is present so
 * neither end has to sniff anything else:
 *
 * ```
 *   window -> worker   { id, method, params }
 *   worker -> window   { id, ok: true,  result }
 *   worker -> window   { id, ok: false, error }
 *   worker -> window   { push: 'delta' | 'fault', ... }        unsolicited
 * ```
 *
 * Everything crossing the port is structured-cloned, which shapes two rules:
 *
 * 1. **No functions, no class instances, no typed-array views into a shared
 *    buffer.** The engine's `Int32Array` indices and its `ColumnStore` never
 *    leave the worker; only plain rows do.
 * 2. **A refused clone is SILENT at the sender.** It surfaces as `messageerror`
 *    on the receiver and nothing at all on the side that posted — the same
 *    failure that made a `WebAssembly.Module` "post successfully" and deliver
 *    nothing on the Perspective path. Both ends listen for it and turn it into
 *    an error rather than a lost reply.
 */
import type { SsrmCalcColumnDef } from '../calcAst.js';
import type { SsrmCalcDiagnostic } from '../calc.js';
import type {
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRow,
  SsrmSchema,
} from '../types.js';

/** Methods a client may call. Anything else is answered with an error frame. */
export type SsrmRpcMethod =
  | 'open'
  | 'close'
  | 'getRows'
  | 'grandTotal'
  | 'countFiltered'
  | 'distinctValues'
  | 'setQuickFilter'
  | 'setCalcColumns'
  | 'calcDiagnostics'
  | 'applyUpdate'
  | 'applySnapshot'
  | 'applyRemove'
  | 'size'
  | 'heartbeat'
  | 'setViewport'
  | 'introspect';

export interface SsrmRequestFrame {
  id: number;
  method: SsrmRpcMethod;
  params: unknown;
}

export interface SsrmResponseFrame {
  id: number;
  ok: boolean;
  result?: unknown;
  /** A string, not an Error: an Error's `stack` survives cloning, its class does not. */
  error?: string;
}

/**
 * A write that landed in the worker, pushed to every OTHER client of the book.
 *
 * Carries the **sparse patch as applied**, not the resulting rows. A tick that
 * moved two prices is two cells per row; re-reading the row from the store to
 * broadcast it would put 121 columns on the wire for the same information, four
 * times a second, per window. AG merges the patch onto the row it already holds.
 */
export interface SsrmDeltaPush {
  push: 'delta';
  bookId: string;
  rows: SsrmRow[];
  removed: unknown[];
  /** Book size after the write, so a client's mirror of it stays live. */
  size: number;
}

/**
 * Something failed inside the worker.
 *
 * A SharedWorker has no visible console and an unhandled rejection in one
 * reaches nothing — from a window that is indistinguishable from a hang. Every
 * fault is therefore pushed to the clients so it can be attributed.
 */
export interface SsrmFaultPush {
  push: 'fault';
  bookId?: string;
  error: string;
}

export type SsrmPushFrame = SsrmDeltaPush | SsrmFaultPush;
export type SsrmFrame = SsrmRequestFrame | SsrmResponseFrame | SsrmPushFrame;

export function isRequestFrame(frame: unknown): frame is SsrmRequestFrame {
  return typeof frame === 'object' && frame !== null && 'method' in frame && 'id' in frame;
}

export function isResponseFrame(frame: unknown): frame is SsrmResponseFrame {
  return typeof frame === 'object' && frame !== null && 'ok' in frame && 'id' in frame;
}

export function isPushFrame(frame: unknown): frame is SsrmPushFrame {
  return typeof frame === 'object' && frame !== null && 'push' in frame;
}

/** `open` — bind this port to a book, creating it if this is the first client. */
export interface SsrmOpenParams {
  bookId: string;
  /**
   * Handed to `openBook` when this call is the one that BUILDS the book.
   *
   * A later client of an open book is answered from the engine that already
   * exists and its options are ignored — one book cannot have two row counts.
   * Whatever goes in here is structured-cloned, so it is data, never a callback.
   */
  options?: unknown;
}

export interface SsrmOpenResult {
  bookId: string;
  size: number;
  schema: SsrmSchema;
  /** Clients attached to this book INCLUDING this one. */
  clients: number;
}

export interface SsrmGetRowsParams {
  bookId: string;
  request: SsrmGetRowsRequest;
}

export interface SsrmWriteParams {
  bookId: string;
  rows: SsrmRow[];
}

export interface SsrmRemoveParams {
  bookId: string;
  keys: unknown[];
}

export interface SsrmFieldParams {
  bookId: string;
  field: string;
}

export interface SsrmQuickFilterParams {
  bookId: string;
  text: string;
}

/**
 * Calculated columns, sent to the worker that holds the book.
 *
 * This method is why the expression AST is taken STRUCTURALLY rather than
 * imported (see `calcAst.ts`). A compiled closure could not be here at all — a
 * function is not structured-cloneable — and the value has to be produced where
 * the book is, because session 5 sorts, filters and groups on it. What crosses
 * is a tree of plain objects, which clones unchanged; the parse stays in the
 * window, where `@starui/engine` already is.
 */
export interface SsrmCalcColumnsParams {
  bookId: string;
  columns: SsrmCalcColumnDef[];
}

/** What `calcDiagnostics` answers — refusals and runtime failures, with counts. */
export type SsrmCalcDiagnosticsResult = SsrmCalcDiagnostic[];

/** What a write answers — the engine's delta plus the new book size. */
export interface SsrmWriteResult {
  changed: unknown[];
  removed: unknown[];
  size: number;
}

export type SsrmGetRowsReply = SsrmGetRowsResult;

/**
 * What one subscriber can currently SEE, so a pushed tick can be narrowed.
 *
 * The range alone is meaningless — position 300 under one window's sort is a
 * different row from position 300 under another's — so the query shape rides
 * with it. It is the shape that window's grid is currently pulling blocks with,
 * which the host already has to be able to answer.
 */
export interface SsrmViewport {
  request: SsrmGetRowsRequest;
  /** Inclusive display position of the first visible row. */
  startRow: number;
  /** EXCLUSIVE display position past the last visible row. */
  endRow: number;
}

export interface SsrmViewportParams {
  bookId: string;
  /** `null` clears it: the port goes back to receiving every pushed row. */
  viewport: SsrmViewport | null;
}

/** One book as the host holds it. The answer to "do these windows share it?" */
export interface SsrmBookReport {
  bookId: string;
  /** Ports attached. A window that shares a book adds one; a second book does not. */
  clients: number;
  size: number;
  /** Of those clients, how many have declared a viewport. */
  viewports: number;
}

export interface SsrmIntrospectResult {
  books: SsrmBookReport[];
  /** Ports reaped by the stale sweep since the worker started. */
  reaped: number;
  staleMs: number;
  sweepMs: number;
}

/**
 * How often a client says it is still there.
 *
 * Any call counts — the heartbeat only exists for a window that is attached and
 * idle, which is what a background blotter is.
 */
export const SSRM_HEARTBEAT_MS = 5_000;

/**
 * How long a silent port is kept before its book is released.
 *
 * **90 seconds because of timer throttling, not caution.** Chrome throttles
 * `setInterval` in a hidden tab to roughly once a minute, so a 20-second window
 * would reap a blotter that is merely in a background tab — the failure this
 * sweep exists to prevent, inverted and worse. It has to clear 60 s with margin.
 * The cost of the margin is that a hard-killed window leaks its book for up to
 * `staleMs + sweepMs`, which is bounded where the leak it replaces was not.
 */
export const SSRM_STALE_MS = 90_000;

/** How often the host looks for stale ports. Idle when no book is open. */
export const SSRM_SWEEP_MS = 15_000;

/**
 * Default ceiling on a single call.
 *
 * Every block read measured on this engine is single-digit milliseconds, so
 * this is not a latency budget — it is the line past which a reply is treated
 * as LOST. It has to be generous, because AG never retries a block it was told
 * failed, and it has to exist, because a reply that never arrives leaves an
 * `outboundRequests` slot held forever.
 */
export const SSRM_RPC_TIMEOUT_MS = 15_000;

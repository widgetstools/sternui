/**
 * Provider-worker side of the Perspective link
 * (ADR-ssrm-worker-hosted-engine.md — separate-worker option).
 *
 * Receives the `MessagePort` a window transferred (see `perspectiveWorkerLink`),
 * stands up a Perspective client over it, opens or creates the provider's
 * table, and exposes a {@link ProviderTableBridge} the provider slot writes
 * rows into. After this the provider streams straight to the engine worker and
 * no main thread is in the data path.
 *
 * ## Idempotence
 *
 * Every window that opens a blotter attempts the hand-off, because none of
 * them can know whether another got there first. The first attach wins and
 * later ones are acked as `linked: false` with their port closed — otherwise
 * N windows would each stand up a client and a bridge against the same table
 * and multiply every write by N.
 *
 * ## Testability
 *
 * The WASM/handshake specifics are injected as `connect`, so this module's
 * logic — dedupe, table open-vs-create, bridge lifecycle, error acks — is
 * verifiable without a browser. The real `connect` drives Perspective's
 * `{cmd:'init'}` handshake and is exercised by the Phase 0b spike.
 */

import { ProviderTableBridge, type BridgeTable } from './ProviderTableBridge.js';
import {
  isPerspectiveAttachRequest,
  type PerspectiveAttachAck,
  type PerspectiveAttachRequest,
} from './perspectiveWorkerLink.js';

/** Perspective client surface the handler needs (write side only). */
export interface AttachClient {
  table(
    data: Record<string, string> | Record<string, unknown>[],
    options?: { index?: string; name?: string },
  ): Promise<BridgeTable>;
  open_table(name: string): Promise<BridgeTable>;
  get_hosted_table_names(): Promise<string[]>;
}

export interface PerspectiveAttachHandlerOpts {
  /**
   * Stand up a Perspective client over the transferred port. Real
   * implementation performs `init_client` + the `{cmd:'init'}` handshake;
   * tests inject a fake.
   */
  connect: (port: MessagePort) => Promise<AttachClient>;
  /**
   * Column schema for table creation when the attach request carries none.
   * May resolve asynchronously (e.g. wait for the provider's first cached
   * rows and infer). When neither source yields a schema, the attach is
   * acked as an error — the window may retry once data exists.
   */
  schemaFor?: (
    req: PerspectiveAttachRequest,
  ) => Record<string, string> | undefined | Promise<Record<string, string> | undefined>;
  /** Flush window handed to the bridge (default: bridge default). */
  flushMs?: number;
  /**
   * Fired once a link is live, before the requesting window is acked.
   * The host uses this to seed the table with rows received before the
   * link came up (hub cache → `bridge.snapshot`).
   */
  onLinked?: (providerId: string, bridge: ProviderTableBridge) => void;
  onError?: (err: unknown) => void;
}

interface Link {
  bridge: ProviderTableBridge;
  dataset: string;
}

export class PerspectiveAttachHandler {
  private readonly links = new Map<string, Link>();
  /** In-flight attaches, so two windows racing cannot both build a link. */
  private readonly pending = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(private readonly opts: PerspectiveAttachHandlerOpts) {}

  /** Bridge for a provider, once linked — the slot writes rows through this. */
  bridgeFor(providerId: string): ProviderTableBridge | undefined {
    return this.links.get(providerId)?.bridge;
  }

  isLinked(providerId: string): boolean {
    return this.links.has(providerId);
  }

  /**
   * Handle one inbound message. Returns true when it was an attach request
   * (so the caller can stop routing it through the hub protocol).
   */
  handleMessage(
    data: unknown,
    ports: readonly MessagePort[],
    reply: (ack: PerspectiveAttachAck) => void,
  ): boolean {
    if (!isPerspectiveAttachRequest(data)) return false;
    void this.attach(data, ports[0], reply);
    return true;
  }

  private async attach(
    req: PerspectiveAttachRequest,
    port: MessagePort | undefined,
    reply: (ack: PerspectiveAttachAck) => void,
  ): Promise<void> {
    if (this.disposed) return;

    if (!port) {
      reply({
        kind: 'psp-attach-ok',
        providerId: req.providerId,
        linked: false,
        error: 'psp-attach carried no MessagePort',
      });
      return;
    }

    // Already linked, or a link is being built — this window is late.
    if (this.links.has(req.providerId) || this.pending.has(req.providerId)) {
      closePort(port);
      await this.pending.get(req.providerId);
      reply({ kind: 'psp-attach-ok', providerId: req.providerId, linked: false });
      return;
    }

    const build = (async () => {
      const client = await this.opts.connect(port);
      const hosted = await client.get_hosted_table_names();
      let table: BridgeTable;
      if (hosted.includes(req.dataset)) {
        table = await client.open_table(req.dataset);
      } else {
        const schema = req.schema ?? (await this.opts.schemaFor?.(req));
        if (!schema || Object.keys(schema).length === 0) {
          throw new Error(
            `no schema available to create table '${req.dataset}' — provider `
            + `has no rows yet and the attach carried none; retry once data exists`,
          );
        }
        // The index column must exist in the schema or Perspective aborts.
        const withKey = schema[req.keyColumn]
          ? schema
          : { ...schema, [req.keyColumn]: 'string' };
        table = await client.table(withKey, {
          index: req.keyColumn,
          name: req.dataset,
        });
      }

      const bridge = new ProviderTableBridge({
        table,
        keyColumn: req.keyColumn,
        flushMs: this.opts.flushMs,
        onError: this.opts.onError,
      });
      this.links.set(req.providerId, { dataset: req.dataset, bridge });
      this.opts.onLinked?.(req.providerId, bridge);
    })();

    this.pending.set(req.providerId, build.then(() => undefined, () => undefined));

    try {
      await build;
      reply({ kind: 'psp-attach-ok', providerId: req.providerId, linked: true });
    } catch (err) {
      this.opts.onError?.(err);
      closePort(port);
      reply({
        kind: 'psp-attach-ok',
        providerId: req.providerId,
        linked: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.pending.delete(req.providerId);
    }
  }

  /** Drop one provider's link (slot torn down / provider stopped). */
  release(providerId: string): void {
    const link = this.links.get(providerId);
    if (!link) return;
    this.links.delete(providerId);
    link.bridge.dispose();
  }

  /** Drop every link. The tables are owned by the engine worker, not us. */
  dispose(): void {
    this.disposed = true;
    for (const [, link] of this.links) link.bridge.dispose();
    this.links.clear();
    this.pending.clear();
  }
}

function closePort(port: MessagePort): void {
  try {
    port.close();
  } catch {
    /* already closed */
  }
}

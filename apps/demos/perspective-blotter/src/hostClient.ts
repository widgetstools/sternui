/**
 * Window side of the seam: attach to the SharedWorker and get a Client.
 *
 * `perspective.worker(port)` is what needs `customElements`, which is why it
 * runs here and not in the worker. The port it is given is one end of a fresh
 * MessageChannel whose other end the worker bound a ProxySession to; the
 * SharedWorker's own port stays free for control traffic so neither channel
 * has to sniff the other's messages.
 */
import perspective from '@perspective-dev/client/inline';

export interface HostHandle {
  client: Promise<unknown>;
  /** Resolves with the worker's `attached` message (table name, boot stats). */
  attached: Promise<Record<string, unknown>>;
  onMessage(listener: (message: Record<string, unknown>) => void): () => void;
  send(message: unknown): void;
  once(type: string): Promise<Record<string, unknown>>;
}

export function createHostHandle(): HostHandle {
  const worker = new SharedWorker(new URL('./perspectiveWorker.ts', import.meta.url), {
    type: 'module',
    name: 'perspective-blotter',
  });

  const control = worker.port;
  const listeners = new Set<(message: Record<string, unknown>) => void>();
  control.onmessage = (event) => {
    for (const listener of listeners) listener(event.data);
  };
  control.start();

  const onMessage = (listener: (message: Record<string, unknown>) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // Subscribe BEFORE asking to attach: the worker answers on the control port
  // at the same moment it answers the frame-port handshake, so a waiter
  // registered after awaiting the Client can miss it — which looks exactly
  // like the worker having hung.
  const attached = new Promise<Record<string, unknown>>((resolve) => {
    const off = onMessage((message) => {
      if (message?.type === 'attached') {
        off();
        resolve(message);
      }
    });
  });

  const frames = new MessageChannel();
  control.postMessage({ cmd: 'attach' }, [frames.port2]);

  const client = perspective.worker(Promise.resolve(frames.port1));

  return {
    client: client as Promise<unknown>,
    attached,
    onMessage,
    send: (message: unknown) => control.postMessage(message),
    once: (type: string) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const off = onMessage((message) => {
          if (message?.type === type) {
            off();
            resolve(message);
          }
        });
      }),
  };
}

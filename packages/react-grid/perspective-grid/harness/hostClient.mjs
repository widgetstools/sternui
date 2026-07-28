/**
 * Window side of the seam: attach this window to the SharedWorker host and
 * get back a Perspective Client.
 *
 * `perspective.worker(port)` is what makes `customElements` a requirement,
 * which is why it runs HERE and not in the worker. The port it is given is
 * one end of a MessageChannel whose other end the host bound a ProxySession
 * to; the SharedWorker's own port is left free for control traffic so
 * neither channel has to sniff the other's messages.
 */
import perspective from '@perspective-dev/client/inline';

export function createHostHandle() {
  const worker = new SharedWorker(new URL('./pspHost.mjs', import.meta.url), {
    type: 'module',
    name: 'psp-host',
  });

  const control = worker.port;
  const listeners = new Set();
  control.onmessage = (event) => {
    for (const listener of listeners) listener(event.data);
  };
  control.start();

  const frames = new MessageChannel();

  // Subscribe BEFORE asking to attach. The host answers on the control port
  // at the same moment it answers the frame-port handshake, so a `ready`
  // waiter registered after awaiting the Client can miss it entirely — which
  // looks exactly like the worker having hung.
  const ready = new Promise((resolve) => {
    const off = onMessage((message) => {
      if (message?.type === 'ready') {
        off();
        resolve(message);
      }
    });
  });

  control.postMessage({ cmd: 'attach' }, [frames.port2]);

  // `worker()` performs the `{cmd:'init'}` handshake and resolves once the
  // host has answered, so awaiting this is awaiting the attach.
  const client = perspective.worker(Promise.resolve(frames.port1));

  function onMessage(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    client,
    /** Resolves with the host's `ready` message (boot timings, window number). */
    ready,
    /** Subscribe to host control messages. Returns an unsubscribe. */
    onMessage,
    send(message) {
      control.postMessage(message);
    },
    /** Await the NEXT control message matching `type`. Request/response only —
     *  for anything the host may already have sent, use a promise created up
     *  front (see `ready`). */
    once(type) {
      return new Promise((resolve) => {
        const off = onMessage((message) => {
          if (message?.type === type) {
            off();
            resolve(message);
          }
        });
      });
    },
  };
}

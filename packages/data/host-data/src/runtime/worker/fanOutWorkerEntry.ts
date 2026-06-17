/**
 * Dedicated fan-out worker entry — one worker per hub `subId`. Prepares
 * per-subscriber envelopes off the SharedWorker thread; the hub posts
 * to the window MessagePort. Loaded as `data-services-fanout-worker.mjs`.
 */

import type {
  FanOutHubToWorker,
  FanOutWorkerInbound,
  FanOutWorkerToHub,
} from './fanOutProtocol.js';

const subscribers = new Map<string, { subId: string; clientId: string }>();

function postToHub(message: FanOutWorkerToHub): void {
  self.postMessage(message);
}

function registerSubscriber(subId: string, clientId: string): void {
  subscribers.set(subId, { subId, clientId });
}

function unregisterSubscriber(subId: string): void {
  subscribers.delete(subId);
}

function handleBroadcast(data: Extract<FanOutHubToWorker, { type: 'broadcast' }>): void {
  const slot = subscribers.get(data.subId);
  if (!slot) {
    postToHub({ type: 'broadcast-done', jobId: data.jobId, deadSubIds: [data.subId] });
    return;
  }
  try {
    const template = data.event as Record<string, unknown>;
    const message = { ...template, subId: data.subId };
    postToHub({
      type: 'deliver',
      jobId: data.jobId,
      clientId: data.clientId,
      subId: data.subId,
      message,
    });
    postToHub({ type: 'broadcast-done', jobId: data.jobId, deadSubIds: [] });
  } catch {
    postToHub({ type: 'broadcast-done', jobId: data.jobId, deadSubIds: [data.subId] });
  }
}

function handleHubMessage(data: FanOutHubToWorker): void {
  switch (data.type) {
    case 'register':
      registerSubscriber(data.subId, data.clientId);
      return;
    case 'unregister':
      unregisterSubscriber(data.subId);
      return;
    case 'broadcast':
      handleBroadcast(data);
      return;
    case 'dispose':
      subscribers.clear();
      self.close();
      return;
    default:
      return;
  }
}

self.addEventListener('message', (ev: MessageEvent<FanOutWorkerInbound>) => {
  const data = ev.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'init') return;
  handleHubMessage(data);
});

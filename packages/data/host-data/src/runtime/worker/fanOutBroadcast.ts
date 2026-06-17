/**
 * Shared fan-out loop — posts one event template to many listeners.
 * Used by the hub inline path and by dedicated fan-out workers.
 */

export interface FanOutTarget {
  clientId: string;
  subId: string;
}

export interface FanOutClientPort {
  postMessage(message: unknown): void;
}

/**
 * Fan out `eventTemplate` to each target, rewriting `subId` per listener.
 * Returns subIds whose port threw on postMessage.
 */
export function fanOutBroadcast(
  clients: ReadonlyMap<string, FanOutClientPort>,
  items: ReadonlyArray<FanOutTarget>,
  eventTemplate: Record<string, unknown>,
): string[] {
  const deadSubIds: string[] = [];
  for (const { clientId, subId } of items) {
    const port = clients.get(clientId);
    if (!port) {
      deadSubIds.push(subId);
      continue;
    }
    try {
      port.postMessage({ ...eventTemplate, subId });
    } catch {
      deadSubIds.push(subId);
    }
  }
  return deadSubIds;
}

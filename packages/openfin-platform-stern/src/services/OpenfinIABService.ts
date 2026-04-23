/**
 * IAB (Inter-Application Bus) Service — type-safe message passing between windows/views.
 */

import { platformContext } from '../core/PlatformContext.js';

export interface IABMessage<T = any> {
  type: string;
  payload: T;
  timestamp: string;
  source?: { windowName?: string; configId?: string };
}

export type IABMessageHandler<T = any> = (message: IABMessage<T>) => void;

class IABService {
  private subscriptions: Map<string, Set<IABMessageHandler>> = new Map();
  private isOpenFin: boolean = false;

  constructor() {
    this.isOpenFin = typeof window !== 'undefined' && 'fin' in window;
  }

  subscribe<T = any>(topic: string, handler: IABMessageHandler<T>): () => void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    const handlers = this.subscriptions.get(topic)!;
    handlers.add(handler as IABMessageHandler);

    if (this.isOpenFin) {
      this.setupOpenFinSubscription(topic);
    }

    return () => {
      handlers.delete(handler as IABMessageHandler);
      if (handlers.size === 0) this.subscriptions.delete(topic);
    };
  }

  async broadcast<T = any>(topic: string, payload: T, source?: any): Promise<void> {
    const message: IABMessage<T> = {
      type: topic,
      payload,
      timestamp: new Date().toISOString(),
      source,
    };

    if (this.isOpenFin) {
      try {
        const fin = (window as any).fin;
        await fin.InterApplicationBus.publish(topic, message);
      } catch (error) {
        platformContext.logger.error('IAB broadcast failed', error, 'IABService');
      }
    } else {
      this.handleMessage(topic, message);
    }
  }

  async send<T = any>(targetUuid: string, targetName: string, topic: string, payload: T): Promise<void> {
    if (!this.isOpenFin) return;
    const message: IABMessage<T> = { type: topic, payload, timestamp: new Date().toISOString() };
    try {
      const fin = (window as any).fin;
      await fin.InterApplicationBus.send({ uuid: targetUuid, name: targetName }, topic, message);
    } catch (error) {
      platformContext.logger.error('IAB send failed', error, 'IABService');
      throw error;
    }
  }

  private setupOpenFinSubscription(topic: string): void {
    if (!this.isOpenFin) return;
    try {
      const fin = (window as any).fin;
      fin.InterApplicationBus.subscribe(
        { uuid: '*' },
        topic,
        (message: IABMessage, _identity: any) => {
          this.handleMessage(topic, message);
        }
      );
    } catch (error) {
      platformContext.logger.error('Failed to setup OpenFin IAB subscription', error, 'IABService');
    }
  }

  private handleMessage(topic: string, message: IABMessage): void {
    const handlers = this.subscriptions.get(topic);
    if (handlers) {
      handlers.forEach(handler => {
        try { handler(message); } catch (error) {
          platformContext.logger.error('IAB handler error', error, 'IABService');
        }
      });
    }
  }

  isInOpenFin(): boolean { return this.isOpenFin; }
  getActiveSubscriptions(): string[] { return Array.from(this.subscriptions.keys()); }
}

export const iabService = new IABService();

// Convenience exports
export const iabBroadcast = iabService.broadcast.bind(iabService);
export const iabSubscribe = iabService.subscribe.bind(iabService);

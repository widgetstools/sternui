/**
 * STOMP Data Provider
 * Based on stern-1 implementation with field inference capabilities.
 *
 * Features:
 * - WebSocket connection via @stomp/stompjs
 * - Snapshot data fetching for field inference
 * - Automatic field schema inference
 * - Duplicate elimination via key column
 */

import { Client, type IMessage } from '@stomp/stompjs';
import type { FieldInfo } from '@stern/shared-types';

export interface StompConnectionConfig {
  websocketUrl: string;
  listenerTopic: string;
  requestMessage?: string;
  requestBody?: string;
  snapshotEndToken?: string;
  keyColumn?: string;
  messageRate?: number;
  snapshotTimeoutMs?: number;
  dataType?: 'positions' | 'trades' | 'orders' | 'custom';
  batchSize?: number;
}

export interface StompConnectionResult {
  success: boolean;
  data?: any[];
  error?: string;
}

export class StompDataProvider {
  private config: StompConnectionConfig;
  private connectionCount = 0;
  private disconnectionCount = 0;

  constructor(config: StompConnectionConfig) {
    this.config = config;
  }

  /**
   * Test connection to STOMP server (without subscribing)
   */
  async checkConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const testClient = new Client({
        brokerURL: this.config.websocketUrl,
        reconnectDelay: 0,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,

        onConnect: () => {
          console.log('[StompProvider] Connection test successful');
          this.connectionCount++;
          testClient.deactivate();
          resolve(true);
        },

        onStompError: (frame) => {
          console.error('[StompProvider] STOMP error', frame);
          resolve(false);
        },

        onWebSocketError: (event) => {
          console.error('[StompProvider] WebSocket error', event);
          resolve(false);
        },
      });

      try {
        testClient.activate();

        // Timeout after 10 seconds
        setTimeout(() => {
          try { testClient.deactivate(); } catch { /* ignore */ }
          resolve(false);
        }, 10000);
      } catch (error) {
        console.error('[StompProvider] Failed to activate test client', error);
        resolve(false);
      }
    });
  }

  /**
   * Fetch snapshot data for field inference
   */
  async fetchSnapshot(
    maxRows: number = 100,
    onBatch?: (batch: any[], totalRows: number) => void
  ): Promise<StompConnectionResult> {
    return new Promise((resolve) => {
      const receivedData: any[] = [];
      const dataMap = new Map<string, any>();
      let snapshotComplete = false;
      const snapshotEndToken = this.config.snapshotEndToken || 'Success';
      const keyColumn = this.config.keyColumn;

      const client = new Client({
        brokerURL: this.config.websocketUrl,
        reconnectDelay: 0,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,

        onConnect: () => {
          console.log('[StompProvider] Connected for snapshot');
          this.connectionCount++;

          const subscription = client.subscribe(
            this.config.listenerTopic,
            (message: IMessage) => {
              try {
                const data = JSON.parse(message.body);

                // Check for snapshot end token
                if (data.snapshotToken === snapshotEndToken || data.status === snapshotEndToken) {
                  console.log('[StompProvider] Snapshot complete token received');
                  snapshotComplete = true;
                  subscription.unsubscribe();
                  client.deactivate();
                  resolve({ success: true, data: receivedData });
                  return;
                }

                // Process data rows
                const rows = data.rows || data.data || (Array.isArray(data) ? data : [data]);

                if (rows.length > 0) {
                  if (keyColumn) {
                    rows.forEach((row: any) => {
                      const key = row[keyColumn];
                      if (key !== undefined && key !== null) {
                        dataMap.set(String(key), row);
                      } else {
                        receivedData.push(row);
                      }
                    });
                    receivedData.length = 0;
                    receivedData.push(...dataMap.values());
                  } else {
                    receivedData.push(...rows);
                  }

                  if (onBatch) {
                    onBatch(rows, receivedData.length);
                  }

                  console.log(`[StompProvider] Received ${rows.length} rows, total: ${receivedData.length}`);

                  if (receivedData.length >= maxRows) {
                    console.log('[StompProvider] Reached max rows, completing snapshot');
                    subscription.unsubscribe();
                    client.deactivate();
                    resolve({ success: true, data: receivedData.slice(0, maxRows) });
                  }
                }
              } catch (error) {
                console.error('[StompProvider] Error processing message', error);
              }
            }
          );

          // Send snapshot request if configured
          if (this.config.requestMessage) {
            console.log('[StompProvider] Sending snapshot request', this.config.requestMessage);
            client.publish({
              destination: this.config.requestMessage,
              body: this.config.requestBody || 'START',
            });
          }
        },

        onStompError: (frame) => {
          console.error('[StompProvider] STOMP error', frame.headers['message']);
          this.disconnectionCount++;
          resolve({ success: false, error: frame.headers['message'] || 'STOMP error' });
        },

        onWebSocketError: () => {
          console.error('[StompProvider] WebSocket connection failed');
          this.disconnectionCount++;
          resolve({ success: false, error: 'WebSocket connection failed' });
        },

        onDisconnect: () => {
          this.disconnectionCount++;
          if (!snapshotComplete) {
            resolve({
              success: receivedData.length > 0,
              data: receivedData,
              error: receivedData.length === 0 ? 'No data received' : undefined,
            });
          }
        },
      });

      try {
        client.activate();

        const timeout = this.config.snapshotTimeoutMs || 60000;
        setTimeout(() => {
          if (!snapshotComplete) {
            console.warn('[StompProvider] Snapshot timeout', { timeout, rows: receivedData.length });
            try { client.deactivate(); } catch { /* ignore */ }
            resolve({
              success: receivedData.length > 0,
              data: receivedData,
              error: receivedData.length === 0 ? 'Snapshot timeout - no data received' : undefined,
            });
          }
        }, timeout);
      } catch (error) {
        console.error('[StompProvider] Failed to activate client', error);
        resolve({ success: false, error: error instanceof Error ? error.message : 'Failed to connect' });
      }
    });
  }

  /**
   * Infer field schema from data rows.
   * Analyzes multiple rows to determine field types, nullability, and structure.
   */
  static inferFields(rows: any[]): Record<string, FieldInfo> {
    if (!rows || rows.length === 0) return {};

    const fields: Record<string, FieldInfo> = {};
    rows.forEach(row => StompDataProvider.inferObject(row, '', fields));
    return fields;
  }

  private static inferObject(obj: any, prefix: string, fields: Record<string, FieldInfo>): void {
    if (typeof obj !== 'object' || obj === null) return;

    Object.entries(obj).forEach(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;

      if (!fields[path]) {
        fields[path] = {
          path,
          type: StompDataProvider.inferType(value),
          nullable: value === null || value === undefined,
          sample: value,
        };

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          fields[path].children = {};
          StompDataProvider.inferObjectChildren(value, fields[path].children!, path);
        }
      } else {
        if (value === null || value === undefined) {
          fields[path].nullable = true;
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (!fields[path].children) fields[path].children = {};
          StompDataProvider.inferObjectChildren(value, fields[path].children!, path);
        }
      }
    });
  }

  private static inferObjectChildren(obj: any, children: Record<string, FieldInfo>, parentPath: string): void {
    Object.entries(obj).forEach(([key, value]) => {
      const fullPath = `${parentPath}.${key}`;

      if (!children[key]) {
        children[key] = {
          path: fullPath,
          type: StompDataProvider.inferType(value),
          nullable: value === null || value === undefined,
          sample: value,
        };

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          children[key].children = {};
          StompDataProvider.inferObjectChildren(value, children[key].children!, fullPath);
        }
      } else {
        if (value === null || value === undefined) {
          children[key].nullable = true;
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (!children[key].children) children[key].children = {};
          StompDataProvider.inferObjectChildren(value, children[key].children!, fullPath);
        }
      }
    });
  }

  private static inferType(value: any): FieldInfo['type'] {
    if (value === null || value === undefined) return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'date';
      if (/^\d{13}$/.test(value)) return 'date';
      return 'string';
    }
    return 'string';
  }
}

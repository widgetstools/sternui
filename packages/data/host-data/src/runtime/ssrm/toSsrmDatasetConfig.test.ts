import { describe, expect, it } from 'vitest';
import type { StompSsrmProviderConfig } from '@starui/types';
import { toSsrmDatasetConfig } from './toSsrmDatasetConfig.js';

const FULL: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/GRID1',
  requestMessage: '/snapshot/positions/GRID1/5/1000',
  requestBody: '',
  requestHeaders: { 'snapshot-rows': '20000' },
  snapshotEndToken: 'Success',
  keyColumn: 'positionId',
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
    { field: 'pnl.total', headerName: 'PnL', cellDataType: 'number' },
  ],
  inferredFields: [{ path: 'positionId', type: 'string', nullable: false }],
  tableName: 'positions',
  heartbeat: { outgoing: 2000, incoming: 2000 },
  maxBufferedRows: 50_000,
  reconnect: { initialDelayMs: 5000 },
};

describe('toSsrmDatasetConfig', () => {
  it('maps every worker-consumed field 1:1', () => {
    expect(toSsrmDatasetConfig(FULL)).toEqual({
      websocketUrl: 'ws://localhost:8081',
      listenerTopic: '/snapshot/positions/GRID1',
      requestMessage: '/snapshot/positions/GRID1/5/1000',
      requestBody: '',
      requestHeaders: { 'snapshot-rows': '20000' },
      snapshotEndToken: 'Success',
      keyColumn: 'positionId',
      columnDefinitions: FULL.columnDefinitions,
      tableName: 'positions',
      heartbeat: { outgoing: 2000, incoming: 2000 },
      maxBufferedRows: 50_000,
    });
  });

  it('drops editor-side and reserved fields (inferredFields, reconnect, providerType)', () => {
    const mapped = toSsrmDatasetConfig(FULL) as Record<string, unknown>;
    expect(mapped).not.toHaveProperty('inferredFields');
    expect(mapped).not.toHaveProperty('reconnect');
    expect(mapped).not.toHaveProperty('providerType');
  });

  it('omits blank optionals so worker "absent means skip" semantics hold', () => {
    const minimal = toSsrmDatasetConfig({
      providerType: 'stomp-ssrm',
      websocketUrl: 'ws://localhost:8081',
      listenerTopic: '/topic/t',
      requestMessage: '   ',
      requestBody: 'START',
      requestHeaders: {},
      snapshotEndToken: '',
      keyColumn: 'id',
      columnDefinitions: [],
      tableName: '  ',
    });
    // No trigger destination → no trigger frame, so no body/headers either.
    expect(minimal).toEqual({
      websocketUrl: 'ws://localhost:8081',
      listenerTopic: '/topic/t',
      keyColumn: 'id',
    });
  });

  it('keeps an empty-string requestBody when a trigger destination exists', () => {
    const mapped = toSsrmDatasetConfig({
      providerType: 'stomp-ssrm',
      websocketUrl: 'ws://x',
      listenerTopic: '/t',
      requestMessage: '/trigger',
      requestBody: '',
      keyColumn: 'id',
    });
    expect(mapped.requestMessage).toBe('/trigger');
    expect(mapped.requestBody).toBe('');
  });
});

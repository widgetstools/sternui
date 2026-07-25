/**
 * `stomp-ssrm` config type + validator — exercised through the
 * `@starui/types` re-export surface (this package owns the vitest
 * runner for the foundation types; the definitions live in
 * `@starui/shared-types/stompSsrm`).
 */
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_SUBTYPE_TO_PROVIDER_TYPE,
  DEFAULT_PROVIDER_CONFIGS,
  PROVIDER_TYPES,
  PROVIDER_TYPE_TO_COMPONENT_SUBTYPE,
  getDefaultProviderConfig,
  validateProviderConfig,
  validateStompSsrmConfig,
  type ProviderConfig,
  type StompSsrmProviderConfig,
} from './dataProvider.js';

const VALID: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/GRID1',
  requestMessage: '/snapshot/positions/GRID1/5/1000',
  snapshotEndToken: 'Success',
  keyColumn: 'positionId',
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
    { field: 'pnl.total', headerName: 'PnL', cellDataType: 'number' },
  ],
};

describe('stomp-ssrm — provider-type registration', () => {
  it('is enumerated in PROVIDER_TYPES and both subtype maps', () => {
    expect(PROVIDER_TYPES.STOMP_SSRM).toBe('stomp-ssrm');
    expect(PROVIDER_TYPE_TO_COMPONENT_SUBTYPE['stomp-ssrm']).toBe('stomp-ssrm');
    expect(COMPONENT_SUBTYPE_TO_PROVIDER_TYPE['stomp-ssrm']).toBe('stomp-ssrm');
  });

  it('ships a default config with the SSRM-required fields present', () => {
    const def = getDefaultProviderConfig('stomp-ssrm') as Partial<StompSsrmProviderConfig>;
    expect(def.providerType).toBe('stomp-ssrm');
    expect(def).toHaveProperty('keyColumn');
    expect(def).toHaveProperty('websocketUrl');
    expect(def).toHaveProperty('listenerTopic');
    // No push-plane knobs leak into the pull-plane default.
    expect(DEFAULT_PROVIDER_CONFIGS['stomp-ssrm']).not.toHaveProperty('throttleMs');
    expect(DEFAULT_PROVIDER_CONFIGS['stomp-ssrm']).not.toHaveProperty('conflateByKey');
    expect(DEFAULT_PROVIDER_CONFIGS['stomp-ssrm']).not.toHaveProperty('snapshotChunkSize');
  });

  it('is a member of the ProviderConfig union', () => {
    const cfg: ProviderConfig = VALID;
    expect(cfg.providerType).toBe('stomp-ssrm');
  });
});

describe('validateStompSsrmConfig', () => {
  it('accepts a fully-specified config', () => {
    expect(validateStompSsrmConfig(VALID)).toEqual([]);
  });

  it('flags a missing / blank keyColumn', () => {
    expect(validateStompSsrmConfig({ ...VALID, keyColumn: undefined })).toContainEqual(
      expect.objectContaining({ field: 'keyColumn', code: 'missing' }),
    );
    expect(validateStompSsrmConfig({ ...VALID, keyColumn: '   ' })).toContainEqual(
      expect.objectContaining({ field: 'keyColumn', code: 'missing' }),
    );
  });

  it('flags a composite (array) keyColumn — SSRM keys on a single column', () => {
    const issues = validateStompSsrmConfig({ ...VALID, keyColumn: ['a', 'b'] });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'keyColumn', code: 'composite-key' }),
    );
  });

  it('flags a keyColumn absent from the declared columnDefinitions', () => {
    const issues = validateStompSsrmConfig({ ...VALID, keyColumn: 'notAColumn' });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'keyColumn', code: 'key-not-in-columns' }),
    );
  });

  it('skips the column-membership check when no columns are declared (schema refined from rows)', () => {
    expect(
      validateStompSsrmConfig({ ...VALID, keyColumn: 'anything', columnDefinitions: [] }),
    ).toEqual([]);
    const { columnDefinitions: _cols, ...noCols } = VALID;
    expect(validateStompSsrmConfig({ ...noCols, keyColumn: 'anything' })).toEqual([]);
  });

  it('flags a missing websocketUrl and an empty listenerTopic', () => {
    const issues = validateStompSsrmConfig({
      providerType: 'stomp-ssrm',
      websocketUrl: '',
      listenerTopic: '',
      keyColumn: 'id',
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'websocketUrl', code: 'missing' }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'listenerTopic', code: 'missing' }),
    );
  });

  it('flags a malformed websocket URL (wrong protocol or unparseable)', () => {
    for (const bad of ['http://localhost:8081', 'not a url', 'localhost:8081']) {
      expect(validateStompSsrmConfig({ ...VALID, websocketUrl: bad })).toContainEqual(
        expect.objectContaining({ field: 'websocketUrl', code: 'malformed' }),
      );
    }
  });

  it('does not judge URL shape when template tokens are present', () => {
    expect(
      validateStompSsrmConfig({ ...VALID, websocketUrl: '{{env.brokerUrl}}' }),
    ).toEqual([]);
    expect(
      validateStompSsrmConfig({ ...VALID, websocketUrl: 'ws://[host]:8081' }),
    ).toEqual([]);
  });

  it('reports each problem independently (structured, not first-error-wins)', () => {
    const issues = validateStompSsrmConfig({
      providerType: 'stomp-ssrm',
      websocketUrl: 'ftp://nope',
      listenerTopic: '',
      keyColumn: '',
    });
    expect(issues.map((i) => i.field).sort()).toEqual([
      'keyColumn',
      'listenerTopic',
      'websocketUrl',
    ]);
  });
});

describe('validateProviderConfig — stomp-ssrm integration', () => {
  it('routes stomp-ssrm rows through the structured validator as hard errors', () => {
    const result = validateProviderConfig({
      providerType: 'stomp-ssrm',
      websocketUrl: 'ws://localhost:8081',
      listenerTopic: '/snapshot/x',
      keyColumn: '',
    } as ProviderConfig);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('Key column'))).toBe(true);
  });

  it('passes a valid stomp-ssrm config', () => {
    expect(validateProviderConfig(VALID).isValid).toBe(true);
  });
});

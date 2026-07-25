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

describe('validateStompSsrmConfig — window-side query knobs (P4b-2)', () => {
  it('accepts well-formed calc expressions, tree levels and gate knobs', () => {
    expect(
      validateStompSsrmConfig({
        ...VALID,
        calcExpressions: { pnlPerUnit: '"pnl.total" / 2' },
        treePathFields: ['positionId'],
        wideColumnThreshold: 80,
        sweepThrottleWideMs: 1000,
      }),
    ).toEqual([]);
  });

  it('flags a calc column with a blank name or blank expression', () => {
    expect(
      validateStompSsrmConfig({ ...VALID, calcExpressions: { '': '"pnl.total" * 2' } }),
    ).toContainEqual(expect.objectContaining({ field: 'calcExpressions', code: 'missing' }));
    expect(
      validateStompSsrmConfig({ ...VALID, calcExpressions: { ppu: '   ' } }),
    ).toContainEqual(expect.objectContaining({ field: 'calcExpressions', code: 'missing' }));
  });

  it('flags a calc column colliding with a declared column', () => {
    expect(
      validateStompSsrmConfig({ ...VALID, calcExpressions: { positionId: '1 + 1' } }),
    ).toContainEqual(
      expect.objectContaining({ field: 'calcExpressions', code: 'calc-name-collision' }),
    );
  });

  it("flags a calc column under the plane's reserved __ssrm prefix", () => {
    for (const name of ['__ssrm_expr', '__ssrmChildCount']) {
      expect(
        validateStompSsrmConfig({ ...VALID, calcExpressions: { [name]: '1' } }),
      ).toContainEqual(
        expect.objectContaining({ field: 'calcExpressions', code: 'calc-reserved-prefix' }),
      );
    }
  });

  it('flags a calc expression referencing another calc alias (engine limit)', () => {
    const issues = validateStompSsrmConfig({
      ...VALID,
      calcExpressions: { ppu: '"pnl.total" / 2', doubled: '"ppu" * 2' },
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: 'calcExpressions', code: 'calc-cross-reference' }),
    );
    expect(issues.filter((i) => i.field === 'calcExpressions')).toHaveLength(1);
  });

  it('flags blank, duplicate and undeclared tree levels', () => {
    expect(
      validateStompSsrmConfig({ ...VALID, treePathFields: [' '] }),
    ).toContainEqual(expect.objectContaining({ field: 'treePathFields', code: 'missing' }));
    expect(
      validateStompSsrmConfig({ ...VALID, treePathFields: ['positionId', 'positionId'] }),
    ).toContainEqual(
      expect.objectContaining({ field: 'treePathFields', code: 'tree-field-duplicate' }),
    );
    expect(
      validateStompSsrmConfig({ ...VALID, treePathFields: ['notAColumn'] }),
    ).toContainEqual(
      expect.objectContaining({ field: 'treePathFields', code: 'tree-field-not-in-columns' }),
    );
  });

  it('skips the tree-level column-membership check when no columns are declared', () => {
    expect(
      validateStompSsrmConfig({ ...VALID, columnDefinitions: [], treePathFields: ['anything'], keyColumn: 'k' }),
    ).toEqual([]);
  });

  it('flags non-positive / non-integer wide-gate knobs', () => {
    for (const bad of [0, -5, 2.5, Number.NaN]) {
      expect(
        validateStompSsrmConfig({ ...VALID, wideColumnThreshold: bad }),
      ).toContainEqual(
        expect.objectContaining({ field: 'wideColumnThreshold', code: 'malformed' }),
      );
    }
    for (const bad of [0, -100, Number.NaN]) {
      expect(
        validateStompSsrmConfig({ ...VALID, sweepThrottleWideMs: bad }),
      ).toContainEqual(
        expect.objectContaining({ field: 'sweepThrottleWideMs', code: 'malformed' }),
      );
    }
    // A fractional throttle is fine — only the threshold is a count.
    expect(validateStompSsrmConfig({ ...VALID, sweepThrottleWideMs: 750.5 })).toEqual([]);
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

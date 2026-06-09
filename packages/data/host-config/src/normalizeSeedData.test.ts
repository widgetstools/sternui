import { describe, it, expect } from 'vitest';

import {
  activeAppIdFromSeed,
  activeUserIdFromSeed,
  canonicalAppIdFromSeed,
  canonicalUserIdFromSeed,
  normalizeImportedAppConfigRow,
  normalizeSeedData,
  parseSeedJson,
} from './normalizeSeedData';

import type { AppConfigRow, SeedData } from './types';



function makeSeed(over: Partial<SeedData> & { appConfig?: AppConfigRow[] }): SeedData {

  return {
    activeAppId: 'star-demo',
    activeUserId: 'k151344',
    appRegistry: [{

      appId: 'star-demo',

      displayName: 'Star Demo',

      manifestUrl: 'http://x/m.json',

      configServiceEnabled: false,

      environment: 'dev',

    }],

    userProfiles: [{

      userId: 'k151344',

      appId: 'star-demo',

      roleIds: ['admin'],

      displayName: 'Developer',

    }],

    roles: [],

    permissions: [],

    ...over,

  };

}



describe('parseSeedJson', () => {
  it('rejects a data-provider export envelope', () => {
    expect(parseSeedJson({ kind: 'starui.dataProvider', version: 1, provider: {} })).toBeNull();
  });

  it('accepts a minimal deploy bundle', () => {
    expect(parseSeedJson(makeSeed({}))).not.toBeNull();
  });

  it('rejects JSON without appRegistry', () => {
    expect(parseSeedJson({ permissions: [] })).toBeNull();
  });

  it('rejects JSON without activeAppId / activeUserId', () => {
    expect(parseSeedJson({
      appRegistry: [{ appId: 'x', displayName: 'x', manifestUrl: 'http://x', configServiceEnabled: false, environment: 'dev' }],
      userProfiles: [],
      roles: [],
      permissions: [],
    })).toBeNull();
  });
});

describe('normalizeSeedData', () => {

  it('reads appId and userId from activeAppId / activeUserId', () => {
    const seed = makeSeed({});
    expect(activeAppIdFromSeed(seed)).toBe('star-demo');
    expect(activeUserIdFromSeed(seed)).toBe('k151344');
    expect(canonicalAppIdFromSeed(seed)).toBe('star-demo');
    expect(canonicalUserIdFromSeed(seed)).toBe('k151344');
  });



  it('re-stamps mismatched appConfig rows to the registry appId and profile userId', () => {

    const seed = makeSeed({

      appConfig: [

        {

          configId: 'dock-config',

          appId: 'TestApp',

          userId: 'dev1',

          isPublic: true,

          displayText: 'dock',

          componentType: 'dock-config',

          componentSubType: '',

          isTemplate: false,

          payload: {},

          createdBy: 'dev1',

          updatedBy: 'dev1',

          creationTime: '2026-01-01T00:00:00.000Z',

          updatedTime: '2026-01-01T00:00:00.000Z',

        },

        {

          configId: 'component-registry::TestApp::system',

          appId: 'TestApp',

          userId: 'dev1',

          isPublic: true,

          displayText: 'registry',

          componentType: 'component-registry',

          componentSubType: '',

          isTemplate: false,

          payload: { version: 2, entries: [{ id: 'grid-pnl', appId: 'TestApp' }] },

          createdBy: 'dev1',

          updatedBy: 'dev1',

          creationTime: '2026-01-01T00:00:00.000Z',

          updatedTime: '2026-01-01T00:00:00.000Z',

        },

        {

          configId: 'grid-instance-1',

          appId: 'StarDemo',

          userId: 'dev1',

          isPublic: false,

          displayText: 'grid',

          componentType: 'markets-grid-profile-set',

          componentSubType: '',

          isTemplate: false,

          payload: { version: 3, profiles: [] },

          createdBy: 'dev1',

          updatedBy: 'dev1',

          creationTime: '2026-01-01T00:00:00.000Z',

          updatedTime: '2026-01-01T00:00:00.000Z',

        },

      ],

    });



    const normalized = normalizeSeedData(seed);

    expect(normalized.appConfig![0].appId).toBe('star-demo');

    expect(normalized.appConfig![0].userId).toBe('k151344');

    expect(normalized.appConfig![1].appId).toBe('star-demo');

    expect(normalized.appConfig![1].userId).toBe('system');

    expect(normalized.appConfig![1].configId).toBe('component-registry::star-demo::system');

    expect((normalized.appConfig![1].payload as { entries: Array<{ appId: string }> }).entries[0].appId).toBe('star-demo');

    expect(normalized.appConfig![2].appId).toBe('star-demo');

    expect(normalized.appConfig![2].userId).toBe('k151344');

  });



  it('re-stamps mismatched userProfiles appId', () => {

    const seed = makeSeed({

      userProfiles: [{

        userId: 'k151344',

        appId: 'StarDemo',

        roleIds: ['admin'],

        displayName: 'Developer',

      }],

    });

    const normalized = normalizeSeedData(seed);

    expect(normalized.userProfiles![0].appId).toBe('star-demo');

  });



  it('normalizeImportedAppConfigRow rescopes registry configId on import', () => {
    const row = makeSeed({}).appConfig?.[0] ?? {
      configId: 'component-registry::TestApp::system',
      appId: 'TestApp',
      userId: 'system',
      isPublic: true,
      displayText: 'registry',
      componentType: 'component-registry',
      componentSubType: '',
      isTemplate: false,
      payload: { version: 2, entries: [{ id: 'grid', appId: 'TestApp' }] },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00.000Z',
      updatedTime: '2026-01-01T00:00:00.000Z',
    };
    const normalized = normalizeImportedAppConfigRow(row, {
      activeAppId: 'star-demo',
      activeUserId: 'k151344',
    });
    expect(normalized.configId).toBe('component-registry::star-demo::system');
    expect(normalized.appId).toBe('star-demo');
    expect(normalized.userId).toBe('system');
  });

  it('is a no-op when rows already match the registry scope', () => {

    const seed = makeSeed({

      appConfig: [{

        configId: 'dock-config',

        appId: 'star-demo',

        userId: 'k151344',

        isPublic: true,

        displayText: 'dock',

        componentType: 'dock-config',

        componentSubType: '',

        isTemplate: false,

        payload: {},

        createdBy: 'k151344',

        updatedBy: 'k151344',

        creationTime: '2026-01-01T00:00:00.000Z',

        updatedTime: '2026-01-01T00:00:00.000Z',

      }],

    });

    expect(normalizeSeedData(seed)).toBe(seed);

  });

});



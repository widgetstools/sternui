import { describe, it, expect } from 'vitest';
import { resolveBrowserIdentity } from './identity.js';

describe('resolveBrowserIdentity', () => {
  const fixedUuid = () => 'fixed-uuid';

  it('uses URL params when present', () => {
    const id = resolveBrowserIdentity(
      'instanceId=i1&appId=app1&userId=u1&componentType=MarketsGrid&componentSubType=positions&isTemplate=true&singleton=true&roles=trader,admin&permissions=read,write',
      {},
      fixedUuid,
    );
    expect(id).toEqual({
      instanceId: 'i1',
      appId: 'app1',
      userId: 'u1',
      componentType: 'MarketsGrid',
      componentSubType: 'positions',
      isTemplate: true,
      singleton: true,
      roles: ['trader', 'admin'],
      permissions: ['read', 'write'],
      customData: {},
    });
  });

  it('falls back to overrides when URL params are missing', () => {
    const id = resolveBrowserIdentity(
      '',
      {
        appId: 'app-default',
        userId: 'u-default',
        componentType: 'OrderBook',
        roles: ['viewer'],
      },
      fixedUuid,
    );
    expect(id.appId).toBe('app-default');
    expect(id.userId).toBe('u-default');
    expect(id.componentType).toBe('OrderBook');
    expect(id.roles).toEqual(['viewer']);
    expect(id.permissions).toEqual([]);
    expect(id.instanceId).toBe('browser-fixed-uuid');
  });

  it('mints a fresh instanceId when neither URL nor overrides supply one', () => {
    const id = resolveBrowserIdentity('appId=x', {}, fixedUuid);
    expect(id.instanceId).toBe('browser-fixed-uuid');
  });

  it('URL params take precedence over overrides', () => {
    const id = resolveBrowserIdentity('appId=fromUrl', { appId: 'fromOverride' }, fixedUuid);
    expect(id.appId).toBe('fromUrl');
  });

  it('roles=&permissions= empty strings produce empty arrays (not undefined)', () => {
    const id = resolveBrowserIdentity('roles=&permissions=', {}, fixedUuid);
    expect(id.roles).toEqual([]);
    expect(id.permissions).toEqual([]);
  });

  it('decodes ?data= base64 JSON into customData and merges over overrides.customData', () => {
    const payload = { foo: 1, bar: 'baz' };
    const encoded = btoa(JSON.stringify(payload));
    const id = resolveBrowserIdentity(
      `data=${encoded}`,
      { customData: { foo: 999, baseline: true } },
      fixedUuid,
    );
    expect(id.customData).toEqual({ baseline: true, foo: 1, bar: 'baz' });
  });

  it('malformed ?data= payload is ignored, identity still resolves', () => {
    const id = resolveBrowserIdentity('data=not-base64', { appId: 'a' }, fixedUuid);
    expect(id.appId).toBe('a');
    expect(id.customData).toEqual({});
  });
});

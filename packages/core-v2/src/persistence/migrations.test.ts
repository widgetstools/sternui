import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryAdapter } from './MemoryAdapter';
import { migrateLegacyLocalStorage } from './migrations';
import { RESERVED_DEFAULT_PROFILE_ID } from './StorageAdapter';

describe('migrateLegacyLocalStorage', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('is a no-op when no legacy keys exist', async () => {
    await migrateLegacyLocalStorage('g1', adapter);
    expect(await adapter.listProfiles('g1')).toEqual([]);
  });

  it('seeds Default from legacy gc-state and removes both legacy keys', async () => {
    const legacy = { 'general-settings': { v: 1, data: { theme: 'dark' } } };
    localStorage.setItem('gc-state:g1', JSON.stringify(legacy));
    localStorage.setItem('gc-grid:g1', '{"some":"junk"}');

    await migrateLegacyLocalStorage('g1', adapter);

    const def = await adapter.loadProfile('g1', RESERVED_DEFAULT_PROFILE_ID);
    expect(def).not.toBeNull();
    expect(def!.name).toBe('Default');
    expect(def!.state).toEqual(legacy);
    expect(localStorage.getItem('gc-state:g1')).toBeNull();
    expect(localStorage.getItem('gc-grid:g1')).toBeNull();
  });

  it('preserves the active-profile localStorage key', async () => {
    localStorage.setItem('gc-state:g1', '{}');
    localStorage.setItem('gc-active-profile:g1', 'my-profile');
    await migrateLegacyLocalStorage('g1', adapter);
    expect(localStorage.getItem('gc-active-profile:g1')).toBe('my-profile');
  });

  it('does not overwrite an existing Default profile (idempotent re-runs)', async () => {
    // First run seeds Default with version 1.
    localStorage.setItem('gc-state:g1', JSON.stringify({ a: { v: 1, data: 'first' } }));
    await migrateLegacyLocalStorage('g1', adapter);

    // Simulate the user running v2 for a while — Default's contents change.
    const after = await adapter.loadProfile('g1', RESERVED_DEFAULT_PROFILE_ID);
    after!.state = { a: { v: 1, data: 'updated by v2' } };
    after!.updatedAt = Date.now();
    await adapter.saveProfile(after!);

    // Now suppose a stale gc-state somehow reappears (browser restored a
    // backup, etc.). Migration must not stomp the newer Default.
    localStorage.setItem('gc-state:g1', JSON.stringify({ a: { v: 1, data: 'STALE' } }));
    await migrateLegacyLocalStorage('g1', adapter);

    const final = await adapter.loadProfile('g1', RESERVED_DEFAULT_PROFILE_ID);
    expect(final!.state).toEqual({ a: { v: 1, data: 'updated by v2' } });
    expect(localStorage.getItem('gc-state:g1')).toBeNull();
  });

  it('drops corrupt JSON and still removes the legacy keys', async () => {
    localStorage.setItem('gc-state:g1', '{not valid json');
    localStorage.setItem('gc-grid:g1', 'also-junk');
    await migrateLegacyLocalStorage('g1', adapter);
    expect(localStorage.getItem('gc-state:g1')).toBeNull();
    expect(localStorage.getItem('gc-grid:g1')).toBeNull();
    // No Default seeded — the parse failed, so we have nothing to write.
    expect(await adapter.loadProfile('g1', RESERVED_DEFAULT_PROFILE_ID)).toBeNull();
  });

  it('scopes per-grid: g1 migration leaves g2 keys untouched', async () => {
    localStorage.setItem('gc-state:g1', '{}');
    localStorage.setItem('gc-state:g2', '{}');
    await migrateLegacyLocalStorage('g1', adapter);
    expect(localStorage.getItem('gc-state:g1')).toBeNull();
    expect(localStorage.getItem('gc-state:g2')).toBe('{}');
  });
});

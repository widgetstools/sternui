import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './MemoryAdapter';
import type { ProfileSnapshot } from './StorageAdapter';

const snap = (over: Partial<ProfileSnapshot> = {}): ProfileSnapshot => ({
  id: 'p1',
  gridId: 'g1',
  name: 'P1',
  state: { mod: { v: 1, data: { hello: 'world' } } },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('MemoryAdapter', () => {
  it('save → load round-trips structurally', async () => {
    const a = new MemoryAdapter();
    await a.saveProfile(snap());
    const got = await a.loadProfile('g1', 'p1');
    expect(got).toEqual(snap());
  });

  it('returns null for missing profiles', async () => {
    const a = new MemoryAdapter();
    expect(await a.loadProfile('g1', 'ghost')).toBeNull();
  });

  it('listProfiles is scoped per gridId', async () => {
    const a = new MemoryAdapter();
    await a.saveProfile(snap({ id: 'p1', gridId: 'g1' }));
    await a.saveProfile(snap({ id: 'p2', gridId: 'g1' }));
    await a.saveProfile(snap({ id: 'p3', gridId: 'g2' }));
    expect((await a.listProfiles('g1')).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect((await a.listProfiles('g2')).map((p) => p.id)).toEqual(['p3']);
  });

  it('deleteProfile removes only the targeted (gridId, id) pair', async () => {
    const a = new MemoryAdapter();
    await a.saveProfile(snap({ id: 'p1', gridId: 'g1' }));
    await a.saveProfile(snap({ id: 'p1', gridId: 'g2' }));
    await a.deleteProfile('g1', 'p1');
    expect(await a.loadProfile('g1', 'p1')).toBeNull();
    expect(await a.loadProfile('g2', 'p1')).not.toBeNull();
  });

  it('clones on save and load — caller mutations do not bleed into stored state', async () => {
    const a = new MemoryAdapter();
    const original = snap();
    await a.saveProfile(original);
    // Mutate the input after saving.
    (original.state.mod.data as { hello: string }).hello = 'MUTATED';
    const got = await a.loadProfile('g1', 'p1');
    expect((got!.state.mod.data as { hello: string }).hello).toBe('world');

    // Mutate the loaded copy — re-loading should still see the original.
    (got!.state.mod.data as { hello: string }).hello = 'AGAIN';
    const second = await a.loadProfile('g1', 'p1');
    expect((second!.state.mod.data as { hello: string }).hello).toBe('world');
  });
});

import { describe, expect, it } from 'vitest';
import { applyTick } from './applyTick';
import { seedState } from './seeds';

const rngUp = () => 0.9;    // deterministic high → upward nudge
const rngDown = () => 0.1;  // deterministic low → downward nudge

describe('applyTick', () => {
  it('returns a new state object (immutability)', () => {
    const s0 = seedState(0);
    const s1 = applyTick(s0, rngUp);
    expect(s1).not.toBe(s0);
    expect(s1.quotes).not.toBe(s0.quotes);
  });

  it('nudges mids and sets a direction flag', () => {
    const s0 = seedState(0);
    const id = s0.instruments[0].id;
    const s1 = applyTick(s0, rngUp);
    expect(s1.quotes[id].mid).not.toBe(s0.quotes[id].mid);
    expect(['up', 'down', 'flat']).toContain(s1.quotes[id].dir);
  });

  it('keeps row ids stable and bid <= mid <= ask', () => {
    const s0 = seedState(0);
    const s1 = applyTick(s0, rngDown);
    expect(Object.keys(s1.quotes).sort()).toEqual(Object.keys(s0.quotes).sort());
    for (const q of Object.values(s1.quotes)) {
      expect(q.bid).toBeLessThanOrEqual(q.mid + 1e-9);
      expect(q.mid).toBeLessThanOrEqual(q.ask + 1e-9);
    }
  });

  it('caps price history length', () => {
    const id = seedState(0).instruments[0].id;
    let s = seedState(0);
    for (let i = 0; i < 100; i++) s = applyTick(s, rngUp);
    expect(s.history[id].length).toBeLessThanOrEqual(60);
  });
});

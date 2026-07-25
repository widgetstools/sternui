import { describe, expect, it } from 'vitest';
import { DatasetStateMachine } from './DatasetStateMachine.js';
import type { DatasetStateSnapshot } from './types.js';

function recordingMachine(): { machine: DatasetStateMachine; log: DatasetStateSnapshot[] } {
  const log: DatasetStateSnapshot[] = [];
  const machine = new DatasetStateMachine((s) => log.push(s));
  return { machine, log };
}

describe('DatasetStateMachine — happy path', () => {
  it('starts connecting at generation 1 with zero rows', () => {
    const { machine } = recordingMachine();
    expect(machine.state).toEqual({ phase: 'connecting', rowCount: 0, generation: 1 });
  });

  it('walks connecting → seeding → live with rising rowCount', () => {
    const { machine, log } = recordingMachine();
    expect(machine.dialed(1)).toBe(true);
    expect(machine.state.phase).toBe('seeding');
    expect(machine.snapshotBatch(1, 500)).toBe(true);
    expect(machine.snapshotBatch(1, 250)).toBe(true);
    expect(machine.state.rowCount).toBe(750);
    expect(machine.snapshotEnd(1)).toBe(true);
    expect(machine.state).toEqual({ phase: 'live', rowCount: 750, generation: 1 });
    expect(log.map((s) => s.phase)).toEqual(['seeding', 'seeding', 'seeding', 'live']);
    // Monotone rowCount through the seed.
    const counts = log.map((s) => s.rowCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('emits a snapshot per transition (listener sees settled state)', () => {
    const { machine, log } = recordingMachine();
    machine.dialed(1);
    machine.snapshotBatch(1, 10);
    expect(log[1]).toEqual({ phase: 'seeding', rowCount: 10, generation: 1 });
  });
});

describe('DatasetStateMachine — configure-vs-seed ordering', () => {
  it('a snapshot batch that beats the dialed event implies the dial', () => {
    const { machine } = recordingMachine();
    expect(machine.snapshotBatch(1, 100)).toBe(true);
    expect(machine.state).toEqual({ phase: 'seeding', rowCount: 100, generation: 1 });
  });

  it('the late dialed after an early batch does not reset the count', () => {
    const { machine } = recordingMachine();
    machine.snapshotBatch(1, 100);
    expect(machine.dialed(1)).toBe(false);
    expect(machine.state).toEqual({ phase: 'seeding', rowCount: 100, generation: 1 });
  });

  it('a duplicate dialed while live is dropped', () => {
    const { machine } = recordingMachine();
    machine.dialed(1);
    machine.snapshotBatch(1, 5);
    machine.snapshotEnd(1);
    expect(machine.dialed(1)).toBe(false);
    expect(machine.state.phase).toBe('live');
  });
});

describe('DatasetStateMachine — 0-rows ambiguity', () => {
  it('an end token after zero batches is empty, never live(0)', () => {
    const { machine } = recordingMachine();
    machine.dialed(1);
    machine.snapshotEnd(1);
    expect(machine.state).toEqual({ phase: 'empty', rowCount: 0, generation: 1 });
  });

  it('an end token that even beats the dial is still empty', () => {
    const { machine } = recordingMachine();
    expect(machine.snapshotEnd(1)).toBe(true);
    expect(machine.state.phase).toBe('empty');
  });

  it('live rows arriving after an empty seed promote to live', () => {
    const { machine } = recordingMachine();
    machine.dialed(1);
    machine.snapshotEnd(1);
    expect(machine.liveRows(1, 3)).toBe(true);
    expect(machine.state).toEqual({ phase: 'live', rowCount: 3, generation: 1 });
  });

  it('a live rowCount refresh updates live state without a phase change', () => {
    const { machine } = recordingMachine();
    machine.snapshotBatch(1, 10);
    machine.snapshotEnd(1);
    expect(machine.liveRows(1, 12)).toBe(true);
    expect(machine.state).toEqual({ phase: 'live', rowCount: 12, generation: 1 });
    expect(machine.liveRows(1, 12)).toBe(false); // no change → no transition
  });
});

describe('DatasetStateMachine — restart adoption', () => {
  it('restart bumps THE generation token and resets to connecting', () => {
    const { machine, log } = recordingMachine();
    machine.snapshotBatch(1, 100);
    machine.snapshotEnd(1);
    const gen = machine.restart();
    expect(gen).toBe(2);
    expect(machine.state).toEqual({ phase: 'connecting', rowCount: 0, generation: 2 });
    expect(log.at(-1)).toEqual({ phase: 'connecting', rowCount: 0, generation: 2 });
  });

  it('drops every stale-generation event after a restart', () => {
    const { machine } = recordingMachine();
    machine.snapshotBatch(1, 100);
    machine.restart(); // gen 2, old session teardown still in flight
    expect(machine.snapshotBatch(1, 50)).toBe(false);
    expect(machine.snapshotEnd(1)).toBe(false);
    expect(machine.dialed(1)).toBe(false);
    expect(machine.liveRows(1, 999)).toBe(false);
    expect(machine.streamError(1, 'stale socket died')).toBe(false);
    expect(machine.state).toEqual({ phase: 'connecting', rowCount: 0, generation: 2 });
  });

  it('adopts the new generation session normally after restart', () => {
    const { machine } = recordingMachine();
    machine.snapshotBatch(1, 100);
    const gen = machine.restart();
    machine.dialed(gen);
    machine.snapshotBatch(gen, 40);
    machine.snapshotEnd(gen);
    expect(machine.state).toEqual({ phase: 'live', rowCount: 40, generation: 2 });
  });

  it('future-generation events (impossible sender) are dropped too', () => {
    const { machine } = recordingMachine();
    expect(machine.snapshotBatch(7, 10)).toBe(false);
    expect(machine.state.generation).toBe(1);
  });
});

describe('DatasetStateMachine — errors', () => {
  it('streamError is terminal for the generation', () => {
    const { machine } = recordingMachine();
    machine.snapshotBatch(1, 10);
    expect(machine.streamError(1, 'broker gone')).toBe(true);
    expect(machine.state).toEqual({
      phase: 'error',
      rowCount: 10,
      generation: 1,
      error: 'broker gone',
    });
    // Same-generation frames after the error are dropped.
    expect(machine.snapshotBatch(1, 10)).toBe(false);
    expect(machine.snapshotEnd(1)).toBe(false);
    expect(machine.streamError(1, 'second error')).toBe(false);
    expect(machine.state.error).toBe('broker gone');
  });

  it('restart recovers from error and clears the detail', () => {
    const { machine } = recordingMachine();
    machine.streamError(1, 'dial failed');
    const gen = machine.restart();
    expect(machine.state).toEqual({ phase: 'connecting', rowCount: 0, generation: 2 });
    machine.dialed(gen);
    machine.snapshotBatch(gen, 1);
    machine.snapshotEnd(gen);
    expect(machine.state.phase).toBe('live');
  });
});

import { describe, expect, it } from 'vitest';
import { classifyFrame, matchesEndToken } from './stompFrames.js';

describe('matchesEndToken', () => {
  it('is a case-insensitive substring match', () => {
    expect(matchesEndToken('Success: All 20000 positions records delivered', 'success')).toBe(true);
    expect(matchesEndToken('starting live updates...', 'Starting Live Updates')).toBe(true);
    expect(matchesEndToken('[]', 'success')).toBe(false);
  });

  it('never matches without a configured token', () => {
    expect(matchesEndToken('Success', undefined)).toBe(false);
    expect(matchesEndToken('Success', '')).toBe(false);
  });
});

describe('classifyFrame', () => {
  it('classifies the end token first, even against JSON-looking bodies', () => {
    expect(classifyFrame('Success: All 500 records delivered.', 'success')).toEqual({ kind: 'end' });
    expect(classifyFrame('{"note":"Success"}', 'success')).toEqual({ kind: 'end' });
  });

  it('parses JSON array batches into rows', () => {
    expect(classifyFrame('[{"id":"a"},{"id":"b"}]', 'success')).toEqual({
      kind: 'rows',
      rows: [{ id: 'a' }, { id: 'b' }],
    });
  });

  it('unwraps {rows:[...]} and {data:[...]} envelopes', () => {
    expect(classifyFrame('{"rows":[{"id":1}]}', undefined)).toEqual({
      kind: 'rows',
      rows: [{ id: 1 }],
    });
    expect(classifyFrame('{"data":[{"id":2}]}', undefined)).toEqual({
      kind: 'rows',
      rows: [{ id: 2 }],
    });
  });

  it('treats a bare object as a one-row batch', () => {
    expect(classifyFrame('{"id":"solo"}', undefined)).toEqual({
      kind: 'rows',
      rows: [{ id: 'solo' }],
    });
  });

  it('ignores non-JSON, empty, and rowless bodies', () => {
    expect(classifyFrame('', 'success')).toEqual({ kind: 'ignore' });
    expect(classifyFrame('   ', 'success')).toEqual({ kind: 'ignore' });
    expect(classifyFrame('heartbeat', 'success')).toEqual({ kind: 'ignore' });
    expect(classifyFrame('[]', 'success')).toEqual({ kind: 'ignore' });
    expect(classifyFrame('[1,2,3]', 'success')).toEqual({ kind: 'ignore' });
    expect(classifyFrame('42', 'success')).toEqual({ kind: 'ignore' });
  });
});

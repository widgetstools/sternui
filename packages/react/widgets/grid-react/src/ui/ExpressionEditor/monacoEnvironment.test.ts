import { describe, expect, it } from 'vitest';
import { ensureMonacoWorkerEnvironment } from './monacoEnvironment';

describe('ensureMonacoWorkerEnvironment', () => {
  it('is idempotent and records the passed api on window', () => {
    const fakeApi = { Range: class {} } as unknown as typeof import('monaco-editor');
    ensureMonacoWorkerEnvironment(fakeApi);
    ensureMonacoWorkerEnvironment(fakeApi);
    interface W { MonacoEnvironment?: unknown; monaco?: unknown }
    const w = globalThis as unknown as W;
    expect(w.MonacoEnvironment).toBeDefined();
    expect(w.monaco).toBe(fakeApi);
  });
});

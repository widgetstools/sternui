import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createDataServicesWorker } from './createDataServicesWorker.js';

class MockSharedWorker {
  port = {};
  addEventListener = vi.fn();

  constructor(
    public url: URL,
    public opts: SharedWorkerOptions,
  ) {}
}

describe('createDataServicesWorker', () => {
  beforeEach(() => {
    vi.stubGlobal('SharedWorker', MockSharedWorker);
    vi.stubGlobal('location', { href: 'http://localhost:5174/' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the worker from appName and stamps REST URL query param', () => {
    const worker = createDataServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'demo-app',
      configServiceRestUrl: 'http://localhost:3000/api',
    });

    expect(worker).toBeInstanceOf(MockSharedWorker);
    expect(worker.url.pathname).toContain('data-services-worker.mjs');
    expect(worker.url.searchParams.get('configServiceRestUrl')).toBe(
      'http://localhost:3000/api',
    );
    expect(worker.opts).toMatchObject({
      type: 'module',
      name: 'mkt-data-services:demo-app',
    });
  });

  it('accepts absolute worker script URLs', () => {
    const worker = createDataServicesWorker('https://cdn.example/worker.mjs', {
      appName: 'remote',
    });

    expect(worker.url.href).toBe('https://cdn.example/worker.mjs');
  });
});

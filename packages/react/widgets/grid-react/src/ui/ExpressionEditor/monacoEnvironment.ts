import type * as monaco from 'monaco-editor';

/**
 * One-time Monaco worker stub: our DSL does not need TS/CSS/HTML workers.
 * Satisfies Monaco's global plumbing without bundling real workers.
 */
export function ensureMonacoWorkerEnvironment(monacoApi: typeof monaco): void {
  interface MonacoWorkerWindow extends Window {
    MonacoEnvironment?: unknown;
    monaco?: typeof monaco;
  }
  const w = globalThis as unknown as MonacoWorkerWindow;
  if (!w.MonacoEnvironment) {
    w.MonacoEnvironment = {
      getWorker() {
        return {
          postMessage: () => {},
          terminate: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      },
    };
  }
  w.monaco = monacoApi;
}

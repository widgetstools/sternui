export type { SsrmEngine, SsrmEngineKind } from './types.js';
export { createCustomEngine } from './customEngine.js';
export { materializeCalcColumns } from './materializeCalcColumns.js';

// Perspective-backed engine — dataset hosted once in the provider
// SharedWorker, windows hold only viewports (ADR-ssrm-worker-hosted-engine.md).
export { createPerspectiveEngine } from './perspectiveEngine.js';
export type { PerspectiveEngineOpts } from './perspectiveEngine.js';
export { PerspectiveViewCache, viewCacheKey } from './perspectiveViewCache.js';
export type {
  PerspectiveClient,
  PerspectiveTable,
  PerspectiveView,
  PerspectiveViewConfig,
} from './perspectiveTypes.js';

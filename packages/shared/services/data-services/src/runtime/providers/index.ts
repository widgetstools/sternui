/**
 * Probe surface — pure main-thread functions for one-shot snapshot
 * fetches and field inference. Same vocabulary as the streaming
 * runtime; calling them in-process is the design doc's
 * `transport: 'main'` mode.
 *
 * Usage:
 *   import { probeStomp, probeRest, inferFields } from '@starui/data-services';
 *   const r = await probeStomp(cfg, { maxRows: 100 });
 *   if (!r.ok) throw new Error(r.error);
 *   const { fields } = inferFields(r.rows!, { targetSampleSize: 100 });
 */

export { probeStomp } from './transports/stomp.js';
export type {
  ProbeResult as StompProbeResult,
  ProbeOpts as StompProbeOpts,
} from './transports/stomp.js';

export { probeRest } from './transports/rest.js';
export type { ProbeResult as RestProbeResult } from './transports/rest.js';

export { inferFields, type InferOptions } from './inferFields.js';

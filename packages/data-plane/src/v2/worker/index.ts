/**
 * Worker-side barrel. Imported only by the SharedWorker entry file
 * in each app. Main-thread code should not pull this — it'd drag the
 * Hub into the page bundle.
 */

export { Hub, type HubOpts, type PortLike } from './Hub.js';
export { installWorker, type InstallOpts, type InstalledWorker } from './entry.js';
export { registerProvider, startProvider, type ProviderFactory } from '../providers/registry.js';
export { startMock, type MockProviderOpts } from '../providers/mock.js';
export {
  startStomp,
  probeStomp,
  type StompOpts,
  type StompClientFactory,
  type ProbeResult,
  type ProbeOpts,
} from '../providers/stomp.js';
export { inferFields, type InferOptions } from '../providers/inferFields.js';
export type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';

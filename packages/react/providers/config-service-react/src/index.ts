// ─── @starui/config-service-react ──────────────────────────────────
//
// React bindings for `@starui/config-service`. One Provider, one
// hook, one context value. The Provider takes the host's identity +
// appId (plus optional seed / REST URLs) and constructs a fully
// initialised `ConfigManager` that publishes `ApplicationContext`
// into the surrounding `<DataServicesProvider>`. Descendants read
// the live `{ configManager, storage, appId, userId,
// applicationContext }` via `useConfigService()`.
//
//   import { ConfigServiceProvider, useConfigService }
//     from '@starui/config-service-react';

export {
  ConfigServiceProvider,
  type ConfigServiceProviderProps,
} from './ConfigServiceProvider';
export { useConfigService } from './useConfigService';
export type { ConfigServiceContextValue } from './types';

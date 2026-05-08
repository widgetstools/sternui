/**
 * @starui/data-services-react — React bindings.
 *
 * Thin React adapter over `@starui/data-services`. Exports the
 * `DataServicesProvider` and the `useProviderStream` /
 * `useResolvedCfg` / `useAppDataStore` / `useDataProvidersList` hooks.
 *
 *   import { DataServicesProvider, useProviderStream, ... }
 *     from '@starui/data-services-react/runtime';
 *
 * The root export re-exports the runtime surface for convenience so
 * `@starui/data-services-react` continues to be a usable barrel.
 */

export * from './runtime/index.js';

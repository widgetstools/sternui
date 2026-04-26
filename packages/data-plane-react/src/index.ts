/**
 * @marketsui/data-plane-react — React bindings for @marketsui/data-plane.
 *
 * One context provider + three hooks:
 *   • `<DataPlaneProvider client={...}>` — mount near the app root.
 *   • `useDataPlaneClient()` — escape hatch to the underlying client.
 *   • `useDataPlaneValue(providerId, key)` — keyed-resource value, auto-updates.
 *   • `useDataPlaneAppData(providerId, key)` — AppData k/v with `setValue`.
 *   • `useDataPlaneRowStream(providerId)` — row-stream subscription with
 *     buffered + `onEvent` (unbuffered) modes.
 *
 * Framework dependency lives here alone; `@marketsui/data-plane` stays
 * React-free.
 */
export { DataPlaneProvider, useDataPlaneClient, type DataPlaneProviderProps } from './context';
export { useDataPlaneValue, type UseValueOpts, type UseValueResult } from './useDataPlaneValue';
export {
  useDataPlaneAppData,
  type SetAppDataValue,
  type UseAppDataResult,
} from './useDataPlaneAppData';
export {
  useDataPlaneRowStream,
  type UseRowStreamOpts,
  type UseRowStreamResult,
} from './useDataPlaneRowStream';
export { useDataPlaneRestart, type UseRestartResult } from './useDataPlaneRestart';
export { useDataPlaneResolve, type UseResolveResult } from './useDataPlaneResolve';

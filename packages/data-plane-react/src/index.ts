/**
 * @marketsui/data-plane-react — React bindings.
 *
 * The v2 data-plane is the live surface; the v1 React hooks and the
 * v1 context provider are gone. New consumers import from the v2
 * subpath:
 *
 *   import { DataPlaneProvider, useProviderStream, useResolvedCfg, ... }
 *     from '@marketsui/data-plane-react/v2';
 *
 * The root export re-exports the v2 surface for convenience so
 * `@marketsui/data-plane-react` continues to be a usable barrel.
 */

export * from './v2/index.js';

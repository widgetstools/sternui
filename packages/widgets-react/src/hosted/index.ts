/**
 * Public surface for hosted-feature wrappers.
 *
 * Today: the type contract used by `<HostedMarketsGrid>` and the
 * underlying identity / storage primitives. Future sessions of the
 * HostedMarketsGrid refactor add the hooks and the wrapper component
 * itself to this barrel.
 */

export type {
  HostedContext,
  RegisteredComponentMetadata,
  ConfigManager,
  StorageAdapterFactory,
} from './types.js';

export { useHostedIdentity } from './useHostedIdentity.js';
export type {
  UseHostedIdentityArgs,
  UseHostedIdentityResult,
} from './useHostedIdentity.js';

export { useAgGridTheme } from './useAgGridTheme.js';
export type { AgGridThemeMode } from './useAgGridTheme.js';

export { HostedMarketsGrid } from './HostedMarketsGrid.js';
export type { HostedMarketsGridProps } from './HostedMarketsGrid.js';

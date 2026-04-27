/**
 * REST configurator hooks. The Columns hook is shared with STOMP since
 * the column-build pipeline (FieldNode → ColumnDefinition via the
 * shared columnRegistry) is transport-agnostic.
 */

export { useRestConnectionTest } from './useRestConnectionTest.js';
export type {
  UseRestConnectionTestReturn,
  ConnectionTestResult,
} from './useRestConnectionTest.js';

export { useRestFieldInference } from './useRestFieldInference.js';
export type { UseRestFieldInferenceReturn } from './useRestFieldInference.js';

// Re-exported so the REST form imports a single hooks barrel.
export { useColumnConfig } from '../../stomp/hooks/useColumnConfig.js';
export type { UseColumnConfigReturn } from '../../stomp/hooks/useColumnConfig.js';

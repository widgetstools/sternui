// @marketsui/widgets — Provider Editor Components

// ─── Components ─────────────────────────────────
export { DataProviderEditor } from './DataProviderEditor.js';
export { ProviderForm } from './ProviderForm.js';
export { ProviderList } from './ProviderList.js';
export { TypeSelectionDialog } from './TypeSelectionDialog.js';
export { KeyValueEditor } from './KeyValueEditor.js';
export { StompConfigurationForm } from './stomp/StompConfigurationForm.js';

// ─── Hooks ──────────────────────────────────────
export {
  useDataProviders,
  useDataProvider,
  useCreateDataProvider,
  useUpdateDataProvider,
  useDeleteDataProvider,
  dataProviderKeys,
} from './hooks/useDataProviderQueries.js';

// ─── Service ────────────────────────────────────
export { DataProviderConfigService, dataProviderConfigService } from './services/dataProviderConfigService.js';

// ─── STOMP Provider (for field inference in non-React contexts) ──────────────
export { StompDataProvider } from './stomp/StompDatasourceProvider.js';

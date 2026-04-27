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
  useVisibleDataProviders,
  useDataProvider,
  useCreateDataProvider,
  useUpdateDataProvider,
  useDeleteDataProvider,
  dataProviderKeys,
} from './hooks/useDataProviderQueries.js';

// ─── Column registry (formatters + cell renderers) ─────────────
export {
  FORMATTERS,
  CELL_RENDERERS,
  DEFAULT_FORMATTER_BY_TYPE,
  DEFAULT_RENDERER_BY_TYPE,
  formattersFor,
  renderersFor,
  defaultColumnFor,
  type FormatterOption,
  type CellRendererOption,
  type CellDataType,
} from './columnRegistry.js';

/**
 * Registry Editor configuration types.
 *
 * The Registry Editor allows users to register reusable components
 * (React or Angular) and manage their template configurations.
 */

/** A single registered component entry.
 *  All registered components are template components by design. */
export interface RegistryEntry {
  /** Unique identifier (UUID). */
  id: string;
  /** Route or URL where the component is hosted. */
  hostUrl: string;
  /** Icon identifier (e.g., "mkt:bond", "lucide:home"). */
  iconId: string;
  /** Component classification (e.g., "GRID", "CHART", "HEATMAP", "ORDERTICKET"). */
  componentType: string;
  /** Component sub-classification (e.g., "CREDIT", "RATES", "MBS"). */
  componentSubType: string;
  /** Config ID for the template APP_CONFIG row. Defaults to generateTemplateConfigId() output but user can override. */
  configId: string;
  /** Human-readable display name. */
  displayName: string;
  /** ISO 8601 timestamp of when this entry was created. */
  createdAt: string;
}

/** The full registry editor configuration, persisted as an APP_CONFIG row. */
export interface RegistryEditorConfig {
  /** Config format version for future migration. */
  version: number;
  /** All registered component entries. */
  entries: RegistryEntry[];
}

/**
 * Generate the config ID for a template component.
 * Format: `templateComponent<ComponentType><ComponentSubType>`
 * e.g., `templateComponentGRIDCREDIT`
 */
export function generateTemplateConfigId(componentType: string, componentSubType: string): string {
  return `templateComponent${componentType}${componentSubType}`;
}

/**
 * Field-format catalog — barrel.
 *
 * A curated repository of FI/equity field names mapped to formats, alignment
 * and theme-safe semantic colour, plus the matcher and plan builder that the
 * "Auto Format" toolbar action uses.
 */
export { FIELD_FORMAT_CATALOG } from './fieldFormatCatalog.js';
export { matchFieldToCatalog, normalizeToken } from './matchFieldToCatalog.js';
export { buildAutoFormatPlan } from './buildAutoFormatPlan.js';
export type {
  AutoFormatAlignment,
  AutoFormatAssignment,
  AutoFormatColumn,
  AutoFormatRendererId,
  FieldFormatEntry,
} from './types.js';

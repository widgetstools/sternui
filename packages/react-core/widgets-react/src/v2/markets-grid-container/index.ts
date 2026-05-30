/**
 * v2 MarketsGridContainer barrel.
 *
 * Subpath import: `@starui/widgets-react/v2/markets-grid-container`
 *
 * The optional `@starui/grid` peer dep is unchanged from
 * v1: consumers who don't use MarketsGrid skip this barrel and the
 * dep stays out of their tree.
 */

export {
  MarketsGridContainer,
  type MarketsGridContainerProps,
  type ProviderSelection,
  type ProviderMode,
} from './MarketsGridContainer.js';
export { DatePicker, type DatePickerProps } from './DatePicker.js';

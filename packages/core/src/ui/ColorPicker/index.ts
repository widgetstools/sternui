/**
 * Cockpit ColorPicker kit — a single compact inline field that opens a
 * Figma-style popover shell (alpha slider + panel-local recents strip).
 *
 *   import { CompactColorField } from '@grid-customizer/core';
 *
 * The popover shell is an implementation detail of CompactColorField;
 * it's NOT exported. FormattingToolbar and other toolbar-style
 * consumers should use the `ColorPickerPopover` re-exported from
 * `@grid-customizer/core` which wraps FormatColorPicker in a toolbar
 * icon-button trigger. AUDIT M1 collapsed the previous dual export.
 */

export { CompactColorField, type CompactColorFieldProps } from './CompactColorField';

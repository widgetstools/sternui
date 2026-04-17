/**
 * v2 ColorPicker kit — one compact inline field + one Figma-style popover
 * shared by every settings panel.
 *
 *   import { CompactColorField } from '@grid-customizer/core-v2';
 *
 * The popover stays exported for cases where a panel wants to drive its
 * own trigger (e.g. a swatch inside a big StyleEditor header) without
 * the standard 30px inline row.
 */

export { CompactColorField, type CompactColorFieldProps } from './CompactColorField';
export { ColorPickerPopover, type ColorPickerPopoverProps } from './ColorPickerPopover';

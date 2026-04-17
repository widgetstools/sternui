import type { BorderSpec, ValueFormatterTemplate } from '../../modules/column-customization/state';

/**
 * StyleEditorValue — the shape the shared <StyleEditor /> edits.
 *
 * Deliberately broad so a cell editor (conditional-styling), a header
 * editor (column-groups), or a column-customization assignment can all
 * hand the editor their slice.
 *
 * Fields are optional — absent means "not overridden" (the editor shows
 * the unset UI).
 */

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type FontWeight = 400 | 500 | 600 | 700;

export interface StyleEditorValue {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: TextAlign;
  fontSize?: number;
  fontWeight?: FontWeight;

  color?: string;
  backgroundColor?: string;
  backgroundAlpha?: number;

  borders?: {
    top?: BorderSpec;
    right?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
  };

  valueFormatter?: ValueFormatterTemplate;
}

export type StyleEditorSection = 'text' | 'color' | 'border' | 'format';
export type StyleEditorVariant = 'inline' | 'popover' | 'dialog' | 'drawer';
export type StyleEditorDataType = 'number' | 'date' | 'text' | 'boolean';

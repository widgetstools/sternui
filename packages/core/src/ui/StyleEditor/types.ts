/**
 * `StyleEditorValue` — the shape the shared `<StyleEditor />` edits.
 *
 * Deliberately broad so cell rules (conditional-styling), header editors
 * (column-groups), and column assignments (column-customization) can all
 * hand the editor their slice. Every field is optional — absent means
 * "not overridden", which the editor renders as the unset state.
 */
import type { BorderSpec, ValueFormatterTemplate } from '../../colDef';

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
export type StyleEditorDataType = 'number' | 'date' | 'text' | 'boolean';

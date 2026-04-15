import type { CSSProperties } from 'react';
import type { BorderSpec, CellStyleOverrides } from '../state';

/**
 * Flatten the structured `CellStyleOverrides` shape into a plain CSS object
 * that AG-Grid consumes via `colDef.cellStyle` (and the same shape works for
 * `colDef.headerStyle`). Undefined inputs map to absent keys so multi-module
 * composition can layer values without the flattener clobbering them.
 *
 * Pure function — same input always produces the same output. No internal
 * state. Safe to call on every transform-pipeline pass.
 */
export function cellStyleToAgStyle(overrides: CellStyleOverrides): CSSProperties {
  const out: CSSProperties = {};

  const t = overrides.typography;
  if (t) {
    if (t.bold) out.fontWeight = 'bold';
    if (t.italic) out.fontStyle = 'italic';
    if (t.underline) out.textDecoration = 'underline';
    if (t.fontSize != null) out.fontSize = `${t.fontSize}px`;
  }

  const c = overrides.colors;
  if (c) {
    if (c.text !== undefined) out.color = c.text;
    if (c.background !== undefined) out.backgroundColor = c.background;
  }

  const a = overrides.alignment;
  if (a) {
    if (a.horizontal !== undefined) out.textAlign = a.horizontal;
    if (a.vertical !== undefined) out.verticalAlign = a.vertical;
  }

  const b = overrides.borders;
  if (b) {
    const shorthand = (s: BorderSpec) => `${s.width}px ${s.style} ${s.color}`;
    if (b.top)    out.borderTop    = shorthand(b.top);
    if (b.right)  out.borderRight  = shorthand(b.right);
    if (b.bottom) out.borderBottom = shorthand(b.bottom);
    if (b.left)   out.borderLeft   = shorthand(b.left);
  }

  return out;
}

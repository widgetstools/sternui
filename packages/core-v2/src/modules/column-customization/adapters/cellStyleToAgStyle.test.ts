import { describe, expect, it } from 'vitest';
import { cellStyleToAgStyle } from './cellStyleToAgStyle';
import type { CellStyleOverrides } from '../state';

describe('cellStyleToAgStyle', () => {
  it('returns an empty object when overrides is empty', () => {
    expect(cellStyleToAgStyle({})).toEqual({});
  });

  it('typography: bold/italic/underline/fontSize map to CSS', () => {
    const out = cellStyleToAgStyle({
      typography: { bold: true, italic: true, underline: true, fontSize: 14 },
    });
    expect(out).toEqual({
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontSize: '14px',
    });
  });

  it('typography: false flags do not emit keys', () => {
    const out = cellStyleToAgStyle({
      typography: { bold: false, italic: false, underline: false },
    });
    expect(out).toEqual({});
  });

  it('colors: text and background', () => {
    const out = cellStyleToAgStyle({
      colors: { text: '#f0b90b', background: '#161a1e' },
    });
    expect(out).toEqual({ color: '#f0b90b', backgroundColor: '#161a1e' });
  });

  it('alignment: horizontal + vertical', () => {
    const out = cellStyleToAgStyle({
      alignment: { horizontal: 'right', vertical: 'middle' },
    });
    expect(out).toEqual({ textAlign: 'right', verticalAlign: 'middle' });
  });

  it('borders: per-side shorthand strings', () => {
    const out = cellStyleToAgStyle({
      borders: {
        top:    { width: 1, color: '#313944', style: 'solid' },
        right:  { width: 2, color: '#f0b90b', style: 'dashed' },
        bottom: { width: 1, color: '#000',    style: 'dotted' },
        left:   { width: 3, color: '#fff',    style: 'solid' },
      },
    });
    expect(out).toEqual({
      borderTop: '1px solid #313944',
      borderRight: '2px dashed #f0b90b',
      borderBottom: '1px dotted #000',
      borderLeft: '3px solid #fff',
    });
  });

  it('omits border keys for sides that are absent', () => {
    const out = cellStyleToAgStyle({
      borders: { top: { width: 1, color: '#313944', style: 'solid' } },
    });
    expect(out).toEqual({ borderTop: '1px solid #313944' });
    expect(out).not.toHaveProperty('borderRight');
  });

  it('mixed overrides all merge into one object', () => {
    const overrides: CellStyleOverrides = {
      typography: { bold: true, fontSize: 12 },
      colors: { text: '#fff' },
      alignment: { horizontal: 'center' },
      borders: { bottom: { width: 1, color: '#313944', style: 'solid' } },
    };
    expect(cellStyleToAgStyle(overrides)).toEqual({
      fontWeight: 'bold',
      fontSize: '12px',
      color: '#fff',
      textAlign: 'center',
      borderBottom: '1px solid #313944',
    });
  });

  it('does NOT emit keys whose value is undefined (so AG-Grid keeps existing styling)', () => {
    const out = cellStyleToAgStyle({ colors: { text: undefined, background: '#000' } });
    expect(out).toEqual({ backgroundColor: '#000' });
    expect(Object.prototype.hasOwnProperty.call(out, 'color')).toBe(false);
  });
});

import { useState } from 'react';
import { ChevronDown, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { FormatDropdown } from './FormatDropdown';
import { FormatColorPicker } from './FormatColorPicker';
import type { BorderSide, SideSpec } from './types';
import { EDGE_ORDER } from './types';

/**
 * 5-row border editor (All / Top / Bottom / Left / Right) × 4 columns
 * (label / visibility / thickness select / color swatch).
 *
 *   - Per-side rows edit ONLY their own side.
 *   - The "All" row is a shortcut — any change fans out to all four sides.
 *     Its displayed values are derived; when sides disagree, it shows "—"
 *     for thickness and a diagonal-hatch swatch for color. Editing a mixed
 *     cell snaps every side to the new shared value.
 *   - Clicking a color swatch drills into an inline color picker inside the
 *     same popover (not a nested side-popover); a ← Back header returns to
 *     the table. This keeps the editor spatially anchored — exactly the
 *     compact, toolbar-adjacent surface the user asked for.
 */
export function BorderSidesEditor({
  sides,
  onChange,
}: {
  sides: Record<BorderSide, SideSpec>;
  onChange: (next: Record<BorderSide, SideSpec>) => void;
}) {
  const [editingColorFor, setEditingColorFor] = useState<'all' | BorderSide | null>(null);

  const patchSide = (side: BorderSide, p: Partial<SideSpec>) =>
    onChange({ ...sides, [side]: { ...sides[side], ...p } });

  const patchAll = (p: Partial<SideSpec>) => {
    const next: Record<BorderSide, SideSpec> = { ...sides };
    for (const s of EDGE_ORDER) next[s] = { ...sides[s], ...p };
    onChange(next);
  };

  const allSame = <K extends keyof SideSpec>(key: K): boolean =>
    EDGE_ORDER.every((s) => sides[s][key] === sides.top[key]);
  const allColor = allSame('color') ? sides.top.color : null;
  const allAlpha = allSame('alpha') ? sides.top.alpha : null;
  const allWidth = allSame('width') ? sides.top.width : null;
  const allVisible = allSame('visible') ? sides.top.visible : null;

  type RowDef = {
    key: 'all' | BorderSide;
    label: string;
    color: string | null;
    alpha: number | null;
    width: number | null;
    visible: boolean | null;
    patch: (p: Partial<SideSpec>) => void;
  };

  const rows: RowDef[] = [
    {
      key: 'all',
      label: 'All',
      color: allColor,
      alpha: allAlpha,
      width: allWidth,
      visible: allVisible,
      patch: patchAll,
    },
    ...EDGE_ORDER.map<RowDef>((s) => ({
      key: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      color: sides[s].color,
      alpha: sides[s].alpha,
      width: sides[s].width,
      visible: sides[s].visible,
      patch: (p: Partial<SideSpec>) => patchSide(s, p),
    })),
  ];

  if (editingColorFor) {
    const row = rows.find((r) => r.key === editingColorFor);
    if (!row) {
      setEditingColorFor(null);
      return null;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditingColorFor(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: '2px 6px 2px 4px',
              background: 'transparent',
              border: 'none',
              color: 'var(--gc-text-muted)',
              fontSize: 'var(--gc-font-sm)',
              cursor: 'pointer',
              borderRadius: 3,
            }}
            title="Back to sides"
          >
            <ChevronLeft size={12} strokeWidth={2} />
            Back
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 'var(--gc-font-sm)', fontWeight: 600, color: 'var(--gc-text)' }}>
            {row.label} color
          </span>
          <span style={{ width: 44 }} />
        </div>
        <FormatColorPicker
          value={row.color ?? '#000000'}
          alpha={row.alpha ?? 100}
          onChange={(hex) => row.patch({ color: hex })}
          onAlpha={(a) => row.patch({ alpha: a })}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '46px 22px 1fr 22px',
          alignItems: 'center',
          gap: 6,
          padding: '2px 6px 4px',
          color: 'var(--gc-text-dim)',
          fontSize: 9,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        <span>Side</span>
        <span />
        <span>Thickness</span>
        <span />
      </div>
      {rows.map((row, idx) => (
        <BorderRow
          key={row.key}
          row={row}
          emphasized={row.key === 'all'}
          divider={idx === 0}
          onEditColor={() => setEditingColorFor(row.key)}
        />
      ))}
    </div>
  );
}

function BorderRow({
  row,
  emphasized,
  divider,
  onEditColor,
}: {
  row: {
    key: 'all' | BorderSide;
    label: string;
    color: string | null;
    alpha: number | null;
    width: number | null;
    visible: boolean | null;
    patch: (p: Partial<SideSpec>) => void;
  };
  emphasized?: boolean;
  divider?: boolean;
  onEditColor: () => void;
}) {
  const { color, width, visible } = row;
  const colorDisplay = color ?? '';
  const isHidden = visible === false;
  const isMixedColor = color === null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '46px 22px 1fr 22px',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px',
        background: emphasized ? 'var(--gc-surface-hover)' : 'transparent',
        borderRadius: emphasized ? 'var(--gc-radius-sm, 4px)' : 0,
        borderBottom: divider ? '1px dashed var(--gc-border)' : 'none',
        marginBottom: divider ? 4 : 0,
        opacity: isHidden ? 0.55 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      <span
        style={{
          fontSize: 'var(--gc-font-sm)',
          fontWeight: emphasized ? 600 : 500,
          color: emphasized ? 'var(--gc-text)' : 'var(--gc-text-muted)',
        }}
      >
        {row.label}
      </span>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => row.patch({ visible: visible === false ? true : false })}
        title={visible === false ? 'Show' : 'Hide'}
        style={{
          width: 20,
          height: 20,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 3,
          color: visible === false ? 'var(--gc-text-dim)' : 'var(--gc-text-muted)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {visible === false ? <EyeOff size={12} strokeWidth={1.75} /> : <Eye size={12} strokeWidth={1.75} />}
      </button>
      <ThicknessSelect value={width} onChange={(n) => row.patch({ width: n })} />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onEditColor}
        title={colorDisplay ? `Edit ${row.label.toLowerCase()} color` : 'Pick a shared color'}
        style={{
          width: 20,
          height: 20,
          borderRadius: 3,
          background: colorDisplay || 'transparent',
          backgroundImage: isMixedColor
            ? 'repeating-linear-gradient(45deg, #444 0 3px, #222 3px 6px)'
            : undefined,
          border: '1px solid var(--gc-border)',
          padding: 0,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

function ThicknessSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <FormatDropdown
      trigger={
        <button
          onMouseDown={(e) => e.preventDefault()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            height: 22,
            padding: '0 6px',
            background: 'var(--gc-surface-active)',
            border: 'none',
            borderRadius: 3,
            color: value !== null ? 'var(--gc-text)' : 'var(--gc-text-dim)',
            fontFamily: 'var(--gc-font-mono)',
            fontSize: 'var(--gc-font-sm)',
            cursor: 'pointer',
            width: '100%',
          }}
          title="Thickness"
        >
          <span>{value === null ? '—' : value}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ color: 'var(--gc-text-dim)', fontSize: 9 }}>px</span>
            <ChevronDown size={9} strokeWidth={2} color="var(--gc-text-dim)" />
          </span>
        </button>
      }
      value={value ?? -1}
      onChange={(v) => onChange(Number(v))}
      options={[0, 1, 2, 3, 4, 5].map((n) => ({
        value: n,
        label: n === 0 ? '0 · none' : `${n} px`,
        icon: <ThicknessBar width={n} />,
      }))}
    />
  );
}

function ThicknessBar({ width }: { width: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 18,
        height: Math.max(1, width),
        background: width === 0 ? 'transparent' : 'var(--gc-text)',
        borderRadius: 1,
        opacity: width === 0 ? 0.4 : 1,
        border: width === 0 ? '1px dashed var(--gc-text-dim)' : 'none',
      }}
    />
  );
}

import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { FormatColorPicker, FormatDropdown, FormatPopover } from '../format-editor';
import type { BorderSpec } from '../../colDef';
import { Caps } from '../SettingsPanel';

/**
 * Shared border style editor — the single source of truth for every
 * "turn border sides on/off + pick width / style / colour" interaction
 * in the app.
 *
 * Layout (the one that first shipped in the FormattingToolbar's Borders
 * popover; extracted so the Styling Rules BORDER band renders the
 * identical UI instead of rolling its own):
 *
 *     ┌───────────── Preview ─────────────┐
 *     │        ┌──────────────────┐       │   48px tall, dashed outer,
 *     │        │        CELL      │       │   inner box reflects current
 *     │        └──────────────────┘       │   border spec.
 *     └────────────────────────────────────┘
 *
 *     [A]  [T]  [R]  [B]  [L]  [×]           6 preset squares (28×28),
 *                                            single-letter labels centered
 *                                            inside a square whose sides
 *                                            are solid when active.
 *
 *     ▣ #F87171  │ [SOLID][DASH][DOT] │ [−][1][+] PX    Controls row.
 *
 * The component flex-wraps gracefully: at 240–400px (FormattingToolbar
 * popover) the preview/grid/controls stack naturally; at ~680px (Styling
 * Rules band) they lay out on a single line. No layout tweaks required
 * per host.
 *
 * Colour is always picked via the shared `FormatColorPicker` so the
 * preset palette + recent-swatches memory stay consistent with every
 * other colour control in the app.
 *
 * Data shape is deliberately plain: a `{ top?, right?, bottom?, left?:
 * BorderSpec }` map. Callers translate to/from their native state
 * (`StyleEditorValue.borders` in the customizer, `CellStyleOverrides.borders`
 * in the formatting toolbar — both identical shapes).
 */

export interface BordersValue {
  top?: BorderSpec;
  right?: BorderSpec;
  bottom?: BorderSpec;
  left?: BorderSpec;
}

export interface BorderStyleEditorProps {
  value: BordersValue;
  onChange: (next: BordersValue) => void;
  /**
   * Optional small label shown inside the preview cell. Defaults to
   * empty (no label). FormattingToolbar passes "Cell" / "Header" so the
   * user sees which target they're editing.
   */
  previewLabel?: string;
  /** Optional test id for the outer wrapper. */
  'data-testid'?: string;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';
type BorderStyle = BorderSpec['style'];

const EDGES: ReadonlyArray<Edge> = ['top', 'right', 'bottom', 'left'];
const STYLE_OPTIONS: ReadonlyArray<{ value: BorderStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];
const WIDTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1 px' },
  { value: 2, label: '2 px' },
  { value: 3, label: '3 px' },
  { value: 4, label: '4 px' },
  { value: 5, label: '5 px' },
];

// Default spec used when the user toggles on an edge with no prior
// history. A thin red line so the change is instantly visible against
// any background.
const DEFAULT_SPEC: BorderSpec = { width: 1, color: '#f87171', style: 'solid' };

/**
 * Preset-button style with split on/selected states.
 *
 * - `on`: this side has a border applied → the relevant outline(s)
 *   render solid green; letter renders green.
 * - `selected`: this side is the current edit-target (color/style/width
 *   controls write to it) → adds a subtle green fill + a 1px inset ring.
 * - `danger`: clear-all variant → dashed outline + red glyph.
 *
 * Tokens use the Cockpit → shadcn → hex fallback chain so the button
 * renders correctly inside the v2 sheet scope, inside the bare v2
 * formatting toolbar, or outside either.
 */
function presetBtnStyle(opts: {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
  on?: boolean;
  selected?: boolean;
  danger?: boolean;
}): React.CSSProperties {
  const { top, right, bottom, left, on, selected, danger } = opts;
  const edgeColor = on
    ? 'var(--ck-green, var(--primary, #2dd4bf))'
    : 'var(--ck-t0, var(--foreground, #eaecef))';
  const solid = `2px solid ${edgeColor}`;
  const dashed = '1px dashed var(--ck-border-hi, var(--border, #3e4754))';
  return {
    width: '100%',
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTop: top ? solid : dashed,
    borderRight: right ? solid : dashed,
    borderBottom: bottom ? solid : dashed,
    borderLeft: left ? solid : dashed,
    borderRadius: 2,
    cursor: 'pointer',
    background: selected
      ? 'var(--ck-green-bg, color-mix(in srgb, var(--primary) 18%, transparent))'
      : 'transparent',
    // The "selected" ring — subtle inner glow so the edit-target reads
    // distinctly from merely-on sides even at 20×Npx.
    boxShadow: selected
      ? 'inset 0 0 0 1px var(--ck-green, var(--primary, #2dd4bf))'
      : 'none',
    color: danger
      ? 'var(--ck-red, var(--destructive, #f87171))'
      : on || selected
        ? 'var(--ck-green, var(--primary, #2dd4bf))'
        : 'var(--ck-t0, var(--foreground, #eaecef))',
    // `×` (U+00D7) reads small next to the letters; bump the clear
    // variant well above letter size so it dominates optically.
    fontSize: danger ? 18 : 9,
    fontWeight: 600,
    letterSpacing: danger ? '0' : '0.06em',
    textTransform: 'uppercase',
    fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
    padding: 0,
    lineHeight: 1,
    transition: 'background 120ms, border-color 120ms, color 120ms, box-shadow 120ms',
  };
}

/**
 * Shared trigger style for the two small shadcn dropdowns (style / width).
 * Matches the color-swatch trigger height (24px) so the controls row
 * reads as a single optical band.
 */
function dropdownTriggerStyle(minWidth: number): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 24,
    minWidth,
    padding: '0 6px 0 10px',
    background: 'var(--ck-bg, var(--background))',
    border: '1px solid var(--ck-border-hi, var(--border))',
    borderRadius: 2,
    color: 'var(--ck-t0, var(--foreground))',
    cursor: 'pointer',
    fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  };
}

export function BorderStyleEditor({
  value,
  onChange,
  previewLabel,
  ...rest
}: BorderStyleEditorProps) {
  const borders = value ?? {};

  const hasT = Boolean(borders.top);
  const hasR = Boolean(borders.right);
  const hasB = Boolean(borders.bottom);
  const hasL = Boolean(borders.left);
  const hasAny = hasT || hasR || hasB || hasL;
  const allOn = hasT && hasR && hasB && hasL;

  // Edit-target selection. 'all' = batch-edit every currently-on side
  // (useful to set a uniform look); a specific Edge = edit only that
  // side, leaving the others alone.
  //
  // Seeded to 'all' so the first-use experience matches the previous
  // batch-edit behaviour; after the user toggles an individual side
  // the newly-enabled side becomes the selection.
  const [selectedEdge, setSelectedEdge] = useState<Edge | 'all'>('all');

  // Spec that the controls (color swatch, style dropdown, width
  // dropdown) read from. Preference order:
  //   1. The explicitly selected side, if it's on.
  //   2. First defined side (so controls still show something useful
  //      when selectedEdge is 'all' or points at an off side).
  //   3. DEFAULT_SPEC.
  const anchor: BorderSpec = useMemo(() => {
    if (selectedEdge !== 'all') {
      const b = borders[selectedEdge];
      if (b && b.width > 0) return b;
    }
    for (const e of EDGES) {
      const b = borders[e];
      if (b && b.width > 0) return b;
    }
    return DEFAULT_SPEC;
  }, [borders, selectedEdge]);

  // Last-known spec per edge so toggling off and on doesn't flatten the
  // look. Seeded from the incoming value.
  const [memory, setMemory] = useState<Partial<Record<Edge, BorderSpec>>>(() => ({ ...borders }));

  const emit = (next: BordersValue) => {
    // Normalize — if every side is undefined, emit an empty object (not
    // undefined) so the caller can still round-trip through its state.
    const cleaned: BordersValue = {};
    for (const e of EDGES) {
      if (next[e]) cleaned[e] = next[e];
    }
    onChange(cleaned);
  };

  /**
   * Side-button click. Implements the tri-state cycle:
   *   OFF                → turn ON  and SELECT
   *   ON, not selected   → SELECT (no toggle off)
   *   ON, selected       → turn OFF (move selection to another on side or 'all')
   *
   * Turning on restores the edge's last-known spec from `memory` so
   * the colour/style/width chosen for a side survive a quick off/on.
   */
  const handleEdgeClick = (edge: Edge) => {
    const current = borders[edge];
    if (!current) {
      // OFF → ON + select
      const nextSpec = memory[edge] ?? { ...anchor };
      emit({ ...borders, [edge]: nextSpec });
      setSelectedEdge(edge);
      return;
    }
    if (selectedEdge !== edge) {
      // ON but not selected → just change selection
      setSelectedEdge(edge);
      return;
    }
    // ON and selected → turn OFF, move selection
    setMemory((m) => ({ ...m, [edge]: current }));
    const nextBorders = { ...borders };
    delete nextBorders[edge];
    emit(nextBorders);
    // Prefer another on side; fall back to 'all'
    const nextOn = EDGES.find((e) => e !== edge && borders[e]);
    setSelectedEdge(nextOn ?? 'all');
  };

  /**
   * A-button click — dual purpose:
   *   - If every side is already on AND we're already in all-mode,
   *     clear everything (convenient single-click reset).
   *   - Otherwise, turn every side on with the anchor spec AND
   *     switch the edit-target to 'all' so subsequent control edits
   *     apply uniformly.
   */
  const handleAllClick = () => {
    if (allOn && selectedEdge === 'all') {
      emit({});
      setSelectedEdge('all');
      return;
    }
    const spec = { ...anchor };
    emit({ top: spec, right: spec, bottom: spec, left: spec });
    setSelectedEdge('all');
  };

  /**
   * Route a BorderSpec patch to the correct target(s):
   *   - selectedEdge === 'all'       → every currently-on side, or seed
   *     `top` when none are on (so the first control change produces
   *     instant visible feedback).
   *   - selectedEdge is a specific Edge → only that side. If the side
   *     is currently off, enable it with the patched spec (auto-turn-on
   *     on first edit — matches the "edit target that's off" intent).
   */
  const patchSelected = (patch: Partial<BorderSpec>) => {
    if (selectedEdge === 'all') {
      const onEdges = EDGES.filter((e) => Boolean(borders[e]));
      if (onEdges.length === 0) {
        const seeded: BorderSpec = { ...anchor, ...patch };
        emit({ ...borders, top: seeded });
        setMemory((m) => ({ ...m, top: seeded }));
        setSelectedEdge('top');
        return;
      }
      const nextBorders = { ...borders };
      for (const e of onEdges) {
        nextBorders[e] = { ...(nextBorders[e] as BorderSpec), ...patch };
      }
      emit(nextBorders);
      setMemory((m) => ({
        ...m,
        ...Object.fromEntries(onEdges.map((e) => [e, nextBorders[e]])),
      }));
      return;
    }
    // Single-edge edit
    const current = borders[selectedEdge];
    const nextSpec: BorderSpec = { ...(current ?? anchor), ...patch };
    emit({ ...borders, [selectedEdge]: nextSpec });
    setMemory((m) => ({ ...m, [selectedEdge]: nextSpec }));
  };

  const clearAll = () => {
    emit({});
    setSelectedEdge('all');
  };

  const normalizedHex = anchor.color.startsWith('#') ? anchor.color.toUpperCase() : anchor.color;

  // Preview inner-box border: each side renders with ITS OWN spec (so
  // per-side colour/style/width differences are visible at a glance).
  // Off sides show a faint dashed hairline so the empty-state outline
  // remains readable.
  const previewSide = (spec: BorderSpec | undefined) =>
    spec
      ? `${spec.width}px ${spec.style} ${spec.color}`
      : '1px dashed var(--ck-border, var(--border, #2a2f36))';

  return (
    <div
      data-v2-border-host=""
      data-testid={rest['data-testid']}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        background: 'var(--ck-card, var(--background))',
        border: '1px solid var(--ck-border, var(--border))',
        borderRadius: 2,
        fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
      }}
    >
      {/* ── Preview cell ──────────────────────────────────────────── */}
      <div
        style={{
          flex: '1 1 80px',
          minWidth: 72,
          maxWidth: 110,
          position: 'relative',
          height: 36,
          borderRadius: 2,
          background: 'var(--ck-bg, var(--background))',
          border: '1px dashed var(--ck-border, var(--border))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '66%',
            height: '66%',
            borderRadius: 2,
            borderTop: previewSide(borders.top),
            borderRight: previewSide(borders.right),
            borderBottom: previewSide(borders.bottom),
            borderLeft: previewSide(borders.left),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {previewLabel ? (
            <Caps size={8} color="var(--ck-t2, var(--muted-foreground))">
              {previewLabel}
            </Caps>
          ) : null}
        </div>
      </div>

      {/* ── Preset grid ───────────────────────────────────────────── */}
      <div
        style={{
          flex: '2 1 140px',
          minWidth: 132,
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <button
          type="button"
          onClick={handleAllClick}
          onMouseDown={(e) => e.preventDefault()}
          title={
            allOn && selectedEdge === 'all'
              ? 'Clear all sides'
              : 'Turn on all sides + batch-edit'
          }
          style={presetBtnStyle({
            top: true,
            right: true,
            bottom: true,
            left: true,
            on: allOn,
            selected: selectedEdge === 'all',
          })}
        >
          A
        </button>
        <button
          type="button"
          onClick={() => handleEdgeClick('top')}
          onMouseDown={(e) => e.preventDefault()}
          title={hasT ? (selectedEdge === 'top' ? 'Top (click to remove)' : 'Select top for editing') : 'Add top border'}
          style={presetBtnStyle({ top: true, on: hasT, selected: selectedEdge === 'top' && hasT })}
        >
          T
        </button>
        <button
          type="button"
          onClick={() => handleEdgeClick('right')}
          onMouseDown={(e) => e.preventDefault()}
          title={hasR ? (selectedEdge === 'right' ? 'Right (click to remove)' : 'Select right for editing') : 'Add right border'}
          style={presetBtnStyle({ right: true, on: hasR, selected: selectedEdge === 'right' && hasR })}
        >
          R
        </button>
        <button
          type="button"
          onClick={() => handleEdgeClick('bottom')}
          onMouseDown={(e) => e.preventDefault()}
          title={hasB ? (selectedEdge === 'bottom' ? 'Bottom (click to remove)' : 'Select bottom for editing') : 'Add bottom border'}
          style={presetBtnStyle({ bottom: true, on: hasB, selected: selectedEdge === 'bottom' && hasB })}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => handleEdgeClick('left')}
          onMouseDown={(e) => e.preventDefault()}
          title={hasL ? (selectedEdge === 'left' ? 'Left (click to remove)' : 'Select left for editing') : 'Add left border'}
          style={presetBtnStyle({ left: true, on: hasL, selected: selectedEdge === 'left' && hasL })}
        >
          L
        </button>
        <button
          type="button"
          onClick={clearAll}
          onMouseDown={(e) => e.preventDefault()}
          title="Clear all borders"
          aria-label="Clear all borders"
          disabled={!hasAny}
          style={{
            ...presetBtnStyle({ danger: true }),
            opacity: hasAny ? 1 : 0.5,
            cursor: hasAny ? 'pointer' : 'default',
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Controls row: color · style · width ───────────────────── */}
      <div
        style={{
          flex: '1 1 260px',
          minWidth: 240,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {/* COLOR — shared FormatColorPicker via a swatch trigger */}
        <FormatPopover
          width={240}
          trigger={
            <button
              type="button"
              title="Border colour"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 8px 2px 2px',
                background: 'var(--ck-bg, var(--background))',
                border: '1px solid var(--ck-border-hi, var(--border))',
                borderRadius: 2,
                height: 24,
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  background: anchor.color,
                  border: '1px solid var(--ck-border-hi, var(--border))',
                  borderRadius: 2,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
                  fontSize: 11,
                  color: 'var(--ck-t0, var(--foreground))',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {normalizedHex}
              </span>
            </button>
          }
        >
          <FormatColorPicker
            value={anchor.color || '#f87171'}
            onChange={(c) => {
              if (c) patchSelected({ color: c });
            }}
            allowClear={false}
          />
        </FormatPopover>

        {/* STYLE — shadcn dropdown (Radix popover + checkmark rail) */}
        <FormatDropdown<BorderStyle>
          value={anchor.style}
          onChange={(v) => patchSelected({ style: v })}
          options={STYLE_OPTIONS.map((o) => ({ ...o }))}
          width={140}
          trigger={
            <button type="button" title="Border style" style={dropdownTriggerStyle(84)}>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {STYLE_OPTIONS.find((o) => o.value === anchor.style)?.label ?? 'Solid'}
              </span>
              <ChevronDown size={12} strokeWidth={1.75} style={{ opacity: 0.6 }} />
            </button>
          }
        />

        {/* WIDTH — shadcn dropdown, 1..5 px */}
        <FormatDropdown<number>
          value={Math.max(1, Math.min(5, anchor.width || 1))}
          onChange={(v) => patchSelected({ width: v })}
          options={WIDTH_OPTIONS.map((o) => ({ ...o }))}
          width={110}
          trigger={
            <button type="button" title="Border width" style={dropdownTriggerStyle(64)}>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {Math.max(1, Math.min(5, anchor.width || 1))} px
              </span>
              <ChevronDown size={12} strokeWidth={1.75} style={{ opacity: 0.6 }} />
            </button>
          }
        />
      </div>
    </div>
  );
}

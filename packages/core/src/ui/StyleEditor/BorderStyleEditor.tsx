import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { FormatColorPicker, FormatDropdown, FormatPopover } from '../format-editor';
import type { BorderSpec } from '../../colDef';
// Terminal-styled stylesheet — tokens + component-scoped classes.
// Defines the `.gc-be-*` chrome used below. Dark + light mode aware
// via `[data-theme="light"]` overrides.
import './BorderStyleEditor.css';

/**
 * Shared border style editor — the single source of truth for every
 * "turn border sides on/off + pick width / style / colour" interaction
 * in the app.
 *
 * Visual design (matches the v2 terminal spec):
 *
 *   ┌─────┐ │ [A T B L R] │ [◼ #26C5B3 ▾] │ [—— SOLID ▾] │ [1 PX ▾] │ [×]
 *   │ pre │
 *   └─────┘
 *
 * Single row when the host is wide enough; wraps to two rows inside
 * narrow popovers (the FormattingToolbar's Borders popover caps at
 * ~400px, which forces the color/style/width/close group onto a
 * second line).
 *
 * Side buttons (A T B L R):
 *   - Each button renders its letter + a dashed outline on the sides
 *     it controls.
 *   - When that side is ON, its outline turns solid accent-color.
 *   - When that side is the current edit-target, the whole button
 *     gets an accent halo (box-shadow ring) so the control row's
 *     reads go to it.
 *
 * Data shape is a plain `{ top?, right?, bottom?, left?: BorderSpec }`
 * map. Callers translate to/from their native state
 * (`StyleEditorValue.borders` in the customizer,
 * `CellStyleOverrides.borders` in the formatting toolbar — both
 * identical shapes).
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
  /** Optional small label shown inside the preview cell. Retained
   *  for API back-compat; the new compact preview no longer renders
   *  the label visually. */
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
// history. A thin accent-colored line so the change is instantly
// visible against any background.
const DEFAULT_SPEC: BorderSpec = { width: 1, color: '#2dd4bf', style: 'solid' };

/** Side-button order matches the spec: All, then T B L R in box-wise order. */
const SIDE_BUTTONS: ReadonlyArray<{
  key: 'all' | Edge;
  letter: 'A' | 'T' | 'B' | 'L' | 'R';
}> = [
  { key: 'all', letter: 'A' },
  { key: 'top', letter: 'T' },
  { key: 'bottom', letter: 'B' },
  { key: 'left', letter: 'L' },
  { key: 'right', letter: 'R' },
];

export function BorderStyleEditor({
  value,
  onChange,
  previewLabel: _previewLabel,
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

  // Last-known spec per edge so toggling off and on doesn't flatten
  // the look. Seeded from the incoming value.
  const [memory, setMemory] = useState<Partial<Record<Edge, BorderSpec>>>(() => ({
    ...borders,
  }));

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
      const nextSpec = memory[edge] ?? { ...anchor };
      emit({ ...borders, [edge]: nextSpec });
      setSelectedEdge(edge);
      return;
    }
    if (selectedEdge !== edge) {
      setSelectedEdge(edge);
      return;
    }
    setMemory((m) => ({ ...m, [edge]: current }));
    const nextBorders = { ...borders };
    delete nextBorders[edge];
    emit(nextBorders);
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
    const current = borders[selectedEdge];
    const nextSpec: BorderSpec = { ...(current ?? anchor), ...patch };
    emit({ ...borders, [selectedEdge]: nextSpec });
    setMemory((m) => ({ ...m, [selectedEdge]: nextSpec }));
  };

  const clearAll = () => {
    emit({});
    setSelectedEdge('all');
  };

  const normalizedHex = anchor.color.startsWith('#')
    ? anchor.color.toUpperCase().replace(/^#/, '')
    : anchor.color;

  // Preview: render each side's own spec so per-side differences are
  // visible. Off sides show a faint dashed hairline so the empty-state
  // outline remains readable.
  const previewSide = (spec: BorderSpec | undefined) =>
    spec
      ? `${spec.width}px ${spec.style} ${spec.color}`
      : '1px dashed var(--be-line)';

  const edgeIsOn = (key: 'all' | Edge): boolean =>
    key === 'all' ? allOn : Boolean(borders[key]);

  const edgeIsSelected = (key: 'all' | Edge): boolean =>
    selectedEdge === key &&
    (key === 'all' ? true : Boolean(borders[key]) || selectedEdge === key);

  return (
    <div className="gc-be-editor" data-v2-border-host="" data-testid={rest['data-testid']}>
      {/* ── Preview ────────────────────────────────────────────── */}
      <div className="gc-be-preview" data-testid="gc-be-preview">
        <span
          className="gc-be-preview-inner"
          style={{
            borderTop: previewSide(borders.top),
            borderRight: previewSide(borders.right),
            borderBottom: previewSide(borders.bottom),
            borderLeft: previewSide(borders.left),
          }}
        />
      </div>

      <span aria-hidden className="gc-be-div" />

      {/* ── Side preset buttons: A T B L R ────────────────────── */}
      <div className="gc-be-sides" role="group" aria-label="Border sides">
        {SIDE_BUTTONS.map(({ key, letter }) => {
          const on = edgeIsOn(key);
          const selected = edgeIsSelected(key);
          const title =
            key === 'all'
              ? allOn && selectedEdge === 'all'
                ? 'Clear all sides'
                : 'Turn on all sides + batch-edit'
              : on
                ? selectedEdge === key
                  ? `${key[0].toUpperCase()}${key.slice(1)} (click to remove)`
                  : `Select ${key} for editing`
                : `Add ${key} border`;
          return (
            <button
              key={key}
              type="button"
              className="gc-be-side"
              data-side={letter}
              data-on={on ? 'true' : undefined}
              data-selected={selected ? 'true' : undefined}
              data-testid={`gc-be-side-${letter.toLowerCase()}`}
              title={title}
              aria-pressed={on}
              onClick={() => (key === 'all' ? handleAllClick() : handleEdgeClick(key))}
              onMouseDown={(e) => e.preventDefault()}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <span aria-hidden className="gc-be-div" />

      {/* ── Color trigger ──────────────────────────────────────── */}
      <FormatPopover
        width={240}
        trigger={
          <button
            type="button"
            className="gc-be-color"
            title="Border colour"
            data-testid="gc-be-color"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              className="gc-be-swatch"
              aria-hidden
              style={{ background: anchor.color }}
            />
            <span>{normalizedHex}</span>
            <ChevronDown className="gc-be-caret" strokeWidth={1.75} />
          </button>
        }
      >
        <FormatColorPicker
          value={anchor.color || DEFAULT_SPEC.color}
          onChange={(c) => {
            if (c) patchSelected({ color: c });
          }}
          allowClear={false}
        />
      </FormatPopover>

      <span aria-hidden className="gc-be-div" />

      {/* ── Style dropdown ─────────────────────────────────────── */}
      <FormatDropdown<BorderStyle>
        value={anchor.style}
        onChange={(v) => patchSelected({ style: v })}
        options={STYLE_OPTIONS.map((o) => ({ ...o }))}
        width={140}
        trigger={
          <button
            type="button"
            className="gc-be-chip"
            title="Border style"
            data-testid="gc-be-style"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              className="gc-be-stroke"
              aria-hidden
              data-style={anchor.style}
            />
            <span>{STYLE_OPTIONS.find((o) => o.value === anchor.style)?.label ?? 'Solid'}</span>
            <ChevronDown className="gc-be-caret" strokeWidth={1.75} />
          </button>
        }
      />

      <span aria-hidden className="gc-be-div" />

      {/* ── Width dropdown ─────────────────────────────────────── */}
      <FormatDropdown<number>
        value={Math.max(1, Math.min(5, anchor.width || 1))}
        onChange={(v) => patchSelected({ width: v })}
        options={WIDTH_OPTIONS.map((o) => ({ ...o }))}
        width={110}
        trigger={
          <button
            type="button"
            className="gc-be-chip"
            title="Border width"
            data-testid="gc-be-width"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span>{Math.max(1, Math.min(5, anchor.width || 1))} PX</span>
            <ChevronDown className="gc-be-caret" strokeWidth={1.75} />
          </button>
        }
      />

      {/* ── Close / clear-all (far right, `margin-left: auto`) ─── */}
      <button
        type="button"
        className="gc-be-close"
        onClick={clearAll}
        onMouseDown={(e) => e.preventDefault()}
        disabled={!hasAny}
        aria-label="Clear all borders"
        title="Clear all borders"
        data-testid="gc-be-clear"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

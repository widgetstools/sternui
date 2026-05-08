import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../PortalContainer';

/**
 * Generic keyboard-navigable palette modal.
 *
 * Used by both the Column palette (Ctrl+Shift+C) and Function palette
 * (Ctrl+Shift+F). Same contract, different data:
 *   - Opens centered over the viewport with a filter input auto-focused.
 *   - Live-filters items by substring match on `label` and any `keywords`.
 *   - Arrow keys move selection, Enter invokes `onPick`, Esc invokes `onClose`.
 *   - Click outside dismisses.
 *
 * Rendered via React portal into `document.body` so it escapes the settings
 * sheet's overflow clipping (same reason `PortalPopover` exists in the
 * conditional-styling panel).
 */
export interface PaletteItem {
  /** Stable identifier — used for React key AND passed back to `onPick`. */
  id: string;
  /** Primary label (bold line). */
  label: string;
  /** Secondary detail (dim, one line). */
  detail?: string;
  /** Optional third line — tooltip / description. Renders on the selected row. */
  description?: string;
  /** Optional group header shown above the row when it differs from the
   *  previous item's group (e.g. "Math", "String"). */
  group?: string;
  /** Extra searchable text (lowercased, matched against filter input). */
  keywords?: string[];
}

export interface PaletteProps {
  title: string;
  placeholder: string;
  items: PaletteItem[];
  onPick: (item: PaletteItem) => void;
  onClose: () => void;
  /** Optional subtitle under the title. */
  subtitle?: string;
}

export function Palette({ title, placeholder, items, onPick, onClose, subtitle }: PaletteProps) {
  const portalContainer = usePortalContainer();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = (it.label + ' ' + (it.detail ?? '') + ' ' + (it.keywords?.join(' ') ?? '')).toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter]);

  // Reset selection when the filtered list collapses/expands.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Keyboard navigation. Bound to window during lifetime so arrow keys work
  // even if focus drifts off the filter input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(filtered.length - 1, s + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const pick = filtered[selected];
        if (pick) onPick(pick);
        return;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filtered, selected, onPick, onClose]);

  // Autofocus input on mount.
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view as it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Click-outside dismiss.
  const shellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10200,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={shellRef}
        style={{
          width: 560, maxWidth: '92vw', maxHeight: '70vh',
          background: 'var(--gc-surface, #161a1e)',
          border: '1px solid var(--gc-border, #313944)',
          borderRadius: 8,
          boxShadow: '0 20px 48px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Geist', 'Inter', -apple-system, sans-serif",
        }}
      >
        <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--gc-border, #313944)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gc-text, #eaecef)', letterSpacing: 0.3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--gc-text-dim, #7a8494)', marginTop: 2 }}>{subtitle}</div>}
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={placeholder}
            style={{
              marginTop: 8, width: '100%', height: 28,
              background: 'var(--gc-bg, #0b0e11)',
              color: 'var(--gc-text, #eaecef)',
              border: '1px solid var(--gc-border, #313944)',
              borderRadius: 4, padding: '0 10px',
              fontSize: 12, outline: 'none',
              fontFamily: "'JetBrains Mono', Menlo, monospace",
            }}
          />
        </div>
        <div
          ref={listRef}
          style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--gc-text-dim, #7a8494)' }}>
              No matches for <code>{filter}</code>.
            </div>
          )}
          {filtered.map((it, idx) => {
            const prev = filtered[idx - 1];
            const showGroup = it.group && (!prev || prev.group !== it.group);
            const isSelected = idx === selected;
            return (
              <div key={it.id} data-idx={idx}>
                {showGroup && (
                  <div style={{
                    padding: '8px 14px 4px', fontSize: 9, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                    color: 'var(--gc-text-dim, #7a8494)',
                  }}>{it.group}</div>
                )}
                <div
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => onPick(it)}
                  style={{
                    padding: '6px 14px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--gc-accent-muted, rgba(240,185,11,0.10))' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--gc-accent, #f0b90b)' : '2px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', Menlo, monospace",
                      fontSize: 12,
                      color: isSelected ? 'var(--gc-accent, #f0b90b)' : 'var(--gc-text, #eaecef)',
                      fontWeight: 500,
                    }}>{it.label}</span>
                    {it.detail && (
                      <span style={{ fontSize: 10, color: 'var(--gc-text-dim, #7a8494)' }}>{it.detail}</span>
                    )}
                  </div>
                  {isSelected && it.description && (
                    <div style={{
                      marginTop: 4, fontSize: 10, lineHeight: 1.5,
                      color: 'var(--gc-text-muted, #a0a8b4)',
                    }}>{it.description}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          padding: '6px 14px', borderTop: '1px solid var(--gc-border, #313944)',
          fontSize: 9, color: 'var(--gc-text-faint, #4a5568)',
          display: 'flex', gap: 14,
        }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd> insert</span>
          <span><kbd style={kbdStyle}>Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    portalContainer ?? document.body,
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '0 4px',
  borderRadius: 2,
  background: 'var(--gc-surface-active, #2b3139)',
  color: 'var(--gc-text-muted, #a0a8b4)',
  fontFamily: "'JetBrains Mono', Menlo, monospace",
  fontSize: 9,
  border: '1px solid var(--gc-border, #313944)',
};

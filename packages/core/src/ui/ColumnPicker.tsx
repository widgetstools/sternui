import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useGridCustomizerCore } from './GridCustomizerContext';
import { Input } from './shadcn/input';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GridColumnInfo {
  colId: string;
  headerName: string;
  field?: string;
  pinned?: string | boolean | null;
  visible: boolean;
}

// ─── Hook: get columns from live grid API ────────────────────────────────────

export function useGridColumns(): GridColumnInfo[] {
  const core = useGridCustomizerCore();
  const [columnVersion, setColumnVersion] = useState(0);

  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const handler = () => setColumnVersion(n => n + 1);
    const events = ['displayedColumnsChanged', 'columnEverythingChanged'] as const;
    for (const evt of events) {
      try { api.addEventListener(evt, handler); } catch {}
    }
    return () => {
      for (const evt of events) {
        try { api.removeEventListener(evt, handler); } catch {}
      }
    };
  }, [core]);

  return useMemo(() => {
    const api = core.getGridApi();
    if (!api) return [];
    try {
      const allCols = api.getColumns?.() ?? [];
      return allCols.map((col: any) => {
        const colDef = col.getColDef?.() ?? {};
        return {
          colId: col.getColId?.() ?? colDef.colId ?? colDef.field ?? '',
          headerName: colDef.headerName ?? colDef.field ?? col.getColId?.() ?? '',
          field: colDef.field,
          pinned: col.getPinned?.() ?? colDef.pinned,
          visible: col.isVisible?.() ?? true,
        };
      }).filter((c: GridColumnInfo) => c.colId);
    } catch {
      return [];
    }
  }, [core, columnVersion]);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const dropdownStyles: Record<string, React.CSSProperties> = {
  container: { position: 'relative' },
  inputWrap: { position: 'relative' },
  input: { paddingLeft: 28, width: '100%' },
  searchIcon: {
    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
    pointerEvents: 'none', opacity: 0.4,
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
    marginTop: 4, maxHeight: 220, overflowY: 'auto',
    background: 'var(--gc-bg)', border: '1px solid var(--gc-border)',
    borderRadius: 'var(--gc-radius)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    padding: '6px 10px', background: 'none', border: 'none',
    color: 'var(--gc-text)', fontSize: 11, fontFamily: 'var(--gc-font)',
    cursor: 'pointer', textAlign: 'left' as const, transition: 'background 80ms',
  },
  dot: {
    width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
  },
  field: {
    fontSize: 9, fontFamily: 'var(--gc-font-mono)', color: 'var(--gc-text-dim)',
  },
  pin: {
    fontSize: 9, padding: '1px 6px', borderRadius: 2,
    background: 'var(--gc-accent-muted)', color: 'var(--gc-accent)',
  },
  empty: {
    padding: '10px 16px', fontSize: 11, color: 'var(--gc-text-dim)', textAlign: 'center' as const,
  },
  // Multi-select chips
  chipWrap: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 6,
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '1px 6px 1px 8px', borderRadius: 2,
    background: 'var(--gc-accent-muted)', color: 'var(--gc-accent)',
    fontSize: 9, fontWeight: 500,
  },
  chipX: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--gc-accent)', fontSize: 11, lineHeight: 1, padding: 0,
    opacity: 0.6,
  },
};

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={dropdownStyles.searchIcon}>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ─── Single-select Column Picker ─────────────────────────────────────────────

export function ColumnPickerSingle({
  placeholder,
  excludeIds,
  onSelect,
}: {
  placeholder?: string;
  excludeIds?: Set<string>;
  onSelect: (col: GridColumnInfo) => void;
}) {
  const columns = useGridColumns();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exclude = excludeIds ?? new Set();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return columns.filter(
      (c) => !exclude.has(c.colId) &&
        (c.headerName.toLowerCase().includes(q) || c.colId.toLowerCase().includes(q) ||
          (c.field ?? '').toLowerCase().includes(q)),
    );
  }, [columns, exclude, search]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div style={dropdownStyles.container}>
      <div style={dropdownStyles.inputWrap}>
        <Input ref={inputRef} style={dropdownStyles.input} className="pl-7"
          placeholder={placeholder ?? 'Search columns...'}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
        <SearchIcon />
      </div>
      {open && (
        <div ref={dropdownRef} style={dropdownStyles.dropdown}>
          {filtered.length > 0 ? filtered.map((col) => (
            <button key={col.colId} style={dropdownStyles.item}
              onClick={() => { onSelect(col); setSearch(''); setOpen(false); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gc-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
              <span style={{ ...dropdownStyles.dot, background: col.visible ? 'var(--gc-accent)' : 'var(--gc-text-dim)' }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{col.headerName}</span>
              <span style={dropdownStyles.field}>{col.field ?? col.colId}</span>
              {col.pinned && <span style={dropdownStyles.pin}>{String(col.pinned).toUpperCase()}</span>}
            </button>
          )) : (
            <div style={dropdownStyles.empty}>{search ? 'No matching columns' : 'No columns available'}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-select Column Picker (chips + dropdown) ───────────────────────────

export function ColumnPickerMulti({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (colIds: string[]) => void;
  placeholder?: string;
}) {
  const columns = useGridColumns();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return columns.filter(
      (c) => !selectedSet.has(c.colId) &&
        (c.headerName.toLowerCase().includes(q) || c.colId.toLowerCase().includes(q) ||
          (c.field ?? '').toLowerCase().includes(q)),
    );
  }, [columns, selectedSet, search]);

  const colMap = useMemo(() => {
    const map = new Map<string, GridColumnInfo>();
    for (const c of columns) map.set(c.colId, c);
    return map;
  }, [columns]);

  const removeCol = useCallback((colId: string) => {
    onChange(value.filter((id) => id !== colId));
  }, [value, onChange]);

  const addCol = useCallback((col: GridColumnInfo) => {
    onChange([...value, col.colId]);
    setSearch('');
    setOpen(false);
  }, [value, onChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div style={dropdownStyles.container}>
      {/* Selected chips */}
      {value.length > 0 && (
        <div style={dropdownStyles.chipWrap}>
          {value.map((colId) => {
            const col = colMap.get(colId);
            return (
              <span key={colId} style={dropdownStyles.chip}>
                {col?.headerName ?? colId}
                <button style={dropdownStyles.chipX} onClick={() => removeCol(colId)}>&times;</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div style={dropdownStyles.inputWrap}>
        <Input ref={inputRef} style={dropdownStyles.input} className="pl-7"
          placeholder={placeholder ?? 'Add columns...'}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
        <SearchIcon />
      </div>

      {open && (
        <div ref={dropdownRef} style={dropdownStyles.dropdown}>
          {filtered.length > 0 ? filtered.map((col) => (
            <button key={col.colId} style={dropdownStyles.item}
              onClick={() => addCol(col)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gc-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
              <span style={{ ...dropdownStyles.dot, background: col.visible ? 'var(--gc-accent)' : 'var(--gc-text-dim)' }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{col.headerName}</span>
              <span style={dropdownStyles.field}>{col.field ?? col.colId}</span>
            </button>
          )) : (
            <div style={dropdownStyles.empty}>{search ? 'No matching columns' : 'All columns selected'}</div>
          )}
        </div>
      )}
    </div>
  );
}

import { memo } from 'react';
import { Select } from '../../../ui/shadcn';
import { useGridColumns } from '../../../hooks/useGridColumns';

/**
 * Chip picker for the cell-scope rule's target columns. Renders amber
 * "NO COLUMNS" warning when empty so the user can't ship a cell-scope
 * rule that wouldn't apply to anything.
 */
export const ColumnPickerMulti = memo(function ColumnPickerMulti({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const cols = useGridColumns();
  const remaining = cols.filter((c) => !value.includes(c.colId));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 24 }}>
        {value.length === 0 ? (
          <span
            role="alert"
            data-testid="cs-no-columns-warning"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ck-amber)',
              background: 'var(--ck-amber-bg)',
              border: '1px solid var(--ck-amber)',
              borderRadius: 2,
              padding: '4px 8px',
              fontFamily: 'var(--ck-font-sans)',
            }}
          >
            NO COLUMNS · RULE WON'T APPLY
          </span>
        ) : (
          value.map((colId) => {
            const col = cols.find((c) => c.colId === colId);
            return (
              <span
                key={colId}
                data-v2-chip=""
                className="gc-cs-col-chip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px',
                  borderRadius: 2,
                  background: 'var(--ck-card)',
                  border: '1px solid var(--ck-border)',
                  fontFamily: 'var(--ck-font-mono)',
                  fontSize: 11,
                  color: 'var(--ck-t0)',
                }}
              >
                {col?.headerName ?? colId}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== colId))}
                  title="Remove"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ck-t2)',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 12,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>
      {remaining.length > 0 && (
        <Select
          className="gc-cs-col-add"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange([...value, v]);
          }}
        >
          <option value="">ADD COLUMN…</option>
          {remaining.map((c) => (
            <option key={c.colId} value={c.colId}>
              {c.headerName}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
});

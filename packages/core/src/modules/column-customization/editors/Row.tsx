import { Caps } from '../../../ui/SettingsPanel';

/**
 * Row — shared layout primitive for every control in the column-settings
 * editor bands. 180px caps-label + hint stack on the left, flex control
 * row on the right. Used by FilterEditor, RowGroupingEditor, and the
 * band bodies inside ColumnSettingsEditorInner.
 *
 * Extracted from ColumnSettingsPanel.tsx during the AUDIT M3 split so
 * sibling editor files can import the same layout shell without pulling
 * the panel in.
 */
export interface RowProps {
  label: string;
  hint?: string;
  control: React.ReactNode;
}

export function Row({ label, hint, control }: RowProps) {
  return (
    <div
      className="gc-option-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        alignItems: 'center',
        columnGap: 20,
        rowGap: 4,
        padding: '8px 0',
        borderBottom: '1px solid color-mix(in srgb, var(--ck-border) 50%, transparent)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Caps size={10}>{label}</Caps>
        {hint && (
          <span style={{ fontSize: 10, color: 'var(--ck-t3)', lineHeight: 1.35 }}>{hint}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{control}</div>
    </div>
  );
}

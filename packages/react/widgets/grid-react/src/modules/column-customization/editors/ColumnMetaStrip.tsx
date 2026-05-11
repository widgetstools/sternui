import { MetaCell, Mono } from '../../../ui/SettingsPanel';

export function ColumnMetaStrip({
  colId,
  cellDataType,
  overrideCount,
  templateCount,
}: {
  colId: string;
  cellDataType: string | undefined;
  overrideCount: number;
  templateCount: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-x-5 px-6 pt-3 pb-4 border-b border-border bg-card">
      <MetaCell label="COL ID" value={<Mono color="var(--ds-text-primary)">{colId}</Mono>} />
      <MetaCell
        label="TYPE"
        value={<Mono color="var(--ds-text-primary)">{cellDataType ?? '—'}</Mono>}
      />
      <MetaCell
        label="OVERRIDES"
        value={
          <Mono color={overrideCount > 0 ? 'var(--ds-accent-warning)' : 'var(--ds-text-faint)'}>
            {overrideCount}
          </Mono>
        }
      />
      <MetaCell
        label="TEMPLATES"
        value={
          <Mono color={templateCount > 0 ? 'var(--ds-accent-positive)' : 'var(--ds-text-faint)'}>
            {templateCount}
          </Mono>
        }
      />
    </div>
  );
}

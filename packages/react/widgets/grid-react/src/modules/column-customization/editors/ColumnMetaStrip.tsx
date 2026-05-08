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
    <div className="gc-meta-grid">
      <MetaCell label="COL ID" value={<Mono color="var(--ck-t0)">{colId}</Mono>} />
      <MetaCell
        label="TYPE"
        value={<Mono color="var(--ck-t0)">{cellDataType ?? '—'}</Mono>}
      />
      <MetaCell
        label="OVERRIDES"
        value={
          <Mono color={overrideCount > 0 ? 'var(--ck-amber)' : 'var(--ck-t3)'}>
            {overrideCount}
          </Mono>
        }
      />
      <MetaCell
        label="TEMPLATES"
        value={
          <Mono color={templateCount > 0 ? 'var(--ck-green)' : 'var(--ck-t3)'}>
            {templateCount}
          </Mono>
        }
      />
    </div>
  );
}

import { X } from 'lucide-react';
import { Band, Caps } from '../../../ui/SettingsPanel';
import { Row } from './Row';
import { TemplatePicker } from './TemplatePicker';
import type { ColumnTemplate } from '../../column-templates';

export function TemplatesBand({
  colId,
  templates,
  allTemplates,
  appliedIds,
  onAdd,
  onRemove,
}: {
  colId: string;
  templates: ColumnTemplate[];
  allTemplates: Record<string, ColumnTemplate>;
  appliedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Band index="03" title="TEMPLATES">
      {/* Applied-templates line item — mirrors the Row rhythm used by
          every other band so the user scans "APPLIED | <chips>" at a
          glance. Chips carry a per-row × to remove the template from
          the draft. */}
      <Row
        label="APPLIED"
        hint={
          templates.length > 0
            ? `${templates.length} template${templates.length === 1 ? '' : 's'} · later templates layer over earlier`
            : 'No style templates on this column yet'
        }
        control={
          templates.length === 0 ? (
            <Caps size={10} color="var(--ck-t3)">
              —
            </Caps>
          ) : (
            <div
              data-testid={`cols-${colId}-templates`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {templates.map((t) => (
                <span
                  key={t.id}
                  className="gc-chip"
                  data-testid={`cols-${colId}-template-${t.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 4px 0 10px',
                    height: 24,
                    background: 'var(--ck-card-hi)',
                    border: '1px solid var(--ck-border-hi)',
                    borderRadius: 2,
                    fontSize: 11,
                    fontFamily: 'var(--ck-font-sans)',
                    color: 'var(--ck-t0)',
                  }}
                >
                  {t.name}
                  <button
                    type="button"
                    aria-label={`Remove template ${t.name}`}
                    title={`Remove ${t.name}`}
                    onClick={() => onRemove(t.id)}
                    data-testid={`cols-${colId}-template-remove-${t.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      padding: 0,
                      margin: 0,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--ck-t2)',
                      cursor: 'pointer',
                      borderRadius: 2,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--ck-red)';
                      e.currentTarget.style.background = 'var(--ck-red-bg)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--ck-t2)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          )
        }
      />
      <Row
        label="ADD TEMPLATE"
        hint="Pick a saved template to layer onto this column"
        control={
          <TemplatePicker
            allTemplates={allTemplates}
            appliedIds={appliedIds}
            onAdd={onAdd}
            colId={colId}
          />
        }
      />
    </Band>
  );
}

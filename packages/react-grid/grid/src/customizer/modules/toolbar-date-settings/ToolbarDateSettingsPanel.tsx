import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  IconInput,
  ObjectTitleRow,
  SettingsRow as Row,
  SharpBtn,
} from '../../ui/SettingsPanel';
import { Select } from '../../ui/NativeOptionsSelect';
import { cn } from '@starui/ui';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import {
  useAppDataKeys,
  useAppDataLookup,
  useAppDataProviders,
} from '../column-customization/editors/CellEditorEditor';
import { BoolControl } from '../general-settings/fieldSchema';
import { ProviderGridHostSection } from './ProviderGridHostSection';
import { GridEventBindingsSection } from './GridEventBindingsSection';
import {
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';

const SECTIONS = [
  {
    index: '01',
    id: 'toolbar-date',
    title: 'Toolbar Date',
    headerTitle: 'TOOLBAR DATE PICKER',
  },
  {
    index: '02',
    id: 'data-provider',
    title: 'Data Provider',
    headerTitle: 'DATA PROVIDER',
  },
  {
    index: '03',
    id: 'event-callbacks',
    title: 'Event Callbacks',
    headerTitle: 'EVENT CALLBACKS',
  },
] as const;

type SectionIndex = (typeof SECTIONS)[number]['index'];

interface SectionNavItemProps {
  index: SectionIndex;
  title: string;
  active: boolean;
  onClick: () => void;
}

function SectionNavItem({ index, title, active, onClick }: SectionNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      data-testid={`tds-nav-${index}`}
      className={cn(
        'group flex h-8 w-full items-center gap-2 rounded-sm border-l-2 pl-2.5 pr-2 text-left transition-colors',
        active
          ? 'border-l-[color:var(--ds-primary)] bg-[var(--ds-primary-soft)] text-foreground'
          : 'border-l-transparent text-foreground/90 hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'w-5 shrink-0 font-mono text-[10px] tabular-nums leading-none',
          active ? 'text-[color:var(--ds-primary)]' : 'opacity-70',
        )}
      >
        {index}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.1em]">
        {title}
      </span>
    </button>
  );
}

function SectionAnchor({
  index,
  title,
}: {
  index: SectionIndex;
  title: string;
}) {
  return (
    <header className="mb-2 flex select-none items-center gap-2.5">
      <span className="font-mono text-[10px] tabular-nums tracking-[0.06em] text-muted-foreground">
        {index}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/85">
        {title}
      </span>
      <span className="h-px flex-1 bg-border" />
    </header>
  );
}

export function ToolbarDateSettingsPanel(): ReactElement {
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    ToolbarDateSettingsState,
    ToolbarDateSettingsState
  >({
    moduleId: TOOLBAR_DATE_SETTINGS_MODULE_ID,
    itemId: 'settings',
    selectItem: (state) => state,
    commitItem: (next) => () => next,
  });

  const appData = useAppDataLookup();
  const providers = useAppDataProviders(appData);
  const keys = useAppDataKeys(appData, draft.historicalDateAppDataProvider || undefined);

  const [activeSection, setActiveSection] = useState<SectionIndex>('01');
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const update = <K extends keyof ToolbarDateSettingsState>(
    key: K,
    value: ToolbarDateSettingsState[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const scrollToSection = useCallback((index: SectionIndex) => {
    sectionRefs.current.get(index)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(index);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const idx = visible[0].target.getAttribute('data-section-index');
          if (idx && idx !== activeSectionRef.current) {
            setActiveSection(idx as SectionIndex);
          }
        }
      },
      { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const [, el] of sectionRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="toolbar-date-settings-panel">
      <div className="shrink-0 border-b border-border bg-background">
        <ObjectTitleRow
          title="Custom Settings"
          actions={(
            <>
              <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
              <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
            </>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          data-testid="tds-section-nav"
          className="w-[176px] shrink-0 overflow-y-auto border-r border-border bg-[var(--ds-surface-ground)] py-1.5"
        >
          <nav className="flex flex-col gap-px px-1">
            {SECTIONS.map((section) => (
              <SectionNavItem
                key={section.index}
                index={section.index}
                title={section.title}
                active={activeSection === section.index}
                onClick={() => scrollToSection(section.index)}
              />
            ))}
          </nav>
        </aside>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto pb-6">
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('01', el);
              else sectionRefs.current.delete('01');
            }}
            data-section-index="01"
            data-testid="toolbar-date-appdata-section"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="01" title={SECTIONS[0].headerTitle} />
            <p className="mb-3 text-[11px] text-[color:var(--ds-text-secondary)]">
              When the user picks a toolbar date before today, write the ISO date
              (`YYYY-MM-DD`) to the selected AppData provider key. Historical
              providers can reference the key via
              {' '}
              <code className="font-mono text-[10px]">{`{{provider.key}}`}</code>
              .
            </p>

            <Row
              label="ENABLED"
              hint="Allow past dates in the toolbar picker and write them to AppData."
              data-testid="tds-enabled"
              control={(
                <BoolControl
                  checked={draft.historicalDateAppDataEnabled}
                  onChange={(checked) => update('historicalDateAppDataEnabled', checked)}
                  testId="tds-enabled-switch"
                />
              )}
            />

            {draft.historicalDateAppDataEnabled ? (
              <>
                <Row
                  label="PROVIDER"
                  hint="Named AppData provider instance"
                  data-testid="tds-provider"
                  control={
                    appData?.listProviders ? (
                      <Select
                        value={draft.historicalDateAppDataProvider}
                        onChange={(e) => {
                          update('historicalDateAppDataProvider', e.target.value);
                          update('historicalDateAppDataKey', '');
                        }}
                        data-testid="tds-provider-select"
                        style={{ maxWidth: 240 }}
                      >
                        <option value="">— pick a provider —</option>
                        {providers.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </Select>
                    ) : (
                      <IconInput
                        value={draft.historicalDateAppDataProvider}
                        onCommit={(value) => update('historicalDateAppDataProvider', value.trim())}
                        placeholder="positions"
                        data-testid="tds-provider-text"
                        style={{ maxWidth: 240 }}
                      />
                    )
                  }
                />

                <Row
                  label="KEY"
                  hint="Key on the provider (e.g. asOfDate)"
                  data-testid="tds-key"
                  control={
                    appData?.keysOf && draft.historicalDateAppDataProvider ? (
                      <Select
                        value={draft.historicalDateAppDataKey}
                        onChange={(e) => update('historicalDateAppDataKey', e.target.value)}
                        data-testid="tds-key-select"
                        style={{ maxWidth: 240 }}
                      >
                        <option value="">— pick a key —</option>
                        {keys.map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </Select>
                    ) : (
                      <IconInput
                        value={draft.historicalDateAppDataKey}
                        onCommit={(value) => update('historicalDateAppDataKey', value.trim())}
                        placeholder="asOfDate"
                        data-testid="tds-key-text"
                        style={{ maxWidth: 240 }}
                      />
                    )
                  }
                />
              </>
            ) : null}
          </section>

          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('02', el);
              else sectionRefs.current.delete('02');
            }}
            data-section-index="02"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="02" title={SECTIONS[1].headerTitle} />
            <ProviderGridHostSection hideSectionHeader />
          </section>

          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('03', el);
              else sectionRefs.current.delete('03');
            }}
            data-section-index="03"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="03" title={SECTIONS[2].headerTitle} />
            <GridEventBindingsSection hideSectionHeader />
          </section>
        </div>
      </div>
    </div>
  );
}

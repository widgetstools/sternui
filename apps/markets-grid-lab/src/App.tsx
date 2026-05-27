import { useState, type ReactElement } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@starui/ui';
import { ThemeToggle } from './components/ThemeToggle';
import { LabDemoProvider } from './demo/LabDemoContext';
import { LabScenarioRail } from './demo/LabScenarioRail';
import { OverviewTab } from './tabs/OverviewTab';
import { FormattingTab } from './tabs/FormattingTab';
import { RenderersTab } from './tabs/RenderersTab';
import { FormatterToolbarTab } from './tabs/FormatterToolbarTab';
import { ColumnGroupsTab } from './tabs/ColumnGroupsTab';
import { CalculatedColumnsTab } from './tabs/CalculatedColumnsTab';
import { ConditionalStylingTab } from './tabs/ConditionalStylingTab';
import { LiveUpdatesTab } from './tabs/LiveUpdatesTab';
import { AlertsTab } from './tabs/AlertsTab';
import { QuickFiltersTab } from './tabs/QuickFiltersTab';
import { ProfilesTab } from './tabs/ProfilesTab';

interface TabEntry {
  id: string;
  label: string;
  hint: string;
  render: () => ReactElement;
}

const TABS: TabEntry[] = [
  { id: 'overview',     label: 'Overview',           hint: 'Full feature kitchen-sink',            render: () => <OverviewTab /> },
  { id: 'formatting',   label: 'Formatting',         hint: 'Value formatters & types',           render: () => <FormattingTab /> },
  { id: 'renderers',    label: 'Cell Renderers',     hint: 'Visual cell components',             render: () => <RenderersTab /> },
  { id: 'toolbar',      label: 'Formatter Toolbar',  hint: 'Live cell-style toolbar',            render: () => <FormatterToolbarTab /> },
  { id: 'groups',       label: 'Column Groups',      hint: 'Nested header groups',               render: () => <ColumnGroupsTab /> },
  { id: 'calc',         label: 'Calculated',         hint: 'Derived virtual columns',            render: () => <CalculatedColumnsTab /> },
  { id: 'conditional',  label: 'Conditional Style',  hint: 'Expression-driven styling',          render: () => <ConditionalStylingTab /> },
  { id: 'filters',      label: 'Quick Filters',      hint: 'Saved filter pill buttons',          render: () => <QuickFiltersTab /> },
  { id: 'live',         label: 'Live Updates',       hint: 'High-frequency stream',              render: () => <LiveUpdatesTab /> },
  { id: 'alerts',       label: 'Alerts',             hint: 'Triggers, toasts, bell + OpenFin',   render: () => <AlertsTab /> },
  { id: 'profiles',     label: 'Profiles',           hint: 'Pre-baked configurations',           render: () => <ProfilesTab /> },
];

export function App() {
  const [active, setActive] = useState<string>(TABS[0].id);
  const activeEntry = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <LabDemoProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
        <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-5 pr-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-5 w-1.5 rounded-sm bg-[color:var(--ds-text-primary)]"
              aria-hidden
            />
            <h1 className="text-[15px] font-semibold tracking-tight">MarketsGrid Feature Lab</h1>
            <span className="ml-2 text-[12px] font-normal text-[color:var(--ds-text-secondary)]">
              · {activeEntry.hint}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Tabs
            value={active}
            onValueChange={setActive}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2">
              <TabsList className="h-9 flex-wrap gap-1 bg-[color:var(--ds-surface-raised)] p-1">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="h-7 px-3 text-[12px] data-[state=active]:bg-[color:var(--ds-surface-primary)] data-[state=active]:text-[color:var(--ds-text-primary)] data-[state=active]:shadow-[var(--ds-elevation-card)]"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {TABS.map((t) => (
              <TabsContent
                key={t.id}
                value={t.id}
                className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
              >
                {active === t.id ? t.render() : null}
              </TabsContent>
            ))}
          </Tabs>

          <LabScenarioRail activeTab={active} />
        </div>
      </div>
    </LabDemoProvider>
  );
}

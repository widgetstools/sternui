import type { ReactElement } from 'react';
import {
  IconInput,
  ObjectTitleRow,
  SettingsRow as Row,
  SharpBtn,
  SubLabel,
} from '../../ui/SettingsPanel';
import { Select } from '../../ui/NativeOptionsSelect';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import {
  useAppDataKeys,
  useAppDataLookup,
  useAppDataProviders,
} from '../column-customization/editors/CellEditorEditor';
import { BoolControl } from '../general-settings/fieldSchema';
import { ProviderGridHostSection } from './ProviderGridHostSection';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';

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

  const update = <K extends keyof ToolbarDateSettingsState>(
    key: K,
    value: ToolbarDateSettingsState[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="toolbar-date-settings-panel">
      <ObjectTitleRow
        title="Custom Settings"
        actions={(
          <>
            <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
            <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
          </>
        )}
      />
      <ProviderGridHostSection />
      <div className="space-y-1 border-b border-[color:var(--ds-border-primary)] p-3">
        <SubLabel>HISTORICAL DATE → APP DATA</SubLabel>
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
      </div>
    </div>
  );
}

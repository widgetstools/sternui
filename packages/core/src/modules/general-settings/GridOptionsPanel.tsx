/**
 * Grid Options settings panel — v4 thin shell.
 *
 * The 1400-LOC v2-verbatim panel collapsed into ~100 LOC of wiring: the
 * per-band / per-row JSX is declared as data in `gridOptionsSchema.tsx`
 * and rendered by `BandRenderer`. Visual fidelity is preserved — the
 * renderer emits the SAME `<Band>` + `<Row>` markup v2 used.
 *
 * Flow mirrors the per-item editors (calculated-columns,
 * conditional-styling, column-groups): local draft + explicit SAVE /
 * RESET, dirty LED in the header, OVERRIDES count in the meta strip.
 */
import { memo } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import {
  MetaCell,
  Mono,
  ObjectTitleRow,
  SharpBtn,
} from '../../ui/SettingsPanel';
import { BandRenderer } from './fieldSchema';
import { GRID_OPTIONS_SCHEMA } from './gridOptionsSchema';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';

// Inlined to avoid a circular import with `./index` (which in turn
// imports this panel). Matches the exported `GENERAL_SETTINGS_MODULE_ID`.
const MODULE_ID = 'general-settings';

/**
 * Count how many user-visible options have been moved off their initial
 * values — displayed in the meta strip as "OVERRIDES". Gives the user a
 * quick sense of how much they've customised the grid.
 */
function countNonDefault(s: GeneralSettingsState): number {
  let n = 0;
  for (const key of Object.keys(INITIAL_GENERAL_SETTINGS) as Array<keyof GeneralSettingsState>) {
    if (s[key] !== INITIAL_GENERAL_SETTINGS[key]) n++;
  }
  return n;
}

export const GridOptionsPanel = memo(function GridOptionsPanel() {
  // Treat the entire module state as a single "item" — grid options is a
  // singleton, not a list. `selectItem` is identity (with a fallback so
  // the first render before hydration still works); `commitItem`
  // replaces state wholesale on save.
  const { draft, setDraft, dirty, save, discard, missing } = useModuleDraft<
    GeneralSettingsState,
    GeneralSettingsState
  >({
    moduleId: MODULE_ID,
    // Singleton — one draft per module, not per item. A fixed key is
    // fine and ensures the DIRTY=NN counter in the settings sheet reads
    // the draft state correctly.
    itemId: '__singleton__',
    selectItem: (state) => state ?? INITIAL_GENERAL_SETTINGS,
    commitItem: (next) => () => next,
  });

  // Typed patch helper — accepted by BandRenderer's `update` prop.
  const update = <K extends keyof GeneralSettingsState>(
    key: K,
    value: GeneralSettingsState[K],
  ): void => {
    setDraft({ [key]: value } as Partial<GeneralSettingsState>);
  };

  // `missing` can't really happen for the singleton state slice, but
  // the guard protects against a misconfigured store.
  if (missing) return null;

  const overrides = countNonDefault(draft);

  return (
    <div
      data-testid="go-panel"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
    >
      <div className="gc-editor-header">
        <ObjectTitleRow
          title={<span style={{ fontWeight: 600, fontSize: 13 }}>Grid Options</span>}
          actions={
            <>
              <SharpBtn
                variant="ghost"
                disabled={!dirty}
                onClick={discard}
                data-testid="go-discard-btn"
                title="Revert unsaved changes"
              >
                <RotateCcw size={13} strokeWidth={2} /> RESET
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid="go-save-btn"
                title="Save grid options"
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
            </>
          }
        />
      </div>

      <div className="gc-editor-scroll">
        <div className="gc-meta-grid">
          <MetaCell label="SCHEMA" value={<Mono color="var(--ck-t0)">v2</Mono>} />
          <MetaCell label="OVERRIDES" value={<Mono color="var(--ck-t0)">{overrides}</Mono>} />
          <MetaCell
            label="DIRTY"
            value={<Mono color={dirty ? 'var(--ck-amber)' : 'var(--ck-t3)'}>{dirty ? 'YES' : '—'}</Mono>}
          />
          <MetaCell
            label="QUICK FILTER"
            value={
              <Mono color={draft.quickFilterText ? 'var(--ck-amber)' : 'var(--ck-t3)'}>
                {draft.quickFilterText ? 'SET' : '—'}
              </Mono>
            }
          />
        </div>

        {GRID_OPTIONS_SCHEMA.map((band) => (
          <BandRenderer key={band.index} band={band} state={draft} update={update} />
        ))}
      </div>
    </div>
  );
});

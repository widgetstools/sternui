import type { LabDemoProfileEntry } from '../labProfileKit';
import { SMART_EDIT_TAB_STATE } from '../../seeds/smartEdit';
import type { SmartEditSettings, SmartEditState } from '@starui/engine';
import { INITIAL_SMART_EDIT } from '@starui/engine';

export const SMART_EDIT_GRID_ID = 'lab-smart-edit';

function smartEditState(settings: Partial<SmartEditSettings> = {}): SmartEditState {
  return {
    settings: {
      ...INITIAL_SMART_EDIT.settings,
      ...settings,
    },
  };
}

export const SMART_EDIT_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'se-00-curriculum',
    name: '00 · Curriculum',
    blurb: 'Editable qty + price, all ops, K/M/B shortcuts on.',
    seed: {
      'smart-edit': SMART_EDIT_TAB_STATE,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'se-01-qty-only',
    name: '01 · Qty only',
    blurb: 'Quantity editable; price read-only in column defs.',
    seed: {
      'smart-edit': SMART_EDIT_TAB_STATE,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'se-02-shortcuts-off',
    name: '02 · Shortcuts off',
    blurb: 'Magnitude parser disabled — plain numbers only.',
    seed: {
      'smart-edit': smartEditState({ magnitudeShortcutsEnabled: false }),
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'se-03-confirm-low',
    name: '03 · Confirm threshold',
    blurb: 'Confirm dialog when more than 5 cells selected.',
    seed: {
      'smart-edit': smartEditState({ confirmThreshold: 5 }),
      'general-settings': { cellSelection: true },
    },
  },
];

export const SMART_EDIT_ACTIVE_PROFILE_ID = 'se-00-curriculum';

import type { GridCustomizerModule } from '../../types/module';
import { INITIAL_PROFILES, type ProfilesState } from './state';
import { ProfilesPanel } from './ProfilesPanel';

export const profilesModule: GridCustomizerModule<ProfilesState> = {
  id: 'profiles',
  name: 'Profiles',
  icon: 'Save',
  priority: 2,

  getInitialState: () => ({ ...INITIAL_PROFILES }),

  // Profiles module doesn't transform defs or options —
  // it orchestrates save/load via the core's serializeAll/deserializeAll

  serialize: (state) => ({
    activeProfileId: state.activeProfileId,
    defaultProfileId: state.defaultProfileId,
  }),
  deserialize: (data) => ({
    ...INITIAL_PROFILES,
    ...(data as Partial<ProfilesState>),
  }),

  SettingsPanel: ProfilesPanel,
};

export type { ProfilesState } from './state';

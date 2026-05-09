// ─── @starui/config-editor-ui ─────────────────────────────────────────
//
// Engine-agnostic React editors for the four `config-service` auth
// tables. Components consume the framework-agnostic `ConfigClient`
// interface (Local-Dexie or REST — same shape) via
// `<ConfigEditorProvider>`, so the same screens work whether the host
// is offline-first, REST-backed, or test-stubbed.
//
//   import {
//     ConfigEditorProvider,
//     RolesEditor,
//     PermissionsEditor,
//     UserProfileEditor,
//     AppRegistryEditor,
//   } from '@starui/config-editor-ui';

export {
  ConfigEditorProvider,
  useConfigClient,
  type ConfigEditorProviderProps,
} from './ConfigEditorContext';

export { RolesEditor } from './RolesEditor';
export { PermissionsEditor } from './PermissionsEditor';
export { UserProfileEditor } from './UserProfileEditor';
export { AppRegistryEditor } from './AppRegistryEditor';

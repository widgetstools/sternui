/**
 * AppData provider — config-only "kind of provider".
 *
 * Unlike the streaming providers in `../transports/`, AppData is a
 * key/value bag whose values get inlined into other providers'
 * configs via `{{name.key}}` substitution upstream of the worker.
 * It has no `start/stop/snapshot/onUpdate` lifecycle and so doesn't
 * register with the provider factory registry.
 */

export {
  AppDataConfigStore,
  COMPONENT_TYPE_APPDATA,
  type AppDataConfig,
} from './store.js';
export { AppDataStore } from './AppDataStore.js';

/**
 * Vitest setup for `@starui/config-service-react`.
 *
 * The Provider's `<ConfigServiceProvider>` constructs a real
 * `ConfigManager` which opens a Dexie database — jsdom 29 ships no
 * IndexedDB, so we install `fake-indexeddb/auto` BEFORE any test file
 * imports the Provider.
 */
import 'fake-indexeddb/auto';

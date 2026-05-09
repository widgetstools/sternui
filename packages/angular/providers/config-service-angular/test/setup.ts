/**
 * Vitest setup for `@starui/config-service-angular`.
 *
 * `@angular/compiler` is loaded explicitly so JIT compilation of
 * `@Injectable({ providedIn: 'root' })` decorated classes succeeds
 * inside Vitest — production builds AOT-compile via ng-packagr, but
 * the test runner constructs them directly through `Injector.create`.
 *
 * The `ConfigServiceClient` constructs a real `ConfigManager` which
 * opens a Dexie database — jsdom 29 ships no IndexedDB, so we install
 * `fake-indexeddb/auto` BEFORE any test file imports the client.
 */
import '@angular/compiler';
import 'fake-indexeddb/auto';

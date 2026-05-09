import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest config for `@starui/config-service-angular`.
 *
 * Mirrors the `@starui/config-service-react` test setup — jsdom for
 * IndexedDB friendliness (provided via `fake-indexeddb` in
 * `test/setup.ts`), and source aliases so the suite runs against the
 * live TS sources of `@starui/config-service` and
 * `@starui/data-services-angular` rather than the published `dist`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@starui/config-service-angular': resolve(__dirname, 'src/index.ts'),
      '@starui/config-service': resolve(
        __dirname,
        '../../../shared/services/config-service/src/index.ts',
      ),
      '@starui/data-services-angular': resolve(
        __dirname,
        '../data-services-angular/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});

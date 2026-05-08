import { defineConfig } from 'vitest/config';

/**
 * Vitest config for `@starui/config-service-server`.
 *
 * Tests run in the node environment (no DOM). Tests may exercise the
 * sql.js storage layer against in-memory databases.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});

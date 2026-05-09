import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@starui/config-editor-ui': resolve(__dirname, 'src/index.ts'),
      '@starui/config-service': resolve(
        __dirname,
        '../../../shared/services/config-service/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});

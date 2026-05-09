import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@starui/config-service-react': resolve(__dirname, 'src/index.ts'),
      '@starui/config-service': resolve(
        __dirname,
        '../../../shared/services/config-service/src/index.ts',
      ),
      '@starui/data-services-react': resolve(
        __dirname,
        '../data-services-react/src/index.ts',
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

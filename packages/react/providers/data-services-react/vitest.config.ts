import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Subpaths — must come BEFORE the bare-package alias so the
      // longer prefix wins. Vite/Vitest match the longest alias prefix.
      '@starui/data-services-react/runtime': resolve(__dirname, 'src/runtime/index.tsx'),
      '@starui/data-services-react': resolve(__dirname, 'src/index.ts'),
      '@starui/data-services/runtime/client': resolve(__dirname, '../../../shared/services/data-services/src/runtime/client/index.ts'),
      '@starui/data-services/runtime/sharedWorker': resolve(__dirname, '../../../shared/services/data-services/src/runtime/worker/index.ts'),
      '@starui/data-services/runtime': resolve(__dirname, '../../../shared/services/data-services/src/runtime/index.ts'),
      '@starui/data-services': resolve(__dirname, '../../../shared/services/data-services/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // v2 subpaths — must come BEFORE the bare-package alias so the
      // longer prefix wins. Vite/Vitest match the longest alias prefix.
      '@starui/data-plane-react/v2': resolve(__dirname, 'src/v2/index.tsx'),
      '@starui/data-plane-react': resolve(__dirname, 'src/index.ts'),
      '@starui/data-plane/v2/client': resolve(__dirname, '../../shared/data-plane/src/v2/client/index.ts'),
      '@starui/data-plane/v2/worker': resolve(__dirname, '../../shared/data-plane/src/v2/worker/index.ts'),
      '@starui/data-plane/v2': resolve(__dirname, '../../shared/data-plane/src/v2/index.ts'),
      '@starui/data-plane': resolve(__dirname, '../../shared/data-plane/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

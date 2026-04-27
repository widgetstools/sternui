import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@marketsui/data-plane-react/v2': resolve(__dirname, 'src/v2/index.tsx'),
      '@marketsui/data-plane-react': resolve(__dirname, 'src/index.ts'),
      // v1 subpaths.
      '@marketsui/data-plane/client': resolve(__dirname, '../data-plane/src/client/index.ts'),
      '@marketsui/data-plane/worker': resolve(__dirname, '../data-plane/src/worker/index.ts'),
      '@marketsui/data-plane/providers': resolve(__dirname, '../data-plane/src/providers/index.ts'),
      '@marketsui/data-plane/protocol': resolve(__dirname, '../data-plane/src/protocol.ts'),
      // v2 subpaths — must come BEFORE the bare-package alias so the
      // longer prefix wins. Vite/Vitest match the longest alias prefix.
      '@marketsui/data-plane/v2/client': resolve(__dirname, '../data-plane/src/v2/client/index.ts'),
      '@marketsui/data-plane/v2/worker': resolve(__dirname, '../data-plane/src/v2/worker/index.ts'),
      '@marketsui/data-plane/v2': resolve(__dirname, '../data-plane/src/v2/index.ts'),
      '@marketsui/data-plane': resolve(__dirname, '../data-plane/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

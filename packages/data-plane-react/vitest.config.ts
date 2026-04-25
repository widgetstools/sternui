import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@marketsui/data-plane-react': resolve(__dirname, 'src/index.ts'),
      '@marketsui/data-plane/client': resolve(__dirname, '../data-plane/src/client/index.ts'),
      '@marketsui/data-plane/worker': resolve(__dirname, '../data-plane/src/worker/index.ts'),
      '@marketsui/data-plane/providers': resolve(__dirname, '../data-plane/src/providers/index.ts'),
      '@marketsui/data-plane/protocol': resolve(__dirname, '../data-plane/src/protocol.ts'),
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

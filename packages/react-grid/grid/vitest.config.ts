import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      /**
       * Vite refuses this id under vitest — it is outside the project root and
       * carries a `?url` suffix — and it is reached TRANSITIVELY: `MarketsGrid`
       * imports `CustomSSRMGrid`, which imports `agGrid/modules.ts`, whose
       * graph reaches the Perspective client. The failure is at collection
       * time, so it takes the whole file rather than one test.
       */
      {
        find: '@perspective-dev/client/dist/wasm/perspective-js.wasm?url',
        replacement: resolve(__dirname, 'src/test/perspectiveWasmUrlStub.ts'),
      },
      {
        find: '@starui/design-system/adapters/ag-grid',
        replacement: resolve(__dirname, '../../design-system/design-system/dist/adapters/agGrid.js'),
      },
      {
        find: '@starui/design-system/tokens',
        replacement: resolve(__dirname, '../../design-system/design-system/dist/tokens/index.js'),
      },
      {
        find: '@starui/design-system',
        replacement: resolve(__dirname, '../../design-system/design-system/dist/index.js'),
      },
      { find: '@starui/grid/customizer', replacement: resolve(__dirname, 'src/customizer/index.ts') },
      { find: '@starui/grid', replacement: resolve(__dirname, 'src/index.ts') },
      { find: '@starui/ssrm-grid', replacement: resolve(__dirname, '../ssrm-grid/src/index.ts') },
      { find: '@starui/engine', replacement: resolve(__dirname, '../../shared/engine/src/index.ts') },
      { find: '@starui/types', replacement: resolve(__dirname, '../../shared/types/src/index.ts') },
      { find: '@starui/host', replacement: resolve(__dirname, '../../shared/host/src/index.ts') },
      { find: '@starui/ui', replacement: resolve(__dirname, '../../react-ui/ui/src/index.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts', './src/test/providers.tsx'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15_000,
  },
});

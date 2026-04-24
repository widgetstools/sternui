import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  // Port 5190 is owned by apps/demo-react (the plain-DexieAdapter demo).
  // 5191 = the ConfigService-backed sibling; separate port = both can
  // run concurrently for side-by-side comparison.
  server: { port: 5191, open: true },
  resolve: {
    alias: {
      // Alias core + markets-grid to source so Vite bundles them via
      // the consumer's tree (avoids the Monaco-worker resolution issue
      // that hits consumers reading core's prebuilt dist).
      '@marketsui/core': resolve(__dirname, '../../packages/core/src'),
      '@marketsui/markets-grid': resolve(__dirname, '../../packages/markets-grid/src'),
    },
  },
});

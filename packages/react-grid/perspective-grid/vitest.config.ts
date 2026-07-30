/**
 * The engine modules here are pure logic and run fine under node, but
 * `usePerspectiveTable` is a React hook — it needs a DOM to render into and
 * the React plugin to transform its `.tsx` test.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

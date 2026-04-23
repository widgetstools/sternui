import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import path from 'path';

export default defineConfig({
  plugins: [angular()],
  resolve: {
    alias: {
      // Resolve @stern/angular from TypeScript source (no dist needed in dev)
      '@stern/angular': path.resolve(__dirname, '../../packages/angular/src/index.ts'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    include: ['@angular/core', '@angular/common', '@angular/router', '@angular/forms', 'ag-grid-angular', 'ag-grid-community', 'ag-grid-enterprise'],
    exclude: ['@stern/angular'],
  },
});

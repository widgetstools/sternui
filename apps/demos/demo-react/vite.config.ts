import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../../scripts/staruiConsumerVite.mjs';

export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url)), {
    plugins: [react()],
    server: {
      port: 5190,
      open: true,
      // MarketsCgrid pilot: @cgrid/kernel is a file: dep into the sibling
      // canvasgrid repo; its module worker resolves through @fs and must
      // be allowed explicitly (vite fs.allow defaults to the workspace).
      fs: { allow: ['../../..', '/Users/develop/wfh/canvasgrid'] },
    },
  }),
);

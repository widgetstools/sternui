import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../scripts/staruiConsumerVite.mjs';

const appDir = appDirFromConfig(import.meta.url);
const staruiPartial = staruiConsumerViteConfig(appDir, { worker: true });
const staruiAliases = Array.isArray(staruiPartial.resolve?.alias)
  ? staruiPartial.resolve.alias
  : [];

export default defineConfig(
  mergeConfig(staruiPartial, {
    plugins: [react(), svgr()],
    resolve: {
      alias: [
        ...staruiAliases,
        {
          find: /^@stomp\/stompjs$/,
          replacement: resolve(__dirname, '../../node_modules/@stomp/stompjs/esm6/index.js'),
        },
      ],
    },
    server: { port: 5174 },
  }),
);

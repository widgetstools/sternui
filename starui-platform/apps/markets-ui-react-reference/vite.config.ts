import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), svgr()],
  optimizeDeps: {
    exclude: ['@stomp/stompjs'],
  },
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: [
      {
        find: /^@stomp\/stompjs$/,
        replacement: resolve(__dirname, "../../../node_modules/@stomp/stompjs/esm6/index.js"),
      },
    ],
  },
  server: {
    port: 5174,
  },
  build: {
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
  worker: {
    format: 'es',
  },
});

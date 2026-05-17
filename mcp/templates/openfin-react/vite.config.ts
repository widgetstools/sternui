import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { resolve } from "node:path";

// Tailwind v3 works via PostCSS — Vite picks up postcss.config.cjs
// automatically. No Tailwind-specific Vite plugin is needed.
export default defineConfig({
  plugins: [
    react(),
    svgr(), // Enables: import Icon from 'path/to/icon.svg?react'
  ],
  optimizeDeps: {
    // Exclude @stomp/stompjs from pre-bundling so the resolve alias
    // below (which forces the ESM6 entry) can take effect. Pre-bundling
    // would pick the UMD version first, breaking dynamic imports in the
    // SharedWorker.
    exclude: ["@stomp/stompjs"],
  },
  resolve: {
    // Prefer source extensions so `.tsx`/`.ts` always win when imports
    // omit the extension.
    extensions: [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: [
      // Force the ESM6 entry for stompjs. Its `exports` map puts
      // "browser" → UMD before "import" → ESM, and Vite's `module`-mode
      // SharedWorker bundler picks the UMD branch which then explodes
      // with `require is not defined` at runtime in the worker. The
      // ESM build works equally well in the main thread.
      {
        find: /^@stomp\/stompjs$/,
        replacement: resolve(__dirname, "./node_modules/@stomp/stompjs/esm6/index.js"),
      },
    ],
  },
  server: {
    port: {{port}},
  },
  build: {
    // Monaco + AG-Grid Enterprise legitimately push chunks past 500 kB.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Radix-UI + lucide-react "use client" directives are RSC
        // markers irrelevant in a plain client bundle.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        if (warning.code === "SOURCEMAP_ERROR") return;
        defaultHandler(warning);
      },
    },
  },
  worker: {
    // The data-services SharedWorker uses dynamic `import('@stomp/stompjs')`
    // to lazy-load the STOMP client. Dynamic imports require code-splitting,
    // which Vite's default IIFE worker format does not support — Rollup
    // throws "Invalid value 'iife' for option 'worker.format' — UMD and
    // IIFE output formats are not supported for code-splitting builds."
    format: "es",
  },
});

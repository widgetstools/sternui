import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";
import { resolve } from "path";

// Tailwind v3 works via PostCSS — Vite picks up postcss.config.js automatically.
// No Tailwind-specific Vite plugin is needed.
export default defineConfig({
  plugins: [
    react(),
    svgr(),   // Enables: import Icon from 'path/to/icon.svg?react'
  ],
  resolve: {
    // Prefer `.tsx`/`.ts` over `.js`/`.mjs` so source files always win
    // when imports omit the extension. This guards against a recurring
    // pitfall: the app's `tsconfig.app.json` has `composite: true` and
    // no `outDir`, so any `tsc -b` run (manual or editor-triggered)
    // emits `.js` siblings next to every `.tsx` under `src/`. Vite's
    // default extension order picks `.js` first, so the stale compiled
    // output silently shadows live source edits and HMR appears broken.
    // Putting source extensions ahead of compiled ones makes the dev
    // server resolve to source regardless.
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: {
      // Resolve @marketsui/core + @marketsui/markets-grid to their
      // `src/` directories rather than the prebuilt `dist/`. Core's
      // built bundle emits Monaco worker chunks via
      // `new Worker(new URL(...))` that Rollup can't statically link
      // from a downstream consumer — aliasing to source lets Vite
      // process Monaco via its own worker plugin. Same workaround
      // the demo-react + demo-configservice-react apps use.
      "@marketsui/core": resolve(__dirname, "../../packages/core/src"),
      "@marketsui/markets-grid": resolve(__dirname, "../../packages/markets-grid/src"),
      // Alias every v2 data-plane / widgets-react entrypoint to its
      // source. Without these the dev server reads the prebuilt
      // `dist/` from each package's `exports` map, so source edits
      // don't take effect until you also run `turbo build`. Symptoms
      // of forgetting: new console.logs never show up; refactors
      // (e.g. removing useProviderStream from the container) don't
      // visibly land. Aliasing to source makes Vite HMR Just Work.
      "@marketsui/widgets-react/v2/markets-grid-container": resolve(__dirname, "../../packages/widgets-react/src/v2/markets-grid-container/index.ts"),
      "@marketsui/widgets-react/v2/provider-editor": resolve(__dirname, "../../packages/widgets-react/src/v2/provider-editor/index.ts"),
      "@marketsui/widgets-react/v2/data-provider-selector": resolve(__dirname, "../../packages/widgets-react/src/v2/data-provider-selector/index.ts"),
      "@marketsui/data-plane-react/v2": resolve(__dirname, "../../packages/data-plane-react/src/v2/index.tsx"),
      "@marketsui/data-plane/v2/client": resolve(__dirname, "../../packages/data-plane/src/v2/client/index.ts"),
      "@marketsui/data-plane/v2/worker": resolve(__dirname, "../../packages/data-plane/src/v2/worker/index.ts"),
      "@marketsui/data-plane/v2": resolve(__dirname, "../../packages/data-plane/src/v2/index.ts"),
      // openfin-platform exports from BOTH `./config` (dock-editor +
      // registry-editor read-only entrypoint that avoids pulling
      // @openfin/* runtimes into non-OpenFin builds) AND `.` (the
      // full surface). Both need to alias to source so adding/
      // renaming exports (e.g. `deriveTemplateConfigId`) doesn't
      // require a turbo build before the dev server picks it up.
      "@marketsui/openfin-platform/config": resolve(__dirname, "../../packages/openfin-platform/src/config-only.ts"),
      "@marketsui/openfin-platform": resolve(__dirname, "../../packages/openfin-platform/src/index.ts"),
      // config-service has the AppConfigRow type — alias it too so
      // the `singleton?: boolean` field added in the same refactor
      // is visible to consumers without a rebuild.
      "@marketsui/config-service": resolve(__dirname, "../../packages/config-service/src/index.ts"),
      // Force the ESM6 entry for stompjs. Its `exports` map puts
      // "browser" → UMD before "import" → ESM, and Vite's `module`-mode
      // SharedWorker bundler picks the UMD branch which then explodes
      // with `require is not defined` at runtime in the worker. The
      // ESM build works equally well in the main thread, so a plain
      // resolver alias is the cheapest fix that keeps both contexts
      // happy.
      "@stomp/stompjs": resolve(__dirname, "../../node_modules/@stomp/stompjs/esm6/index.js"),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    // Monaco + AG-Grid Enterprise legitimately push chunks past 500 kB.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Radix-UI + lucide-react "use client" directives are RSC
        // markers irrelevant in a plain client bundle.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
  worker: {
    // The data-plane SharedWorker uses dynamic `import('@stomp/stompjs')`
    // to lazy-load the STOMP client. Dynamic imports require
    // code-splitting, which Vite's default IIFE worker format doesn't
    // support — Rollup throws "Invalid value 'iife' for option
    // 'worker.format' — UMD and IIFE output formats are not supported
    // for code-splitting builds." ESM workers are widely supported in
    // modern Chromium / OpenFin and are the right format for module
    // workers anyway.
    format: 'es',
  },
});

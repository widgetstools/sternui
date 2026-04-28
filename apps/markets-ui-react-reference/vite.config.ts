import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";
import { resolve } from "path";
import { buildPackageAliases } from "./vite-package-aliases";

// Auto-discover every `@marketsui/*` workspace package and produce
// one alias entry per export (`.`, `./v2`, `./v2/client`, …) → its
// source path. See `./vite-package-aliases.ts` for the algorithm.
//
// Why: source-side edits to any workspace package were only visible
// after a full `turbo build` round-trip — the `package.json` `exports`
// map points at compiled `./dist/...`, so the dev server resolved
// through that. Auto-aliasing to `src/` removes the round-trip; new
// console logs and renamed exports land via Vite HMR immediately.
//
// New workspace packages or new subpath exports require zero
// vite.config edits — the alias map regenerates on each Vite start.
//
// `core` ships Monaco worker chunks that Rollup can't statically
// link from a downstream consumer when consumed-as-source — but we
// already alias `core` to source for unrelated reasons (see Monaco
// worker handling), so leaving it in the auto-discovered set is fine.
const workspaceAliases = buildPackageAliases({
  packagesRoot: resolve(__dirname, "../../packages"),
});

// Boot-time visibility — confirms the helper ran and shows what's
// aliased before any browser request.
// eslint-disable-next-line no-console
console.log(`[vite] auto-discovered ${workspaceAliases.length} @marketsui/* source aliases:`);
for (const a of [...workspaceAliases].sort((x, y) => x.find.source.localeCompare(y.find.source))) {
  // eslint-disable-next-line no-console
  console.log(`  ${a.find.source.padEnd(70)} → ${a.replacement.replace(resolve(__dirname, "../.."), ".")}`);
}

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
    // Vite's alias **array form** — each entry's `find` is an
    // anchored regex (^…$) so `@marketsui/foo` matches only the
    // bare specifier and NOT `@marketsui/foo/bar` (which would
    // otherwise prefix-match and resolve to a wrong path).
    alias: [
      // Auto-discovered @marketsui/* package aliases (one per
      // declared export entrypoint, mapped to its source path).
      ...workspaceAliases,
      // Force the ESM6 entry for stompjs. Its `exports` map puts
      // "browser" → UMD before "import" → ESM, and Vite's `module`-mode
      // SharedWorker bundler picks the UMD branch which then explodes
      // with `require is not defined` at runtime in the worker. The
      // ESM build works equally well in the main thread, so a plain
      // resolver alias is the cheapest fix that keeps both contexts
      // happy.
      {
        find: /^@stomp\/stompjs$/,
        replacement: resolve(__dirname, "../../node_modules/@stomp/stompjs/esm6/index.js"),
      },
    ],
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

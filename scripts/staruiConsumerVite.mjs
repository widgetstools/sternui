/**
 * Shared Vite partial config for apps consuming @wellsfargo-starui/* packages.
 */
import {
  staruiViteAliases,
  staruiOptimizeDeps,
  staruiServerFsAllow,
  reactResolveConfig,
  appDirFromConfig,
  staruiHostDataWorkerAssetPlugin,
  staruiEnsureBuiltAssetsPlugin,
  staruiPerspectiveWasmAssetsPlugin,
  stompJsEsmAlias,
} from './staruiConsumerAliases.mjs';

export { appDirFromConfig };

/**
 * @param {string} appDir absolute path to the app root
 * @param {{ worker?: boolean }} [opts] pass `{ worker: true }` when the app uses SharedWorker
 */
export function staruiConsumerViteConfig(appDir, opts = {}) {
  const reactResolve = reactResolveConfig(appDir);

  return {
    plugins: [
      staruiEnsureBuiltAssetsPlugin(),
      staruiHostDataWorkerAssetPlugin(appDir),
      staruiPerspectiveWasmAssetsPlugin(appDir),
    ],
    optimizeDeps: {
      ...reactResolve.optimizeDeps,
      ...staruiOptimizeDeps(),
      include: [
        ...(reactResolve.optimizeDeps.include ?? []),
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
      ],
    },
    resolve: {
      dedupe: reactResolve.dedupe,
      alias: [stompJsEsmAlias(appDir), ...reactResolve.alias, ...staruiViteAliases(appDir)],
      extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    },
    server: {
      fs: {
        allow: staruiServerFsAllow(appDir),
      },
    },
    ...(opts.worker ? { worker: { format: 'es' } } : {}),
    build: {
      // monaco-editor (via @wellsfargo-starui/grid's ExpressionEditor) is irreducibly
      // large (~3.8MB editor + multi-MB language workers). Keep the limit
      // above it so the known-large monaco chunk doesn't emit a noisy
      // warning, while genuinely oversized *app* chunks still surface.
      chunkSizeWarningLimit: 4500,
      // Reporting gzip sizes re-compresses every emitted chunk; on the
      // multi-MB monaco bundles that is a measurable chunk of build time
      // for output we don't act on. Skip it.
      reportCompressedSize: false,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          if (warning.code === 'SOURCEMAP_ERROR') return;
          defaultHandler(warning);
        },
        output: {
          // Pull monaco-editor out of the main app chunk into its own
          // cacheable vendor chunk. Shrinks the entry bundle, lowers peak
          // minifier memory (no single 4MB+ chunk), and lets monaco stay
          // cached across rebuilds. App-agnostic: a no-op for apps that
          // don't pull monaco in.
          manualChunks(id) {
            if (id.includes('node_modules/monaco-editor')) return 'monaco-editor';
            if (id.includes('node_modules/ag-grid-enterprise')) return 'ag-grid-enterprise';
            if (id.includes('node_modules/ag-grid-community')) return 'ag-grid-community';
            if (id.includes('node_modules/ag-grid-react')) return 'ag-grid-react';
            return undefined;
          },
        },
      },
    },
  };
}

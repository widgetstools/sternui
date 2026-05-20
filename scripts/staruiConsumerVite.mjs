/**
 * Shared Vite partial config for apps consuming @starui/* packages.
 */
import {
  staruiViteAliases,
  staruiOptimizeDeps,
  staruiServerFsAllow,
  reactResolveConfig,
  appDirFromConfig,
  staruiHostDataWorkerAssetPlugin,
} from './staruiConsumerAliases.mjs';

export { appDirFromConfig };

/**
 * @param {string} appDir absolute path to the app root
 * @param {{ worker?: boolean }} [opts] pass `{ worker: true }` when the app uses SharedWorker
 */
export function staruiConsumerViteConfig(appDir, opts = {}) {
  const reactResolve = reactResolveConfig(appDir);

  return {
    plugins: [staruiHostDataWorkerAssetPlugin(appDir)],
    optimizeDeps: {
      ...reactResolve.optimizeDeps,
      ...staruiOptimizeDeps(),
    },
    resolve: {
      dedupe: reactResolve.dedupe,
      alias: [...reactResolve.alias, ...staruiViteAliases(appDir)],
      extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    },
    server: {
      fs: {
        allow: staruiServerFsAllow(appDir),
      },
    },
    ...(opts.worker ? { worker: { format: 'es' } } : {}),
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
  };
}

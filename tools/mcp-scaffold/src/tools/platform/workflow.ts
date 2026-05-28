import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMPTY_GRID_TROUBLESHOOTING,
  WIRE_STOMP_STEPS,
  recommendTemplate,
  type TemplateRecommendationInput,
} from '../../knowledge/platform.js';

async function fetchHealth(url: string): Promise<{ ok: boolean; body?: string; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const body = await res.text();
    return { ok: res.ok, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function readProjectFile(projectDir: string, rel: string): string | null {
  const p = join(projectDir, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export function handleRecommendTemplate(input: TemplateRecommendationInput) {
  const rec = recommendTemplate(input);
  return { recommendation: rec, nextTool: 'starui_scaffold_app' };
}

export async function handleSetupStompDev(opts: {
  projectDir?: string;
  stompPort?: number;
  websocketUrl?: string;
}) {
  const port = opts.stompPort ?? 8081;
  const wsUrl = opts.websocketUrl ?? `ws://localhost:${port}`;
  const health = await fetchHealth(`http://localhost:${port}/health`);
  const steps = [...WIRE_STOMP_STEPS];
  const projectHints: string[] = [];

  if (opts.projectDir) {
    const pkg = readProjectFile(opts.projectDir, 'package.json');
    const vite = readProjectFile(opts.projectDir, 'vite.config.ts');
    const ds = readProjectFile(opts.projectDir, 'src/dataServices.ts');
    if (!pkg?.includes('@starui/data')) projectHints.push('Add @starui/data tarball to package.json');
    if (vite && !vite.includes('worker: true')) projectHints.push('Enable worker: true in vite.config for SharedWorker');
    if (!ds) projectHints.push('Add src/dataServices.ts with bootstrapDataServicesWithWorkerAsset');
    if (!existsSync(join(opts.projectDir, 'stomp-view-server'))) {
      projectHints.push('Copy stomp-view-server/ or run from monorepo apps/stomp-view-server');
    }
  }

  return {
    stompServerHealthy: health.ok,
    healthUrl: `http://localhost:${port}/health`,
    healthDetail: health.body ?? health.error,
    websocketUrl: wsUrl,
    devCommands: {
      stomp: 'npm run dev:stomp',
      app: 'npm run dev',
    },
    gridToolbarShortcut: 'Alt+Shift+P (Win/Linux) or Cmd+Shift+P (Mac) → select STOMP provider',
    steps,
    projectHints,
    generateConfigTool: 'starui_generate_stomp_config',
  };
}

export async function handleDiagnoseDataPlane(opts: { projectDir: string; stompPort?: number }) {
  const port = opts.stompPort ?? 8081;
  const issues: Array<{ severity: 'error' | 'warn' | 'info'; message: string; fix: string }> = [];
  const passed: string[] = [];

  const pkg = readProjectFile(opts.projectDir, 'package.json');
  const vite = readProjectFile(opts.projectDir, 'vite.config.ts');
  const main = readProjectFile(opts.projectDir, 'src/main.tsx');
  const ds = readProjectFile(opts.projectDir, 'src/dataServices.ts');
  const ensure = readProjectFile(opts.projectDir, 'src/ensureStompProvider.ts');

  if (!pkg) issues.push({ severity: 'error', message: 'No package.json', fix: 'Scaffold or cd to project root' });
  else {
    if (pkg.includes('@starui/data') || pkg.includes('host-data')) passed.push('data bucket dependency present');
    else issues.push({ severity: 'error', message: 'Missing @starui/data tarball dep', fix: 'Add file:libs/starui-data-*.tgz' });
  }

  if (vite?.includes('worker: true')) passed.push('Vite worker mode enabled');
  else if (ds) issues.push({ severity: 'error', message: 'SharedWorker requires worker: true in vite.config', fix: 'staruiConsumerViteConfig(..., { worker: true })' });

  if (main?.includes('DataServicesProvider')) passed.push('DataServicesProvider in main.tsx');
  else if (ds) issues.push({ severity: 'error', message: 'DataServicesProvider not in main.tsx', fix: 'Wrap <App /> with DataServicesProvider' });

  if (ds) passed.push('dataServices.ts exists');
  else issues.push({ severity: 'warn', message: 'No dataServices.ts — static grid or missing data plane', fix: 'Add bootstrapDataServicesWithWorkerAsset' });

  if (ensure) passed.push('ensureStompProvider.ts found');
  else if (ds) issues.push({ severity: 'info', message: 'No STOMP seed — create provider via editor or starui_add_provider_to_project', fix: 'starui_generate_stomp_config + ensureStompProvider' });

  const health = await fetchHealth(`http://localhost:${port}/health`);
  if (health.ok) passed.push(`stomp-view-server healthy on :${port}`);
  else issues.push({ severity: 'warn', message: `STOMP server not reachable on :${port}`, fix: 'npm run dev:stomp' });

  const likelyCause =
    issues.some((i) => i.severity === 'error')
      ? 'Data plane misconfigured — fix errors above'
      : !health.ok
        ? 'Grid empty: start stomp-view-server and select provider in toolbar'
        : !ensure
          ? 'Grid empty: no provider seeded — run ensureStompProvider or pick provider in toolbar'
          : 'Check provider toolbar selection (Alt+Shift+P)';

  return {
    summary: likelyCause,
    passed,
    issues,
    troubleshooting: EMPTY_GRID_TROUBLESHOOTING,
    wireStomp: WIRE_STOMP_STEPS,
  };
}

export function handleUpgradeScaffold(opts: { projectDir: string; templateId: string }) {
  const expected = {
    basic: ['src/App.tsx', 'src/bondColumns.ts', 'src/globals.css', 'libs/manifest.json'],
    stomp: ['src/dataServices.ts', 'src/ensureStompProvider.ts', 'stomp-view-server/package.json'],
    'openfin-platform': ['launch.mjs', 'public/platform/manifest.fin.json', 'src/platform/Provider.tsx'],
  }[opts.templateId] ?? [];

  const missing = expected.filter((f) => !existsSync(join(opts.projectDir, f)));
  const present = expected.filter((f) => existsSync(join(opts.projectDir, f)));

  return {
    templateId: opts.templateId,
    present,
    missing,
    suggestion: missing.length
      ? 'Re-scaffold with force:true to a new folder or manually add missing files from template'
      : 'Project matches core template files — run starui_check_tarball_versions for deps',
  };
}

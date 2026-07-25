#!/usr/bin/env node
/**
 * soakSsrm.mjs — SSRM pull-plane memory soak (opt-in, NOT CI-blocking).
 *
 * Runs TWO tabs on ONE SSRM provider (the lab grid spike →
 * one SharedWorker hosting the Perspective table) under a live feed for
 * N minutes, sampling:
 *
 *   • post-GC JS heap of each page (CDP `HeapProfiler.collectGarbage` +
 *     `Runtime.getHeapUsage`) — window-side leaks: view/block caches,
 *     grid rows, listeners;
 *   • total browser process-tree RSS (OS view) — catches what page
 *     heaps can't see: the SharedWorker's JS + Perspective WASM side.
 *
 * Prints a sample table and a per-metric + overall LEAK/FLAT verdict
 * (first-third vs last-third medians; LEAK = growth > 15% AND > 20 MB).
 *
 * Usage (see docs/SSRM_PROVIDER_V2.md):
 *   npm run soak:ssrm                       # 5 min, 10k rows, 5 t/s × 500
 *   node scripts/soakSsrm.mjs --minutes 2 --sample-secs 10
 *   node scripts/soakSsrm.mjs --rows 20000 --rate 10 --upt 1000
 *
 * Requires the stomp-view-server (:8081) and markets-grid-lab (:5300)
 * dev servers; either may already be running (reused if so) — missing
 * ones are spawned and torn down on exit.
 */

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── args ───────────────────────────────────────────────────────────

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const MINUTES = arg('minutes', 5);
const SAMPLE_SECS = arg('sample-secs', 15);
const ROWS = arg('rows', 10_000);
const RATE = arg('rate', 5);
const UPT = arg('upt', 500);
const BASE_URL = process.env.SOAK_BASE_URL ?? 'http://localhost:5300';
const SETTLE_SECS = arg('settle-secs', 20);

const SPIKE_URL = `${BASE_URL}/spikes/ssrmGrid.html?rows=${ROWS}&rate=${RATE}&upt=${UPT}`;

// ─── dev-server management (reuse when already listening) ───────────

function hostListening(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Vite may bind only the IPv6 loopback — probe both. */
async function portListening(port) {
  return (await hostListening(port, '127.0.0.1')) || hostListening(port, '::1');
}

const spawned = [];

async function ensureServer(port, command, label) {
  if (await portListening(port)) {
    console.log(`[soak] reusing ${label} already on :${port}`);
    return;
  }
  console.log(`[soak] starting ${label} (:${port}) — ${command}`);
  const child = spawn(command, { cwd: ROOT, shell: true, stdio: 'ignore' });
  spawned.push({ child, label });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await portListening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not listen on :${port} within 120s`);
}

function killSpawned() {
  for (const { child, label } of spawned) {
    if (child.pid == null || child.exitCode !== null) continue;
    console.log(`[soak] stopping ${label} (pid ${child.pid})`);
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}

// ─── OS process-tree RSS ────────────────────────────────────────────

function processTable() {
  if (process.platform === 'win32') {
    const out = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Csv -NoTypeInformation',
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return out.stdout
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.replaceAll('"', '').split(','))
      .filter((cols) => cols.length === 3 && cols[0] !== '')
      .map(([pid, ppid, ws]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(ws) }));
  }
  const out = spawnSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  return out.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length === 3)
    .map(([pid, ppid, rss]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss) * 1024 }));
}

/** Sum RSS of `rootPid` + every descendant (the whole browser tree). */
function processTreeRss(rootPid) {
  const rows = processTable();
  const childrenOf = new Map();
  for (const row of rows) {
    if (!childrenOf.has(row.ppid)) childrenOf.set(row.ppid, []);
    childrenOf.get(row.ppid).push(row.pid);
  }
  const byPid = new Map(rows.map((row) => [row.pid, row.rss]));
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length > 0) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += byPid.get(pid) ?? 0;
    for (const child of childrenOf.get(pid) ?? []) stack.push(child);
  }
  return total;
}

// ─── page helpers ───────────────────────────────────────────────────

async function openTab(context, label) {
  const page = await context.newPage();
  await page.goto(SPIKE_URL);
  await page.waitForFunction(() => '__ssrmGridSpike' in window, undefined, { timeout: 60_000 });
  await page.waitForFunction(
    (rows) => {
      const s = window.__ssrmGridSpike.state();
      return s !== null && s.phase === 'live' && s.rowCount === rows;
    },
    ROWS,
    { timeout: 120_000, polling: 200 },
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  console.log(`[soak] tab ${label} live at ${ROWS} rows`);
  return { page, cdp, label };
}

async function postGcHeap(tab) {
  await tab.cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await tab.cdp.send('Runtime.getHeapUsage');
  return usedSize;
}

// ─── verdict ────────────────────────────────────────────────────────

const MB = (bytes) => bytes / (1024 * 1024);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** LEAK when last-third median grew > 15% AND > 20 MB over first-third. */
function metricVerdict(samples) {
  const third = Math.max(1, Math.floor(samples.length / 3));
  const start = median(samples.slice(0, third));
  const end = median(samples.slice(-third));
  const growthMb = MB(end - start);
  const growthPct = start > 0 ? ((end - start) / start) * 100 : 0;
  const leak = growthPct > 15 && growthMb > 20;
  return { start, end, growthMb, growthPct, leak };
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  console.log(
    `[soak] SSRM pull-plane soak — ${MINUTES} min, sample every ${SAMPLE_SECS}s, ` +
      `${ROWS} rows @ ${RATE} ticks/s × ${UPT} rows/tick, two tabs, one worker`,
  );

  await ensureServer(8081, 'npm --prefix apps run dev -w @starui/stomp-view-server', 'stomp-view-server');
  await ensureServer(
    5300,
    'npm --prefix apps run dev -w @starui/markets-grid-lab -- --no-open --force',
    'markets-grid-lab',
  );

  // launchServer (not launch) so the root browser PID is public API —
  // the OS RSS walk needs it.
  const server = await chromium.launchServer({ headless: true });
  const browserPid = server.process().pid;
  const browser = await chromium.connect(server.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const samples = [];
  try {
    const tabA = await openTab(context, 'A');
    const tabB = await openTab(context, 'B');

    console.log(`[soak] settling ${SETTLE_SECS}s before the first sample…`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_SECS * 1000));

    const startedAt = Date.now();
    const endAt = startedAt + MINUTES * 60_000;
    console.log('\n   t      heap A (MB)   heap B (MB)   browser tree RSS (MB)');
    console.log('   ─────  ───────────   ───────────   ─────────────────────');
    for (;;) {
      const heapA = await postGcHeap(tabA);
      const heapB = await postGcHeap(tabB);
      const rss = processTreeRss(browserPid);
      samples.push({ at: Date.now() - startedAt, heapA, heapB, rss });
      const t = Math.round((Date.now() - startedAt) / 1000);
      const mmss = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      console.log(
        `   ${mmss}  ${MB(heapA).toFixed(1).padStart(11)}   ${MB(heapB).toFixed(1).padStart(11)}   ${MB(rss).toFixed(1).padStart(21)}`,
      );
      if (Date.now() >= endAt) break;
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_SECS * 1000));
    }

    // Sanity: the dataset stayed live the whole run.
    for (const tab of [tabA, tabB]) {
      const state = await tab.page.evaluate(() => window.__ssrmGridSpike.state());
      if (state?.phase !== 'live') {
        throw new Error(`tab ${tab.label} ended in phase '${state?.phase}' — soak invalid`);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    killSpawned();
  }

  if (samples.length < 3) {
    console.error(`[soak] only ${samples.length} samples — too short for a verdict`);
    process.exitCode = 2;
    return;
  }

  console.log('\n[soak] verdicts (first-third median → last-third median):');
  const verdicts = {
    'page heap A': metricVerdict(samples.map((s) => s.heapA)),
    'page heap B': metricVerdict(samples.map((s) => s.heapB)),
    'browser RSS': metricVerdict(samples.map((s) => s.rss)),
  };
  let leak = false;
  for (const [name, v] of Object.entries(verdicts)) {
    leak ||= v.leak;
    console.log(
      `   ${name.padEnd(12)} ${MB(v.start).toFixed(1)} → ${MB(v.end).toFixed(1)} MB ` +
        `(${v.growthMb >= 0 ? '+' : ''}${v.growthMb.toFixed(1)} MB, ${v.growthPct.toFixed(1)}%) — ` +
        (v.leak ? 'LEAK' : 'FLAT'),
    );
  }
  console.log(`\nVERDICT: ${leak ? 'LEAK' : 'FLAT'}`);
  process.exitCode = leak ? 1 : 0;
}

main().catch((err) => {
  console.error('[soak] failed:', err);
  killSpawned();
  process.exitCode = 1;
});

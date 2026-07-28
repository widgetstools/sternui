/**
 * Launcher. Opening windows rather than iframes is deliberate: separate
 * windows are what the desktop actually does, and iframes would share this
 * page's main thread — which is the very thing the pull path is meant to keep
 * out of the picture.
 */
import { createHostHandle } from './hostClient';

const steps = document.getElementById('steps')!;
const line = (className: string, text: string) => {
  const li = document.createElement('li');
  li.className = className;
  li.textContent = text;
  steps.prepend(li);
};

const openBlotter = (index: number) =>
  window.open('./blotter.html', `blotter-${index}-${Date.now()}`, 'width=1400,height=820');

document.getElementById('marketsgrid')!.onclick = () => {
  window.open('./marketsgrid.html', 'mg-' + Date.now(), 'width=1500,height=880');
  line('ok', 'opened MarketsGrid on the pull path — same Table, full widget chrome.');
};

document.getElementById('one')!.onclick = () => {
  openBlotter(1);
  line('ok', 'opened 1 blotter — read its own time-to-first-rows.');
};

document.getElementById('three')!.onclick = () => {
  for (let i = 1; i <= 3; i++) openBlotter(i);
  line(
    'ok',
    'opened 3 blotters in one gesture. Each reports its own attach and first-rows time; ' +
      'the snapshot is paid once, by whichever window got there first.',
  );
};

// Connecting here warms the worker, so the broker snapshot is already loading
// while you decide how many blotters to open — the late-joiner case, which is
// the one that matters on a desk.
const host = createHostHandle();
host.onMessage((message) => {
  // `connected` matters as much as `stage`: stages are broadcast on
  // TRANSITIONS, so a page that arrives after the worker has booted would
  // otherwise sit blank looking broken while everything is in fact fine.
  if (message?.type === 'connected') line('ok', `worker already up — ${String(message.stage)}`);
  else if (message?.type === 'stage') line('run', `worker: ${String(message.stage)}`);
  else if (message?.type === 'error') line('bad', `worker error — ${String(message.detail)}`);
  else if (message?.type === 'status') {
    const stats = message.stats as Record<string, number>;
    line(
      'ok',
      `status — stage "${String(message.stage)}", ${message.attached} window(s) attached, ` +
        `${stats.snapshotRows} snapshot rows, ${stats.deltaFrames} delta frames / ${stats.deltaRows} rows, ` +
        `${stats.schemaColumns} columns.`,
    );
  }
});

document.getElementById('status')!.onclick = () => host.send({ cmd: 'status' });

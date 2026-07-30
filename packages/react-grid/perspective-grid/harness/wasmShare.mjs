/**
 * Client-wasm sharing probe — page side.
 *
 * Answers, in one run: whether `getCompiledClientWasm()` works in a
 * SharedWorker and from which scope; whether the Module can cross out of one;
 * and — regardless of those two — which window-side strategy actually reaches a
 * row count, and what it costs in bytes.
 *
 * The byte figures come from each strategy's OWN worker
 * (`performance.getEntriesByType('resource')`), not from the page, because the
 * page has already paid for whatever it imported and would report the union.
 */
import { BOOK_NAME } from './mockBook.mjs';

const steps = document.getElementById('steps');
const footnote = document.getElementById('footnote');

function begin(label) {
  const li = document.createElement('li');
  li.className = 'run';
  li.innerHTML = `<span class="label">${label}</span> — running…`;
  steps.appendChild(li);
  return {
    ok: (detail) => {
      li.className = 'ok';
      li.innerHTML = `<span class="label">${label}</span> — ${detail}`;
    },
    bad: (detail) => {
      li.className = 'bad';
      li.innerHTML = `<span class="label">${label}</span> — ${detail}`;
    },
  };
}

const ms = (n) => `${n.toFixed(1)}ms`;
const kb = (n) => `${(n / 1024).toFixed(2)}kB`;

/** Everything the probe learns, dumped to the console as one object. */
const findings = { scopes: {}, transfer: null, strategies: {} };

const worker = new SharedWorker(new URL('./wasmShareHost.mjs', import.meta.url), {
  type: 'module',
  name: 'wasm-share-host',
});
const control = worker.port;

const listeners = new Set();
control.onmessage = (event) => {
  for (const listener of listeners) listener(event.data);
};
/**
 * A `WebAssembly.Module` that cannot be deserialized in this agent cluster does
 * NOT arrive as a failed `message` — it arrives as `messageerror`, with the
 * throw on the receiving side. Without this listener that case is silence, and
 * silence is what the previous attempt had to work from.
 */
let messageErrors = 0;
control.onmessageerror = () => {
  messageErrors += 1;
};
control.start();

function onMessage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function once(type) {
  return new Promise((resolve) => {
    const off = onMessage((message) => {
      if (message?.type === type) {
        off();
        resolve(message);
      }
    });
  });
}

/** Ask the host to bind a ProxySession, and hand back this end of the channel. */
let attachId = 0;
async function attachFramePort() {
  const id = ++attachId;
  const channel = new MessageChannel();
  const attached = new Promise((resolve) => {
    const off = onMessage((message) => {
      if (message?.type === 'attached' && message.id === id) {
        off();
        resolve();
      }
    });
  });
  control.postMessage({ cmd: 'attach', id }, [channel.port2]);
  await attached;
  return channel.port1;
}

/** Run one strategy in its own Worker and report what it cost. */
function runStrategy(mode, clientModule) {
  return new Promise(async (resolve) => {
    const framePort = await attachFramePort();
    const probe = new Worker(new URL('./wasmShareClient.mjs', import.meta.url), {
      type: 'module',
      name: `wasm-share-${mode}`,
    });
    probe.onmessage = (event) => {
      probe.terminate();
      resolve(event.data);
    };
    probe.onerror = (err) => {
      probe.terminate();
      resolve({ mode, ok: false, error: `worker error: ${err.message}`, resources: [] });
    };
    probe.postMessage({ mode, clientModule }, [framePort]);
  });
}

/** The perspective chunks a strategy pulled — the number acceptance is about. */
function perspectiveBytes(resources = []) {
  const chunks = resources.filter(
    (r) => /perspective/i.test(r.name) || /\.wasm$/i.test(r.name),
  );
  const total = chunks.reduce((sum, r) => sum + r.decodedBodySize, 0);
  const biggest = chunks
    .slice(0, 3)
    .map((r) => `${r.name} ${kb(r.decodedBodySize)}`)
    .join(', ');
  return { total, biggest: biggest || 'none' };
}

async function run() {
  // 1. Worker-scope questions. Both `getCompiledClientWasm()` calls and the
  //    postMessage out, each reported on its own.
  const step1 = begin('1. getCompiledClientWasm() inside the SharedWorker');
  const moduleArrived = once('module');
  control.postMessage({ cmd: 'probe' });
  const probe = await once('probe');
  findings.scopes.workerBeforeClient = probe.before;
  findings.scopes.workerAfterClient = probe.after;
  findings.transfer = probe.transfer;

  const beforeText = probe.before.ok
    ? `RESOLVED in ${ms(probe.before.ms)} (${probe.before.value.exports} exports)`
    : `THREW in ${ms(probe.before.ms)}: ${probe.before.error}`;
  const afterText = probe.after.ok
    ? `RESOLVED in ${ms(probe.after.ms)} (${probe.after.value.exports} exports)`
    : `THREW in ${ms(probe.after.ms)}: ${probe.after.error}`;
  const line1 = `before any client — ${beforeText}; after perspective.worker() — ${afterText}.`;
  if (probe.after.ok) step1.ok(line1);
  else step1.bad(line1);

  // 2. Can it LEAVE the SharedWorker? A throw at postMessage and a throw at
  //    deserialize are different failures and are reported as such.
  const step2 = begin('2. transfer the Module out of the SharedWorker');
  let clientModule = null;
  if (!probe.transfer.attempted) {
    step2.bad('not attempted — the getter never produced a Module.');
  } else if (probe.transfer.threw) {
    step2.bad(
      `postMessage THREW ${probe.transfer.errorName ?? ''}: ${probe.transfer.error}. ` +
        'The Module cannot leave a SharedWorker.',
    );
  } else {
    const arrived = await Promise.race([
      moduleArrived,
      new Promise((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    if (arrived?.module instanceof WebAssembly.Module) {
      clientModule = arrived.module;
      step2.ok(
        `arrived intact — ${WebAssembly.Module.exports(clientModule).length} exports. ` +
          'A SharedWorker and a window are in the same agent cluster after all.',
      );
    } else if (messageErrors > 0) {
      step2.bad(
        `postMessage succeeded but the window raised ${messageErrors} messageerror — ` +
          'deserialization was refused (cross agent cluster).',
      );
    } else {
      step2.bad('postMessage succeeded but nothing arrived within 2s.');
    }
  }
  findings.moduleArrived = clientModule !== null;

  // 3. Window scope, as the control for "from which scope". If this throws too
  //    the getter is simply unusable and the answer is the fetch strategy.
  const step3 = begin('3. getCompiledClientWasm() in a window (control)');
  try {
    const perspective = (await import('@perspective-dev/client/inline')).default;
    // Build a client FIRST. The getter answers a variable that only
    // `compilerize()` sets, so calling it on a bare import measures the
    // ordering rule again instead of the scope — which is the mistake this
    // step exists to avoid making about the worker.
    await perspective.worker(Promise.resolve(await attachFramePort()));
    const t0 = performance.now();
    const mod = await perspective.getCompiledClientWasm();
    findings.scopes.window = { ok: true, ms: performance.now() - t0 };
    step3.ok(
      `RESOLVED in ${ms(performance.now() - t0)} — ${WebAssembly.Module.exports(mod).length} exports.`,
    );
  } catch (err) {
    findings.scopes.window = { ok: false, error: String(err?.message ?? err) };
    step3.bad(`THREW: ${String(err?.message ?? err)}`);
  }

  // 4. The strategies. Each runs in its own Worker and has to reach a row count
  //    over the SharedWorker's Table — initializing without throwing is not
  //    evidence that anything works.
  const modes = ['inline', 'fetch'];
  if (clientModule) modes.push('module-direct', 'module-promise', 'module-promise-raw');

  for (const mode of modes) {
    const step = begin(`4. strategy "${mode}"`);
    const result = await runStrategy(mode, clientModule);
    findings.strategies[mode] = result;
    const bytes = perspectiveBytes(result.resources);
    if (result.ok) {
      step.ok(
        `read ${result.rows.toLocaleString()} rows from '${BOOK_NAME}' in ${ms(result.totalMs)} ` +
          `— perspective bytes ${kb(bytes.total)} (${bytes.biggest}).`,
      );
    } else {
      step.bad(
        `${result.errorName ?? 'failed'}: ${result.error} ` +
          `— perspective bytes ${kb(bytes.total)} (${bytes.biggest}).`,
      );
    }
  }

  if (!clientModule) {
    begin('4. strategies "module-*"').bad(
      'skipped — no Module reached this window, so there is nothing to init from.',
    );
  }

  footnote.textContent =
    'Full findings object logged to the console as `__wasmShareFindings`. ' +
    'The row count is the assertion; the byte figure is the payoff.';
  globalThis.__wasmShareFindings = findings;
  console.log('[wasm-share] findings', findings);
}

window.addEventListener('unhandledrejection', (event) => {
  begin('unhandled rejection').bad(String(event.reason?.message ?? event.reason));
});

void run();

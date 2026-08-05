/// <reference lib="webworker" />
import { bootWorkerEntry, reportBootFailure } from '@starui/host-data/runtime/sharedWorker';

/**
 * The data-services SharedWorker, with an SSRM book host wired in.
 *
 * ## Why the book lives HERE and not in `ssrmBookWorker`
 *
 * Two SharedWorkers are alive in this app: this one, which holds the providers,
 * and `ssrmBookWorker`, which holds a GENERATED book and never sees a provider.
 * A book fed by a provider has to live where the provider's rows already are.
 * The alternative puts every row through a second port and a second structured
 * clone — and since there is no route between two SharedWorkers that does not
 * pass through a window, it would be one forwarding copy PER WINDOW. That is a
 * second copy of the feed, and it scales with the thing this path exists to
 * make cheap.
 *
 * So: **a fed book lives in the data-services worker; a generated book lives
 * wherever the generator does.** `@starui/ssrm-engine/worker` has no opinion —
 * it serves ports and knows nothing about who mounted it — which is what lets
 * both hostings be the same code.
 *
 * ## Why this file is in the app
 *
 * `@starui/host-data` must not depend on a `react-grid` package, so the engine
 * is INJECTED rather than imported there — the same shape as the Perspective
 * loader, for one extra reason. An app owns the entry; host-data owns the hub.
 *
 * ## One engine per worker, deliberately
 *
 * This entry passes `loadSsrm` and NOT `loadPerspective`. A worker with both
 * would tee the same provider into two engines and every memory figure taken
 * against it would be of two engines recorded as one — which has already
 * happened on this surface once, at 1,114 MB instead of 411 MB. The app picks
 * the worker by URL flag; the shipped `data-services-perspective-worker.mjs`
 * stays the Perspective side of that A/B.
 */

const LABEL = '@starui/perspective-ssrm-lab ssrm worker';

bootWorkerEntry({
  label: LABEL,
  hub: {
    // Dynamic, so the engine is fetched only by a worker that will use it. Both
    // entry points are needed: the root exports the engine, `/worker` the host.
    loadSsrm: async () => {
      const [core, worker] = await Promise.all([
        import('@starui/ssrm-engine'),
        import('@starui/ssrm-engine/worker'),
      ]);
      return {
        createSsrmEngine: core.createSsrmEngine,
        createSsrmWorkerHost: worker.createSsrmWorkerHost,
      };
    },
  },
}).catch((err) => reportBootFailure(LABEL, err));

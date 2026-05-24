/**
 * Orchestrator for the conditional-styling runtime.
 *
 * Wires the four runtime subsystems (refresh schedulers, expiry timer,
 * trigger cache, header painter, timed activations) into a single
 * activate(platform) → dispose() function the Module shell calls.
 *
 * Dependency graph (← = depends on):
 *
 *   schedulers (refresh, targeted-refresh) ← no deps
 *   triggerCache ← platform
 *   headerPainter ← platform + diffCache
 *   expiry ← headerPainter.evaluate + schedulers.scheduleTargetedRefresh + schedulers.scheduleRefresh
 *   timedActivations ← triggerCache + diffCache + schedulers + expiry + headerPainter
 *
 * activate() owns:
 *   - the resource-cache lookup for the per-grid diff cache
 *   - registering AG-Grid api listeners (onReady, modelUpdated, filterChanged, cellValueChanged)
 *   - subscribing to platform state changes (rule edits)
 *   - the safely() cleanup wrapper that isolates teardown steps
 */

import type { Module, PlatformHandle } from '@starui/engine';
import {
  CONDITIONAL_DIFF_CACHE_KEY,
  clearTimedRuleState,
  pruneTimedRuleStateByRuleSet,
} from '../transforms';
import type { ConditionalStylingState } from '../state';
import { normalizeDuration } from './utils';
import {
  createExpiryScheduler,
  createRefreshScheduler,
  createTargetedRefreshScheduler,
} from './schedulers';
import { createTriggerCache } from './triggerCache';
import { createHeaderPainter } from './headerPainter';
import { createTimedActivations } from './timedActivations';

export function activateConditionalStyling(
  platform: PlatformHandle<ConditionalStylingState>,
): ReturnType<NonNullable<Module<ConditionalStylingState>['activate']>> {
  const disposers: Array<() => void> = [];
  const diffCacheByApi = platform.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
    CONDITIONAL_DIFF_CACHE_KEY,
  );
  clearTimedRuleState();

  // Subsystems.
  const refresh = createRefreshScheduler(platform);
  const targetedRefresh = createTargetedRefreshScheduler(platform);
  const triggers = createTriggerCache(platform);
  const headerPainter = createHeaderPainter(platform, diffCacheByApi);
  const expiry = createExpiryScheduler({
    scheduleRefresh: refresh.scheduleRefresh,
    scheduleTargetedRefresh: targetedRefresh.scheduleTargetedRefresh,
    evaluate: headerPainter.evaluate,
  });
  const timed = createTimedActivations(platform, {
    triggers,
    diffCacheByApi,
    scheduleRefresh: refresh.scheduleRefresh,
    scheduleTargetedRefresh: targetedRefresh.scheduleTargetedRefresh,
    armNextExpiry: expiry.armNextExpiry,
    evaluate: headerPainter.evaluate,
  });

  // Fire evaluate on every relevant data-side event — and once immediately
  // so profile loads paint without waiting for a first event.
  disposers.push(platform.api.onReady(() => {
    timed.processTimedActivations();
    headerPainter.evaluate();
    refresh.scheduleRefresh();
  }));
  disposers.push(platform.api.on('modelUpdated', () => {
    timed.processTimedActivations();
    headerPainter.evaluate();
  }));
  disposers.push(platform.api.on('filterChanged', headerPainter.evaluate));
  // NOTE: cellValueChanged is wired by timedActivations.attachCellValueChangedListener —
  // don't double-register here; it already runs evaluate() in its own handler.
  disposers.push(platform.api.onReady(() => {
    disposers.push(timed.attachCellValueChangedListener());
  }));

  // Rule-list changes: state subscription. Reconcile the timed-rule
  // state with the new rule set first — without this, a profile
  // switch that drops the previous profile's timed rules leaves
  // stale `rowUntil` / `cellsUntil` entries in the module-scoped map.
  // `getNextTimedExpiry()` keeps returning a non-null timestamp,
  // the coalesced timer fires, re-arms with delay 8ms, and loops
  // forever — visible as repeated `armNextExpiry / expiry refresh
  // fired` traces with the same `firesAt` value.
  disposers.push(platform.subscribe(() => {
    const state = platform.getState();
    const activeTimedRuleIds = new Set<string>();
    for (const r of state.rules) {
      if (r.enabled && normalizeDuration(r.activeDurationMs) != null) {
        activeTimedRuleIds.add(r.id);
      }
    }
    pruneTimedRuleStateByRuleSet(activeTimedRuleIds);
    triggers.rebuild(state.rules);
    expiry.armNextExpiry();
    headerPainter.evaluate();
    refresh.scheduleRefresh();
  }));
  // Seed the triggers cache with whatever rules already exist when
  // we activate — `platform.subscribe` fires on changes only, not on
  // mount, so the initial set would otherwise stay invisible until
  // the user edits a rule.
  triggers.rebuild(platform.getState().rules);

  // Per-step isolated teardown — any single step failing logs and lets
  // the rest run. Without this, an exception in (say) refreshRaf cancel
  // would skip clearing the expiryTimer, leaking a setTimeout that mutates
  // grid state indefinitely after dispose. Per the review's instruction:
  // never rely on disposer ordering for safety.
  const safely = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[conditional-styling] cleanup step failed:', label, err);
    }
  };

  return () => {
    safely('refresh.dispose', refresh.dispose);
    safely('targetedRefresh.dispose', targetedRefresh.dispose);
    safely('expiry.dispose', expiry.dispose);
    safely('timed.dispose', timed.dispose);
    safely('clearTimedRuleState', () => clearTimedRuleState());
    for (const d of disposers) { try { d(); } catch { /* swallow — per-disposer */ } }
    safely('remove header flash classes', () => {
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.ag-header-cell[class*="ds-flash-hdr-"]').forEach((el) => {
          [...el.classList].forEach((c) => { if (c.startsWith('ds-flash-hdr-')) el.classList.remove(c); });
        });
      }
    });
  };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import {
  conditionalStylingModule,
  INITIAL_CONDITIONAL_STYLING,
  _resetConditionalStylingResourcesForTests,
  type ConditionalRule,
  type ConditionalStylingState,
} from './index';
import type { AnyColDef, GridContext, ModuleContext } from '../../core/types';

// ─── Test fixtures ─────────────────────────────────────────────────────────

function makeGridCtx(gridId = 'grid-1'): GridContext {
  return { gridId, gridApi: {} as never, getRowId: () => 'r' };
}

function makeModuleCtx(state: ConditionalStylingState, gridId = 'grid-1'): ModuleContext {
  return {
    gridId,
    eventBus: { emit: () => {}, on: () => () => {} },
    getGridContext: () => null,
    getModuleState: <T>(_id: string) => state as unknown as T,
    setModuleState: () => {},
  };
}

function makeRule(over: Partial<ConditionalRule> = {}): ConditionalRule {
  return {
    id: 'r1',
    name: 'Big bid',
    enabled: true,
    priority: 0,
    scope: { type: 'cell', columns: ['bid'] },
    expression: '[bid] > 100',
    style: { light: { backgroundColor: 'yellow' }, dark: { backgroundColor: 'darkred' } },
    ...over,
  };
}

beforeEach(() => {
  // Drop the previous grid's <style> tag and engine before each test so the
  // module-level Map doesn't leak resources between cases.
  _resetConditionalStylingResourcesForTests();
});

afterEach(() => {
  document.head.querySelectorAll('style[data-gc-module="conditional-styling"]').forEach((el) => el.remove());
});

// ─── Metadata ───────────────────────────────────────────────────────────────

describe('conditional-styling module — metadata', () => {
  it('declares schemaVersion and stable id', () => {
    expect(conditionalStylingModule.id).toBe('conditional-styling');
    expect(conditionalStylingModule.schemaVersion).toBe(1);
    // Runs after column-customization (10) so its classes layer on top.
    expect(conditionalStylingModule.priority).toBeGreaterThan(10);
  });

  it('does not depend on column-templates (out of v2.0 scope)', () => {
    expect(conditionalStylingModule.dependencies ?? []).toEqual([]);
  });
});

// ─── transformColumnDefs ────────────────────────────────────────────────────

describe('conditional-styling module — transformColumnDefs', () => {
  const baseDefs: AnyColDef[] = [
    { field: 'bid' } satisfies ColDef,
    { field: 'ask' } satisfies ColDef,
  ];

  it('returns the same array when no rules are enabled', () => {
    const out = conditionalStylingModule.transformColumnDefs!(baseDefs, INITIAL_CONDITIONAL_STYLING, makeGridCtx());
    expect(out).toBe(baseDefs);
  });

  it('attaches a cellClassRule to the targeted column only', () => {
    const state: ConditionalStylingState = { rules: [makeRule()] };
    const out = conditionalStylingModule.transformColumnDefs!(baseDefs, state, makeGridCtx()) as ColDef[];

    expect(out[0].cellClassRules).toBeDefined();
    expect(Object.keys(out[0].cellClassRules!)).toContain('gc-rule-r1');
    // Untouched column passes through by reference.
    expect(out[1]).toBe(baseDefs[1]);
  });

  it('skips disabled rules', () => {
    const state: ConditionalStylingState = { rules: [makeRule({ enabled: false })] };
    const out = conditionalStylingModule.transformColumnDefs!(baseDefs, state, makeGridCtx());
    expect(out).toBe(baseDefs);
  });

  it('skips row-scoped rules in the column transform', () => {
    const state: ConditionalStylingState = {
      rules: [makeRule({ id: 'r2', scope: { type: 'row' }, expression: '[qty] > 0' })],
    };
    const out = conditionalStylingModule.transformColumnDefs!(baseDefs, state, makeGridCtx());
    expect(out).toBe(baseDefs);
  });

  it('recurses into ColGroupDef.children', () => {
    const grouped: AnyColDef[] = [
      {
        headerName: 'Pricing',
        children: [{ field: 'bid' } satisfies ColDef, { field: 'ask' } satisfies ColDef],
      } satisfies ColGroupDef,
    ];
    const state: ConditionalStylingState = { rules: [makeRule()] };
    const out = conditionalStylingModule.transformColumnDefs!(grouped, state, makeGridCtx());

    const group = out[0] as ColGroupDef;
    const bid = group.children[0] as ColDef;
    expect(bid.cellClassRules).toBeDefined();
    expect(Object.keys(bid.cellClassRules!)).toContain('gc-rule-r1');
    // ask was untouched — same reference.
    expect(group.children[1]).toBe((grouped[0] as ColGroupDef).children[1]);
  });

  it('injects a <style> tag with the rule CSS', () => {
    const state: ConditionalStylingState = { rules: [makeRule()] };
    conditionalStylingModule.transformColumnDefs!(baseDefs, state, makeGridCtx());

    const styleEl = document.head.querySelector('style[data-gc-module="conditional-styling"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl!.textContent).toContain('.gc-rule-r1');
    // Light selector excludes both `.dark` class AND `[data-theme="dark"]`
    // so the rule applies regardless of which theme-signalling convention
    // the host app uses.
    expect(styleEl!.textContent).toContain(
      ':root:not(.dark):not([data-theme="dark"]) .gc-rule-r1',
    );
    // Dark selector matches both conventions.
    expect(styleEl!.textContent).toContain('.dark .gc-rule-r1');
    expect(styleEl!.textContent).toContain('[data-theme="dark"] .gc-rule-r1');
    expect(styleEl!.textContent).toContain('background-color: yellow');
    expect(styleEl!.textContent).toContain('background-color: darkred');
  });

  it('removes CSS for disabled rules on re-run (state diff)', () => {
    const enabled: ConditionalStylingState = { rules: [makeRule()] };
    const disabled: ConditionalStylingState = { rules: [makeRule({ enabled: false })] };
    conditionalStylingModule.transformColumnDefs!(baseDefs, enabled, makeGridCtx());
    conditionalStylingModule.transformColumnDefs!(baseDefs, disabled, makeGridCtx());

    const styleEl = document.head.querySelector('style[data-gc-module="conditional-styling"]')!;
    // Re-run with disabled rule should clear the CSS.
    expect(styleEl.textContent).not.toContain('.gc-rule-r1');
  });

  it('isolates per-grid resources (different gridIds → different <style> tags)', () => {
    const state: ConditionalStylingState = { rules: [makeRule()] };
    conditionalStylingModule.transformColumnDefs!(baseDefs, state, makeGridCtx('a'));
    conditionalStylingModule.transformColumnDefs!(baseDefs, state, makeGridCtx('b'));

    const tags = document.head.querySelectorAll('style[data-gc-module="conditional-styling"]');
    expect(tags.length).toBe(2);
    const ids = Array.from(tags).map((t) => t.getAttribute('data-gc-grid')).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});

// ─── transformGridOptions (row rules) ──────────────────────────────────────

describe('conditional-styling module — transformGridOptions', () => {
  it('passes opts through when no row rules are enabled', () => {
    const opts = { rowHeight: 30 };
    const out = conditionalStylingModule.transformGridOptions!(opts, INITIAL_CONDITIONAL_STYLING, makeGridCtx());
    expect(out).toBe(opts);
  });

  it('builds a rowClassRules predicate per enabled row rule', () => {
    const state: ConditionalStylingState = {
      rules: [makeRule({ id: 'rr', scope: { type: 'row' }, expression: '[qty] > 0' })],
    };
    const out = conditionalStylingModule.transformGridOptions!({}, state, makeGridCtx());
    expect(out.rowClassRules).toBeDefined();
    expect(Object.keys(out.rowClassRules!)).toContain('gc-rule-rr');
    expect(typeof (out.rowClassRules as Record<string, unknown>)['gc-rule-rr']).toBe('function');
  });

  it('predicate returns false (not a thrown error) on a broken expression', () => {
    const state: ConditionalStylingState = {
      rules: [makeRule({ id: 'broken', scope: { type: 'row' }, expression: 'not-a-real-expr (((' })],
    };
    const out = conditionalStylingModule.transformGridOptions!({}, state, makeGridCtx());
    const fn = (out.rowClassRules as Record<string, (p: unknown) => boolean>)['gc-rule-broken'];
    expect(fn({ data: {} } as never)).toBe(false);
  });
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('conditional-styling module — lifecycle', () => {
  it('onRegister injects CSS for rules already in state (e.g. from a profile load)', () => {
    const state: ConditionalStylingState = { rules: [makeRule({ id: 'preload' })] };
    conditionalStylingModule.onRegister!(makeModuleCtx(state));

    const styleEl = document.head.querySelector('style[data-gc-module="conditional-styling"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl!.textContent).toContain('.gc-rule-preload');
  });

  it('onGridDestroy removes the per-grid <style> tag', () => {
    const state: ConditionalStylingState = { rules: [makeRule()] };
    conditionalStylingModule.onRegister!(makeModuleCtx(state, 'doomed'));
    expect(document.head.querySelector('style[data-gc-grid="doomed"]')).not.toBeNull();

    conditionalStylingModule.onGridDestroy!(makeGridCtx('doomed'));
    expect(document.head.querySelector('style[data-gc-grid="doomed"]')).toBeNull();
  });
});

// ─── serialize / deserialize ────────────────────────────────────────────────

describe('conditional-styling module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: ConditionalStylingState = { rules: [makeRule()] };
    expect(conditionalStylingModule.deserialize(conditionalStylingModule.serialize(state))).toEqual(state);
  });

  it('coerces non-array `rules` to []', () => {
    expect(conditionalStylingModule.deserialize({ rules: 'oops' })).toEqual({ rules: [] });
  });

  it('tolerates null / undefined / non-object payloads', () => {
    expect(conditionalStylingModule.deserialize(null)).toEqual(INITIAL_CONDITIONAL_STYLING);
    expect(conditionalStylingModule.deserialize(undefined)).toEqual(INITIAL_CONDITIONAL_STYLING);
    expect(conditionalStylingModule.deserialize('garbage')).toEqual(INITIAL_CONDITIONAL_STYLING);
  });
});

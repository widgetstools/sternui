import { describe, expect, it, vi } from 'vitest';
import type { SSRMColDef } from './ssrmgrid-entry.js';
import {
  applyPerspectivePlansToColDefs,
  filterMaterializePlans,
  materializeCalcFields,
  planSsrmCalcColumn,
  planSsrmCalcColumns,
  ssrmEngineCalcColumnDefs,
} from './ssrmCalcColumns.js';

describe('ssrmCalcColumns', () => {
  describe('planSsrmCalcColumn', () => {
    it('plans perspective compile for arithmetic', () => {
      const plan = planSsrmCalcColumn({
        colId: 'grossPnl',
        expression: '[price] * [quantity]',
      });
      expect(plan).toEqual({
        kind: 'perspective',
        colId: 'grossPnl',
        perspectiveExpression: '"price" * "quantity"',
        perspectiveType: 'float',
      });
    });

    it('plans perspective compile for IFS traffic-light leaf', () => {
      const plan = planSsrmCalcColumn({
        colId: 'trafficlight',
        expression: 'IFS([price] >= 105, 1, [price] >= 95, 2, 3)',
      });
      expect(plan.kind).toBe('perspective');
      if (plan.kind === 'perspective') {
        expect(plan.perspectiveExpression).toContain('"price"');
        // The compiler emits `if(cond, a, b)`, not a `?:` ternary. VERIFIED
        // against 4.5.2 (`scripts/calcColumnProbe.mjs`): both forms compile and
        // both yield [1,2,3] on the same book, so asserting the ternary was
        // pinning one valid spelling rather than the behaviour.
        expect(plan.perspectiveExpression).toContain('if(');
      }
    });

    it('plans materialize for viewport-only .old/.new refs', () => {
      const plan = planSsrmCalcColumn({
        colId: 'pnlDelta',
        expression: '[pnl.new] - [pnl.old]',
      });
      expect(plan).toEqual({
        kind: 'materialize',
        colId: 'pnlDelta',
        expression: '[pnl.new] - [pnl.old]',
      });
    });

    it('marks dataset aggregates as unsupported', () => {
      const plan = planSsrmCalcColumn({
        colId: 'share',
        expression: '[pnl] / SUM([pnl])',
      });
      expect(plan.kind).toBe('unsupported');
      if (plan.kind === 'unsupported') {
        expect(plan.reason).toMatch(/SUM|unsupported|function/i);
      }
    });
  });

  /**
   * The `ssrm-engine` backend: `@starui/ssrm-engine` evaluates the AST where
   * the book is, so the plan carries the tree and nothing else.
   */
  describe('planSsrmCalcColumn — backend: ssrm-engine', () => {
    it('hands over the parsed AST rather than a string', () => {
      const plan = planSsrmCalcColumn(
        { colId: 'grossPnl', expression: '[price] * [quantity]' },
        { backend: 'ssrm-engine' },
      );
      expect(plan.kind).toBe('ssrm-engine');
      // Plain data, because the AST is the only thing that crosses the
      // SharedWorker port — a compiled closure is not structured-cloneable.
      expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
      expect(plan.kind === 'ssrm-engine' && plan.ast.type).toBe('binary');
    });

    it('takes an expression the PERSPECTIVE backend cannot compile', () => {
      // A ternary is not Perspective-compilable and is not in the materialize
      // set either, so this same expression is `unsupported` on the default
      // backend. Losing that is the point of adding this one.
      const expression = '[price] > 100 ? "rich" : "cheap"';
      expect(planSsrmCalcColumn({ colId: 'band', expression }).kind).toBe('unsupported');
      expect(
        planSsrmCalcColumn({ colId: 'band', expression }, { backend: 'ssrm-engine' }).kind,
      ).toBe('ssrm-engine');
    });

    it('reports a PARSE failure as unsupported, with the parser message', () => {
      const plan = planSsrmCalcColumn(
        { colId: 'broken', expression: '[price] * * 2' },
        { backend: 'ssrm-engine' },
      );
      expect(plan.kind).toBe('unsupported');
      expect(plan.kind === 'unsupported' && plan.reason.length).toBeGreaterThan(0);
    });

    it('does NOT re-implement the engine refusal list', () => {
      // `SUM([col])` is a cross-row aggregate the engine refuses BY NAME and
      // records in `calcDiagnostics()`. The planner deliberately does not
      // duplicate that list — a second copy is a second thing to keep in step,
      // and this repo already has two calculated-column error conventions that
      // differ. It parses, so it is planned; the engine has the last word.
      expect(
        planSsrmCalcColumn({ colId: 'total', expression: 'SUM([price])' }, { backend: 'ssrm-engine' })
          .kind,
      ).toBe('ssrm-engine');
    });

    it('collects the defs the engine is handed', () => {
      const plans = planSsrmCalcColumns(
        [
          { colId: 'a', expression: '[price] * 2' },
          { colId: 'bad', expression: '[price] * * 2' },
        ],
        { backend: 'ssrm-engine' },
      );
      const defs = ssrmEngineCalcColumnDefs(plans);
      expect(defs.map((d) => d.colId)).toEqual(['a']);
      expect(defs[0].ast).toBeDefined();
    });

    it('binds the FIELD and drops the valueGetter, which is what the twin reads', () => {
      // `buildVirtualColDef`'s own getter falls back to `data[colId]` on a
      // group row with the comment "SSRM stamps the folded agg onto
      // data[field]". The engine stamps there, so binding the field lands the
      // value where that code looks.
      const defs: SSRMColDef[] = [{ colId: 'a', valueGetter: () => 1 }];
      const out = applyPerspectivePlansToColDefs(defs, [
        { kind: 'ssrm-engine', colId: 'a', expression: '[price] * 2', ast: { type: 'literal', value: 1 } as never },
      ]);
      expect(out[0].valueGetter).toBeUndefined();
      expect(out[0].field).toBe('a');
    });
  });

  describe('applyPerspectivePlansToColDefs', () => {
    it('sets perspectiveExpression and strips valueGetter', () => {
      const defs: SSRMColDef[] = [
        {
          colId: 'grossPnl',
          valueGetter: () => 0,
        },
      ];
      const out = applyPerspectivePlansToColDefs(defs, [
        {
          kind: 'perspective',
          colId: 'grossPnl',
          perspectiveExpression: '"price" * "quantity"',
          perspectiveType: 'float',
        },
      ]);
      expect(out[0]?.field).toBe('grossPnl');
      expect(out[0]?.perspectiveExpression).toBe('"price" * "quantity"');
      expect(out[0]?.perspectiveType).toBe('float');
      expect(out[0]?.valueGetter).toBeUndefined();
    });

    it('strips valueGetter for materialize plans and sets field', () => {
      const defs: SSRMColDef[] = [
        {
          colId: 'pnlDelta',
          valueGetter: () => 0,
        },
      ];
      const out = applyPerspectivePlansToColDefs(defs, [
        {
          kind: 'materialize',
          colId: 'pnlDelta',
          expression: '[pnl.new] - [pnl.old]',
        },
      ]);
      expect(out[0]?.field).toBe('pnlDelta');
      expect(out[0]?.perspectiveExpression).toBeUndefined();
      expect(out[0]?.valueGetter).toBeUndefined();
    });
  });

  describe('materializeCalcFields', () => {
    it('enriches rows with evaluated materialize fields', () => {
      const evalRow = vi.fn((expression: string, row: Record<string, unknown>) => {
        if (expression === '[a] + [b]') {
          return Number(row.a) + Number(row.b);
        }
        return null;
      });
      const rows = [{ id: '1', a: 10, b: 5 }];
      const out = materializeCalcFields(
        rows,
        [{ kind: 'materialize', colId: 'sum', expression: '[a] + [b]' }],
        evalRow,
      );
      expect(evalRow).toHaveBeenCalledWith('[a] + [b]', rows[0]);
      expect(out[0]).toEqual({ id: '1', a: 10, b: 5, sum: 15 });
      expect(out[0]).not.toBe(rows[0]);
    });

    it('returns same array reference when no materialize plans', () => {
      const rows = [{ id: '1' }];
      expect(materializeCalcFields(rows, [], vi.fn())).toBe(rows);
    });
  });

  describe('planSsrmCalcColumns + filterMaterializePlans', () => {
    it('collects materialize plans only', () => {
      const plans = planSsrmCalcColumns([
        { colId: 'a', expression: '[x] + 1' },
        { colId: 'b', expression: '[pnl.old] - [pnl.new]' },
        { colId: 'c', expression: 'SUM([x])' },
      ]);
      const materialize = filterMaterializePlans(plans);
      expect(materialize).toHaveLength(1);
      expect(materialize[0]?.colId).toBe('b');
    });
  });
});

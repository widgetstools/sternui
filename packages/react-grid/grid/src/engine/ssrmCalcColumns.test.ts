import { describe, expect, it, vi } from 'vitest';
import type { SSRMColDef } from './ssrmgrid-entry.js';
import {
  applyPerspectivePlansToColDefs,
  filterMaterializePlans,
  materializeCalcFields,
  planSsrmCalcColumn,
  planSsrmCalcColumns,
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
        // IFS lowers to nested Perspective if() calls (ternary output was
        // dropped by the compiler).
        expect(plan.perspectiveExpression).toContain('"price"');
        expect(plan.perspectiveExpression).toMatch(/^if\(/);
        expect(plan.perspectiveExpression).toContain('if("price" >= 95');
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

import { describe, expect, it } from 'vitest';
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import {
  columnCustomizationModule,
  INITIAL_COLUMN_CUSTOMIZATION,
  type ColumnCustomizationState,
} from './index';
import type { AnyColDef } from '../../core/types';

describe('column-customization module — metadata', () => {
  it('declares schemaVersion and stable id', () => {
    expect(columnCustomizationModule.id).toBe('column-customization');
    expect(columnCustomizationModule.schemaVersion).toBe(2);
    // After general-settings (priority 0) so per-column overrides win.
    expect(columnCustomizationModule.priority).toBeGreaterThan(0);
  });

  it('declares no module dependencies in v2.0 (templates module is out of scope)', () => {
    expect(columnCustomizationModule.dependencies ?? []).toEqual([]);
  });
});

describe('column-customization module — transformColumnDefs', () => {
  const ctx = {} as never;

  const baseDefs: AnyColDef[] = [
    { field: 'symbol' } satisfies ColDef,
    { field: 'price', headerName: 'Price' } satisfies ColDef,
  ];

  it('returns the same array reference when no assignments exist', () => {
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, INITIAL_COLUMN_CUSTOMIZATION, ctx);
    // Identity short-circuit lets AG-Grid skip a recompute when nothing changed.
    expect(out).toBe(baseDefs);
  });

  it('applies inline overrides to the matching column only', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: { colId: 'symbol', headerName: 'Ticker', initialWidth: 120 },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].headerName).toBe('Ticker');
    expect(out[0].initialWidth).toBe(120);
    // Untouched column passes through by reference.
    expect(out[1]).toBe(baseDefs[1]);
  });

  it('translates filterable → ColDef.filter (AG-Grid uses `filter`, not `filterable`)', () => {
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', filterable: false, sortable: true, resizable: false } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].filter).toBe(false);
    expect(out[0].sortable).toBe(true);
    expect(out[0].resizable).toBe(false);
  });

  it('handles initialPinned values "left" / "right" / true / false', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: { colId: 'symbol', initialPinned: 'left' },
        price: { colId: 'price', initialPinned: false },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].initialPinned).toBe('left');
    expect(out[1].initialPinned).toBe(false);
  });

  it('uses colId in preference to field when both are present', () => {
    const defs: AnyColDef[] = [{ field: 'p', colId: 'priceCol' } satisfies ColDef];
    const state: ColumnCustomizationState = {
      assignments: { priceCol: { colId: 'priceCol', headerName: 'Last Price' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(defs, state, ctx) as ColDef[];
    expect(out[0].headerName).toBe('Last Price');
  });

  it('skips assignments whose key matches no column (silent ignore)', () => {
    const state: ColumnCustomizationState = {
      assignments: { ghost: { colId: 'ghost', headerName: 'Nope' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx);
    expect(out).toEqual(baseDefs);
  });

  it('recurses into ColGroupDef.children and only rebuilds groups whose children changed', () => {
    const groupedDefs: AnyColDef[] = [
      {
        headerName: 'Pricing',
        children: [
          { field: 'bid' } satisfies ColDef,
          { field: 'ask' } satisfies ColDef,
        ],
      } satisfies ColGroupDef,
      { field: 'qty' } satisfies ColDef,
    ];
    const state: ColumnCustomizationState = {
      assignments: { bid: { colId: 'bid', headerName: 'Bid Px' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(groupedDefs, state, ctx);

    const group = out[0] as ColGroupDef;
    expect(group.children[0]).not.toBe((groupedDefs[0] as ColGroupDef).children[0]);
    expect((group.children[0] as ColDef).headerName).toBe('Bid Px');
    // ask was untouched — same reference.
    expect(group.children[1]).toBe((groupedDefs[0] as ColGroupDef).children[1]);
    // Outer non-group passes through.
    expect(out[1]).toBe(groupedDefs[1]);
  });

  it('does not rebuild a group whose children all unchanged', () => {
    const groupedDefs: AnyColDef[] = [
      {
        headerName: 'Pricing',
        children: [{ field: 'bid' } satisfies ColDef],
      } satisfies ColGroupDef,
    ];
    const state: ColumnCustomizationState = {
      assignments: { unrelated: { colId: 'unrelated', headerName: 'X' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(groupedDefs, state, ctx);
    expect(out[0]).toBe(groupedDefs[0]);
  });

  it('emits colDef.cellStyle when cellStyleOverrides is set', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          cellStyleOverrides: {
            typography: { bold: true },
            colors: { background: '#161a1e' },
          },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ fontWeight: 'bold', backgroundColor: '#161a1e' });
    // Untouched column has no cellStyle assigned.
    expect(out[1].cellStyle).toBeUndefined();
  });

  it('does NOT touch colDef.cellStyle when cellStyleOverrides is absent', () => {
    const defsWithExistingStyle: AnyColDef[] = [
      { field: 'symbol', cellStyle: { color: 'red' } } satisfies ColDef,
    ];
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', headerName: 'Ticker' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(defsWithExistingStyle, state, ctx) as ColDef[];
    // The transformer left the upstream cellStyle in place — multi-module
    // composition contract.
    expect(out[0].cellStyle).toEqual({ color: 'red' });
    expect(out[0].headerName).toBe('Ticker');
  });
});

describe('column-customization module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: { colId: 'symbol', headerName: 'X', initialWidth: 100 },
      },
    };
    expect(columnCustomizationModule.deserialize(columnCustomizationModule.serialize(state))).toEqual(state);
  });

  it('migrates v1 `overrides` shape into `assignments`, dropping out-of-scope fields', () => {
    const v1 = {
      overrides: {
        symbol: {
          headerName: 'Ticker',
          initialWidth: 120,
          // v1-only fields that v2.0 doesn't carry — must be dropped silently.
          headerStyle: { backgroundColor: 'red' },
          cellStyle: { color: 'blue' },
          cellEditorName: 'agSelectCellEditor',
          cellEditorParams: { values: ['A'] },
          cellRendererName: 'sideRenderer',
        },
      },
    };
    const out = columnCustomizationModule.deserialize(v1) as ColumnCustomizationState;
    expect(out).toEqual({
      assignments: {
        symbol: {
          colId: 'symbol',
          headerName: 'Ticker',
          initialWidth: 120,
          headerTooltip: undefined,
          initialHide: undefined,
          initialPinned: undefined,
          sortable: undefined,
          filterable: undefined,
          resizable: undefined,
        },
      },
    });
  });

  it('drops the legacy `templates` field that v1.x stored inside this module', () => {
    const v1x = {
      assignments: { s: { colId: 's', headerName: 'X' } },
      templates: { built: { id: 'built', cellStyle: {} } },
    };
    const out = columnCustomizationModule.deserialize(v1x) as ColumnCustomizationState & { templates?: unknown };
    expect(out.templates).toBeUndefined();
    expect(out.assignments.s.headerName).toBe('X');
  });

  it('tolerates null / non-object payloads', () => {
    expect(columnCustomizationModule.deserialize(null)).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(columnCustomizationModule.deserialize(undefined)).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(columnCustomizationModule.deserialize('garbage')).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
  });
});

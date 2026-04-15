import { describe, expect, it } from 'vitest';
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import {
  columnCustomizationModule,
  INITIAL_COLUMN_CUSTOMIZATION,
  type ColumnCustomizationState,
} from './index';
import type { AnyColDef, GridContext } from '../../core/types';
import type { ColumnTemplatesState } from '../column-templates';

// Build a stub GridContext for transform tests, with `getModuleState` wired
// to return a column-templates state of the caller's choosing.
function makeCtx(templates: Partial<ColumnTemplatesState> = {}): GridContext {
  const tplState: ColumnTemplatesState = {
    templates: templates.templates ?? {},
    typeDefaults: templates.typeDefaults ?? {},
  };
  return {
    gridId: 'test',
    gridApi: {} as never,
    getRowId: () => '0',
    getModuleState: <T,>(id: string) => {
      if (id === 'column-templates') return tplState as T;
      throw new Error(`makeCtx: no stub for module "${id}"`);
    },
  };
}

describe('column-customization module — metadata', () => {
  it('declares schemaVersion and stable id', () => {
    expect(columnCustomizationModule.id).toBe('column-customization');
    expect(columnCustomizationModule.schemaVersion).toBe(3);
    // After general-settings (priority 0) so per-column overrides win.
    expect(columnCustomizationModule.priority).toBeGreaterThan(0);
  });

  it('declares column-templates as a dependency (enforced at registration)', () => {
    expect(columnCustomizationModule.dependencies).toEqual(['column-templates']);
  });
});

describe('column-customization module — transformColumnDefs', () => {
  const ctx = makeCtx();

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

  it('emits colDef.headerStyle when headerStyleOverrides is set', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          headerStyleOverrides: {
            typography: { bold: true, fontSize: 13 },
            alignment: { horizontal: 'center' },
          },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].headerStyle).toEqual({
      fontWeight: 'bold',
      fontSize: '13px',
      textAlign: 'center',
    });
  });

  it('cellStyleOverrides + headerStyleOverrides on same column emit both', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          cellStyleOverrides: { colors: { background: '#000' } },
          headerStyleOverrides: { colors: { background: '#fff' } },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ backgroundColor: '#000' });
    expect(out[0].headerStyle).toEqual({ backgroundColor: '#fff' });
  });

  it('emits colDef.valueFormatter from a preset template', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: { kind: 'preset', preset: 'currency' },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(typeof out[1].valueFormatter).toBe('function');
    const fmt = out[1].valueFormatter as (params: { value: unknown }) => string;
    expect(fmt({ value: 1234.5 })).toBe('$1,234.50');
  });

  it('emits colDef.valueFormatter from an expression template', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: { kind: 'expression', expression: "x + ' USD'" },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    const fmt = out[1].valueFormatter as (params: { value: unknown }) => string;
    expect(fmt({ value: 100 })).toBe('100 USD');
  });

  it('does NOT touch colDef.valueFormatter when template is absent', () => {
    const defsWithFormatter: AnyColDef[] = [
      { field: 'price', valueFormatter: 'value + " original"' } satisfies ColDef,
    ];
    const state: ColumnCustomizationState = {
      assignments: { price: { colId: 'price', headerName: 'Price' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(defsWithFormatter, state, ctx) as ColDef[];
    expect(out[0].valueFormatter).toBe('value + " original"');
  });

  it('emits colDef.cellEditor when cellEditorName is set on the assignment', () => {
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', cellEditorName: 'agSelectCellEditor' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellEditor).toBe('agSelectCellEditor');
  });

  it('emits colDef.cellEditorParams when cellEditorParams is set on the assignment', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          cellEditorName: 'agSelectCellEditor',
          cellEditorParams: { values: ['A', 'B'] },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellEditorParams).toEqual({ values: ['A', 'B'] });
  });

  it('emits colDef.cellRenderer when cellRendererName is set on the assignment', () => {
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', cellRendererName: 'sideRenderer' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellRenderer).toBe('sideRenderer');
  });

  it('reads column-templates state via ctx.getModuleState (templateIds emit fields from referenced template)', () => {
    const localCtx = makeCtx({
      templates: {
        bold: {
          id: 'bold',
          name: 'Bold',
          cellStyleOverrides: { typography: { bold: true } },
          createdAt: 0,
          updatedAt: 0,
        },
      },
    });
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', templateIds: ['bold'] } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ fontWeight: 'bold' });
  });

  it('assignment fields beat template fields (per-field for styling, last-writer for the rest)', () => {
    const localCtx = makeCtx({
      templates: {
        tpl: {
          id: 'tpl',
          name: 'tpl',
          sortable: true,
          cellStyleOverrides: { typography: { bold: true, fontSize: 14 } },
          createdAt: 0,
          updatedAt: 0,
        },
      },
    });
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          templateIds: ['tpl'],
          sortable: false,
          cellStyleOverrides: { typography: { bold: false } },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
    expect(out[0].sortable).toBe(false);
    // `cellStyleToAgStyle` only emits fontWeight when bold is truthy — assignment's
    // bold:false suppresses the template's fontWeight, leaving only fontSize.
    expect(out[0].cellStyle).toEqual({ fontSize: '14px' });
  });

  it('typeDefault for the column\'s cellDataType applies when the assignment has no templateIds', () => {
    const defsWithType: AnyColDef[] = [
      { field: 'price', cellDataType: 'numeric' } satisfies ColDef,
    ];
    const localCtx = makeCtx({
      templates: {
        num: {
          id: 'num',
          name: 'num',
          cellStyleOverrides: { alignment: { horizontal: 'right' } },
          createdAt: 0,
          updatedAt: 0,
        },
      },
      typeDefaults: { numeric: 'num' },
    });
    // Empty assignment subscribes the column to the typeDefault.
    const state: ColumnCustomizationState = {
      assignments: { price: { colId: 'price' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(defsWithType, state, localCtx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ textAlign: 'right' });
  });

  it('typeDefault is a no-op when colDef.cellDataType is undefined (resolver requires the data-type field)', () => {
    // `baseDefs` columns have no cellDataType set.
    const localCtx = makeCtx({
      templates: {
        num: {
          id: 'num',
          name: 'num',
          cellStyleOverrides: { alignment: { horizontal: 'right' } },
          createdAt: 0,
          updatedAt: 0,
        },
      },
      typeDefaults: { numeric: 'num' },
    });
    const state: ColumnCustomizationState = {
      assignments: { price: { colId: 'price' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
    expect(out[1].cellStyle).toBeUndefined();
  });

  it('templates compose with explicit assignment cellEditor — assignment wins last', () => {
    const localCtx = makeCtx({
      templates: {
        tpl: {
          id: 'tpl',
          name: 'tpl',
          cellEditorName: 'agSelectCellEditor',
          cellEditorParams: { values: ['A', 'B'] },
          createdAt: 0,
          updatedAt: 0,
        },
      },
    });
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          templateIds: ['tpl'],
          cellEditorParams: { values: ['X'] },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
    expect(out[0].cellEditor).toBe('agSelectCellEditor');         // from template
    expect(out[0].cellEditorParams).toEqual({ values: ['X'] });    // assignment wholesale-replaces
  });

  it('identity short-circuit still fires when assignments map is empty (no templates state read)', () => {
    // Build a context whose getModuleState THROWS so we know the walker never read it.
    const throwCtx: GridContext = {
      gridId: 'test',
      gridApi: {} as never,
      getRowId: () => '0',
      getModuleState: () => {
        throw new Error('should not have been called');
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, INITIAL_COLUMN_CUSTOMIZATION, throwCtx);
    expect(out).toBe(baseDefs);
  });

  it('unknown template ids in templateIds are silently skipped (template was deleted but assignment still references it)', () => {
    const localCtx = makeCtx({
      templates: {
        ok: { id: 'ok', name: 'ok', sortable: true, createdAt: 0, updatedAt: 0 },
      },
    });
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', templateIds: ['ghost', 'ok'] } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
    expect(out[0].sortable).toBe(true);
  });

  it('two templateIds compose styling per-field on emitted cellStyle', () => {
    const localCtx = makeCtx({
      templates: {
        a: {
          id: 'a',
          name: 'a',
          cellStyleOverrides: { typography: { bold: true }, colors: { background: '#000' } },
          createdAt: 0,
          updatedAt: 0,
        },
        b: {
          id: 'b',
          name: 'b',
          cellStyleOverrides: { colors: { text: '#fff' } },
          createdAt: 0,
          updatedAt: 0,
        },
      },
    });
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', templateIds: ['a', 'b'] } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ fontWeight: 'bold', backgroundColor: '#000', color: '#fff' });
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

describe('column-customization module — dependency enforcement', () => {
  it('topoSortModules throws when column-templates is missing from the module list', async () => {
    const { topoSortModules } = await import('../../core/topoSort');
    expect(() => topoSortModules([columnCustomizationModule])).toThrow(
      /column-templates/,
    );
  });

  it('topoSortModules orders column-templates BEFORE column-customization', async () => {
    const { topoSortModules } = await import('../../core/topoSort');
    const { columnTemplatesModule } = await import('../column-templates');
    // Pass them in the "wrong" order to make sure topo-sort actually reorders.
    const sorted = topoSortModules([columnCustomizationModule, columnTemplatesModule]);
    const ids = sorted.map((m) => m.id);
    expect(ids.indexOf('column-templates')).toBeLessThan(ids.indexOf('column-customization'));
  });
});

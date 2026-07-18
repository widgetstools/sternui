import { describe, expect, it, vi } from 'vitest';
import type { TransformContext } from '@wellsfargo-starui/engine';
import { generalSettingsModule } from './index';
import { INITIAL_GENERAL_SETTINGS } from './state';
import {
  buildCellChangeFlashCss,
  CELL_CHANGE_FLASH_CSS_HANDLE,
  CELL_CHANGE_FLASH_CSS_RULE_ID,
} from './cellChangeFlashCss';

describe('generalSettingsModule.transformColumnDefs', () => {
  const baseDefs = [
    { field: 'cusip', headerName: 'CUSIP' },
    { field: 'midPrice', headerName: 'Mid' },
  ];

  it('sets enableCellChangeFlash on every column from module state', () => {
    const off = generalSettingsModule.transformColumnDefs!(
      baseDefs,
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: false },
      {} as never,
    );
    expect(off.every((d) => d.enableCellChangeFlash === false)).toBe(true);

    const on = generalSettingsModule.transformColumnDefs!(
      baseDefs,
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: true },
      {} as never,
    );
    expect(on.every((d) => d.enableCellChangeFlash === true)).toBe(true);
  });

  it('includes enableCellChangeFlash in defaultColDef from transformGridOptions', () => {
    const ctx = makeCtx();
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: true },
      ctx,
    );
    expect(opts.defaultColDef?.enableCellChangeFlash).toBe(true);
  });
});

describe('generalSettingsModule.transformGridOptions rowSelection', () => {
  const ctx = makeCtx();

  it('omits rowSelection when mode is off', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, rowSelection: undefined },
      ctx,
    );
    expect(opts.rowSelection).toBeUndefined();
    expect(opts.selectionColumnDef).toBeUndefined();
  });

  it('enables checkboxes and selectionColumnDef when checkbox selection is on', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'multiRow',
        checkboxSelection: true,
      },
      ctx,
    );
    expect(opts.rowSelection).toEqual({
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
    });
    expect(opts.selectionColumnDef).toEqual({
      suppressMovable: false,
      lockPosition: false,
      pinned: 'left',
    });
  });

  it('removes row and header checkboxes when checkbox selection is off', () => {
    const multi = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'multiRow',
        checkboxSelection: false,
      },
      ctx,
    );
    expect(multi.rowSelection).toEqual({
      mode: 'multiRow',
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: true,
    });
    expect(multi.selectionColumnDef).toBeUndefined();

    const single = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'singleRow',
        checkboxSelection: false,
      },
      ctx,
    );
    expect(single.rowSelection).toEqual({
      mode: 'singleRow',
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: true,
    });
  });
});

describe('generalSettingsModule cell change flash CSS', () => {
  it('injects scoped flash colour CSS when flash-on-change is enabled', () => {
    const addRule = vi.fn();
    const removeRule = vi.fn();
    const ctx = makeCtx({ addRule, removeRule });

    generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        enableCellChangeFlash: true,
        cellChangeFlashColor: 'rose',
      },
      ctx,
    );

    expect(addRule).toHaveBeenCalledWith(
      CELL_CHANGE_FLASH_CSS_RULE_ID,
      buildCellChangeFlashCss('test-grid', 'rose'),
    );
    expect(removeRule).not.toHaveBeenCalled();
  });

  it('removes flash colour CSS when flash-on-change is disabled', () => {
    const addRule = vi.fn();
    const removeRule = vi.fn();
    const ctx = makeCtx({ addRule, removeRule });

    generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: false },
      ctx,
    );

    expect(removeRule).toHaveBeenCalledWith(CELL_CHANGE_FLASH_CSS_RULE_ID);
    expect(addRule).not.toHaveBeenCalled();
  });
});

function makeCtx(
  css: Partial<{ addRule: ReturnType<typeof vi.fn>; removeRule: ReturnType<typeof vi.fn> }> = {},
): TransformContext {
  return {
    gridId: 'test-grid',
    getRowId: () => '',
    getModuleState: () => undefined,
    api: null,
    resources: {
      css: () => ({
        addRule: css.addRule ?? vi.fn(),
        removeRule: css.removeRule ?? vi.fn(),
        clear: vi.fn(),
      }),
    },
  } as TransformContext;
}

function makeCtxWithCssTracking(): {
  ctx: TransformContext;
  addRule: ReturnType<typeof vi.fn>;
  removeRule: ReturnType<typeof vi.fn>;
} {
  const addRule = vi.fn();
  const removeRule = vi.fn();
  return {
    ctx: makeCtx({ addRule, removeRule }),
    addRule,
    removeRule,
  };
}

// Ensure css handle key stays stable for ResourceScope lookups.
describe('CELL_CHANGE_FLASH_CSS_HANDLE', () => {
  it('matches the injector module id used in transformGridOptions', () => {
    const { ctx, addRule } = makeCtxWithCssTracking();
    const cssSpy = vi.spyOn(ctx.resources, 'css');
    generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: true },
      ctx,
    );
    expect(cssSpy).toHaveBeenCalledWith(CELL_CHANGE_FLASH_CSS_HANDLE);
    expect(addRule).toHaveBeenCalled();
  });
});

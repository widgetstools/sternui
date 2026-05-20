import { describe, expect, it } from 'vitest';
import { generalSettingsModule } from './index';
import { INITIAL_GENERAL_SETTINGS } from './state';

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
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: true },
    );
    expect(opts.defaultColDef?.enableCellChangeFlash).toBe(true);
  });
});

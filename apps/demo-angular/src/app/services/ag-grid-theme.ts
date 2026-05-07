import { themeQuartz } from 'ag-grid-community';
import { agGridLightParams, agGridDarkParams } from '@design-system/adapters/agGrid';

export const fiGridTheme = themeQuartz
  .withParams(agGridLightParams as any, 'light')
  .withParams(agGridDarkParams as any, 'dark');

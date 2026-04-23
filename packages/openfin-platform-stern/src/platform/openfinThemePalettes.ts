import type { CustomPaletteSet } from '@openfin/workspace-platform';

export const THEME_PALETTES: Record<string, CustomPaletteSet> = {
  light: {
    brandPrimary: '#0A76D3',
    brandSecondary: '#1E1F23',
    backgroundPrimary: '#FAFBFE',
    background1: '#FFFFFF',
    background2: '#FAFBFE',
    background3: '#F3F5F8',
    background4: '#ECEEF1',
    background5: '#DDDFE4',
    background6: '#C9CBD2',
    statusSuccess: '#35C759',
    statusWarning: '#F48F00',
    statusCritical: '#BE1D1F',
    statusActive: '#0498FB',
  },
  dark: {
    brandPrimary: '#0A76D3',
    brandSecondary: '#383A40',
    backgroundPrimary: '#1E1F23',
    background1: '#111214',
    background2: '#1E1F23',
    background3: '#24262B',
    background4: '#2F3136',
    background5: '#383A40',
    background6: '#53565F',
    statusSuccess: '#35C759',
    statusWarning: '#F48F00',
    statusCritical: '#BE1D1F',
    statusActive: '#0498FB',
  },
};

export const DEFAULT_THEME_MODE = 'light';
export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = typeof THEME_MODES[number];

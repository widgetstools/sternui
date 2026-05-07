/**
 * Custom types for the Stern Trading Platform OpenFin integration.
 */

export interface SternPlatformSettings {
  theme: 'light' | 'dark';
  locale: string;
  features: {
    home: boolean;
    dock: boolean;
    store: boolean;
    notifications: boolean;
  };
}

export interface BlotterWindowOptions {
  name: string;
  url: string;
  bounds: { x: number; y: number; width: number; height: number };
  configurationId: string;
  processAffinity?: string;
}

export interface DialogWindowOptions {
  name: string;
  url: string;
  bounds?: { x: number; y: number; width: number; height: number };
  width?: number;
  height?: number;
  modal?: boolean;
  alwaysOnTop?: boolean;
  showTaskbarIcon?: boolean;
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  parentWindow?: any;
}

export interface FDC3ContextData {
  type: string;
  id?: { [key: string]: string };
  name?: string;
  [key: string]: any;
}

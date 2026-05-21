// ─────────────────────────────────────────────────────────────
//  Stockflux palette packs — shared shapes (reference: staruidesign1)
// ─────────────────────────────────────────────────────────────

export type StockfluxPaletteName = 'teal' | 'indigo' | 'amber' | 'slate' | 'grey';

export const DEFAULT_STOCKFLUX_PALETTE: StockfluxPaletteName = 'slate';

export const STOCKFLUX_PALETTE_NAMES: readonly StockfluxPaletteName[] = [
  'teal',
  'indigo',
  'amber',
  'slate',
  'grey',
] as const;

export interface StockfluxHexMode {
  bg: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bg5: string;
  t0: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  border: string;
  border2: string;
  border3: string;
  brand: string;
  brandHi: string;
  brandLo: string;
  brandSoft: string;
  brandRing: string;
  up: string;
  upHi: string;
  upSoft: string;
  upStrip: string;
  down: string;
  downHi: string;
  downSoft: string;
  downStrip: string;
  flat: string;
  info: string;
  infoSoft: string;
  warn: string;
  warnSoft: string;
  success: string;
  error: string;
  bidFill: string;
  askFill: string;
  scrollbar: string;
  mutedSurface: string;
  popoverSurface: string;
  sidebarGround: string;
}

export interface StockfluxShadcnMode {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
}

export interface StockfluxAgGridMode {
  bg: string;
  fg: string;
  chrome: string;
  header: string;
  headerText: string;
  odd: string;
  hover: string;
  sel: string;
  border: string;
  rowBorder: string;
  accent: string;
  accentSoft: string;
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  menu: string;
  menuText: string;
  menuBorder: string;
  tooltip: string;
  tooltipText: string;
  toggleOff: string;
}

export interface StockfluxPalettePack {
  hex: { dark: StockfluxHexMode; light: StockfluxHexMode };
  shadcn: { dark: StockfluxShadcnMode; light: StockfluxShadcnMode };
  agGrid: { dark: StockfluxAgGridMode; light: StockfluxAgGridMode };
}

// ─────────────────────────────────────────────────────────────
//  StarUI palette packs — shared shapes (reference: staruidesign1)
// ─────────────────────────────────────────────────────────────

export type StarUIPaletteName = 'teal' | 'indigo' | 'amber' | 'slate' | 'grey';

export const DEFAULT_STARUI_PALETTE: StarUIPaletteName = 'slate';

export const STARUI_PALETTE_NAMES: readonly StarUIPaletteName[] = [
  'teal',
  'indigo',
  'amber',
  'slate',
  'grey',
] as const;

export interface StarUIHexMode {
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

export interface StarUIShadcnMode {
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

export interface StarUIAgGridMode {
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

export interface StarUIPalettePack {
  hex: { dark: StarUIHexMode; light: StarUIHexMode };
  shadcn: { dark: StarUIShadcnMode; light: StarUIShadcnMode };
  agGrid: { dark: StarUIAgGridMode; light: StarUIAgGridMode };
}

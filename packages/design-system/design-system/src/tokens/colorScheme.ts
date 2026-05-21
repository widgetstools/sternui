import type { StockfluxShadcnMode } from './stockflux/types';

/** Semantic color roles — one scheme per palette × mode */
export interface ColorScheme {
  primary: {
    color:      string;
    hover:      string;
    display:    string;
    highlight:  string;
    pressed:    string;
    foreground: string;
    soft:       string;
    ring:       string;
  };
  surface: {
    ground:     string;
    sunken:     string;
    primary:    string;
    secondary:  string;
    tertiary:   string;
    quaternary: string;
    muted:      string;
    popover:    string;
  };
  text: {
    primary:   string;
    secondary: string;
    muted:     string;
    faint:     string;
    disabled:  string;
  };
  border: {
    primary:   string;
    secondary: string;
    tertiary:  string;
  };
  accent: {
    positive:      string;
    positiveHover: string;
    negative:      string;
    negativeHover: string;
    warning:       string;
    info:          string;
    infoHover:     string;
    highlight:     string;
    purple:        string;
  };
  trade: {
    flat:          string;
    positiveStrip: string;
    negativeStrip: string;
    bidFill:       string;
    askFill:       string;
  };
  action: {
    buyBg:    string;
    buyText:  string;
    sellBg:   string;
    sellText: string;
  };
  state: {
    focusRing:    string;
    focusRingBg:  string;
    disabledBg:   string;
    disabledFg:   string;
    hoverOverlay: string;
    selection:    string;
  };
  overlay: {
    positiveSoft:  string;
    negativeSoft:  string;
    warningSoft:   string;
    infoSoft:      string;
    positiveRing:  string;
    negativeRing:  string;
    warningRing:   string;
    infoRing:      string;
    neutralSoft:   string;
    neutralRing:   string;
  };
  chart: readonly [string, string, string, string, string];
  sidebar: {
    background:          string;
    foreground:            string;
    primary:               string;
    primaryForeground:     string;
    accent:                string;
    accentForeground:      string;
    border:                string;
    ring:                  string;
  };
  cvd: {
    buy:  string;
    sell: string;
  };
  scrollbar: string;
  elevation: {
    card:    string;
    overlay: string;
    glow:    string;
  };
  shadcn: StockfluxShadcnMode;
}

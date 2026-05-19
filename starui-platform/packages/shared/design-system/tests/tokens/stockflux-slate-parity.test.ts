import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dark, light } from '../../src/tokens/semantic';
import {
  stockfluxSlateHex,
  stockfluxSlateShadcn,
  stockfluxSlateAgGrid,
} from '../../src/tokens/stockfluxSlate';
import {
  agGridDarkParams,
  agGridLightParams,
} from '../../src/adapters/agGrid';

const STOCKFLUX_PALETTES = resolve(
  '/Users/develop/wfh/Stockflux-design/palettes.css',
);
const STOCKFLUX_AGGRID = resolve(
  '/Users/develop/wfh/Stockflux-design/aggrid-theme.js',
);

function extractCssBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const brace = css.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(brace + 1, i);
    }
  }
  throw new Error(`unclosed block: ${selector}`);
}

function cssVar(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`var not found: ${name}`);
  return m[1].trim();
}

describe('Stockflux SLATE BLUE parity', () => {
  const slateDarkCss = extractCssBlock(
    readFileSync(STOCKFLUX_PALETTES, 'utf8'),
    '[data-palette="slate"][data-theme="dark"]',
  );
  const slateLightCss = extractCssBlock(
    readFileSync(STOCKFLUX_PALETTES, 'utf8'),
    '[data-palette="slate"][data-theme="light"]',
  );

  for (const [mode, scheme, hex, shadcn, css] of [
    ['dark', dark, stockfluxSlateHex.dark, stockfluxSlateShadcn.dark, slateDarkCss],
    ['light', light, stockfluxSlateHex.light, stockfluxSlateShadcn.light, slateLightCss],
  ] as const) {
    describe(mode, () => {
      it('surface + text + border hex match palettes.css', () => {
        expect(scheme.surface.ground).toBe(cssVar(css, '--sf-bg'));
        expect(scheme.surface.sunken).toBe(cssVar(css, '--sf-bg-1'));
        expect(scheme.surface.primary).toBe(cssVar(css, '--sf-bg-2'));
        expect(scheme.text.primary).toBe(cssVar(css, '--sf-t-0'));
        expect(scheme.text.disabled).toBe(cssVar(css, '--sf-t-4'));
        expect(scheme.border.tertiary).toBe(cssVar(css, '--sf-border-3'));
        expect(scheme.accent.positive).toBe(cssVar(css, '--sf-up'));
        expect(scheme.accent.negative).toBe(cssVar(css, '--sf-down'));
        expect(scheme.trade.bidFill).toBe(cssVar(css, '--sf-bid-fill'));
        expect(hex.bg).toBe(cssVar(css, '--sf-bg'));
      });

      it('shadcn HSL channels match palettes.css', () => {
        expect(shadcn.background).toBe(cssVar(css, '--background'));
        expect(shadcn.primary).toBe(cssVar(css, '--primary'));
        expect(shadcn.accent).toBe(cssVar(css, '--accent'));
        expect(shadcn.destructive).toBe(cssVar(css, '--destructive'));
        expect(shadcn.destructiveForeground).toBe(
          cssVar(css, '--destructive-foreground'),
        );
        expect(shadcn.chart1).toBe(cssVar(css, '--chart-1'));
      });

      it('scheme.shadcn is wired on ColorScheme', () => {
        expect(scheme.shadcn.primary).toBe(shadcn.primary);
      });
    });
  }

  it('AG Grid dark params match aggrid-theme.js slate pack', () => {
    const js = readFileSync(STOCKFLUX_AGGRID, 'utf8');
    const pack = stockfluxSlateAgGrid.dark;
    expect(js).toContain(`bg: '${pack.bg}'`);
    expect(agGridDarkParams.backgroundColor).toBe(pack.bg);
    expect(agGridDarkParams.headerBackgroundColor).toBe(pack.header);
    expect(agGridDarkParams.oddRowBackgroundColor).toBe(pack.odd);
    expect(agGridDarkParams.rowHoverColor).toBe(pack.hover);
    expect(agGridDarkParams.accentColor).toBe(pack.accent);
  });

  it('AG Grid light params match aggrid-theme.js slate pack', () => {
    const pack = stockfluxSlateAgGrid.light;
    expect(agGridLightParams.backgroundColor).toBe(pack.bg);
    expect(agGridLightParams.tooltipBackgroundColor).toBe(pack.tooltip);
    expect(agGridLightParams.tooltipTextColor).toBe(pack.tooltipText);
  });
});

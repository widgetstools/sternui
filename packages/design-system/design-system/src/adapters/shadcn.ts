// ─────────────────────────────────────────────────────────────
//  shadcn/ui adapter — re-exports compat CSS generation.
//  Canonical OKLCH tokens: tokens/starui-tokens.css
// ─────────────────────────────────────────────────────────────

import { dark, light } from '../tokens/semantic';

export { generateCompatCSS, generateUnifiedCSS } from './compatCss';

/** @deprecated shadcn vars are defined in starui-tokens.css */
export function generateShadcnCSS(): string {
  return '';
}

/** Get semantic scheme for JS consumers */
export function getShadcnTokens(mode: 'dark' | 'light') {
  return mode === 'dark' ? dark : light;
}

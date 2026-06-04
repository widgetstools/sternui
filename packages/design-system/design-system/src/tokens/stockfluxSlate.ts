// ─────────────────────────────────────────────────────────────
//  STARUI token exports (legacy names retained for compatibility)
//  Canonical source: tokens/staruiHex.ts
// ─────────────────────────────────────────────────────────────

import {
  staruiHex,
  toLegacyHexPack,
  buildShadcnFromStarui,
  buildAgGridFromStarui,
} from './staruiHex';

/** @deprecated Import `staruiHex` — kept for existing consumers. */
export const stockfluxSlateHex = {
  dark: toLegacyHexPack(staruiHex.dark),
  light: toLegacyHexPack(staruiHex.lightClinical),
  paper: toLegacyHexPack(staruiHex.lightPaper),
} as const;

export { staruiHex };

export const stockfluxSlateShadcn = {
  dark: buildShadcnFromStarui(staruiHex.dark),
  light: buildShadcnFromStarui(staruiHex.lightClinical),
  paper: buildShadcnFromStarui(staruiHex.lightPaper),
} as const;

export const stockfluxSlateAgGrid = {
  dark: buildAgGridFromStarui(staruiHex.dark, 'dark'),
  light: buildAgGridFromStarui(staruiHex.lightClinical, 'light'),
  paper: buildAgGridFromStarui(staruiHex.lightPaper, 'light'),
} as const;

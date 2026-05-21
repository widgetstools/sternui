import { stockfluxAmberPack } from './amber';
import { stockfluxGreyPack } from './grey';
import { stockfluxIndigoPack } from './indigo';
import { stockfluxSlatePack } from './slate';
import { stockfluxTealPack } from './teal';
import {
  DEFAULT_STOCKFLUX_PALETTE,
  STOCKFLUX_PALETTE_NAMES,
  type StockfluxPaletteName,
  type StockfluxPalettePack,
} from './types';

export {
  DEFAULT_STOCKFLUX_PALETTE,
  STOCKFLUX_PALETTE_NAMES,
  type StockfluxPaletteName,
  type StockfluxPalettePack,
  type StockfluxHexMode,
  type StockfluxShadcnMode,
  type StockfluxAgGridMode,
} from './types';

export { stockfluxTealPack } from './teal';
export { stockfluxIndigoPack } from './indigo';
export { stockfluxAmberPack } from './amber';
export { stockfluxSlatePack, stockfluxSlateHex, stockfluxSlateShadcn, stockfluxSlateAgGrid } from './slate';
export { stockfluxGreyPack } from './grey';

export const STOCKFLUX_PALETTES: Record<StockfluxPaletteName, StockfluxPalettePack> = {
  teal:   stockfluxTealPack,
  indigo: stockfluxIndigoPack,
  amber:  stockfluxAmberPack,
  slate:  stockfluxSlatePack,
  grey:   stockfluxGreyPack,
};

export function getStockfluxPack(palette: StockfluxPaletteName): StockfluxPalettePack {
  return STOCKFLUX_PALETTES[palette];
}

export function isStockfluxPaletteName(value: string): value is StockfluxPaletteName {
  return (STOCKFLUX_PALETTE_NAMES as readonly string[]).includes(value);
}

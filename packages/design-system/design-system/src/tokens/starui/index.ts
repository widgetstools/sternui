import { staruiAmberPack } from './amber';
import { staruiGreyPack } from './grey';
import { staruiIndigoPack } from './indigo';
import { staruiSlatePack } from './slate';
import { staruiTealPack } from './teal';
import {
  DEFAULT_STARUI_PALETTE,
  STARUI_PALETTE_NAMES,
  type StarUIPaletteName,
  type StarUIPalettePack,
} from './types';

export {
  DEFAULT_STARUI_PALETTE,
  STARUI_PALETTE_NAMES,
  type StarUIPaletteName,
  type StarUIPalettePack,
  type StarUIHexMode,
  type StarUIShadcnMode,
  type StarUIAgGridMode,
} from './types';

export { staruiTealPack } from './teal';
export { staruiIndigoPack } from './indigo';
export { staruiAmberPack } from './amber';
export { staruiSlatePack, staruiSlateHex, staruiSlateShadcn, staruiSlateAgGrid } from './slate';
export { staruiGreyPack } from './grey';

export const STARUI_PALETTES: Record<StarUIPaletteName, StarUIPalettePack> = {
  teal:   staruiTealPack,
  indigo: staruiIndigoPack,
  amber:  staruiAmberPack,
  slate:  staruiSlatePack,
  grey:   staruiGreyPack,
};

export function getStarUIPack(palette: StarUIPaletteName): StarUIPalettePack {
  return STARUI_PALETTES[palette];
}

export function isStarUIPaletteName(value: string): value is StarUIPaletteName {
  return (STARUI_PALETTE_NAMES as readonly string[]).includes(value);
}

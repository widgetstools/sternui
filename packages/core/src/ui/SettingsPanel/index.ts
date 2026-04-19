/**
 * v2 SettingsPanel primitives — Cockpit Terminal edition.
 *
 * Import site:
 *
 *   import {
 *     PanelChrome, TabStrip, ObjectTitleRow,
 *     FigmaPanelSection, SubLabel, PairRow,
 *     ItemCard, IconInput, PillToggleGroup, PillToggleBtn,
 *     GhostIcon, DirtyDot, LedBar,
 *     Caps, Mono, SharpBtn, TGroup, TBtn, TDivider, Band, MetaCell, Stepper,
 *   } from '@grid-customizer/core';
 *
 * Every primitive consumes the `--ck-*` tokens scoped to the Cockpit
 * popout shell (`v2-sheet-styles.ts`).
 */

export { DirtyDot, LedBar, type DirtyDotProps, type LedBarProps } from './DirtyDot';
export { GhostIcon, type GhostIconProps } from './GhostIcon';
export { SubLabel, type SubLabelProps } from './SubLabel';
export { IconInput, type IconInputProps } from './IconInput';
export { PillToggleGroup, PillToggleBtn, type PillToggleGroupProps, type PillToggleBtnProps } from './PillToggleGroup';
export { PairRow, type PairRowProps } from './PairRow';
export { FigmaPanelSection, type FigmaPanelSectionProps } from './FigmaPanelSection';
export { ItemCard, type ItemCardProps } from './ItemCard';
export { ObjectTitleRow, type ObjectTitleRowProps } from './ObjectTitleRow';
export { TitleInput, type TitleInputProps } from './TitleInput';
export { PanelChrome, type PanelChromeProps } from './PanelChrome';
export { TabStrip, type TabStripProps, type TabItem } from './TabStrip';
export {
  Caps,
  Mono,
  SharpBtn,
  TGroup,
  TBtn,
  TDivider,
  Band,
  MetaCell,
  Stepper,
  type CapsProps,
  type MonoProps,
  type SharpBtnProps,
  type SharpBtnVariant,
  type TGroupProps,
  type TBtnProps,
  type BandProps,
  type MetaCellProps,
  type StepperProps,
} from './Cockpit';

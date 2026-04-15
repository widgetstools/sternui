// @grid-customizer/markets-grid-v2 — public API.
//
// Thin AG-Grid wrapper for core-v2. Auto-save is on by default; the explicit
// Save button calls `useProfileManager.saveActiveProfile()` directly (no
// `gc:save-all` window event, no `activeFiltersRef` mutation — the two v1
// architectural debts the v2 plan calls out).

export { MarketsGrid, DEFAULT_V2_MODULES } from './MarketsGrid';
export { FiltersToolbar } from './FiltersToolbar';
export { ProfileSelector } from './ProfileSelector';
export { useMarketsGridV2 } from './useMarketsGridV2';

export type { MarketsGridV2Props, SavedFilter } from './types';
export type { FiltersToolbarProps } from './FiltersToolbar';
export type { ProfileSelectorProps } from './ProfileSelector';
export type { UseMarketsGridV2Options, UseMarketsGridV2Result } from './useMarketsGridV2';

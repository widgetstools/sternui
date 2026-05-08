/**
 * Cockpit list rail — shared shadcn/cmdk primitive for every settings
 * panel's master-detail "items list" rail.
 *
 * Wraps `cmdk` (the unstyled primitive that shadcn's Command component
 * is also built on) so the four module panels — Column Settings,
 * Conditional Styling, Column Groups, Calculated Columns — share one
 * accessible, keyboard-navigable list rail instead of hand-rolled
 * `<ul><li><button>` markup.
 *
 * Why cmdk directly and not shadcn's `Command` wrapper:
 *   - shadcn's wrapper applies Tailwind utility classes (`bg-popover`,
 *     `text-popover-foreground`, `data-[selected]:bg-accent`) that
 *     fight the cockpit token CSS we already use here. Pulling cmdk
 *     directly lets the existing `.gc-popout-list-item[*]` selectors
 *     remain the single source of truth for the cockpit theme.
 *
 * Selection model:
 *   - cmdk auto-sets `aria-selected="true"` on whichever item is
 *     currently *highlighted* (hovered / keyboard-focused). That is
 *     the cmdk "current" item, not the panel's "currently-edited"
 *     item.
 *   - Panel-level "this card is open in the editor" is encoded as
 *     `data-active="true"` on the item (set by callers via the
 *     `active` prop). The cockpit CSS keys the green left-border on
 *     `data-active`, with `aria-selected` falling back to a softer
 *     hover-style highlight for keyboard navigation discoverability.
 */
import { Command as CommandPrimitive } from 'cmdk';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

export interface CockpitListProps
  extends Omit<ComponentPropsWithoutRef<typeof CommandPrimitive>, 'shouldFilter'> {
  /** Test hook applied to the inner `<CommandList>` element. */
  listTestId?: string;
}

/**
 * Outer Command + inner CommandList. The cockpit rail never shows a
 * search input, so cmdk's built-in filter is disabled — every item
 * passed in always renders.
 */
export const CockpitList = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  CockpitListProps
>(function CockpitList({ children, listTestId, ...rest }, ref) {
  return (
    <CommandPrimitive ref={ref} shouldFilter={false} {...rest}>
      <CommandPrimitive.List className="gc-popout-list-items" data-testid={listTestId}>
        {children}
      </CommandPrimitive.List>
    </CommandPrimitive>
  );
});

export interface CockpitListItemProps
  extends Omit<ComponentPropsWithoutRef<typeof CommandPrimitive.Item>, 'value'> {
  /** Stable id for the row — wired into cmdk's value model so keyboard
   *  navigation, click, and `onSelect` all dispatch with the same key. */
  value: string;
  /** True when this row's editor card is open in the panel's right
   *  pane. Encoded as `data-active="true"` so the cockpit theme can
   *  draw the persistent green left-border without conflicting with
   *  cmdk's transient `aria-selected` highlight. */
  active?: boolean;
  /** Optional ghosting hook (`data-muted="true"`) for rows whose
   *  underlying record is disabled — preserves the existing
   *  conditional-styling rule list affordance. */
  muted?: boolean;
}

export const CockpitListItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  CockpitListItemProps
>(function CockpitListItem(
  { value, active, muted, className, children, ...rest },
  ref,
) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      value={value}
      data-active={active ? 'true' : undefined}
      data-muted={muted ? 'true' : undefined}
      className={className ?? 'gc-popout-list-item'}
      {...rest}
    >
      {children}
    </CommandPrimitive.Item>
  );
});

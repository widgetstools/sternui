import { createContext, useContext, type ReactNode } from 'react';

/**
 * PortalContainerContext — a React context that carries the target
 * `HTMLElement` for every portal-rendering primitive in the app
 * (Radix Popover, Radix AlertDialog, Radix Tooltip, native
 * `createPortal`, etc.).
 *
 * Why we need it:
 *   - Shadcn primitives use Radix internally; Radix's `*Portal`
 *     sub-components render into `document.body` by default.
 *   - When the settings sheet is popped out into a detached OS
 *     window (see `<PopoutPortal/>`), its React subtree is still
 *     mounted in the MAIN window's React tree — so `document` there
 *     is the main window's document, NOT the popout's.
 *   - Without an override, every dropdown / popover / modal opened
 *     from inside the popped sheet would render its menu into the
 *     main window's body, which is invisible (hidden by the popout
 *     OS window) and unusable.
 *   - Radix's `*Portal` all accept a `container` prop. We thread
 *     the right container down via this context.
 *
 * Default value is `null` — callers should treat null as "use the
 * normal document.body" (Radix's default behavior when `container`
 * is unset).
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export interface PortalContainerProviderProps {
  /**
   * The DOM element that every downstream portal should render
   * into. Pass `null` / undefined to fall back to the default
   * (main document.body). Typically the popout window's `body` or
   * a dedicated `<div>` inside it.
   */
  container: HTMLElement | null;
  children: ReactNode;
}

export function PortalContainerProvider({ container, children }: PortalContainerProviderProps) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

/**
 * Read the current portal container. Returns `null` when nothing
 * has overridden the default — the caller should then let its
 * underlying Portal component fall back to `document.body`.
 *
 * Usage inside a Radix-Portal-using primitive:
 * ```tsx
 * const container = usePortalContainer();
 * return <PopoverPrimitive.Portal container={container ?? undefined}>...</PopoverPrimitive.Portal>;
 * ```
 */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}

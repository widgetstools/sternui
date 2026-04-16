import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { clickIsInsideAnyOpenPopover, registerPopoverRoot } from './popoverStack';

/**
 * Portal popover. Renders `children` into `document.body` floating next to
 * the trigger element, so the content escapes any `overflow: hidden` or
 * stacking-context ancestor. Attaches click-toggle to the trigger via
 * `React.cloneElement`, so the trigger can be any React element.
 *
 * Outside-click behaviour consults the shared popover stack — nested
 * popovers don't close their parents.
 */
export function FormatPopover({
  trigger,
  children,
  width = 240,
  align = 'start',
}: {
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  children: ReactNode;
  width?: number;
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Re-measure on scroll / resize while open so the popover tracks its trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const measure = () => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger) return;
      const tRect = trigger.getBoundingClientRect();
      const cHeight = content?.offsetHeight ?? 300; // estimate before first paint
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 4;
      const margin = 8;

      // ── Vertical: prefer below, flip above if clipped ──
      const spaceBelow = vh - tRect.bottom - gap - margin;
      const spaceAbove = tRect.top - gap - margin;
      let top: number;
      if (spaceBelow >= cHeight || spaceBelow >= spaceAbove) {
        // Below the trigger
        top = tRect.bottom + gap;
      } else {
        // Above the trigger
        top = tRect.top - gap - cHeight;
      }
      // Clamp so it never goes off-screen
      top = Math.max(margin, Math.min(top, vh - cHeight - margin));

      // ── Horizontal: start-aligned, flip if clipped ──
      let left = align === 'end' ? tRect.right - width : tRect.left;
      const maxLeft = vw - width - margin;
      if (left > maxLeft) left = Math.max(margin, maxLeft);
      if (left < margin) left = margin;

      setPos({ top, left });
    };
    measure();
    // Re-measure once more after the portal content paints (actual height known).
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [open, width, align]);

  useEffect(() => {
    if (!open || !contentRef.current) return;
    return registerPopoverRoot(contentRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (clickIsInsideAnyOpenPopover(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const clonedTrigger = React.cloneElement(
    trigger as ReactElement<Record<string, unknown>>,
    {
      ref: (el: HTMLElement | null) => {
        triggerRef.current = el;
      },
      onClick: (e: React.MouseEvent) => {
        (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
        setOpen((p) => !p);
      },
    } as Record<string, unknown>,
  );

  return (
    <>
      {clonedTrigger}
      {open &&
        createPortal(
          <div
            ref={contentRef}
            // Portal renders on document.body, outside [data-gc-settings],
            // so --gc-* vars may not resolve. Use explicit dark fallbacks.
            data-gc-settings=""
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 2147483647, // max 32-bit int — always topmost
              background: 'var(--gc-surface, #161a1e)',
              border: '1px solid var(--gc-border, #313944)',
              borderRadius: 'var(--gc-radius-xl, 6px)',
              padding: 10,
              width,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
              fontFamily: 'var(--gc-font, "Geist", "Inter", -apple-system, sans-serif)',
              fontSize: 'var(--gc-font-sm, 11px)',
              color: 'var(--gc-text, #eaecef)',
            }}
            onMouseDown={(e) => {
              // Stop propagation so no ancestor's document.mousedown handler
              // interprets this click as "outside" and closes the popover.
              // This is the primary mechanism that keeps the color picker
              // (and any nested popover content) alive while the user interacts.
              e.stopPropagation();
              const tag = (e.target as HTMLElement).tagName;
              if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

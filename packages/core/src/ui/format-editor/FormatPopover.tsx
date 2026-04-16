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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = align === 'end' ? rect.right - width : rect.left;
    // Auto-flip away from the viewport edge: if the popover would overflow
    // right, pin it to the right; if it would overflow left, pin to the left.
    const margin = 8;
    const maxLeft = window.innerWidth - width - margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    if (left < margin) left = margin;
    setPos({ top: rect.bottom + 4, left });
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
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 10100,
              background: 'var(--gc-surface)',
              border: '1px solid var(--gc-border)',
              borderRadius: 'var(--gc-radius-xl, 6px)',
              padding: 10,
              width,
              boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
              fontFamily: 'var(--gc-font)',
              fontSize: 'var(--gc-font-sm)',
              color: 'var(--gc-text)',
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

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { clickIsInsideAnyOpenPopover, registerPopoverRoot } from './popoverStack';

/**
 * Portal dropdown with Figma-style checkmark rail. Used for select-style
 * choices where only one option can be active (thickness, style, preset, ...).
 *
 * `trigger` is cloned with an onClick that toggles open. Shares the popover
 * stack so it doesn't close its parent popover when picked.
 */
export function FormatDropdown<V extends string | number>({
  trigger,
  options,
  value,
  onChange,
  footer,
  width,
}: {
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  options: Array<{ value: V; label: string; icon?: ReactNode }>;
  value: V;
  onChange: (v: V) => void;
  footer?: ReactNode;
  /** Optional explicit min-width override; otherwise sizes to content. */
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

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
            onMouseDown={(e) => {
              e.stopPropagation();
              const tag = (e.target as HTMLElement).tagName;
              if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
            }}
            data-gc-settings=""
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 10100,
              background: 'var(--gc-surface, #161a1e)',
              border: '1px solid var(--gc-border, #313944)',
              borderRadius: 'var(--gc-radius-xl, 6px)',
              padding: 4,
              minWidth: width ?? 180,
              boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
              fontFamily: 'var(--gc-font, "Geist", "Inter", -apple-system, sans-serif)',
              fontSize: 'var(--gc-font-sm, 11px)',
              color: 'var(--gc-text, #eaecef)',
            }}
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <button
                  key={String(o.value)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 8px 6px 4px',
                    background: 'transparent',
                    color: 'var(--gc-text)',
                    border: 'none',
                    borderRadius: 'var(--gc-radius-sm, 4px)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--gc-font)',
                    fontSize: 'var(--gc-font-sm)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gc-surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      width: 14,
                      display: 'inline-flex',
                      justifyContent: 'center',
                      color: selected ? 'var(--gc-positive)' : 'transparent',
                    }}
                  >
                    <Check size={11} strokeWidth={2} />
                  </span>
                  {o.icon && (
                    <span style={{ color: selected ? 'var(--gc-positive)' : 'var(--gc-text-muted)', display: 'inline-flex' }}>
                      {o.icon}
                    </span>
                  )}
                  <span style={{ flex: 1 }}>{o.label}</span>
                </button>
              );
            })}
            {footer && (
              <>
                <div style={{ height: 1, background: 'var(--gc-border)', margin: '4px 0' }} />
                {footer}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

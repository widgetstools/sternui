import React, { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@grid-customizer/core';
import { ChevronDown } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolbarSlot {
  /** Unique ID for this toolbar */
  id: string;
  /** Label shown in dropdown tooltip (e.g. "Style", "Filters", "Data") */
  label: string;
  /** Accent color — CSS color string */
  color: string;
  /** Icon element shown in the switcher trigger and dropdown */
  icon?: ReactNode;
  /** The toolbar React element to render */
  content: ReactNode;
}

export interface ToolbarSwitcherProps {
  toolbars: ToolbarSlot[];
  /** Which toolbar is active initially (defaults to first) */
  defaultActiveId?: string;
  /** Additional class on the outer wrapper */
  className?: string;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLOR_DEFAULTS = [
  'var(--primary, #14b8a6)',
  'var(--bn-yellow, #f0b90b)',
  'var(--bn-blue, #3da0ff)',
  'var(--bn-red, #f87171)',
  'var(--purple-400, #c084fc)',
  'var(--bn-cyan, #22d3ee)',
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ToolbarSwitcher({ toolbars, defaultActiveId, className }: ToolbarSwitcherProps) {
  const [activeId, setActiveId] = useState(defaultActiveId ?? toolbars[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (toolbars.length === 0) return null;

  // Single toolbar — no switcher needed
  if (toolbars.length === 1) {
    return <>{toolbars[0].content}</>;
  }

  const activeToolbar = toolbars.find(t => t.id === activeId) ?? toolbars[0];
  const activeIndex = toolbars.findIndex(t => t.id === activeId);
  const activeColor = activeToolbar.color || COLOR_DEFAULTS[activeIndex % COLOR_DEFAULTS.length];

  return (
    <div className={cn('gc-toolbar-switcher relative flex', className)}>
      {/* ── Dropdown trigger — tiny button on left edge ── */}
      <div ref={dropdownRef} className="gc-switcher-dropdown shrink-0 flex items-center border-b border-r border-border bg-card relative" style={{ width: 32 }}>
        <button
          type="button"
          className="gc-switcher-trigger"
          style={{ '--sw-color': activeColor } as React.CSSProperties}
          onClick={() => setOpen(o => !o)}
          title={`Switch toolbar (${activeToolbar.label})`}
        >
          {activeToolbar.icon ? (
            <span className="gc-switcher-icon" style={{ color: activeColor }}>{activeToolbar.icon}</span>
          ) : (
            <span className="gc-switcher-dot" />
          )}
          <ChevronDown size={8} strokeWidth={2.5} style={{ opacity: 0.5 }} />
        </button>

        {/* ── Dropdown menu ── */}
        {open && (
          <div className="gc-switcher-menu">
            {toolbars.map((t, i) => {
              const isActive = t.id === activeId;
              const color = t.color || COLOR_DEFAULTS[i % COLOR_DEFAULTS.length];
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cn('gc-switcher-item', isActive && 'gc-switcher-item-active')}
                  style={{ '--sw-color': color } as React.CSSProperties}
                  onClick={() => handleSelect(t.id)}
                  title={t.label}
                >
                  {t.icon ? (
                    <span className="gc-switcher-item-icon" style={{ color }}>{t.icon}</span>
                  ) : (
                    <span className="gc-switcher-item-dot" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Active toolbar content ── */}
      <div className="flex-1 min-w-0 overflow-visible">
        {activeToolbar.content}
      </div>
    </div>
  );
}

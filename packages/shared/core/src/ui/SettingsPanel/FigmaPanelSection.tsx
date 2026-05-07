import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Cockpit numbered band — the settings editor's section heading voice.
 * Replaces the old Figma-panel-section chrome with the trading-terminal
 * numbered-header look: `01 TITLE ────────────`.
 *
 * API is unchanged (the same `title` / `collapsed` / `onToggle` / `actions`
 * slots) so every existing consumer continues to work. The primitive
 * automatically allocates a per-instance numeric prefix based on its
 * creation order inside a single render — callers who want explicit
 * indices can pass `index` to override.
 */

export interface FigmaPanelSectionProps {
  title: string;
  /** Controlled collapsed flag. When omitted, section is uncontrolled. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Optional default for uncontrolled mode. Defaults to expanded. */
  defaultCollapsed?: boolean;
  /** Right-aligned header actions (GhostIcon buttons, typically). */
  actions?: ReactNode;
  children?: ReactNode;
  /** Optional numeric prefix shown in Plex Mono before the title. */
  index?: string;
  'data-testid'?: string;
}

// Cheap auto-index so callers that don't pass `index` still get a
// stable, deterministic "01/02/03" sequence per render tree.
let _autoIndex = 0;
function nextIndex(): string {
  _autoIndex = (_autoIndex % 99) + 1;
  return String(_autoIndex).padStart(2, '0');
}

export function FigmaPanelSection({
  title,
  collapsed,
  onToggle,
  defaultCollapsed = false,
  actions,
  children,
  index,
  ...rest
}: FigmaPanelSectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isControlled = collapsed !== undefined;
  const isCollapsed = isControlled ? collapsed : internalCollapsed;

  // Memoise the auto-generated index per instance lifetime.
  const resolvedIndex = useMemo(() => index ?? nextIndex(), [index]);

  const toggle = () => {
    if (isControlled) onToggle?.();
    else setInternalCollapsed((c) => !c);
  };

  return (
    <section
      className="gc-band"
      data-testid={rest['data-testid']}
      style={{ padding: '14px 20px 4px' }}
    >
      <header
        onClick={toggle}
        className="gc-band-header"
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ color: 'var(--ck-t2, #6b7480)', display: 'inline-flex' }}>
          {isCollapsed ? <ChevronRight size={11} strokeWidth={2.25} /> : <ChevronDown size={11} strokeWidth={2.25} />}
        </span>
        <span className="gc-band-index">{resolvedIndex}</span>
        <span className="gc-band-title">{title}</span>
        <span className="gc-band-rule" />
        {actions && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {actions}
          </div>
        )}
      </header>
      {!isCollapsed && children !== undefined && <div>{children}</div>}
    </section>
  );
}

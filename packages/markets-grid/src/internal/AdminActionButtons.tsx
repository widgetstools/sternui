import {
  Activity,
  BarChart3,
  Database,
  Eye,
  FileText,
  ListChecks,
  ShieldCheck,
  Terminal,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AdminAction } from '../types';

/**
 * Admin action rendering for the primary MarketsGrid toolbar.
 *
 * `adminActions` on <MarketsGrid> is surfaced as one icon button per
 * action on the right edge of the primary toolbar row. Consumers get
 * immediate one-click access without opening the settings sheet. When
 * no visible actions are passed, the divider + buttons are all omitted
 * so end-user grids carry zero extra chrome.
 *
 * Extracted verbatim from `MarketsGrid.tsx` during Phase C-3.
 */

/** Map of `"lucide:<name>"` to the concrete lucide-react icon component.
 *  Kept inline (rather than dynamic `lucide-react/dist/esm/icons`) to
 *  avoid bundling all 1500+ lucide icons. New entries land here as
 *  needed — `icon: "lucide:<unknown>"` falls back to Wrench. */
const ADMIN_ACTION_ICONS: Record<string, LucideIcon> = {
  'lucide:database':     Database,
  'lucide:file-text':    FileText,
  'lucide:list-checks':  ListChecks,
  'lucide:activity':     Activity,
  'lucide:bar-chart-3':  BarChart3,
  'lucide:shield-check': ShieldCheck,
  'lucide:users':        Users,
  'lucide:terminal':     Terminal,
  'lucide:eye':          Eye,
  'lucide:wrench':       Wrench,
};

function resolveAdminActionIcon(ref: string | undefined): LucideIcon {
  if (!ref) return Wrench;
  return ADMIN_ACTION_ICONS[ref] ?? Wrench;
}

export function AdminActionButtons({ actions }: { actions: AdminAction[] | undefined }) {
  const visible = (actions ?? []).filter((a) => a.visible !== false);
  if (visible.length === 0) return null;

  return (
    <>
      <span className="gc-primary-divider" aria-hidden />
      {visible.map((action) => {
        const Icon = resolveAdminActionIcon(action.icon);
        // Tooltip shows label and description stacked. Native `title`
        // keeps it accessible without portaling a shadcn Tooltip in.
        const title = action.description
          ? `${action.label}\n${action.description}`
          : action.label;
        return (
          <button
            key={action.id}
            type="button"
            className="gc-primary-action"
            onClick={() => { void action.onClick(); }}
            title={title}
            aria-label={action.label}
            data-testid={`admin-action-${action.id}`}
          >
            <Icon size={14} strokeWidth={2} />
          </button>
        );
      })}
    </>
  );
}

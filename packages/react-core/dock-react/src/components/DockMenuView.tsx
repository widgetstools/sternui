import { useRef } from "react";
import {
  Bug,
  Check,
  ChevronRight,
  Code2,
  Database,
  Download,
  Eye,
  FolderSearch,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Settings2,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@starui/ui";
import type { DockMenuAnchor, DockMenuItem, DockMenuModel } from "../types";
import { DockIcon } from "./DockIcon";

/**
 * The lucide icons referenced by the dock's serializable menu models (system
 * Tools + workspace actions). Resolved by **name** here because the model
 * crosses a window boundary as JSON and can't carry React components (S15).
 */
const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  Settings, Database, FolderSearch, RefreshCw, Code2, Bug, Download, Upload, Eye,
  Check, Plus, RotateCcw, Save, Settings2, Pencil, Trash2,
};

interface DockMenuViewProps {
  model: DockMenuModel;
  /** A leaf item was chosen. */
  onSelect: (item: DockMenuItem) => void;
  /** A node with children was chosen — open a nested popup anchored at the row. */
  onOpenSubmenu?: (item: DockMenuItem, anchor: DockMenuAnchor) => void;
}

/**
 * Renders a {@link DockMenuModel} as a flat, themed menu — the body of an
 * OpenFin popup window (Session 15). Plain buttons (no Radix), design-system
 * tokens, dark/light via the model's `theme`. Items with `children` open a
 * nested popup via `onOpenSubmenu`; leaves call `onSelect`. The
 * checkable-column (`item.checked !== undefined`) renders a leading check so
 * the workspace switcher's active marker lines up.
 */
export function DockMenuView({ model, onSelect, onOpenSubmenu }: DockMenuViewProps) {
  return (
    <div
      data-theme={model.theme}
      role="menu"
      aria-label={model.title ?? "Menu"}
      className={cn(
        "flex min-w-[11rem] flex-col gap-0.5 p-1 text-[13px] leading-none",
        "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-primary)]",
        "rounded-md border border-[var(--ds-border-primary)] shadow-lg",
        "font-[var(--ds-font-sans)] select-none",
      )}
    >
      {model.items.map((item) => (
        <DockMenuRow
          key={item.id}
          item={item}
          theme={model.theme}
          onSelect={onSelect}
          onOpenSubmenu={onOpenSubmenu}
        />
      ))}
    </div>
  );
}

function DockMenuRow({
  item,
  theme,
  onSelect,
  onOpenSubmenu,
}: {
  item: DockMenuItem;
  theme: DockMenuModel["theme"];
  onSelect: (item: DockMenuItem) => void;
  onOpenSubmenu?: (item: DockMenuItem, anchor: DockMenuAnchor) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const hasChildren = Boolean(item.children && item.children.length > 0);
  const LucideCmp = item.iconName ? LUCIDE_BY_NAME[item.iconName] : undefined;

  const leading =
    item.checked !== undefined ? (
      <Check
        className={cn("h-4 w-4 shrink-0", item.checked ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
    ) : item.icon ? (
      <DockIcon icon={item.icon} theme={theme} size={16} />
    ) : LucideCmp ? (
      <LucideCmp className="h-4 w-4 shrink-0" aria-hidden />
    ) : null;

  const onClick = () => {
    if (item.disabled) return;
    if (hasChildren) {
      const r = ref.current?.getBoundingClientRect();
      onOpenSubmenu?.(item, { x: Math.round(r?.right ?? 0), y: Math.round(r?.top ?? 0) });
      return;
    }
    onSelect(item);
  };

  return (
    <>
      {item.separatorBefore ? (
        <div aria-hidden className="my-1 h-px bg-[var(--ds-border-primary)]" />
      ) : null}
      <button
        ref={ref}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        data-dock-item={item.id}
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px]",
          "outline-none",
          item.disabled
            ? "cursor-default text-[var(--ds-text-secondary)] opacity-60"
            : "hover:bg-[var(--ds-surface-hover,rgba(127,127,127,0.15))] focus-visible:bg-[var(--ds-surface-hover,rgba(127,127,127,0.15))]",
        )}
      >
        {leading}
        <span className="flex-1 truncate">{item.label}</span>
        {hasChildren ? <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
      </button>
    </>
  );
}

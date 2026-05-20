/**
 * Lucide-backed DynamicIcon for config-browser (replaces @starui/icons-svg).
 */
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileJson,
  Inbox,
  Moon,
  Package,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'lucide:alert-triangle': AlertTriangle,
  'lucide:check': Check,
  'lucide:cloud': Cloud,
  'lucide:cloud-off': CloudOff,
  'lucide:database': Database,
  'lucide:download': Download,
  'lucide:file-json': FileJson,
  'lucide:inbox': Inbox,
  'lucide:moon': Moon,
  'lucide:package': Package,
  'lucide:plus': Plus,
  'lucide:plus-circle': PlusCircle,
  'lucide:refresh-cw': RefreshCw,
  'lucide:search': Search,
  'lucide:sun': Sun,
  'lucide:trash-2': Trash2,
  'lucide:upload': Upload,
  'lucide:x': X,
};

export interface DynamicIconProps {
  icon: string;
  style?: CSSProperties;
  className?: string;
}

export function DynamicIcon({ icon, style, className }: DynamicIconProps) {
  const rawW = style?.width;
  const rawH = style?.height;
  const size = typeof rawW === 'number' ? rawW : typeof rawH === 'number' ? rawH : 16;
  const color = style?.color as string | undefined;
  const LucideComponent = ICON_MAP[icon];

  if (LucideComponent) {
    return (
      <LucideComponent
        size={size}
        color={color}
        className={className}
        style={{ flexShrink: 0, ...style, width: undefined, height: undefined, color: undefined }}
      />
    );
  }

  const [prefix, name] = icon.split(':');
  if (!prefix || !name) return null;
  const src = `https://api.iconify.design/${prefix}/${name}.svg?height=${size}`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={icon}
      style={{ flexShrink: 0, ...style }}
      className={className}
      loading="lazy"
    />
  );
}

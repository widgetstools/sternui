import React from 'react';
import { Icons } from './icons';
import type { AnyModule } from '../types/module';

const iconMap: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Settings: Icons.Settings,
  Columns3: Icons.Columns,
  ColumnGroups: Icons.Groups,
  Palette: Icons.Palette,
  Sigma: Icons.Sigma,
  Filter: Icons.Filter,
  Zap: Icons.Zap,
  Lock: Icons.Lock,
  Database: Icons.Database,
  ArrowUpDown: Icons.ArrowUpDown,
  Edit: Icons.Edit,
  Undo: Icons.Undo,
  Download: Icons.Download,
  Gauge: Icons.Gauge,
  Brush: Icons.Brush,
  Save: Icons.Save,
  Code: Icons.Code,
  Copy: Icons.Copy,
};

// Short labels for nav items
const shortLabels: Record<string, string> = {
  'general-settings': 'General',
  'column-templates': 'Tpls',
  'column-customization': 'Columns',
  'column-groups': 'Groups',
  'conditional-styling': 'Styling',
  'calculated-columns': 'Calc',
  'named-queries': 'Queries',
  'cell-flashing': 'Flash',
  'entitlements': 'Entitle',
  'data-management': 'Data',
  'sort-filter': 'Sort',
  'editing': 'Edit',
  'undo-redo': 'Undo',
  'export-clipboard': 'Export',
  'performance': 'Perf',
  'theming': 'Theme',
  'profiles': 'Profiles',
  'expression-editor': 'Expr',
};

interface ModuleNavProps {
  modules: AnyModule[];
  activeModuleId: string | null;
  onSelect: (moduleId: string) => void;
}

export const ModuleNav = React.memo(function ModuleNav({
  modules,
  activeModuleId,
  onSelect,
}: ModuleNavProps) {
  // Hide state-only modules (no SettingsPanel) from the settings nav.
  const visibleModules = modules.filter((m) => !!m.SettingsPanel);

  return (
    <nav className="gc-nav">
      {visibleModules.map((mod) => {
        const IconComponent = iconMap[mod.icon] ?? Icons.Settings;
        const label = shortLabels[mod.id] ?? mod.name;
        return (
          <button
            key={mod.id}
            className="gc-nav-item"
            data-active={activeModuleId === mod.id}
            onClick={() => onSelect(mod.id)}
            title={mod.name}
          >
            <IconComponent size={16} className="gc-nav-icon" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
});

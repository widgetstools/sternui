import { ConfigBrowserPanel as StarConfigBrowserPanel } from '@starui/config-browser';

export function ConfigBrowserPanel() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <StarConfigBrowserPanel />
    </div>
  );
}

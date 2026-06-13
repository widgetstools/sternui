import { ConfigBrowserPanel } from "@starui/config-browser";
import {
  isWorkerConfigManagerClient,
  LocalConfigBrowserAccess,
  type ConfigBrowserAccess,
} from "@starui/host-data";
import type { ConfigManager } from "@starui/host-config";
import { usePlatformBootstrap } from "../platformBootstrap";

export default function ConfigBrowserView() {
  const { platform } = usePlatformBootstrap();
  return (
    <ConfigBrowserPanel
      resolveConfigAccess={async (): Promise<ConfigBrowserAccess> => {
        const cm = platform.configManager;
        if (isWorkerConfigManagerClient(cm)) return cm;
        return new LocalConfigBrowserAccess(cm as ConfigManager);
      }}
    />
  );
}

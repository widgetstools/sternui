/**
 * @marketsui/host-wrapper-react — Seam #2 from docs/ARCHITECTURE.md.
 *
 * The single component-side seam between a hosted React component and
 * the surrounding runtime / persistence / theme choices.
 *
 * Usage:
 *
 *   import { HostWrapper, useHost } from '@marketsui/host-wrapper-react';
 *   import { BrowserRuntime } from '@marketsui/runtime-browser';
 *   import { createConfigClient } from '@marketsui/config-service';
 *
 *   const runtime = new BrowserRuntime({ identity: { appId, userId } });
 *   const configManager = createConfigClient({ baseUrl });
 *
 *   <HostWrapper runtime={runtime} configManager={configManager}>
 *     <YourComponent />
 *   </HostWrapper>
 *
 *   // Inside YourComponent:
 *   const { instanceId, theme, configManager, onThemeChanged } = useHost();
 */

export { HostWrapper, type HostWrapperProps } from './HostWrapper.js';
export { HostContext, useHost, type HostContextValue } from './HostContext.js';

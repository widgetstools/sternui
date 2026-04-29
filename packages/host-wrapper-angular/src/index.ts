/**
 * @marketsui/host-wrapper-angular — Seam #2 (Angular flavor) from
 * docs/ARCHITECTURE.md. Mirrors @marketsui/host-wrapper-react: hosted
 * Angular components inject `HostService` to read identity,
 * configManager, theme, and runtime lifecycle events.
 *
 * Wire at app root:
 *
 *   providers: [provideHostWrapper({ runtime, configManager })]
 *
 * Inject in components:
 *
 *   constructor(private host: HostService) {}
 *   onSave() { this.host.configManager.upsertConfig(...); }
 *   ngOnInit() { this.host.theme$.subscribe(...); }
 */

export { HostService } from './HostService';
export { HOST_RUNTIME, HOST_CONFIG_MANAGER, HOST_CONFIG_URL } from './HostTokens';
export { provideHostWrapper, type HostWrapperOptions } from './provider';

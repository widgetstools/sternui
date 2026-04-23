/**
 * ParentIdentity — identifies a parent widget when opening settings screens.
 */
export interface ParentIdentity {
  configId: string;
  instanceId: string;
  viewId: string;
}

/**
 * PlatformAdapter — abstracts browser vs OpenFin (or other platforms).
 * BrowserAdapter is the default; OpenFinAdapter lives in @stern/openfin-platform.
 */
export interface PlatformAdapter {
  readonly name: string;          // 'browser' | 'openfin' | custom
  readonly isOpenFin: boolean;

  // Widget lifecycle
  openWidget(type: string, data?: Record<string, unknown>): Promise<string>;
  closeWidget(instanceId: string): Promise<void>;

  // Communication
  broadcast(topic: string, data: unknown): void;
  subscribe(topic: string, handler: (data: unknown) => void): () => void;

  // Lifecycle hooks
  onPlatformSave(handler: () => Promise<void>): () => void;
  onPlatformDestroy(handler: () => void): () => void;

  // Settings screens
  openSettingsScreen(
    screenId: string,
    parentIdentity: ParentIdentity,
    data?: Record<string, unknown>
  ): Promise<void>;
  onSettingsResult(handler: (result: unknown) => void): () => void;

  // Platform info
  getInstanceId(): string;
  getLaunchData(): Record<string, unknown> | null;
}

import type { AppConfigRow } from './types';
import type { ProfileSetScope } from './profileSetTypes';

/** Minimal ConfigManager surface used by bundled profile-set I/O. */
export interface ProfileSetConfigAccess {
  getConfig(configId: string): Promise<AppConfigRow | null | undefined>;
  saveConfig(row: AppConfigRow): Promise<void>;
}

/** ConfigManager surface used by the `profiles` namespace factory. */
export interface ProfilesHost extends ProfileSetConfigAccess {
  getAppId(): string;
  getIdentity(): { userId: string };
}

export type { ProfileSetScope };

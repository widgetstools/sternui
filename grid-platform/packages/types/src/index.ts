/**
 * Runtime-agnostic foundation types for StarGrid host ports.
 * Ported from @starui/runtime-port — no legacy imports.
 */

/** Canonical logged-in user until real SSO is wired. */
export const LOGGED_IN_USER_ID = 'dev1';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'stargrid:theme';

export const THEME_BROADCAST_CHANNEL = 'stargrid:theme';

export type Unsubscribe = () => void;

export interface IdentitySnapshot {
  readonly instanceId: string;
  readonly appId: string;
  readonly userId: string;
  readonly componentType: string;
  readonly componentSubType: string;
  readonly isTemplate: boolean;
  readonly singleton: boolean;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly customData: Readonly<Record<string, unknown>>;
}

export type SurfaceKind = 'popout' | 'modal' | 'inpage';

export interface SurfaceSpec {
  readonly kind: SurfaceKind;
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
  readonly windowName?: string;
  readonly customData?: Readonly<Record<string, unknown>>;
}

export interface SurfaceHandle {
  readonly kind: SurfaceKind;
  readonly id: string;
  close(): void;
  focus?(): void;
  onClosed(fn: () => void): Unsubscribe;
}

/** Opaque profile blob — engine interprets; host adapters store. */
export interface ProfileSnapshot {
  readonly id: string;
  readonly gridId: string;
  name: string;
  state: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type AppDataLookup = (name: string, key: string) => unknown;

export interface AppDataSnapshot {
  readonly revision: number;
  lookup(name: string, key: string): unknown;
}

export {
  COMPOSITE_KEY_SEPARATOR,
  composeRowId,
  getValueByPath,
  normalizeKeyColumns,
} from './rowPath.js';

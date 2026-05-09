/**
 * Operator auth gate — placeholder.
 *
 * Reads `?token=...` from the page URL and treats any non-empty value
 * as "signed in". The token is plumbed into `RestConfigClient` via
 * `AppIdentity.getAccessToken`, so every API call carries
 * `Authorization: Bearer <token>` at the wire.
 *
 * Real auth (IDP redirect, refresh, expiry handling) lands in design
 * Decision 16 — explicitly deferred. Until then any operator who can
 * reach this URL is trusted; the server enforces nothing yet either,
 * which is fine for the dev/internal-only deployment shape this admin
 * console targets.
 *
 * The token is also persisted to `sessionStorage` so a page refresh
 * keeps the operator signed in without re-pasting the token.
 */

const STORAGE_KEY = 'starui.config-admin-web.token';

export function readTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('token')?.trim() ?? '';
  if (fromUrl.length > 0) {
    sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

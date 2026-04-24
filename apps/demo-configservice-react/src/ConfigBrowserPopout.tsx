/**
 * ConfigBrowser popup entry — renders ONLY when the bundle loads with
 * `?configBrowser=1` in the URL. Opened from App.tsx via `window.open`.
 *
 * Why a separate entry:
 *   - The popup runs in its own browser window. Closing is natural
 *     (OS window close button, Ctrl+W, etc.) — no custom close UI
 *     needed. Main grid stays visible behind.
 *   - ConfigBrowserPanel itself self-bootstraps its ConfigManager via
 *     `getConfigManager()`'s lazy path. Same-origin = same Dexie DB,
 *     so data is shared across windows automatically.
 *   - Host env (appId, configServiceUrl) is carried via `?hostEnv=...`
 *     query string so ConfigBrowser's `readHostEnv()` returns the
 *     demo's appId — without this it would fall back to `dev-host`
 *     and see none of the demo's rows.
 */
import { useEffect } from 'react';
import { ConfigBrowserPanel } from '@marketsui/config-browser';
import { X } from 'lucide-react';

export function ConfigBrowserPopout() {
  // Set a distinct title so users can tell windows apart in the OS
  // taskbar / window switcher when they have both open.
  useEffect(() => {
    document.title = 'Config Browser · MarketsGrid Demo';
  }, []);

  // Match the demo's default theme so the popup doesn't flash-of-light
  // before any user toggle. Read from localStorage (same shared storage
  // the demo app uses for its `gc-theme` key) so both windows stay in
  // lockstep when the user toggles in the parent.
  useEffect(() => {
    const apply = () => {
      let theme = 'dark';
      try {
        const stored = localStorage.getItem('gc-theme');
        if (stored === 'light') theme = 'light';
      } catch { /* ignore */ }
      document.documentElement.setAttribute('data-theme', theme);
    };
    apply();
    // Repaint on `storage` events — fires when the OTHER window
    // (the parent demo) flips the theme key, giving cross-window sync.
    const handler = (e: StorageEvent) => {
      if (e.key === 'gc-theme') apply();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--background)',
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}>
          Config Browser · demo-configservice
        </span>
        <button
          type="button"
          onClick={() => window.close()}
          title="Close"
          data-testid="config-browser-popout-close"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 5,
            border: '1px solid var(--border)',
            background: 'var(--secondary)',
            color: 'var(--foreground)',
            cursor: 'pointer',
          }}
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ConfigBrowserPanel />
      </div>
    </div>
  );
}

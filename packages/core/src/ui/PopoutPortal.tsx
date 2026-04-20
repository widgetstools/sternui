import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PortalContainerProvider } from './PortalContainer';

/**
 * PopoutPortal — render React children into a detached OS window while
 * keeping them in the parent component's React tree.
 *
 * Because the portal keeps the children attached to the parent's React
 * root, they continue to share context (GridProvider, theme, store,
 * profile-manager) and state updates flow instantly between the main
 * window and the popout — no BroadcastChannel or IndexedDB round-trip
 * needed. The popout is effectively "another monitor" for the same
 * React tree.
 *
 * Caveats the caller should know:
 *   - Closing the main window or refreshing it kills the popout (React
 *     runs in the main VM). This is the correct behavior for "popped-
 *     out panels" — Figma, Slack, iTerm, etc. all behave this way.
 *   - The popout has no URL of its own; refreshing the popout blanks
 *     it. The caller should surface this as "close and reopen" UX.
 *   - Popup blockers only let `window.open` through if it's fired
 *     inside a direct user-gesture handler. Always trigger from a
 *     button onClick (never from useEffect on mount).
 *
 * OpenFin support: the optional `openFinOverride` hook lets a caller
 * use `fin.Window.create` instead of `window.open`. The returned
 * promise must resolve to a same-origin `Window` with `document`
 * accessible (OpenFin's `getWebWindow()` gives you that).
 */

export interface PopoutPortalProps {
  /** The React subtree to render inside the popout window. */
  children: ReactNode;
  /**
   * Fires when the user closes the popout window (via its OS close
   * button, Cmd-W, or beforeunload). The parent should flip its
   * "popped" state back to false so the sheet re-mounts in the main
   * window.
   */
  onClose: () => void;
  /**
   * Stable window name — passed to `window.open` as the second arg.
   * Prevents duplicate windows: calling with the same name refocuses
   * the existing window instead of opening a second.
   */
  name: string;
  /** Title set on the popout document. Shown in the OS title bar. */
  title?: string;
  /** Initial width in CSS pixels. Default 900. */
  width?: number;
  /** Initial height in CSS pixels. Default 700. */
  height?: number;
  /**
   * If true, asks the window manager to pin the popout on top of
   * other windows. **OpenFin honors this; standards-compliant
   * browsers ignore it** (the web platform has no always-on-top
   * API by design). Only used when `openWindow` supports it; the
   * default `window.open` path discards it silently.
   */
  alwaysOnTop?: boolean;
  /**
   * When provided, the popout grows to `expandedHeight` while a
   * Radix popover / dropdown / menu is open inside it, then shrinks
   * back to the base `height` when the last one closes.
   *
   * Why: a small toolbar-height popout (e.g. 900×120) will clip
   * popovers taller than the window. The user shouldn't have to
   * manually resize the window to read a Templates menu or Format
   * picker.
   *
   * Detection: MutationObserver on `popout.document.body` watching
   * for `[data-radix-popper-content-wrapper]` nodes to appear /
   * disappear. Covers every Radix Popover / AlertDialog /
   * DropdownMenu / Tooltip through the standard wrapper attr.
   * Native createPortal callers (HelpOverlay / Palette) don't use
   * the wrapper, so they're not auto-expanded — but those aren't
   * commonly used inside the tiny toolbar popout anyway.
   *
   * Browsers expose `window.resizeTo()` for popups they opened;
   * most allow it for same-origin named windows. OpenFin picks it
   * up too via the same API.
   */
  expandedHeight?: number;
  /**
   * Optional override for the window-creation mechanism. Return a
   * same-origin `Window` whose `document` can be mutated. Defaults to
   * `window.open(...)`. Pass a custom function when running under
   * OpenFin so `fin.Window.create(...)` is used instead.
   */
  openWindow?: (opts: { name: string; width: number; height: number; alwaysOnTop: boolean }) => Window | Promise<Window | null> | null;
  /**
   * Fires once the popout window has been created and its document
   * prepared. Callers that need to programmatically focus / inspect
   * the window later (e.g. the MarketsGrid settings icon wanting to
   * raise the popout when the user re-clicks it) should stash the
   * reference from this callback. Cleared when the portal unmounts.
   */
  onWindowOpened?: (win: Window) => void;
}

export function PopoutPortal({
  children,
  onClose,
  name,
  title = 'Grid Customizer',
  width = 900,
  height = 700,
  alwaysOnTop = false,
  expandedHeight,
  openWindow,
  onWindowOpened,
}: PopoutPortalProps) {
  const [popout, setPopout] = useState<Window | null>(null);
  // Ref holds the latest onClose so the polling effect below doesn't
  // tear down + re-establish its interval every time the caller
  // re-renders with a new closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onWindowOpenedRef = useRef(onWindowOpened);
  onWindowOpenedRef.current = onWindowOpened;

  // ── Open the window on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const open = async () => {
      let w: Window | null;
      if (openWindow) {
        w = await openWindow({ name, width, height, alwaysOnTop });
      } else {
        // `window.open` has no always-on-top feature — the web
        // platform deliberately forbids it. `alwaysOnTop` is
        // silently discarded here; only OpenFin honors it via
        // `openFinWindowOpener()`.
        const features = `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`;
        w = window.open('', name, features);
      }
      if (cancelled) {
        w?.close();
        return;
      }
      if (!w) {
        // Popup blocker or OpenFin rejection. Bail back to the main
        // window — the caller's onClose will re-mount the sheet there.
        console.warn('[PopoutPortal] unable to open window (popup blocker?)');
        onCloseRef.current();
        return;
      }

      prepareDocument(w, title);
      setPopout(w);
      onWindowOpenedRef.current?.(w);
    };

    void open();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Close detection ───────────────────────────────────────────────
  // The popout window lives outside React; when the user closes it we
  // need to drive a state change back to the parent. Two signals:
  //   1. `beforeunload` on the popout — fires for user-initiated close.
  //   2. Polling `popout.closed` — catches OS-level closes / crashes
  //      where beforeunload didn't fire. 500ms cadence is fine for a
  //      UI flip that only happens once per session.
  useEffect(() => {
    if (!popout) return;
    const handleUnload = () => onCloseRef.current();
    popout.addEventListener('beforeunload', handleUnload);
    const pollId = window.setInterval(() => {
      if (popout.closed) {
        window.clearInterval(pollId);
        onCloseRef.current();
      }
    }, 500);
    return () => {
      popout.removeEventListener('beforeunload', handleUnload);
      window.clearInterval(pollId);
    };
  }, [popout]);

  // ── Close the popout if the main window unmounts us ───────────────
  // Without this, navigating away from / unmounting the parent leaves
  // a zombie popout with stale DOM. Fires both on normal unmount and
  // on main-window close (cleanup runs during `beforeunload` too).
  useEffect(() => {
    if (!popout) return;
    const closeOnMainUnload = () => {
      try { popout.close(); } catch { /* cross-origin or already closed */ }
    };
    window.addEventListener('beforeunload', closeOnMainUnload);
    return () => {
      window.removeEventListener('beforeunload', closeOnMainUnload);
      // Intentional: when the portal unmounts (caller flipped
      // `popped` false, OR React tree tore down), close the window
      // too. If the close was initiated BY the popout itself (user
      // clicked its OS close button), `popout.closed` is already
      // true and `.close()` is a safe no-op.
      try { popout.close(); } catch { /* */ }
    };
  }, [popout]);

  // ── Mirror the main window's <html data-theme="..."> onto the popout
  // so the dark/light CSS vars resolve. Observes the attribute so a
  // toggle in main instantly repaints the popout.
  useEffect(() => {
    if (!popout) return;
    const syncTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) popout.document.documentElement.setAttribute('data-theme', theme);
    };
    syncTheme();
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => obs.disconnect();
  }, [popout]);

  // ── Keep the popout's document.title in sync with the `title` prop.
  // prepareDocument seeds the initial title once on window creation;
  // this effect picks up subsequent prop changes (e.g. the caller
  // appends a gridId suffix, or the active profile's name changes).
  useEffect(() => {
    if (!popout) return;
    try { popout.document.title = title; } catch { /* cross-origin / closed */ }
  }, [popout, title]);

  // ── Auto-resize on Radix-popover open/close ──────────────────────
  // When `expandedHeight` is provided, grow the popout to that
  // height while any Radix popover is visible, then shrink back to
  // the base `height` when the last one closes. Implemented as a
  // MutationObserver on the popout body watching for the standard
  // `[data-radix-popper-content-wrapper]` nodes.
  //
  // The observer is the broad net — Radix Popover, AlertDialog,
  // DropdownMenu, and Tooltip all render through the same wrapper,
  // so this one check covers every menu the toolbar can open.
  useEffect(() => {
    if (!popout || !expandedHeight) return;
    const doc = popout.document;
    if (!doc) return;

    let grown = false;
    const resize = (h: number) => {
      try { popout.resizeTo(width, h); } catch { /* cross-origin / closed / blocked */ }
    };
    const check = () => {
      const openCount = doc.querySelectorAll('[data-radix-popper-content-wrapper]').length;
      if (openCount > 0 && !grown) {
        grown = true;
        resize(expandedHeight);
      } else if (openCount === 0 && grown) {
        grown = false;
        resize(height);
      }
    };

    // Initial check in case a popover was open before this effect
    // attached (unlikely but cheap).
    check();

    const obs = new MutationObserver(check);
    obs.observe(doc.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [popout, expandedHeight, width, height]);

  // ── The mount node inside the popout's body ───────────────────────
  const mountNode = useMemo(() => {
    if (!popout) return null;
    const node = popout.document.createElement('div');
    node.setAttribute('data-popout-root', '');
    node.style.cssText = 'width:100%;height:100vh;display:flex;flex-direction:column;';
    popout.document.body.appendChild(node);
    return node;
  }, [popout]);

  if (!popout || !mountNode) return null;
  // Wrap children in the PortalContainerProvider so every downstream
  // Radix Popover / AlertDialog / Tooltip / Select primitive portals
  // into the POPOUT's body instead of the main window's — otherwise
  // dropdowns would render in the main window (invisible to the
  // user sitting in front of the popout) and keyboard focus would
  // bounce across windows. Native `createPortal` callers read the
  // same context.
  return createPortal(
    <PortalContainerProvider container={popout.document.body}>
      {children}
    </PortalContainerProvider>,
    mountNode,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Prime the popout document: title, viewport meta, base styles that
 * prevent the default body margin, and a clone of every stylesheet
 * currently present in the main document's head.
 */
function prepareDocument(popout: Window, title: string): void {
  const doc = popout.document;
  doc.title = title;

  // Clear any placeholder chrome `window.open` may have dropped in.
  // Some browsers seed the document with an `about:blank` doctype +
  // default `<head>`/`<body>` — we keep those and inject into them.
  if (!doc.querySelector('meta[name="viewport"]')) {
    const meta = doc.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    doc.head.appendChild(meta);
  }

  // Zero out the OS window's default body margin so our mount node
  // fills the viewport edge-to-edge.
  const reset = doc.createElement('style');
  reset.textContent = `
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; }
    body { font-family: inherit; background: var(--background, #0b0e11); color: var(--foreground, #eaecef); }
  `;
  doc.head.appendChild(reset);

  // Clone every stylesheet from the main document so our CSS-in-JS
  // tokens (--bn-*, --ck-*, --primary) + cockpit runtime styles +
  // Tailwind bundle all resolve. We clone, not move, so the main
  // window keeps its styles too.
  for (const el of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    doc.head.appendChild(el.cloneNode(true));
  }
}

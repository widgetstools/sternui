import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ExternalLink } from 'lucide-react';
import { PopoutPortal } from './PopoutPortal';
import { openFinWindowOpener } from '../utils/openFin';

/**
 * Poppable — render-props primitive that hoists a React subtree into
 * a detached OS window via `<PopoutPortal>`, factored out of
 * SettingsSheet so `FormattingToolbar` (and any future caller) can
 * reuse the same behavior.
 *
 * What it wires up:
 *   - `popped: boolean` state and `setPopped` internally.
 *   - `popoutWindowRef` populated via `<PopoutPortal onWindowOpened>`.
 *   - `focusIfPopped(): boolean` imperative handle so the host can
 *     raise a buried popout when the user re-clicks the icon that
 *     toggles the subtree.
 *   - `<PopoutButton />` — a ready-made button that renders a pop-out
 *     icon when inline, nothing when popped (OS window chrome owns
 *     restore in that mode).
 *   - `onClose` callback that fires when the popout closes
 *     (OS close button / beforeunload / main-window unmount).
 *   - OpenFin detection + `alwaysOnTop` plumbing (OpenFin honors
 *     it; browsers silently ignore — web platform has no always-on-
 *     top API by design).
 *
 * Usage:
 * ```tsx
 * <Poppable
 *   ref={toolbarRef}
 *   name={`gc-popout-toolbar-${gridId}`}
 *   title={`Formatting — ${gridId}`}
 *   width={900}
 *   height={60}
 *   alwaysOnTop
 * >
 *   {({ popped, PopoutButton }) => (
 *     <div className={cn('gc-formatting-toolbar', popped && 'is-popped')}>
 *       {!popped && <DragRail />}
 *       <TbItems>...<PopoutButton />...</TbItems>
 *       {!popped && <CloseButton />}
 *     </div>
 *   )}
 * </Poppable>
 * ```
 */

export interface PoppableHandle {
  /**
   * Brings the popout OS window to the front if the subtree is
   * currently popped and the window is alive. Returns `true` when
   * focus was requested, `false` otherwise — callers should then
   * fall back to their inline toggle flow.
   */
  focusIfPopped(): boolean;
}

export interface PoppableRenderProps {
  /** Whether the subtree is currently hosted in an OS window. */
  popped: boolean;
  /**
   * A pre-styled icon button that opens the popout when inline.
   * Renders nothing when popped (the OS window chrome replaces it).
   */
  PopoutButton: React.ComponentType<PopoutButtonProps>;
}

export interface PopoutButtonProps {
  /** Override the default className (`gc-popout-btn`). */
  className?: string;
  /** `title` + ARIA label on the button. */
  title?: string;
  /** `data-testid` for e2e targeting. */
  'data-testid'?: string;
  /** Override the icon (defaults to Lucide ExternalLink @ 12px). */
  icon?: ReactNode;
}

export interface PoppableProps {
  /**
   * Stable OS window name. Named windows are refocused rather than
   * duplicated when the user triggers a second pop-out — pick a
   * gridId-scoped name (e.g. `gc-popout-toolbar-${gridId}`).
   */
  name: string;
  /** Window title (shown in OS taskbar). */
  title: string;
  /** Initial width in CSS px. Default 900. */
  width?: number;
  /** Initial height in CSS px. Default 700. */
  height?: number;
  /**
   * If true, the popout window is pinned above other windows.
   * **OpenFin only** — browsers silently ignore this. Use sparingly:
   * appropriate for dense trader tools (a formatter toolbar a user
   * wants to keep visible while they interact with grids in other
   * windows), not for modal dialogs.
   */
  alwaysOnTop?: boolean;
  /**
   * Fires when the popout closes (OS close button, Cmd-W,
   * beforeunload, or main-window unmount). Optional — the Poppable
   * already re-mounts the subtree inline automatically.
   */
  onClose?: () => void;
  /**
   * Render prop that receives `{ popped, PopoutButton }`. The
   * returned tree is hosted inline OR inside a PopoutPortal
   * depending on `popped`.
   */
  children: (props: PoppableRenderProps) => ReactNode;
}

export const Poppable = forwardRef<PoppableHandle, PoppableProps>(function Poppable(
  { name, title, width = 900, height = 700, alwaysOnTop, onClose, children },
  ref,
) {
  const [popped, setPopped] = useState(false);
  const popoutWindowRef = useRef<Window | null>(null);

  // Clear the window ref when returning to inline mode. The portal
  // closes the actual OS window on unmount; this just keeps the
  // ref-based focus check honest.
  useEffect(() => {
    if (!popped) popoutWindowRef.current = null;
  }, [popped]);

  useImperativeHandle(
    ref,
    () => ({
      focusIfPopped() {
        const win = popoutWindowRef.current;
        if (!popped || !win || win.closed) return false;
        try { win.focus(); } catch { /* cross-origin / closed */ }
        return true;
      },
    }),
    [popped],
  );

  const handlePopoutClose = useCallback(() => {
    setPopped(false);
    onClose?.();
  }, [onClose]);

  // Build a memoised PopoutButton component so consumers can drop it
  // anywhere in their tree without triggering re-mount on each parent
  // render. Closure over setPopped is stable.
  const PopoutButton = useCallback(
    ({ className, title: btnTitle, icon, ...rest }: PopoutButtonProps) => {
      if (popped) return null;
      return (
        <button
          type="button"
          className={className ?? 'gc-popout-btn'}
          onClick={() => setPopped(true)}
          title={btnTitle ?? 'Open in a separate window'}
          aria-label={btnTitle ?? 'Open in a separate window'}
          data-testid={rest['data-testid']}
        >
          {icon ?? <ExternalLink size={12} strokeWidth={2} />}
        </button>
      );
    },
    [popped],
  );

  const renderChildren = children({ popped, PopoutButton });

  if (popped) {
    return (
      <PopoutPortal
        name={name}
        title={title}
        width={width}
        height={height}
        alwaysOnTop={alwaysOnTop}
        onClose={handlePopoutClose}
        openWindow={openFinWindowOpener({ alwaysOnTop })}
        onWindowOpened={(win) => { popoutWindowRef.current = win; }}
      >
        {renderChildren}
      </PopoutPortal>
    );
  }
  // Inline — just render the children in the current React tree.
  // Wrap in a Fragment so we don't force an extra DOM node.
  return <>{renderChildren}</>;
});

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Stern-shell copy of the "Save Tab As…" wiring. Mirrors
 * `@marketsui/openfin-platform/internal/viewTabRename.ts` — the two
 * shells are intentionally parallel implementations and don't import
 * from each other (see CLAUDE.md: openfin-platform-stern stays
 * self-contained), so this file is duplicated by design.
 */

import {
  CustomActionCallerType,
  ViewTabMenuOptionType,
  type CustomActionsMap,
  type OpenViewTabContextMenuPayload,
  type ViewTabCustomActionPayload,
} from '@openfin/workspace-platform';

export const ACTION_RENAME_VIEW_TAB = 'rename-view-tab';
export const RENAME_VIEW_TAB_WINDOW_NAME = 'rename-view-tab';

export function injectRenameMenuItem(
  payload: OpenViewTabContextMenuPayload,
): OpenViewTabContextMenuPayload {
  if (payload.selectedViews.length !== 1) return payload;
  return {
    ...payload,
    template: [
      {
        label: 'Save Tab As…',
        data: {
          type: ViewTabMenuOptionType.Custom,
          action: { id: ACTION_RENAME_VIEW_TAB },
        },
      },
      ...payload.template,
    ],
  };
}

export function createRenameViewTabAction(
  openChildWindow: (
    name: string,
    path: string,
    width: number,
    height: number,
    extraOptions?: Record<string, any>,
  ) => Promise<void>,
): CustomActionsMap {
  return {
    [ACTION_RENAME_VIEW_TAB]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.ViewTabContextMenu) return;
      const payload = e as ViewTabCustomActionPayload;
      const target = payload.selectedViews?.[0];
      if (!target) return;

      const view = fin.View.wrapSync(target);

      // Prefer document.title (what the tabstrip actually shows by
      // default). Skip view.name — it's `internal-generated-view-…`.
      let currentTitle = '';
      try {
        const docTitle = await view.executeJavaScript('document.title');
        if (typeof docTitle === 'string') currentTitle = docTitle;
      } catch { /* best-effort */ }
      if (!currentTitle) {
        try {
          const opts = await view.getOptions();
          const t = opts?.title as string | undefined;
          if (t && !t.startsWith('internal-generated-')) currentTitle = t;
        } catch { /* best-effort */ }
      }

      // Center over the parent browser window so the popout reads as
      // anchored to the tab the user right-clicked.
      const popupW = 380;
      const popupH = 140;
      let position: { defaultLeft?: number; defaultTop?: number; defaultCentered?: boolean } = {
        defaultCentered: true,
      };
      try {
        const parent = fin.Window.wrapSync(payload.windowIdentity);
        const bounds = await parent.getBounds();
        position = {
          defaultCentered: false,
          defaultLeft: Math.round(bounds.left + (bounds.width - popupW) / 2),
          defaultTop: Math.round(bounds.top + (bounds.height - popupH) / 2),
        };
      } catch { /* fall back to screen-centered */ }

      await openChildWindow(
        RENAME_VIEW_TAB_WINDOW_NAME,
        '/rename-view-tab',
        popupW,
        popupH,
        {
          frame: false,
          resizable: false,
          maximizable: false,
          minimizable: false,
          alwaysOnTop: true,
          saveWindowState: false,
          contextMenu: false,
          ...position,
          customData: {
            view: { uuid: target.uuid, name: target.name },
            currentTitle,
          },
        },
      );
    },
  };
}

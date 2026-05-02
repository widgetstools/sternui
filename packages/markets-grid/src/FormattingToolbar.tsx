/**
 * FormattingToolbar — entry component.
 *
 * Thin shell that wires:
 *   1. The unified `useFormatter()` state/actions hook;
 *   2. The shared destructive `<ClearAllDialog />`;
 *   3. The `<Poppable />` host that turns the same component graph
 *      into either an in-grid horizontal toolbar or a popped-out
 *      vertical inspector.
 *
 * The actual rendering lives in `./formatter/` — both surfaces consume
 * the same modules (`ModuleContext`, `ModuleType`, ...) so behaviour
 * and appearance can't drift between them. Everything below is
 * orchestration only.
 */

import { ExternalLink } from 'lucide-react';
import { forwardRef } from 'react';
import {
  Poppable,
  useGridPlatform,
  type PoppableHandle,
} from '@marketsui/core';
import {
  ClearAllDialog,
  FormatterPanel,
  FormatterToolbar,
  useFormatter,
} from './formatter';

// Empty interface kept for the public type; consumers spread it
// when wrapping for design-system extensions.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FormattingToolbarProps {}

/** Imperative handle over FormattingToolbar — thin alias over
 *  PoppableHandle. Lets MarketsGrid raise a buried popout
 *  programmatically before falling back to inline toggle. */
export type FormattingToolbarHandle = PoppableHandle;

export const FormattingToolbar = forwardRef<FormattingToolbarHandle, FormattingToolbarProps>(
  function FormattingToolbar(_props, ref) {
    const platform = useGridPlatform();
    const { state, actions } = useFormatter();

    return (
      <>
        <Poppable
          ref={ref}
          name={`gc-popout-toolbar-${platform.gridId}`}
          title={`Formatting — ${platform.gridId}`}
          // 560×680 is the comfortable default: the header strip
          // (column label + scope toggle + undo/redo + preview pill +
          // module trail) needs ~540px, plus the body shows all five
          // modules without forcing scroll on a typical viewport.
          // The panel is fully responsive — resizing the popout
          // shrinks/grows the layout via flex; this is just the
          // initial size before the user drags the corner.
          width={560}
          height={680}
          // OpenFin honors alwaysOnTop (pins above other windows —
          // the right behaviour for a styling tool returned to often).
          // Browsers silently ignore.
          alwaysOnTop
          // OpenFin drops its OS title bar — the panel renders its own
          // draggable title bar with a close button. Browsers always
          // render full chrome so the title bar stays hidden there.
          frame={false}
        >
          {({ popped, PopoutButton, close }) => {
            // Confirm dialog lives INSIDE the render-prop so its Radix
            // portal lands in the same document as the toolbar that
            // triggered it. When popped, that's the popout window's
            // body (via PopoutPortal's PortalContainerProvider); when
            // inline, it's the main window. Hosting the dialog
            // outside Poppable made the dialog render in the parent
            // window even when the popped panel triggered it — the
            // user sat in the popout watching nothing happen.
            if (popped) {
              return (
                <>
                  <ClearAllDialog state={state} actions={actions} />
                  <FormatterPanel
                    state={state}
                    actions={actions}
                    frameless
                    onClose={close}
                    titleText={`Formatting — ${platform.gridId}`}
                  />
                </>
              );
            }
            return (
              <>
                <ClearAllDialog state={state} actions={actions} />
                <FormatterToolbar
                  state={state}
                  actions={actions}
                  popoutSlot={
                    <PopoutButton
                      className="fx-popout"
                      title="Open toolbar in a separate window"
                      data-testid="formatting-popout-btn"
                      icon={<ExternalLink size={13} strokeWidth={2.25} />}
                    />
                  }
                />
              </>
            );
          }}
        </Poppable>
      </>
    );
  },
);

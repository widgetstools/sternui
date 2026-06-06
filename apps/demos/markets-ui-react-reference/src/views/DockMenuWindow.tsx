/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * DockMenuWindow — the body of the dock's popout menu (Session 15), mounted at
 * `/dock/menu`.
 *
 * `OpenFinDockController.openMenu` opens this as an OpenFin popup window
 * (`showPopupWindow`) anchored under the trigger, passing the serializable
 * {@link DockMenuModel} via `customData`. We render `<DockMenuView>` and, on a
 * leaf click, `fin.me.dispatchPopupResult(...)` the selection — the popup then
 * self-closes and `openMenu` resolves in the dock window.
 *
 * Submenus drill down **in place** (a stack of models + a Back row) rather than
 * opening nested child popups — nested popups would blur-close the parent
 * (`blurBehavior:'close'`). The window resizes itself to its content on every
 * level change.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DockMenuView } from "@starui/dock-react";
import type { DockMenuItem, DockMenuModel } from "@starui/dock-react";

export default function DockMenuWindow() {
  const [stack, setStack] = useState<DockMenuModel[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Pull the menu model + theme from the popup's customData — on mount AND on
  // every `shown`, because the popup window is REUSED (hidden on close, not
  // rebuilt — S16 perf), so it doesn't remount when re-opened with a new model.
  useEffect(() => {
    let alive = true;
    const readModel = () => {
      void fin.me
        .getOptions()
        .then((opts: any) => {
          const model = opts?.customData?.model as DockMenuModel | undefined;
          if (!alive || !model) return;
          try {
            document.documentElement.setAttribute("data-theme", model.theme);
          } catch { /* non-browser */ }
          setStack([model]); // reset to the top level on each open
        })
        .catch((err: unknown) => console.error("[dock-menu] getOptions failed:", err));
    };
    readModel();
    let off = () => {};
    try {
      void fin.me.addListener("shown", readModel);
      off = () => {
        try { void fin.me.removeListener("shown", readModel); } catch { /* */ }
      };
    } catch { /* best-effort */ }
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Resize the popup window to fit the current menu level.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || stack.length === 0) return;
    const w = Math.max(Math.ceil(el.scrollWidth), 180);
    const h = Math.max(Math.ceil(el.scrollHeight), 40);
    try {
      void fin.me.resizeTo(w, h, "top-left");
    } catch { /* best-effort */ }
  }, [stack]);

  const current = stack[stack.length - 1];
  if (!current) return null;

  const onSelect = (item: DockMenuItem) => {
    try {
      void fin.me.dispatchPopupResult({
        result: "clicked",
        data: { id: item.id, actionId: item.actionId, customData: item.customData },
      });
    } catch (err) {
      console.error("[dock-menu] dispatchPopupResult failed:", err);
    }
  };

  const onOpenSubmenu = (item: DockMenuItem) => {
    if (item.children && item.children.length > 0) {
      setStack((s) => [...s, { theme: current.theme, title: item.label, items: item.children! }]);
    }
  };

  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <div ref={ref} className="fixed left-0 top-0" data-theme={current.theme}>
      {stack.length > 1 ? (
        <button
          type="button"
          onClick={back}
          className="flex w-full items-center gap-1 rounded-t-md border border-b-0 border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] px-2 py-1 text-left text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] [-webkit-app-region:no-drag]"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          <span className="truncate">{current.title ?? "Back"}</span>
        </button>
      ) : null}
      <DockMenuView model={current} onSelect={onSelect} onOpenSubmenu={onOpenSubmenu} />
    </div>
  );
}

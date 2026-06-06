import { useEffect } from "react";
import type { RefObject } from "react";
import type { DockController } from "../types";

/**
 * Keep the floating dock window sized to the bar's content (Session 14).
 *
 * The custom dock is a floating, content-sized bar that grows with its buttons
 * (min-width floor in CSS). This hook observes the bar element and reports its
 * measured `offsetWidth` / `offsetHeight` over the `DockController.resizeToContent`
 * seam, where the OpenFin host resizes the frameless window to match.
 *
 * Pure/OpenFin-free: the resize side-effect lives behind the controller. Safe in
 * non-layout environments (jsdom has no `ResizeObserver`) — it reports once from
 * the offset metrics and otherwise no-ops, and does nothing if the controller
 * doesn't implement `resizeToContent`.
 */
export function useDockAutoSize(
  ref: RefObject<HTMLElement | null>,
  controller: DockController,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof controller.resizeToContent !== "function") return;
    const report = () => controller.resizeToContent?.(el.offsetWidth, el.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, controller]);
}

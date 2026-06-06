import { useEffect, useState } from "react";
import type { NotificationController } from "../types";

/**
 * Track the notification-center count through a {@link NotificationController}
 * (Phase 4 / S16). Seeds on mount and updates on every `onCountChanged` fire,
 * so the dock's bell badge stays live. Re-subscribes if the controller changes.
 */
export function useNotificationsCount(controller: NotificationController): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    void controller
      .getNotificationsCount()
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch((err) => console.error("[dock] getNotificationsCount failed:", err));
    const off = controller.onCountChanged((n) => {
      if (alive) setCount(n);
    });
    return () => {
      alive = false;
      off();
    };
  }, [controller]);

  return count;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * DockPromptWindow — a single-line text prompt as an OpenFin popup window
 * (Session 15), mounted at `/dock/prompt`. Used by the dock's workspace
 * switcher for **Save workspace as…**.
 *
 * `OpenFinDockController.promptText` opens this via `showPopupWindow`, passing
 * `{ options, theme }` as `customData`. On submit we `dispatchPopupResult` the
 * trimmed text (or `null` on cancel / empty); the popup self-closes and
 * `promptText` resolves in the dock window. Themed shadcn primitives — no native
 * inputs — so it honours the design system under both schemes.
 */
import { useEffect, useState } from "react";
import { Button, Input, Label } from "@starui/ui";
import type { DockPromptOptions } from "@starui/dock-react";

export default function DockPromptWindow() {
  const [options, setOptions] = useState<DockPromptOptions | null>(null);
  const [value, setValue] = useState("");

  // Read options on mount AND on every `shown` — the prompt window is REUSED
  // (hidden on close, not rebuilt — S16 perf), so it won't remount per open.
  useEffect(() => {
    let alive = true;
    const readOptions = () => {
      void fin.me
        .getOptions()
        .then((opts: any) => {
          if (!alive) return;
          const o = opts?.customData?.options as DockPromptOptions | undefined;
          const theme = opts?.customData?.theme as string | undefined;
          if (theme) {
            try {
              document.documentElement.setAttribute("data-theme", theme);
            } catch { /* non-browser */ }
          }
          if (o) {
            setOptions(o);
            setValue(o.initialValue ?? "");
          }
        })
        .catch((err: unknown) => console.error("[dock-prompt] getOptions failed:", err));
    };
    readOptions();
    let off = () => {};
    try {
      void fin.me.addListener("shown", readOptions);
      off = () => {
        try { void fin.me.removeListener("shown", readOptions); } catch { /* */ }
      };
    } catch { /* best-effort */ }
    return () => {
      alive = false;
      off();
    };
  }, []);

  const dispatch = (data: string | null) => {
    try {
      void fin.me.dispatchPopupResult({ result: "clicked", data });
    } catch (err) {
      console.error("[dock-prompt] dispatchPopupResult failed:", err);
    }
  };

  const submit = () => {
    const trimmed = value.trim();
    dispatch(trimmed ? trimmed : null);
  };

  if (!options) return null;

  return (
    <div className="fixed inset-0 flex flex-col gap-3 bg-[var(--ds-surface-secondary)] p-4 font-[var(--ds-font-sans)] text-[var(--ds-text-primary)]">
      <div className="text-sm font-semibold">{options.title}</div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {options.label ? (
          <Label htmlFor="dock-prompt-input">{options.label}</Label>
        ) : null}
        <Input
          id="dock-prompt-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={options.placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") dispatch(null);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => dispatch(null)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!value.trim()}>
            {options.confirmLabel ?? "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useState, useRef, useEffect } from "react";
import { saveDockConfig, IAB_RELOAD_AFTER_IMPORT } from "@markets/openfin-workspace";
import { UPLOAD_SVG } from "@markets/icons-svg/all-icons";

// ─── Types ───────────────────────────────────────────────────────────

type ImportStatus = "idle" | "success" | "error";

// ─── Design tokens ───────────────────────────────────────────────────
// Maps to the --de-* editor design system from @marketsui/tokens.
// This component always renders in dark mode (utility dialog).
const COLORS = {
  accent:        "var(--de-accent)",
  danger:        "var(--de-danger)",
  success:       "var(--de-success)",
  bg:            "var(--de-bg-deep)",
  surface:       "var(--de-bg-surface)",
  border:        "var(--de-border-strong)",
  textPrimary:   "var(--de-text)",
  textSecondary: "var(--de-text-secondary)",
};

// ─── Helpers ─────────────────────────────────────────────────────────

/** Returns true when the app is running inside an OpenFin window. */
const isInOpenFin = typeof (window as any).fin !== "undefined";

// ─── Component ───────────────────────────────────────────────────────

/**
 * ImportConfig — hosted in a small OpenFin window at /import-config.
 *
 * Lets the user upload a JSON file previously exported via "Export Config".
 * On successful import it reloads the dock and closes this window.
 */
export default function ImportConfig() {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup: clear the auto-close timer if component unmounts early
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── Handle file selection ─────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus("idle");
    setMessage("");

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate: the exported JSON must have an "appConfig" array.
      // This is the shape produced by the "Export Config" action.
      if (!importData.appConfig || !Array.isArray(importData.appConfig)) {
        setStatus("error");
        setMessage("No config data found in this file. Make sure it is a valid config export.");
        return;
      }

      // Import dock config — look for the "dock-config" entry inside appConfig[].
      // Each entry in appConfig is an AppConfigRow with a `configId` and `config` field.
      let dockConfigFound = false;
      for (const row of importData.appConfig) {
        if (row.configId === "dock-config" && row.config) {
          await saveDockConfig(row.config);
          dockConfigFound = true;
        }
      }

      if (!dockConfigFound) {
        setStatus("error");
        setMessage("No dock configuration found in this file.");
        return;
      }

      // Tell the provider window to reload the dock buttons
      if (isInOpenFin) {
        await (window as any).fin.InterApplicationBus.publish(IAB_RELOAD_AFTER_IMPORT, {});
      }

      setStatus("success");
      setMessage("Config imported successfully. The dock has been reloaded.");

      // Auto-close after 1.5 s so the user can read the success message
      closeTimerRef.current = setTimeout(async () => {
        if (isInOpenFin) {
          await (window as any).fin.Window.getCurrentSync().close();
        }
      }, 1500);
    } catch (err) {
      console.error("Import failed:", err);
      setStatus("error");
      setMessage("Failed to read the file. Make sure it is a valid config export.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  // Destructure COLORS for convenience in JSX
  const { accent: accentColor, danger: dangerColor, success: successColor,
          bg, surface, border, textPrimary, textSecondary } = COLORS;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: bg, color: textPrimary,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 24, padding: 32,
    }}>
      {/* Icon */}
      <div style={{
        width: 56, height: 56, borderRadius: "var(--de-radius-lg)",
        background: surface, border: `1px solid ${border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div
          style={{ width: 28, height: 28, color: accentColor }}
          dangerouslySetInnerHTML={{
            __html: UPLOAD_SVG
              .replace(/width="24"/, 'width="28"')
              .replace(/height="24"/, 'height="28"')
              .replace(/stroke-width="2"/, 'stroke-width="1.8"'),
          }}
        />
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: textPrimary }}>
          Import Config
        </h1>
        <p style={{ fontSize: 13, color: textSecondary, margin: "6px 0 0" }}>
          Select a previously exported config JSON file
        </p>
      </div>

      {/* Drop zone / file button */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: "100%", maxWidth: 320,
          border: `1.5px dashed ${fileName ? accentColor : border}`,
          borderRadius: "var(--de-radius-md)", padding: "20px 16px",
          textAlign: "center", cursor: "pointer",
          background: fileName ? `${accentColor}10` : surface,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}10`; }}
        onMouseLeave={e => {
          if (!fileName) {
            e.currentTarget.style.borderColor = border;
            e.currentTarget.style.background = surface;
          }
        }}
      >
        {fileName ? (
          <span style={{ fontSize: 13, color: accentColor, fontWeight: 500 }}>
            {fileName}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: textSecondary }}>
            Click to select a <strong style={{ color: textPrimary }}>.json</strong> file
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Status message */}
      {message && (
        <p style={{
          fontSize: 13, textAlign: "center", margin: 0,
          color: status === "success" ? successColor : dangerColor,
        }}>
          {message}
        </p>
      )}

      {/* Close button */}
      <button
        onClick={async () => {
          if (isInOpenFin) {
            await (window as any).fin.Window.getCurrentSync().close();
          }
        }}
        style={{
          padding: "8px 24px", fontSize: 13, fontWeight: 500,
          border: `1px solid ${border}`, borderRadius: "var(--de-radius-sm)",
          background: "transparent", color: textSecondary,
          cursor: "pointer", transition: "all 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = textSecondary; e.currentTarget.style.color = textPrimary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = textSecondary; }}
      >
        Cancel
      </button>
    </div>
  );
}

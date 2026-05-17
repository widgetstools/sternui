import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (err: Error, info: ErrorInfo) => ReactNode;
}

interface State {
  err: Error | null;
  info: ErrorInfo | null;
}

/**
 * Surface render-time errors instead of returning a blank window.
 *
 * Without this, an uncaught error inside any route view (failed lazy
 * chunk, missing provider context, ConfigManager init crash, etc.)
 * unmounts the React tree and OpenFin shows a blank window with no
 * indication of what went wrong. With this, the error + component
 * stack land in the window so the failure is debuggable without
 * having to attach Chrome DevTools.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null, info: null };

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", err, info);
    this.setState({ err, info });
  }

  render(): ReactNode {
    const { err, info } = this.state;
    if (err) {
      if (this.props.fallback && info) return this.props.fallback(err, info);
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            padding: 24,
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            background: "var(--ds-surface-ground, #1a1a1a)",
            color: "var(--ds-text-primary, #f1f1f1)",
          }}
        >
          <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Render error
          </h1>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {err.message}
          </pre>
          {err.stack && (
            <details open style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>Stack</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", opacity: 0.85 }}>
                {err.stack}
              </pre>
            </details>
          )}
          {info?.componentStack && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>
                Component stack
              </summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", opacity: 0.85 }}>
                {info.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

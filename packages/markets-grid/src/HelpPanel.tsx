/**
 * HelpPanel — compact cheatsheet rendered inside the SettingsSheet. v2
 * shipped a 1259-LOC panel with full format / expression / emoji cookbooks;
 * v3 trims to a pragmatic quick-reference. The full cookbook can layer on
 * top later as a separate doc module.
 */
import { X } from 'lucide-react';

export interface HelpPanelProps {
  onClose?: () => void;
}

export function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <div
      className="gc-sheet"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 16,
        color: 'var(--ck-t0)',
        fontFamily: 'var(--ck-font-sans)',
        fontSize: 12,
        overflowY: 'auto',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600 }}>Help</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            data-testid="help-close"
            style={{
              border: 'none', background: 'transparent',
              color: 'var(--ck-t1)', cursor: 'pointer', padding: 4,
            }}
          >
            <X size={14} />
          </button>
        )}
      </header>

      <Section title="Expression language">
        <p>
          CSP-safe DSL evaluated per-cell. Column references use square brackets
          and match the row's data field name:
        </p>
        <Code>{`[price] * [quantity] / 1000`}</Code>
        <Code>{`IF([side] === "buy", [quantity], -[quantity])`}</Code>
        <p>
          In conditional styling, the cell's own value is also available as
          <code>x</code> (or <code>value</code>), and row data as <code>data</code>:
        </p>
        <Code>{`x > 100 AND data.status === "active"`}</Code>
      </Section>

      <Section title="Value formats">
        <p>
          Every formatter accepts an Excel-style format string (SSF-backed, CSP-safe):
        </p>
        <Code>{`#,##0.00             ->  1,234.57`}</Code>
        <Code>{`$#,##0.00            ->  $1,234.57`}</Code>
        <Code>{`[Green]#,##0.00;[Red]#,##0.00   ->  colour-by-sign`}</Code>
        <Code>{`yyyy-mm-dd           ->  2026-04-17`}</Code>
        <p>
          Fixed-income bond-price formats are available as presets
          (<code>TICK32</code>, <code>TICK32_PLUS</code>, <code>TICK64</code>,
          <code>TICK128</code>, <code>TICK256</code>).
        </p>
      </Section>

      <Section title="Profiles">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Each profile carries every module's state + native grid state.</li>
          <li>
            Auto-save debounces changes (default 300ms) into IndexedDB via the
            <code>DexieAdapter</code> — clicking <strong>Save</strong> flushes
            immediately + captures the current column / sort / filter layout.
          </li>
          <li>
            Profile switches replay saved state through the module lifecycle;
            freshly-created profiles reset the live grid to defaults.
          </li>
        </ul>
      </Section>

      <Section title="Keyboard shortcuts">
        <Kbd label="Escape">Close settings sheet</Kbd>
        <Kbd label="⌘ / Ctrl + Enter">Close settings sheet</Kbd>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h3
        style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.1,
          color: 'var(--ck-t2)',
        }}
      >
        {title}
      </h3>
      <div style={{ lineHeight: 1.55 }}>{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        display: 'block',
        padding: '4px 8px',
        margin: '4px 0',
        background: 'var(--ck-bg)',
        border: '1px solid var(--ck-border)',
        borderRadius: 2,
        fontFamily: 'var(--ck-font-mono)',
        fontSize: 11,
        color: 'var(--ck-t0)',
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </pre>
  );
}

function Kbd({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
      <span
        style={{
          padding: '1px 6px',
          background: 'var(--ck-card)',
          border: '1px solid var(--ck-border-hi)',
          borderRadius: 2,
          fontFamily: 'var(--ck-font-mono)',
          fontSize: 10,
        }}
      >
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

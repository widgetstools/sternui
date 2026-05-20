/**
 * HelpPanel — an in-app cheatsheet for Excel format strings, expression
 * syntax, and trading-specific recipes. Rendered inside the SettingsSheet
 * body when the user clicks the Help icon in the sheet's title bar.
 *
 * Content mirrors `docs/FORMATS_AND_EXPRESSIONS.md` — the markdown doc is
 * the source of truth for anyone browsing on GitHub; this component is
 * the same content rendered inline so users never have to leave the app.
 * Keep the two in lockstep when editing.
 *
 * The shell holds the section rail and content pane. Section bodies and
 * shared presentational primitives live under ./help/ — see
 * `help/sections.ts` for the registry and `help/types.ts` for the shape
 * each section component must satisfy.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
// Static-layout styles — AUDIT i5 partial migration. Button/hover state
// styles stay inline (see HelpPanel.css for rationale).
import './HelpPanel.css';
import { SECTIONS } from './help/sections';
import type { SectionId } from './help/types';

export function HelpPanel() {
  const [active, setActive] = useState<SectionId>('overview');
  const activeSection = SECTIONS.find((s) => s.id === active);
  return (
    <div data-testid="v2-settings-help" className="ds-help-shell">
      {/* Section rail */}
      <nav className="ds-help-nav">
        {SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              data-testid={`help-nav-${s.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                width: '100%',
                padding: '7px 10px',
                border: 'none',
                borderRadius: 2,
                background: on
                  ? 'color-mix(in srgb, var(--ds-accent-positive) 10%, transparent)'
                  : 'transparent',
                color: on ? 'var(--ds-accent-positive)' : 'var(--ds-text-secondary)',
                fontSize: 11,
                fontWeight: on ? 600 : 450,
                letterSpacing: 0.12,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 120ms, color 120ms',
              }}
            >
              <ChevronRight
                size={10}
                strokeWidth={2}
                style={{
                  opacity: on ? 1 : 0.5,
                  transform: on ? 'translateX(0)' : 'translateX(-3px)',
                  transition: 'transform 120ms, opacity 120ms',
                }}
              />
              {s.title}
            </button>
          );
        })}
        <div className="ds-help-nav-footer">
          Full reference:
          <br />
          <code>docs/FORMATS_AND_EXPRESSIONS.md</code>
        </div>
      </nav>

      {/* Content pane */}
      <section
        data-testid="help-content"
        className="ds-help-content pt-5 px-7 pb-8 text-[12.5px] leading-relaxed"
      >
        {activeSection ? <activeSection.Body navigateTo={setActive} /> : null}
      </section>
    </div>
  );
}

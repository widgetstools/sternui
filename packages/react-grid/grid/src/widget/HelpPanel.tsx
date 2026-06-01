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
import { ChromeButton } from '@starui/grid/customizer';
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
            <ChromeButton
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              data-testid={`help-nav-${s.id}`}
              data-active={on ? 'true' : 'false'}
              className="ds-help-nav-btn"
            >
              <ChevronRight
                size={10}
                strokeWidth={2}
                className="ds-help-nav-chevron"
              />
              {s.title}
            </ChromeButton>
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

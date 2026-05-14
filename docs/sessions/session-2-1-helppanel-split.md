# Session 2.1 — Split `HelpPanel.tsx` (content → data)

You are a fresh agent session. Your task is to split `HelpPanel.tsx` (1174 LOC) into a `~150 LOC` modal shell + a data module holding the help content. This session is **independent** of Sessions 1.x — you can run it in parallel with any other session.

## Required reading

- [`packages/react/widgets/markets-grid/src/HelpPanel.tsx`](../../packages/react/widgets/markets-grid/src/HelpPanel.tsx) — the target. Read the whole file first; most of the bulk is hardcoded help content.
- [`CLAUDE.md`](../../CLAUDE.md) — naming rules (PascalCase for components; kebab-case folder names allowed)

## Setup

```sh
git fetch origin main
git checkout -b feat/helppanel-split origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

## Task

Move help-content data (section titles, body markdown, code examples, keyboard-shortcut tables) out of `HelpPanel.tsx` into pure-data modules. The component file becomes a small modal shell that consumes the data.

### Step 1 — Map the content structure

```sh
grep -n "^\s*{ title:\|sectionId:\|h1:\|h2:" packages/react/widgets/markets-grid/src/HelpPanel.tsx | head -30
# Find the shape the existing content uses. Probably an array of section objects.
```

Likely shapes (adapt to what you find):
- An array of `{ id, title, body, examples? }` literals inline in the component
- Multiple inline arrays per "tab" (Quick Start, Keyboard Shortcuts, FAQ, etc.)
- Inline JSX `<KeyboardShortcut keys={...}/>` calls — those are renderers, not data

### Step 2 — Define the data type

Create `packages/react/widgets/markets-grid/src/help/types.ts`:

```ts
/**
 * Help content data types.
 *
 * These types describe the shape of the static content that ships in
 * `sections.ts`. The `HelpPanel.tsx` modal renders one section at a time.
 *
 * Keep these pure data: no JSX, no React imports, no functions. The
 * renderer in HelpPanel.tsx interprets the data; if a section needs
 * a richer render (custom component, interactive demo), put a discriminated
 * union variant here and a switch in the renderer.
 */

export interface HelpExample {
  readonly lang: 'tsx' | 'ts' | 'sh' | 'json';
  readonly code: string;
  /** Optional caption rendered below the code block. */
  readonly caption?: string;
}

export interface HelpShortcut {
  /** Display keys, e.g. ['Ctrl', 'Shift', 'F']. */
  readonly keys: readonly string[];
  /** What pressing this combo does. */
  readonly description: string;
}

export type HelpSection =
  | {
      readonly kind: 'prose';
      readonly id: string;
      readonly title: string;
      /** Markdown-flavoured body; the renderer splits paragraphs on blank lines. */
      readonly body: string;
      readonly examples?: readonly HelpExample[];
    }
  | {
      readonly kind: 'shortcuts';
      readonly id: string;
      readonly title: string;
      readonly shortcuts: readonly HelpShortcut[];
    };
```

Adapt the discriminated-union variants to whatever section types the existing component actually renders. If there's only one variant, simplify.

### Step 3 — Move the content data

Create `packages/react/widgets/markets-grid/src/help/sections.ts`:

```ts
/**
 * Help content for the MarketsGrid HelpPanel.
 *
 * Pure data — no JSX, no React. The HelpPanel renderer interprets
 * each section by its `kind` discriminant.
 *
 * Adding a section: append to the array. The renderer respects
 * the array order in its navigation sidebar.
 *
 * Editing content: just edit the strings. No code change needed.
 */

import type { HelpSection } from './types.js';

export const SECTIONS: readonly HelpSection[] = [
  // Copy data verbatim from HelpPanel.tsx. Preserve every word —
  // no rewording during this refactor.
  {
    kind: 'prose',
    id: 'quick-start',
    title: 'Quick start',
    body: '...',
  },
  // ...
];
```

**Rule**: preserve every help-text string verbatim. This refactor is about **structure**, not **content**. If you spot a typo, leave it for a separate doc PR.

### Step 4 — Reduce `HelpPanel.tsx` to a shell

Rewrite `HelpPanel.tsx` to:
- Import `SECTIONS` from `./help/sections.js`
- Render a modal frame (use existing modal primitives from `@starui/ui` — don't invent a new one)
- Render section navigation (the existing sidebar or tab strip)
- Render the active section's body by switching on `section.kind`
- Preserve any existing search functionality (if it exists; check the file first)

Target size: **150 LOC**.

Sketch:

```tsx
/**
 * HelpPanel — modal shell that renders sections from ./help/sections.ts.
 *
 * The renderer switches on `section.kind` for each variant. Content
 * lives in the data module; this file is purely presentational.
 */

import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@starui/ui'; // or whatever the existing import is
import { SECTIONS } from './help/sections.js';
import type { HelpSection } from './help/types.js';

export interface HelpPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function HelpPanel({ open, onClose }: HelpPanelProps) {
  const [activeId, setActiveId] = useState(SECTIONS[0]?.id ?? '');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return SECTIONS;
    const needle = search.toLowerCase();
    return SECTIONS.filter((s) => s.title.toLowerCase().includes(needle));
  }, [search]);

  const active = SECTIONS.find((s) => s.id === activeId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        {/* sidebar */}
        {/* body — render via renderSection(active) */}
      </DialogContent>
    </Dialog>
  );
}

function renderSection(section: HelpSection) {
  switch (section.kind) {
    case 'prose':
      return <ProseSection section={section} />;
    case 'shortcuts':
      return <ShortcutsSection section={section} />;
  }
}

// 30-50 LOC of small subcomponents (ProseSection, ShortcutsSection)
// or move them to ./help/render.tsx if they grow.
```

### Step 5 — Tests

Create `packages/react/widgets/markets-grid/src/HelpPanel.test.tsx` (or expand an existing file):

```tsx
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { HelpPanel } from './HelpPanel';
import { SECTIONS } from './help/sections';

afterEach(() => cleanup());

describe('HelpPanel', () => {
  it('renders with all sections in the sidebar', () => {
    render(<HelpPanel open onClose={() => {}} />);
    for (const section of SECTIONS) {
      expect(screen.getByText(section.title)).toBeTruthy();
    }
  });

  it('renders the first section by default', () => {
    render(<HelpPanel open onClose={() => {}} />);
    // Assert the first section's title is the active heading.
    // Adapt the selector to whatever the implementation uses.
  });

  it('switches the displayed body when a section is clicked', () => {
    render(<HelpPanel open onClose={() => {}} />);
    const target = SECTIONS[1];
    if (!target) return; // only one section
    fireEvent.click(screen.getByText(target.title));
    // Assert the body changed.
  });

  // Only add this test if search exists in the original component:
  it('filters sections by search input', () => {
    render(<HelpPanel open onClose={() => {}} />);
    // Type into the search box, assert section list shrinks.
  });
});
```

## Verification

```sh
# 1. Targeted tests
npm test -w @starui/markets-grid -- --run HelpPanel

# 2. Full package
npm test -w @starui/markets-grid

# 3. Apps typecheck
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 4. E2E regression
npx playwright test e2e/v2-two-grid-isolation.spec.ts e2e/design-system-smoke.spec.ts

# 5. File size
wc -l packages/react/widgets/markets-grid/src/HelpPanel.tsx
# Expected: ~150 (was 1174)

ls packages/react/widgets/markets-grid/src/help/
# Expected: types.ts, sections.ts

# 6. Final gate
npx turbo typecheck build test
# Expected: all green
```

## Manual smoke

Find the HelpPanel trigger in the codebase:

```sh
grep -rn "HelpPanel\|setHelpOpen\|helpOpen" packages/react/widgets/markets-grid/src apps 2>/dev/null | grep -v node_modules | grep -v dist | grep -v ".test." | head -5
```

Run the dev server + click the trigger:

```sh
npm run dev -w @starui/markets-ui-react-reference
# Open http://localhost:5174, navigate to a blotter, find and click the Help button
```

Click through every section. Compare against pre-refactor screenshots if available; otherwise verify each section renders, search filters work, code examples render with syntax (or plain), keyboard shortcuts display correctly.

## Commit, push, open PR

```sh
git add packages/react/widgets/markets-grid/src/HelpPanel.tsx \
        packages/react/widgets/markets-grid/src/HelpPanel.test.tsx \
        packages/react/widgets/markets-grid/src/help/
git status --short
git commit -m "$(cat <<'EOF'
refactor(markets-grid): split HelpPanel — content to data, JSX to shell

Moves all help content (section titles, body text, code examples,
keyboard shortcuts) out of HelpPanel.tsx (1174 LOC) into pure-data
modules:
  - help/types.ts — HelpSection discriminated union
  - help/sections.ts — the data array

HelpPanel.tsx shrinks to ~XXX LOC: modal shell, navigation sidebar,
section renderer that switches on `kind`. No content changes —
every word preserved verbatim from the original.

Tests cover sidebar contents, default section, click-to-switch, and
search filtering (if applicable).

Verification:
  - File sizes: HelpPanel.tsx 1174 → XXX, help/sections.ts YYY
  - npm test -w @starui/markets-grid: green
  - Final gate: npx turbo typecheck build test — green

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/helppanel-split
gh pr create --title "refactor(markets-grid): split HelpPanel content from shell" --body "<see commit message>"
```

Report the PR URL.

## Out of scope

- Rewording any help text. This refactor is structural only.
- Adding new help sections. Separate PR.
- Adding a Markdown renderer dependency (e.g., `react-markdown`). If sections are pre-rendered HTML strings today, leave them as strings; flag in the PR description for follow-up.
- Touching `FiltersToolbar.tsx` or `FormatterPicker.tsx`.
- Changing the trigger UI.
- Adding new dependencies.

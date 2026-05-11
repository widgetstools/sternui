import { describe, expect, it } from 'vitest';
import {
  ensureExpressionEditorMonacoStyle,
  getDocumentThemeClass,
  getMonacoOverflowHost,
  getPortalDomContext,
  hasVisibleSuggestion,
} from './editorDom';

describe('ExpressionEditor editorDom', () => {
  it('creates Monaco overflow hosts in the editor document, not the main document', () => {
    const popoutDoc = document.implementation.createHTMLDocument('popout');
    popoutDoc.documentElement.setAttribute('data-theme', 'dark');

    const mainHost = getMonacoOverflowHost(document);
    const popoutHost = getMonacoOverflowHost(popoutDoc);

    expect(mainHost).toBeTruthy();
    expect(popoutHost).toBeTruthy();
    expect(popoutHost).not.toBe(mainHost);
    expect(popoutHost?.ownerDocument).toBe(popoutDoc);
    expect(popoutDoc.body.contains(popoutHost!)).toBe(true);
    expect(document.body.contains(popoutHost!)).toBe(false);
    expect(popoutHost?.classList.contains('vs-dark')).toBe(true);

    popoutDoc.documentElement.setAttribute('data-theme', 'light');
    expect(getMonacoOverflowHost(popoutDoc)).toBe(popoutHost);
    expect(popoutHost?.classList.contains('vs')).toBe(true);
    expect(popoutHost?.classList.contains('vs-dark')).toBe(false);
  });

  it('installs critical Monaco styles into the editor document only once', () => {
    const popoutDoc = document.implementation.createHTMLDocument('popout');

    ensureExpressionEditorMonacoStyle(popoutDoc);
    ensureExpressionEditorMonacoStyle(popoutDoc);

    const styles = popoutDoc.head.querySelectorAll('#ds-expression-editor-monaco-style');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('.monaco-editor .cursor');
    expect(styles[0]?.textContent).toContain('ds-expression-caret-blink');
  });

  it('derives document/window context from a portal container', () => {
    const popoutDoc = document.implementation.createHTMLDocument('popout');
    const context = getPortalDomContext(popoutDoc.body);

    expect(context.document).toBe(popoutDoc);
    expect(context.window).toBe(popoutDoc.defaultView ?? window);
  });

  it('maps document theme attributes to Monaco theme classes', () => {
    const popoutDoc = document.implementation.createHTMLDocument('popout');

    expect(getDocumentThemeClass(popoutDoc)).toBe('vs');
    popoutDoc.documentElement.setAttribute('data-theme', 'dark');
    expect(getDocumentThemeClass(popoutDoc)).toBe('vs-dark');
  });

  it('detects whether Monaco suggestions are visible in the editor document', () => {
    const popoutDoc = document.implementation.createHTMLDocument('popout');
    expect(hasVisibleSuggestion(popoutDoc)).toBe(false);

    const widget = popoutDoc.createElement('div');
    widget.className = 'suggest-widget';
    const row = popoutDoc.createElement('div');
    row.className = 'monaco-list-row focused';
    widget.appendChild(row);
    popoutDoc.body.appendChild(widget);

    expect(hasVisibleSuggestion(popoutDoc)).toBe(true);

    widget.style.display = 'none';
    expect(hasVisibleSuggestion(popoutDoc)).toBe(false);
  });
});

export interface EditorDomContext {
  document: Document;
  window: Window;
}

const monacoOverflowHosts = new WeakMap<Document, HTMLDivElement>();
const expressionEditorStyleId = 'ds-expression-editor-monaco-style';

export function getElementDomContext(element: HTMLElement | null): EditorDomContext | null {
  if (!element) return null;
  const doc = element.ownerDocument;
  return {
    document: doc,
    window: doc.defaultView ?? window,
  };
}

export function getPortalDomContext(container: HTMLElement | null): EditorDomContext {
  const doc = container?.ownerDocument ?? document;
  return {
    document: doc,
    window: doc.defaultView ?? window,
  };
}

export function getDocumentThemeClass(doc: Document): 'vs-dark' | 'vs' {
  return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs';
}

export function getExpressionTheme(doc: Document): 'gcExpressionDark' | 'gcExpressionLight' {
  return doc.documentElement.getAttribute('data-theme') === 'dark'
    ? 'gcExpressionDark'
    : 'gcExpressionLight';
}

export function getMonacoOverflowHost(doc: Document): HTMLElement | undefined {
  if (!doc.body) return undefined;
  ensureExpressionEditorMonacoStyle(doc);

  const themeClass = getDocumentThemeClass(doc);
  const cached = monacoOverflowHosts.get(doc);
  if (cached?.isConnected) {
    cached.classList.remove('vs-dark', 'vs');
    cached.classList.add(themeClass);
    return cached;
  }

  const host = doc.createElement('div');
  // `monaco-editor` is mandatory: Monaco widget CSS is scoped under it.
  host.className = `monaco-editor ${themeClass} monaco-editor-overflow-widgets-host`;
  host.setAttribute('data-ds-monaco-overflow', '');
  host.style.position = 'absolute';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.zIndex = '2147483646';
  doc.body.appendChild(host);
  monacoOverflowHosts.set(doc, host);
  return host;
}

export function ensurePlaceholderStyle(doc: Document): void {
  if (doc.getElementById('ds-expr-placeholder-style')) return;

  const style = doc.createElement('style');
  style.id = 'ds-expr-placeholder-style';
  style.textContent = `.ds-expr-placeholder { color: var(--ds-text-faint); font-style: italic; pointer-events: none; }`;
  doc.head.appendChild(style);
}

export function ensureExpressionEditorMonacoStyle(doc: Document): void {
  if (doc.getElementById(expressionEditorStyleId)) return;

  const style = doc.createElement('style');
  style.id = expressionEditorStyleId;
  style.textContent = `
[data-ds-monaco-overflow] {
  background: var(--ds-surface-primary);
  color: var(--ds-text-primary);
  font-family: var(--ds-font-sans);
}

.monaco-editor .cursor {
  visibility: visible !important;
  animation: ds-expression-caret-blink 1s steps(1, end) infinite;
}

@keyframes ds-expression-caret-blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.monaco-editor .suggest-widget,
.monaco-editor .parameter-hints-widget,
.monaco-editor .monaco-hover {
  background: var(--ds-surface-primary) !important;
  border: 1px solid var(--ds-border-primary) !important;
  border-radius: var(--ds-radius-sm) !important;
  color: var(--ds-text-primary) !important;
  box-shadow: var(--ds-elevation-overlay) !important;
}

.monaco-editor .suggest-widget .monaco-list-row.focused {
  background: var(--ds-overlay-info-soft) !important;
  color: var(--ds-text-primary) !important;
  border-left: 2px solid var(--ds-accent-info) !important;
}`;
  doc.head.appendChild(style);
}

export function hasVisibleSuggestion(doc: Document): boolean {
  const widget = doc.querySelector<HTMLElement>('.suggest-widget');
  if (!widget) return false;
  if (widget.style.display === 'none' || widget.style.visibility === 'hidden') return false;
  const style = doc.defaultView?.getComputedStyle(widget);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return widget.querySelector('.monaco-list-row') !== null;
}

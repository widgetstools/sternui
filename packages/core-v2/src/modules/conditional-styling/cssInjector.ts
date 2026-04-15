/**
 * Per-grid <style> tag manager.
 *
 * v1 hung this off `ModuleContext.cssInjector`. v2 dropped it from the core
 * context (single-responsibility — the core orchestrates state, not styling),
 * so this module owns one. Each grid instance gets its own <style>; rule
 * upserts / removes are by stable key so re-applying a rule with new CSS
 * just replaces the old text.
 *
 * Server-rendered envs (no `document`) are tolerated: every method becomes
 * a no-op, which lets the module register cleanly during SSR or in tests
 * that don't need real CSS.
 */
export class CssInjector {
  private styleEl: HTMLStyleElement | null = null;
  private rules = new Map<string, string>();

  constructor(private readonly gridId: string) {}

  private ensureStyleEl(): HTMLStyleElement | null {
    if (typeof document === 'undefined') return null;
    if (this.styleEl) return this.styleEl;
    const el = document.createElement('style');
    el.setAttribute('data-gc-grid', this.gridId);
    el.setAttribute('data-gc-module', 'conditional-styling');
    document.head.appendChild(el);
    this.styleEl = el;
    return el;
  }

  private flush(): void {
    const el = this.ensureStyleEl();
    if (!el) return;
    el.textContent = Array.from(this.rules.values()).join('\n');
  }

  addRule(ruleId: string, cssText: string): void {
    this.rules.set(ruleId, cssText);
    this.flush();
  }

  removeRule(ruleId: string): void {
    if (this.rules.delete(ruleId)) this.flush();
  }

  clear(): void {
    if (this.rules.size === 0) return;
    this.rules.clear();
    this.flush();
  }

  destroy(): void {
    this.rules.clear();
    if (this.styleEl?.parentNode) this.styleEl.parentNode.removeChild(this.styleEl);
    this.styleEl = null;
  }
}

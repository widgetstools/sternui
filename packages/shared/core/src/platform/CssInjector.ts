import type { CssHandle } from './types';

/**
 * Per-module <style> tag with keyed rule upserts.
 *
 * Instances are owned by `ResourceScope` — one per (gridId, moduleId). The
 * ResourceScope's `dispose()` tears them all down in a single pass.
 *
 * SSR-safe: every method is a no-op when `document` is undefined.
 */
export class CssInjector implements CssHandle {
  private styleEl: HTMLStyleElement | null = null;
  private rules = new Map<string, string>();

  constructor(
    private readonly gridId: string,
    private readonly moduleId: string,
  ) {}

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

  private ensure(): HTMLStyleElement | null {
    if (typeof document === 'undefined') return null;
    if (this.styleEl) return this.styleEl;
    const el = document.createElement('style');
    el.setAttribute('data-gc-grid', this.gridId);
    el.setAttribute('data-gc-module', this.moduleId);
    document.head.appendChild(el);
    this.styleEl = el;
    return el;
  }

  private flush(): void {
    const el = this.ensure();
    if (!el) return;
    el.textContent = Array.from(this.rules.values()).join('\n');
  }
}

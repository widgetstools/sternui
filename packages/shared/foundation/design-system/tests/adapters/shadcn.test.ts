import { describe, it, expect } from 'vitest';
import { generateUnifiedCSS } from '../../src/adapters/shadcn';

describe('generateUnifiedCSS', () => {
  const css = generateUnifiedCSS();

  it('contains @layer base', () => {
    expect(css).toMatch(/@layer base \{/);
  });

  it('contains :root, [data-theme="dark"] block', () => {
    expect(css).toMatch(/:root,\s*\[data-theme="dark"\]\s*\{/);
  });

  it('contains [data-theme="light"] block', () => {
    expect(css).toMatch(/\[data-theme="light"\]\s*\{/);
  });

  it('contains [data-theme="dark"][data-cvd="on"] CVD override', () => {
    expect(css).toMatch(/\[data-theme="dark"\]\[data-cvd="on"\]\s*\{/);
  });

  it('contains [data-theme="light"][data-cvd="on"] CVD override', () => {
    expect(css).toMatch(/\[data-theme="light"\]\[data-cvd="on"\]\s*\{/);
  });

  it('emits --ds-* source vars (e.g. --ds-surface-ground)', () => {
    expect(css).toMatch(/--ds-surface-ground:\s*#/);
  });

  it('emits shadcn HSL aliases (e.g. --background)', () => {
    expect(css).toMatch(/--background:\s*\d+\s+\d+%\s+\d+%/);
  });

  it('emits PrimeNG --p-* aliases (e.g. --p-primary-color)', () => {
    expect(css).toMatch(/--p-primary-color/);
  });

  it('emits surface scale --surface-50..950 (HSL channels)', () => {
    expect(css).toMatch(/--surface-50:\s*\d+\s+\d+%\s+\d+%/);
    expect(css).toMatch(/--surface-950:\s*\d+\s+\d+%\s+\d+%/);
  });

  it('matches snapshot', () => {
    expect(css).toMatchSnapshot();
  });
});

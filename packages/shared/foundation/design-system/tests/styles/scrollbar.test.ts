import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../src/styles/scrollbar.css'),
  'utf8',
);

describe('scrollbar.css', () => {
  it('defines exactly one .ds-scrollbar utility (and its pseudo-elements)', () => {
    // Top-level (non-pseudo) class selectors
    const matches = css.match(/^\.ds-scrollbar\s*\{/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('uses color-mix against --ds-text-primary for theme-awareness', () => {
    expect(css).toMatch(/color-mix\(in srgb, var\(--ds-text-primary\)/);
  });

  it('does NOT define a hidden-scrollbar utility', () => {
    expect(css).not.toMatch(/scrollbar-width:\s*none/);
  });

  it('uses minimalist 10px width with 2px transparent border for thumb thickness', () => {
    expect(css).toMatch(/width:\s*10px/);
    expect(css).toMatch(/border:\s*2px\s+solid\s+transparent/);
  });
});

import { describe, it, expect } from 'vitest';
import { dark, light } from '../../src/tokens/semantic';
import { contrastRatio } from '../../src/internal/wcag';

const schemes = [['dark', dark], ['light', light]] as const;

describe('Chroma Desk contrast audit', () => {
  for (const [name, s] of schemes) {
    describe(name, () => {
      it('text.primary on surface.ground ≥ 7 (AAA body)', () => {
        expect(contrastRatio(s.text.primary, s.surface.ground)).toBeGreaterThanOrEqual(7);
      });

      it('text.secondary on surface.ground ≥ 4.5 (AA chrome)', () => {
        expect(contrastRatio(s.text.secondary, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('text.muted on surface.ground ≥ 4 (AA approx)', () => {
        expect(contrastRatio(s.text.muted, s.surface.ground)).toBeGreaterThanOrEqual(4);
      });

      it('accent.info on surface.ground ≥ 4.5 (AA links)', () => {
        expect(contrastRatio(s.accent.info, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent.positive on surface.ground ≥ 4.5 (AA gain)', () => {
        expect(contrastRatio(s.accent.positive, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent.negative on surface.ground ≥ 4.5 (AA loss)', () => {
        expect(contrastRatio(s.accent.negative, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent.warning on surface.ground ≥ 4.5 (AA caution)', () => {
        expect(contrastRatio(s.accent.warning, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

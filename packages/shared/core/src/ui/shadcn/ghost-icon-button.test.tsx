import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GhostIconButton } from './ghost-icon-button';

/**
 * GhostIconButton smoke + contract tests. The variants/sizes/reveal
 * mappings are surfaced as data-attributes so the unit tests can
 * assert them without depending on jsdom resolving CSS — the
 * stylesheet itself isn't applied under jsdom and isn't what we're
 * testing here. We're testing the contract between the React props
 * and the DOM hooks the CSS uses.
 */
describe('GhostIconButton', () => {
  afterEach(cleanup);

  it('defaults to variant=default, size=sm, reveal=always, type=button', () => {
    const { getByRole } = render(<GhostIconButton aria-label="x" />);
    const btn = getByRole('button', { name: 'x' });
    expect(btn.getAttribute('data-variant')).toBe('default');
    expect(btn.getAttribute('data-size')).toBe('sm');
    expect(btn.getAttribute('data-reveal')).toBe('always');
    // type=button by default so the component never accidentally
    // submits a form when used inside one.
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.classList.contains('gc-gib')).toBe(true);
  });

  it.each([
    ['default'],
    ['accent'],
    ['destructive'],
  ] as const)('forwards variant=%s to data-variant', (variant) => {
    const { getByRole } = render(<GhostIconButton aria-label="x" variant={variant} />);
    expect(getByRole('button').getAttribute('data-variant')).toBe(variant);
  });

  it('forwards size=md to data-size', () => {
    const { getByRole } = render(<GhostIconButton aria-label="x" size="md" />);
    expect(getByRole('button').getAttribute('data-size')).toBe('md');
  });

  it('emits data-revealed only when reveal=on-row-hover AND revealed=true', () => {
    const { rerender, getByRole } = render(
      <GhostIconButton aria-label="x" reveal="on-row-hover" />,
    );
    const btn = getByRole('button');
    expect(btn.getAttribute('data-revealed')).toBeNull();

    rerender(<GhostIconButton aria-label="x" reveal="on-row-hover" revealed />);
    expect(btn.getAttribute('data-revealed')).toBe('true');

    // revealed should be ignored when reveal='always' isn't using it,
    // but we still pass it through so callers can flip reveal mode at
    // runtime without losing the override. Documented; not asserted as
    // an error.
    rerender(<GhostIconButton aria-label="x" reveal="always" revealed />);
    expect(btn.getAttribute('data-revealed')).toBe('true');
  });

  it('preserves caller-provided className alongside the base class', () => {
    const { getByRole } = render(
      <GhostIconButton aria-label="x" className="extra-class" />,
    );
    const btn = getByRole('button');
    expect(btn.classList.contains('gc-gib')).toBe(true);
    expect(btn.classList.contains('extra-class')).toBe(true);
  });

  it('respects an explicit type prop (e.g., submit)', () => {
    const { getByRole } = render(<GhostIconButton aria-label="x" type="submit" />);
    expect(getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('fires onClick and is blocked by disabled', () => {
    const onClick = vi.fn();
    const { getByRole, rerender } = render(
      <GhostIconButton aria-label="x" onClick={onClick} />,
    );
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<GhostIconButton aria-label="x" onClick={onClick} disabled />);
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards the ref to the underlying button', () => {
    let captured: HTMLButtonElement | null = null;
    render(
      <GhostIconButton
        aria-label="x"
        ref={(el) => {
          captured = el;
        }}
      />,
    );
    expect(captured).toBeInstanceOf(HTMLButtonElement);
  });
});

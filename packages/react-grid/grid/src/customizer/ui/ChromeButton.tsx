import { forwardRef, type ComponentProps } from 'react';
import { Button, cn } from '@starui/ui';

/**
 * shadcn `Button` with Tailwind resets so legacy `.ds-*` / `.fx-*` /
 * cockpit CSS classes keep full control of dimensions, padding, and hover
 * fills. Use wherever a chrome stylesheet already defines the look.
 */
export type ChromeButtonProps = ComponentProps<typeof Button>;

export const CHROME_BUTTON_RESET =
  'min-h-0 w-auto max-w-none shadow-none ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0';

export const ChromeButton = forwardRef<HTMLButtonElement, ChromeButtonProps>(
  function ChromeButton({ className, variant = 'chrome', size = 'chrome', ...rest }, ref) {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(CHROME_BUTTON_RESET, className)}
        {...rest}
      />
    );
  },
);

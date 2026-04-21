/**
 * AlertDialog — built on @radix-ui/react-alert-dialog.
 *
 * Modal confirmation prompt with focus trap, dismissible via Escape, and
 * portal-rendered over the page. Use for *destructive* confirmations
 * (deleting a profile, discarding unsaved changes) where the user must
 * take an explicit action — AlertDialog is deliberately harder to dismiss
 * than a plain Dialog.
 *
 * Visual language matches the rest of the app's shadcn primitives:
 *   --gc-surface / --gc-border / --gc-text with dark hex fallbacks so it
 *   still looks right when rendered into the document root (outside the
 *   gc-sheet scope).
 *
 * Usage:
 *   <AlertDialog>
 *     <AlertDialogTrigger asChild>
 *       <button>Delete</button>
 *     </AlertDialogTrigger>
 *     <AlertDialogContent>
 *       <AlertDialogHeader>
 *         <AlertDialogTitle>Delete profile?</AlertDialogTitle>
 *         <AlertDialogDescription>
 *           "Trading Desk" will be permanently removed.
 *         </AlertDialogDescription>
 *       </AlertDialogHeader>
 *       <AlertDialogFooter>
 *         <AlertDialogCancel>Cancel</AlertDialogCancel>
 *         <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
 *       </AlertDialogFooter>
 *     </AlertDialogContent>
 *   </AlertDialog>
 */

import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from './utils';
import { usePortalContainer } from '../PortalContainer';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[2147483646] bg-black/60 backdrop-blur-[2px]',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => {
  // Route the Radix portal into the PortalContainer context — when
  // the settings sheet is popped into a separate OS window, the
  // dialog has to render IN that window, not the main document.body.
  const portalContainer = usePortalContainer();
  return (
  <AlertDialogPortal container={portalContainer ?? undefined}>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      data-gc-settings=""
      className={cn(
        // Positioning — centered, portal-rendered
        'fixed left-1/2 top-1/2 z-[2147483647] w-[min(420px,calc(100vw-24px))]',
        '-translate-x-1/2 -translate-y-1/2',
        // Theme
        'bg-[var(--gc-surface,#161a1e)] text-[var(--gc-text,#eaecef)]',
        'border border-[var(--gc-border,#313944)] rounded-lg',
        'shadow-[0_24px_56px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)_inset]',
        // Layout + type
        'grid gap-4 p-5',
        'font-[var(--gc-font,"Geist","Inter",-apple-system,sans-serif)]',
        // Animations
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-1.5 text-left', className)}
    {...props}
  />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-row justify-end gap-2', className)}
    {...props}
  />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-[13px] font-semibold tracking-[0.1px] text-[var(--gc-text,#eaecef)]',
      className,
    )}
    {...props}
  />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn(
      'text-[11px] leading-[1.5] text-[var(--gc-muted,#8b93a1)]',
      className,
    )}
    {...props}
  />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & {
    variant?: 'primary' | 'destructive';
  }
>(({ className, variant = 'primary', ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(
      'inline-flex h-[30px] items-center justify-center rounded-md px-3',
      'text-[11px] font-semibold tracking-[0.2px]',
      'transition-colors duration-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'focus-visible:ring-offset-[var(--gc-surface,#161a1e)]',
      'disabled:pointer-events-none disabled:opacity-50',
      variant === 'destructive'
        ? 'bg-[var(--destructive,#ef4444)] text-white hover:bg-[color-mix(in_srgb,var(--destructive,#ef4444)_90%,#000)] focus-visible:ring-[var(--destructive,#ef4444)]'
        : 'bg-[var(--primary,#14b8a6)] text-[#0b0e11] hover:bg-[color-mix(in_srgb,var(--primary,#14b8a6)_90%,#000)] focus-visible:ring-[var(--primary,#14b8a6)]',
      className,
    )}
    {...props}
  />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      'inline-flex h-[30px] items-center justify-center rounded-md px-3',
      'text-[11px] font-medium tracking-[0.1px]',
      'bg-transparent text-[var(--gc-text,#eaecef)]',
      'border border-[var(--gc-border,#313944)]',
      'transition-colors duration-100',
      'hover:bg-[color-mix(in_srgb,var(--gc-text,#eaecef)_6%,transparent)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'focus-visible:ring-offset-[var(--gc-surface,#161a1e)] focus-visible:ring-[var(--gc-border,#313944)]',
      'disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};

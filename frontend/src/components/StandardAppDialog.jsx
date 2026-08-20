import * as React from 'react';
import { X } from 'lucide-react';
import {
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sm: 'max-w-[min(100vw-1.25rem,24rem)]',
  md: 'max-w-[min(100vw-1.25rem,28rem)]',
  lg: 'max-w-[min(100vw-1.25rem,42rem)]',
  xl: 'max-w-[min(100vw-1.25rem,56rem)]',
};

const SHELL_CLASS =
  'flex min-h-0 flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-panel';

export const standardFormLabelClass =
  'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground';

export const standardTextInputClass =
  'h-11 rounded-lg border-input bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/30 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/20';

export const standardSelectClass =
  'flex h-11 w-full appearance-none rounded-lg border border-input bg-card px-3.5 py-2 pr-10 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/20';

export const standardTextareaClass =
  'min-h-[5.5rem] w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-sm leading-relaxed text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/20';

export const standardCancelButtonClass =
  'h-11 rounded-lg border border-input bg-card font-semibold text-foreground shadow-sm transition-colors hover:bg-muted active:scale-[0.98]';

export const standardPrimaryButtonClass =
  'h-11 rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.98]';

export const standardDialogBodyScrollClass =
  'space-y-5 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent';

export const StandardAppDialogContent = React.forwardRef(
  ({ children, className, size = 'md', ...props }, ref) => (
    <DialogContent
      ref={ref}
      hideClose
      className={cn(SHELL_CLASS, SIZE_CLASS[size] || SIZE_CLASS.md, className)}
      {...props}
    >
      {children}
    </DialogContent>
  )
);
StandardAppDialogContent.displayName = 'StandardAppDialogContent';

/**
 * @param {{ title: string; subtitle?: string; icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }} props
 */
export function StandardAppDialogHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="relative shrink-0 border-b border-border bg-card px-5 pb-4 pt-5">
      <DialogHeader className="space-y-1 p-0 text-left">
        <DialogTitle className="flex items-center gap-2.5 pr-11 text-lg font-semibold tracking-tight text-foreground">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          {title}
        </DialogTitle>
        {subtitle ? (
          <p
            className={cn(
              'text-[13px] leading-snug text-muted-foreground',
              Icon ? 'pl-11' : ''
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </DialogHeader>
      <DialogClose
        type="button"
        className="absolute right-3.5 top-4 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 active:scale-95"
        aria-label="Close"
      >
        <X className="h-5 w-5" strokeWidth={2} />
      </DialogClose>
    </div>
  );
}

export function StandardAppDialogBody({ children, className }) {
  return (
    <div className={cn(standardDialogBodyScrollClass, className)}>
      {children}
    </div>
  );
}

export function StandardAppDialogFooter({ children, className }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 border-t border-border bg-muted/40 px-5 py-4',
        className
      )}
    >
      {children}
    </div>
  );
}

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
  'flex min-h-0 flex-col gap-0 overflow-hidden rounded-[1.35rem] border border-slate-200/60 bg-white p-0 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.04]';

/** Shared label style for form fields inside standard dialogs */
export const standardFormLabelClass =
  'text-[13px] font-semibold uppercase tracking-wide text-slate-500';

export const standardTextInputClass =
  'h-12 rounded-xl border-slate-200/90 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/12';

export const standardSelectClass =
  'flex h-12 w-full appearance-none rounded-xl border border-slate-200/90 bg-white px-4 py-2 pr-10 text-sm font-medium text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/12';

export const standardTextareaClass =
  'min-h-[5.5rem] w-full resize-y rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/12';

export const standardCancelButtonClass =
  'h-12 rounded-xl border-2 border-red-500/90 bg-white font-semibold text-red-600 shadow-sm transition-all hover:border-red-600 hover:bg-red-50 hover:shadow-md active:scale-[0.98]';

export const standardPrimaryButtonClass =
  'h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-rose-700 hover:shadow-xl hover:shadow-red-500/35 active:scale-[0.98]';

export const standardDialogBodyScrollClass =
  'space-y-5 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-width:thin] [scrollbar-color:#fecaca_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-red-200/90 [&::-webkit-scrollbar-track]:bg-transparent';

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
    <div className="relative shrink-0 border-b border-slate-100 bg-gradient-to-b from-white via-white to-slate-50/30 px-5 pb-5 pt-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-rose-500 to-amber-400 opacity-[0.92]"
        aria-hidden
      />
      <DialogHeader className="space-y-1 p-0 text-left">
        <DialogTitle className="flex items-center gap-2 pr-11 text-xl font-bold tracking-tight text-slate-900">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-500/25">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          {title}
        </DialogTitle>
        {subtitle ? (
          <p
            className={cn(
              'text-[13px] leading-snug text-slate-500',
              Icon ? 'pl-11' : ''
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </DialogHeader>
      <DialogClose
        type="button"
        className="absolute right-3.5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200/80 focus:ring-offset-0 active:scale-95"
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
        'grid grid-cols-2 gap-3 border-t border-slate-200/80 bg-gradient-to-t from-slate-50/90 via-white to-white px-5 py-5',
        className
      )}
    >
      {children}
    </div>
  );
}

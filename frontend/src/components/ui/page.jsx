import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export function Page({ children, className, ...props }) {
  return (
    <div className={cn('space-y-4 sm:space-y-5', className)} {...props}>
      {children}
    </div>
  );
}

export function PageIntro({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {title ? (
          <h1 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Surface({ children, className, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-soft',
        padded && 'p-4 sm:p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ title, description, actions, className }) {
  return (
    <div className={cn('mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'default', className }) {
  const tones = {
    default: 'bg-indigo-50 text-indigo-600',
    success: 'bg-emerald-50 text-emerald-600',
    danger: 'bg-rose-50 text-rose-600',
    warning: 'bg-amber-50 text-amber-600',
    info: 'bg-sky-50 text-sky-600',
  };

  return (
    <Surface className={cn('p-4 sm:p-5', className)} padded={false}>
      {Icon ? (
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tones[tone] || tones.default)}>
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Surface>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <Surface className={cn('px-6 py-12 text-center', className)}>
      {Icon ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Surface>
  );
}

export function LoadingState({ className }) {
  return (
    <div className={cn('flex h-64 items-center justify-center', className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

export function Toolbar({ children, className }) {
  return <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>{children}</div>;
}

export function SearchField({ className, inputClassName, ...props }) {
  return (
    <div className={cn('relative w-full sm:max-w-sm', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn('h-10 bg-card pl-9', inputClassName)} {...props} />
    </div>
  );
}

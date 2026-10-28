import React from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function Page({ children, className, ...props }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-6', className)} {...props}>
      {children}
    </div>
  );
}

export function PageIntro({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {title ? (
          <h2 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-foreground">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="mt-1.5 text-[15px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

/** Gradient banner for the top of a page: greeting / context on the left, quick actions on the right. */
export function HeroBanner({ eyebrow, title, description, actions, children, className }) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white shadow-lift sm:p-8',
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom_left,black,transparent_70%)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200">{eyebrow}</p>
          ) : null}
          <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h2>
          {description ? (
            <p className="mt-3 text-[15px] leading-relaxed text-indigo-100/90 sm:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
      {children ? <div className="relative mt-6">{children}</div> : null}
    </section>
  );
}

/** Translucent button for use on top of HeroBanner. */
export function HeroAction({ icon: Icon, children, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Surface({ children, className, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/80 bg-card text-card-foreground shadow-soft',
        padded && 'p-5 sm:p-6',
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
    <div className={cn('mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0">
        <h3 className="text-base font-bold tracking-tight text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const STAT_TONES = {
  default: { tile: 'from-indigo-500 to-violet-500 shadow-indigo-500/30', glow: 'bg-indigo-500/10' },
  success: { tile: 'from-emerald-500 to-teal-500 shadow-emerald-500/30', glow: 'bg-emerald-500/10' },
  danger: { tile: 'from-rose-500 to-orange-500 shadow-rose-500/30', glow: 'bg-rose-500/10' },
  warning: { tile: 'from-amber-500 to-orange-500 shadow-amber-500/30', glow: 'bg-amber-500/10' },
  info: { tile: 'from-sky-500 to-cyan-500 shadow-sky-500/30', glow: 'bg-sky-500/10' },
};

export function StatCard({ icon: Icon, label, value, hint, tone = 'default', className }) {
  const t = STAT_TONES[tone] || STAT_TONES.default;
  return (
    <Surface
      className={cn('group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift', className)}
      padded={false}
    >
      <div aria-hidden="true" className={cn('absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-opacity group-hover:opacity-100', t.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-foreground tabular-nums">{value}</p>
          {hint ? <p className="mt-1.5 text-xs font-medium text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg', t.tile)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <Surface className={cn('relative overflow-hidden px-6 py-14 text-center', className)}>
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      {Icon ? (
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-white shadow-soft ring-1 ring-primary/15">
          <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="relative text-lg font-bold tracking-tight text-foreground">{title}</h3>
      {description ? (
        <p className="relative mx-auto mt-1.5 max-w-md text-[15px] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="relative mt-5">{action}</div> : null}
    </Surface>
  );
}
const AVATAR_PALETTE = [
  'from-indigo-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-sky-500 to-cyan-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Round initials avatar; the colour is derived from the name so a person always looks the same. */
export function Avatar({ name = '', size = 'md', className }) {
  const initials =
    String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?';
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-12 w-12 text-sm' };
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-2 ring-white',
        AVATAR_PALETTE[hashString(String(name)) % AVATAR_PALETTE.length],
        sizes[size] || sizes.md,
        className,
      )}
    >
      {initials}
    </span>
  );
}

const PILL_TONES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  danger: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  brand: 'bg-accent text-accent-foreground ring-primary/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
};
const PILL_DOTS = {
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  brand: 'bg-primary',
  neutral: 'bg-slate-400',
};

/** Status badge with a leading dot; colour carries meaning, the text carries it for everyone else. */
export function StatusPill({ tone = 'neutral', children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        PILL_TONES[tone] || PILL_TONES.neutral,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', PILL_DOTS[tone] || PILL_DOTS.neutral)} />
      {children}
    </span>
  );
}

/** Small summary tile for the top of a list page (counts, totals). */
export function MiniStat({ label, value, tone = 'brand', className }) {
  const bar = {
    brand: 'bg-primary',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-slate-400',
  };
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-soft', className)}>
      <span aria-hidden="true" className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', bar[tone] || bar.brand)} />
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{value}</p>
    </div>
  );
}

/** Round icon-only action button used in table rows. Always pass a label. */
export function RowAction({ label, icon: Icon, tone = 'default', className, ...props }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'danger' ? 'hover:text-rose-600' : 'hover:text-primary',
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
export function LoadingState({ className, label = 'Loading…' }) {
  return (
    <div
      className={cn('flex h-64 flex-col items-center justify-center gap-3', className)}
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Placeholder rows for a table while its data loads; keeps the layout from jumping. */
export function TableSkeleton({ rows = 6, columns = 5, className }) {
  return (
    <Surface padded={false} className={cn('overflow-hidden', className)}>
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div className="border-b border-border bg-muted/60 px-4 py-3">
          <Skeleton className="h-3 w-1/3" />
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-border/70 px-4 py-3.5 last:border-b-0">
            {Array.from({ length: columns }).map((__, c) => (
              <Skeleton
                key={c}
                className={cn('h-4 flex-1', c === 0 && 'max-w-[10rem]', c >= 3 && 'hidden sm:block')}
              />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  );
}

/** Inline error block with a retry action, for failed data loads. */
export function ErrorState({ title = 'Something went wrong', description, onRetry, className }) {
  return (
    <Surface className={cn('px-6 py-10 text-center', className)} role="alert">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {onRetry ? (
        <div className="mt-4">
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}

export function Toolbar({ children, className }) {
  return <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>{children}</div>;
}

export function SearchField({ className, inputClassName, ...props }) {
  return (
    <div className={cn('relative w-full sm:max-w-sm', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        autoComplete="off"
        aria-label={props['aria-label'] || props.placeholder || 'Search'}
        className={cn('h-10 bg-card pl-9 [&::-webkit-search-cancel-button]:appearance-none', inputClassName)}
        {...props}
      />
    </div>
  );
}

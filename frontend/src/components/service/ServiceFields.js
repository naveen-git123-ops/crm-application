import React, { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { INPUT_CLASS, PRIORITY_STYLES, STATUS_STYLES } from '@/lib/serviceUtils';

export function StatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        STATUS_STYLES[status] || 'bg-muted text-foreground border-border',
        className,
      )}
    >
      {status || '—'}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', PRIORITY_STYLES[priority] || 'bg-muted text-foreground')}>
      {priority || '—'}
    </span>
  );
}

/** One labelled form control. `field.type`: text | date | datetime | number | textarea | enum | select. */
export function FieldInput({ field, value, onChange, options = [], disabled = false, id }) {
  const common = { id, disabled, className: INPUT_CLASS };
  const current = value ?? '';
  if (field.type === 'textarea') {
    return (
      <Textarea
        id={id}
        rows={3}
        disabled={disabled}
        value={current}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'enum' || field.type === 'select') {
    return (
      <select {...common} value={current} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((opt) => {
          const optValue = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          return <option key={optValue} value={optValue}>{optLabel}</option>;
        })}
      </select>
    );
  }
  if (field.type === 'datetime') {
    return (
      <input {...common} type="datetime-local" value={String(current).slice(0, 16)} onChange={(e) => onChange(e.target.value)} />
    );
  }
  if (field.type === 'date') {
    return <input {...common} type="date" value={String(current).slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === 'number') {
    return (
      <input {...common} type="number" min="0" step="any" value={current} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <input aria-label={field.placeholder}
      {...common}
      type="text"
      value={current}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FormField({ field, value, onChange, options, disabled, error }) {
  const id = `svc-${field.key}`;
  return (
    <div className={cn('space-y-1', field.wide && 'md:col-span-2')}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {field.label}
        {field.required && <span className="text-rose-600"> *</span>}
      </Label>
      <FieldInput id={id} field={field} value={value} onChange={onChange} options={options} disabled={disabled} />
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function FieldGrid({ children, className }) {
  return <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2', className)}>{children}</div>;
}

export function ReadRow({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground break-words">{children === undefined || children === null || children === '' ? '—' : children}</div>
    </div>
  );
}

/** Lists blocking reasons returned by the server so the user knows what is still missing. */
export function BlockerList({ items, title = 'Not ready yet' }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {title}
      </div>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export function SectionCard({ title, description, actions, children, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-white p-4', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Asks for a reason before running an action (status change, locked-record edit, amendment).
 * Usage: const { ask, dialog } = useReasonPrompt(); ask({ title, run: (reason) => ... }); render {dialog}.
 */
export function useReasonPrompt() {
  const [state, setState] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = useCallback((config) => {
    setReason('');
    setState(config);
  }, []);

  const close = () => {
    if (busy) return;
    state?.onCancel?.();
    setState(null);
  };

  const confirm = async () => {
    if (state.required !== false && !reason.trim()) return;
    setBusy(true);
    try {
      await state.run(reason.trim());
      setState(null);
    } catch {
      // The caller already showed the error; keep the dialog open so the reason is not lost.
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.title || 'Reason'}</DialogTitle>
          {state?.description && <DialogDescription>{state.description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="svc-reason" className="text-xs">
            Reason{state?.required !== false && <span className="text-rose-600"> *</span>}
          </Label>
          <Textarea id="svc-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || (state?.required !== false && !reason.trim())}>
            {busy ? 'Saving…' : state?.confirmLabel || 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}

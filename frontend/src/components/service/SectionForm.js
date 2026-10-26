import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { FieldGrid, FormField, SectionCard } from '@/components/service/ServiceFields';
import { SECTION_FIELDS, SECTION_TITLES, checklistRows, uid } from '@/lib/serviceUtils';

export function ChecklistEditor({ rows = [], onChange, disabled, title = 'Checklist' }) {
  const [newLabel, setNewLabel] = useState('');
  const pending = rows.filter((r) => r.required !== false && !r.done).length;

  const update = (id, patch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    onChange([...rows, { id: uid(), label, done: false, remark: '', required: true }]);
    setNewLabel('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        <span className={pending ? 'text-xs text-amber-700' : 'text-xs text-emerald-700'}>
          {rows.length === 0 ? 'No items' : pending ? `${pending} pending` : 'All done'}
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
            <Checkbox
              checked={Boolean(row.done)}
              disabled={disabled}
              onCheckedChange={(checked) => update(row.id, { done: checked === true })}
              aria-label={row.label}
            />
            <span className={row.done ? 'text-sm text-slate-500 line-through' : 'text-sm text-slate-800'}>{row.label}</span>
            <Input
              className="h-8 text-xs"
              placeholder="Remark"
              value={row.remark || ''}
              disabled={disabled}
              onChange={(e) => update(row.id, { remark: e.target.value })}
            />
            {!disabled ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(rows.filter((r) => r.id !== row.id))} aria-label={`Remove ${row.label}`}>
                <Trash2 className="h-3.5 w-3.5 text-slate-400" />
              </Button>
            ) : <span />}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="Add a checklist item"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>
        </div>
      )}
    </div>
  );
}

function useDraft(value, resetKey) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(value);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  const change = (next) => {
    setDraft(next);
    setDirty(true);
  };
  return [draft, change, dirty, () => setDirty(false)];
}

/** One section of the per-request data (inspection, execution, commissioning, work, final test, AMC visit). */
export function SectionForm({
  section, value, enums, disabled, withChecklist = false, onSave, title, description,
}) {
  const resetKey = useMemo(() => JSON.stringify(value || {}), [value]);
  const [draft, change, dirty, markClean] = useDraft(value || {}, resetKey);
  const [saving, setSaving] = useState(false);
  const fields = SECTION_FIELDS[section] || [];

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      markClean();
    } catch {
      // The caller shows the error; the draft stays so nothing the user typed is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title={title || SECTION_TITLES[section]}
      description={description}
      actions={!disabled && (
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      )}
    >
      <FieldGrid>
        {fields.map((field) => (
          <FormField
            key={field.key}
            field={field}
            value={draft[field.key]}
            options={enums?.[section]?.[field.key] || []}
            disabled={disabled}
            onChange={(next) => change({ ...draft, [field.key]: next })}
          />
        ))}
      </FieldGrid>
      {withChecklist && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <ChecklistEditor rows={draft.checklist || []} disabled={disabled} onChange={(rows) => change({ ...draft, checklist: rows })} />
        </div>
      )}
    </SectionCard>
  );
}

/** Troubleshooting is a list: each failed test or revisit adds an entry, earlier findings stay on record. */
export function TroubleshootingForm({
  entries = [], enums, disabled, checklistTemplate, technicianName, onSave,
}) {
  const resetKey = useMemo(() => JSON.stringify(entries || []), [entries]);
  const [draft, change, dirty, markClean] = useDraft(entries || [], resetKey);
  const [saving, setSaving] = useState(false);
  const fields = SECTION_FIELDS.troubleshooting;

  const addEntry = () => {
    change([...draft, {
      id: uid(),
      inspection_date: new Date().toISOString().slice(0, 10),
      technician: technicianName || '',
      checklist: checklistRows(checklistTemplate),
    }]);
  };
  const updateEntry = (id, patch) => change(draft.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEntry = (id) => change(draft.filter((e) => e.id !== id));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      markClean();
    } catch {
      // The caller shows the error; the draft stays so nothing the user typed is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title={SECTION_TITLES.troubleshooting}
      description="Add an entry for each inspection. A failed final test or a revisit adds a new entry; earlier findings stay on record."
      actions={!disabled && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addEntry}><Plus className="mr-1 h-4 w-4" />Add entry</Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    >
      {draft.length === 0 && <p className="text-sm text-slate-500">No troubleshooting entries yet.</p>}
      <div className="space-y-4">
        {draft.map((entry, index) => (
          <div key={entry.id || index} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entry {index + 1}</span>
              {!disabled && (
                <Button variant="ghost" size="sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5 text-rose-600" />Remove
                </Button>
              )}
            </div>
            <FieldGrid>
              {fields.map((field) => (
                <FormField
                  key={field.key}
                  field={{ ...field, key: `${field.key}-${entry.id}` }}
                  value={entry[field.key]}
                  options={enums?.troubleshooting?.[field.key] || []}
                  disabled={disabled}
                  onChange={(next) => updateEntry(entry.id, { [field.key]: next })}
                />
              ))}
            </FieldGrid>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <ChecklistEditor
                title="Inspection checklist"
                rows={entry.checklist || []}
                disabled={disabled}
                onChange={(rows) => updateEntry(entry.id, { checklist: rows })}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

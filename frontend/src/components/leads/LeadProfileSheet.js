import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Mail,
  Phone,
  Building2,
  IndianRupee,
  Store,
  Edit2,
  Trash2,
  History,
  Activity,
  ArrowRight,
} from 'lucide-react';
import {
  LEAD_ACTIVITY_TYPES,
  LEAD_STATUSES,
  STATUS_COLORS,
  isCarryAndOrder,
  leadNeedsVendor,
} from '@/lib/leadUtils';

const selectClass =
  'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm';

export function LeadProfileSheet({
  open,
  onOpenChange,
  lead,
  activities,
  statusHistory,
  canEdit,
  apiBase,
  authHeader,
  vendors,
  assigneeOptions,
  onLeadUpdated,
  onDeleted,
  onAssignVendor,
  onRequestStatusChange,
}) {
  const [activityType, setActivityType] = useState('Note');
  const [activitySummary, setActivitySummary] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [vendorId, setVendorId] = useState('');

  if (!lead) return null;

  const startEdit = () => {
    setForm({
      contact_name: lead.contact_name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone || '',
      source: lead.source,
      status: lead.status,
      value: lead.value ?? '',
      notes: lead.notes || '',
      assigned_to_employee_id: lead.assigned_to_employee_id || '',
      assigned_to_name: lead.assigned_to_name || '',
      enquiry_date: lead.enquiry_date || '',
      category: lead.category || '',
      sub_category: lead.sub_category || '',
    });
    setVendorId(lead.vendor_id || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const vName = vendors.find((v) => v.id === vendorId)?.company_name;
      await axios.put(
        `${apiBase}/leads/${lead.id}`,
        {
          ...form,
          vendor_id: isCarryAndOrder(form.sub_category) ? vendorId || null : null,
          vendor_name: isCarryAndOrder(form.sub_category) ? vName || null : null,
        },
        { headers: authHeader() },
      );
      toast.success('Lead updated');
      setEditing(false);
      onLeadUpdated?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Update failed'));
    }
  };

  const addActivity = async (e) => {
    e.preventDefault();
    if (!activitySummary.trim()) return;
    try {
      await axios.post(
        `${apiBase}/leads/${lead.id}/activities`,
        { activity_type: activityType, summary: activitySummary.trim() },
        { headers: authHeader() },
      );
      setActivitySummary('');
      toast.success('Activity logged');
      onLeadUpdated?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to add activity'));
    }
  };

  const deleteLead = async () => {
    if (!window.confirm('Delete this lead permanently?')) return;
    try {
      await axios.delete(`${apiBase}/leads/${lead.id}`, { headers: authHeader() });
      toast.success('Lead deleted');
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Delete failed'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-slate-50 p-0">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-6 py-5">
          <SheetHeader>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Lead record</p>
            <SheetTitle className="text-xl font-bold text-white mt-1 pr-8">{lead.company}</SheetTitle>
            <p className="text-sm text-slate-300 flex items-center gap-2 mt-1">
              <User className="h-4 w-4" />
              {lead.contact_name}
            </p>
          </SheetHeader>
        </div>

        <div className="px-6 py-4 -mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[lead.status]?.pill || 'bg-slate-100'}`}>
            {lead.status}
          </span>
          {leadNeedsVendor(lead) && (
            <span className="text-xs px-2 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200">
              Vendor required
            </span>
          )}
        </div>

        {canEdit && !editing && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {leadNeedsVendor(lead) && (
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800" onClick={() => onAssignVendor(lead)}>
                <Store className="h-4 w-4 mr-1" />
                Assign vendor
              </Button>
            )}
            <select
              className="h-9 rounded-lg border border-gray-300 text-sm px-2 bg-white"
              value=""
              onChange={(e) => {
                const next = e.target.value;
                if (next) onRequestStatusChange(lead, next);
                e.target.value = '';
              }}
            >
              <option value="">Move to stage…</option>
              {LEAD_STATUSES.filter((s) => s !== lead.status).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={deleteLead}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        )}

        {editing && form && (
          <div className="mt-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Edit lead</p>
            <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Contact" />
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Notes"
            />
            {isCarryAndOrder(form.sub_category) && (
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={selectClass}>
                <option value="">Vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.company_name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="bg-indigo-600 text-white" onClick={saveEdit}>Save</Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-white border border-slate-200 p-1 rounded-lg">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4 text-sm">
            <Row icon={Mail} label="Email" href={`mailto:${lead.email}`}>{lead.email}</Row>
            {lead.phone && <Row icon={Phone} label="Phone" href={`tel:${lead.phone}`}>{lead.phone}</Row>}
            <Row icon={Building2} label="Source">{lead.source}</Row>
            {lead.value > 0 && (
              <Row icon={IndianRupee} label="Value">₹{Number(lead.value).toLocaleString('en-IN')}</Row>
            )}
            {lead.assigned_to_name && <p className="text-gray-600">Owner: {lead.assigned_to_name}</p>}
            {lead.enquiry_date && <p className="text-gray-600">Enquiry: {lead.enquiry_date}</p>}
            {lead.category && <p className="text-gray-600">Category: {lead.category}</p>}
            {lead.sub_category && <p className="text-gray-600 capitalize">Business: {lead.sub_category}</p>}
            {isCarryAndOrder(lead) && (
              <div className="rounded-lg border p-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1 mb-1">
                  <Store className="h-3.5 w-3.5" />
                  Vendor
                </p>
                <p className="font-medium">{lead.vendor_name || 'Not assigned'}</p>
              </div>
            )}
            {lead.notes && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Notes</p>
                <p className="text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4 space-y-4">
            {canEdit && (
              <form onSubmit={addActivity} className="flex flex-col gap-2">
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className={selectClass}
                >
                  {LEAD_ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Input
                  value={activitySummary}
                  onChange={(e) => setActivitySummary(e.target.value)}
                  placeholder="Log a call, email, or note…"
                />
                <Button type="submit" size="sm" className="bg-indigo-600 text-white w-fit">Add</Button>
              </form>
            )}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {activities.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                activities.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3 text-sm bg-gray-50">
                    <span className="font-medium text-blue-700">{a.activity_type}</span>
                    <p className="text-gray-700 mt-1">{a.summary}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {a.created_by_name} · {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {statusHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No stage changes recorded.</p>
            ) : (
              statusHistory.map((h) => (
                <div key={h.id} className="rounded-lg border p-3 text-sm bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100">{h.old_status}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">{h.new_status}</span>
                  </div>
                  {h.change_comment && <p className="text-gray-700 mt-2 italic">&ldquo;{h.change_comment}&rdquo;</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {h.changed_by_name} · {new Date(h.changed_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ icon: Icon, label, children, href }) {
  const inner = (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={href ? 'text-blue-600' : 'text-gray-800'}>{children}</p>
      </div>
    </div>
  );
  if (href) return <a href={href}>{inner}</a>;
  return inner;
}

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  LEAD_SOURCES,
} from '@/lib/leadUtils';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CgwMultiFilePicker, normalizeFileList } from '@/components/CgwMultiFilePicker';
import { LEAD_ATTACHMENT_ACCEPT, LEAD_ATTACHMENT_HINT } from '@/lib/leadAttachmentAccept';

const selectClass =
  'flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900';

const labelClass = 'text-sm font-semibold text-gray-700';

function leadToForm(lead) {
  if (!lead) return null;
  const rawSource = lead.source || 'Other';
  const isPreset = LEAD_SOURCES.includes(rawSource);
  return {
    contact_name: lead.contact_name || '',
    company: lead.company || '',
    email: lead.email || '',
    phone: lead.phone || '',
    source: isPreset ? rawSource : 'Other',
    customSource: isPreset && rawSource !== 'Other' ? '' : (isPreset ? '' : rawSource),
    value: lead.value ?? '',
    brief_of_enquiry: lead.brief_of_enquiry || lead.notes || '',
    assigned_to_employee_id: lead.assigned_to_employee_id || '',
    assigned_to_name: lead.assigned_to_name || '',
    enquiry_date: lead.enquiry_date || '',
    otx_date_from: lead.otx_date_from || '',
    otx_date_to: lead.otx_date_to || '',
    category: lead.category || '',
    sub_category: lead.sub_category || '',
  };
}

export function LeadEditDialog({
  open,
  onOpenChange,
  lead,
  apiBase,
  authHeader,
  customers,
  vendors,
  assigneeOptions,
  onUpdated,
}) {
  const [form, setForm] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [customerContacts, setCustomerContacts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !lead) return;
    setForm(leadToForm(lead));
    setCustomerId(lead.customer_id || '');
    setVendorId(lead.vendor_id || '');
    setAttachments([]);
    if (lead.customer_id) {
      axios
        .get(`${apiBase}/customers/${lead.customer_id}/contacts`, { headers: authHeader() })
        .then((res) => setCustomerContacts(res.data || []))
        .catch(() => setCustomerContacts([]));
    } else {
      setCustomerContacts([]);
    }
  }, [open, lead?.id, apiBase, authHeader]);

  const handleClose = (isOpen) => {
    if (!isOpen) {
      setForm(null);
      setAttachments([]);
    }
    onOpenChange(isOpen);
  };

  const fetchContacts = async (id) => {
    try {
      const { data } = await axios.get(`${apiBase}/customers/${id}/contacts`, { headers: authHeader() });
      setCustomerContacts(data);
    } catch {
      setCustomerContacts([]);
    }
  };

  const saveLead = async () => {
    if (!lead?.id || !form) return;
    const resolvedSource =
      form.source === 'Other' ? (form.customSource || '').trim() : (form.source || '').trim();
    if (form.source === 'Other' && !resolvedSource) {
      toast.error('Please enter the source');
      return;
    }
    setSubmitting(true);
    try {
      const valueRaw = form.value;
      const payload = {
        contact_name: (form.contact_name || '').trim() || form.company,
        company: form.company,
        email: form.email,
        phone: form.phone || null,
        source: resolvedSource,
        value:
          valueRaw === '' || valueRaw == null || Number.isNaN(Number(valueRaw))
            ? null
            : Number(valueRaw),
        brief_of_enquiry: form.brief_of_enquiry || null,
        assigned_to_employee_id: form.assigned_to_employee_id || null,
        assigned_to_name: form.assigned_to_name || null,
        enquiry_date: form.enquiry_date || null,
        otx_date_from: form.otx_date_from || form.enquiry_date || null,
        otx_date_to: form.otx_date_to || null,
        customer_id: customerId || null,
      };
      const { data: updated } = await axios.put(`${apiBase}/leads/${lead.id}`, payload, { headers: authHeader() });
      const filesToUpload = normalizeFileList(attachments);
      for (const file of filesToUpload) {
        const fd = new FormData();
        fd.append('file', file);
        await axios.post(`${apiBase}/leads/${lead.id}/attachments`, fd, {
          headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success('Lead updated');
      handleClose(false);
      onUpdated?.(updated);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update lead'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-white rounded-xl border shadow-xl p-0 max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-6 py-5 rounded-t-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white tracking-tight">Edit lead</DialogTitle>
            <p className="text-slate-300 text-sm mt-1">{lead.company}</p>
          </DialogHeader>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveLead();
          }}
          className="p-6 space-y-4 text-gray-900"
        >
          <div className="space-y-2">
            <Label htmlFor="edit-lead-customer" className={labelClass}>Customer</Label>
            <select
              id="edit-lead-customer"
              value={customerId}
              className={selectClass}
              onChange={(e) => {
                const id = e.target.value;
                setCustomerId(id);
                const cust = customers.find((c) => c.id === id);
                if (cust) {
                  setForm((f) => ({
                    ...f,
                    company: cust.company_name,
                    phone: cust.phone || f.phone,
                    email: cust.email || f.email,
                  }));
                  fetchContacts(id);
                } else {
                  setCustomerContacts([]);
                }
              }}
            >
              <option value="">No customer link</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lead-company" className={labelClass}>Company *</Label>
              <Input
                id="edit-lead-company"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-contact" className={labelClass}>Contact name</Label>
              <Input
                id="edit-lead-contact"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-email" className={labelClass}>Email *</Label>
              <Input
                id="edit-lead-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-phone" className={labelClass}>Phone</Label>
              <Input
                id="edit-lead-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lead-source" className={labelClass}>Source</Label>
              <select
                id="edit-lead-source"
                value={form.source}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm({
                    ...form,
                    source: next,
                    customSource: next === 'Other' ? (form.customSource || '') : '',
                  });
                }}
                className={selectClass}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {form.source === 'Other' && (
                <Input
                  id="edit-lead-source-other"
                  value={form.customSource || ''}
                  onChange={(e) => setForm({ ...form, customSource: e.target.value })}
                  placeholder="Type source"
                  className="h-11 mt-2"
                  required
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-value" className={labelClass}>Value (₹)</Label>
              <Input
                id="edit-lead-value"
                type="number"
                step="0.01"
                min="0"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lead-assigned" className={labelClass}>Assigned to</Label>
              <select
                id="edit-lead-assigned"
                value={form.assigned_to_employee_id}
                onChange={(e) => {
                  const opt = assigneeOptions.find((o) => o.value === e.target.value);
                  setForm({
                    ...form,
                    assigned_to_employee_id: e.target.value,
                    assigned_to_name: opt ? opt.label.split(' (')[0] : '',
                  });
                }}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-enquiry-date" className={labelClass}>Enquiry date</Label>
              <Input
                id="edit-lead-enquiry-date"
                type="date"
                value={form.enquiry_date}
                onChange={(e) => setForm({ ...form, enquiry_date: e.target.value })}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-lead-notes" className={labelClass}>Brief Of Enquiry</Label>
            <textarea
              id="edit-lead-notes"
              value={form.brief_of_enquiry || ''}
              onChange={(e) => setForm({ ...form, brief_of_enquiry: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
            />
          </div>

          <CgwMultiFilePicker
            label="Add attachments"
            accept={LEAD_ATTACHMENT_ACCEPT}
            hint={LEAD_ATTACHMENT_HINT}
            files={attachments}
            onChange={setAttachments}
            addLabel="Attach"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={submitting}>
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

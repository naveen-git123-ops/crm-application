import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BUSINESS_CATEGORY_OPTIONS,
  LEAD_CATEGORY_OPTIONS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  isCarryAndOrder,
  defaultLeadForm,
} from '@/lib/leadUtils';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CgwMultiFilePicker, normalizeFileList } from '@/components/CgwMultiFilePicker';
import { LEAD_ATTACHMENT_ACCEPT, LEAD_ATTACHMENT_HINT } from '@/lib/leadAttachmentAccept';

const selectClass =
  'flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900';

const labelClass = 'text-sm font-semibold text-gray-700';

export function LeadCreateDialog({
  open,
  onOpenChange,
  apiBase,
  authHeader,
  customers,
  vendors,
  assigneeOptions,
  onCreated,
}) {
  const [form, setForm] = useState(defaultLeadForm);
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [customerContacts, setCustomerContacts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setForm(defaultLeadForm());
    setCustomerId('');
    setVendorId('');
    setCustomerContacts([]);
    setAttachments([]);
  };

  const handleClose = (isOpen) => {
    if (!isOpen) reset();
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

  const vendorName = vendors.find((v) => v.id === vendorId)?.company_name || '';
  const carryOrder = isCarryAndOrder(form.sub_category);

  const submitLead = async () => {
    setSubmitting(true);
    try {
      const valueRaw = form.value;
      const payload = {
        ...form,
        contact_name: (form.contact_name || '').trim() || form.company,
        value:
          valueRaw === '' || valueRaw == null || Number.isNaN(Number(valueRaw))
            ? null
            : Number(valueRaw),
        category: form.category || null,
        sub_category: form.sub_category || null,
        assigned_to_employee_id: form.assigned_to_employee_id || null,
        assigned_to_name: form.assigned_to_name || null,
        enquiry_date: form.enquiry_date || null,
        otx_date_from: form.otx_date_from || form.enquiry_date || null,
        otx_date_to: form.otx_date_to || null,
        customer_id: customerId || null,
        vendor_id: carryOrder && vendorId ? vendorId : null,
        vendor_name: carryOrder && vendorName ? vendorName : null,
        contacts: [],
      };
      const { data: created } = await axios.post(`${apiBase}/leads`, payload, { headers: authHeader() });
      const filesToUpload = normalizeFileList(attachments);
      if (filesToUpload.length && created?.id) {
        for (const file of filesToUpload) {
          const fd = new FormData();
          fd.append('file', file);
          await axios.post(`${apiBase}/leads/${created.id}/attachments`, fd, {
            headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' },
          });
        }
      }
      if (carryOrder && !vendorId) {
        toast.success('Lead created — assign vendor from the list below to continue', { duration: 6000 });
      } else {
        toast.success('Lead created');
      }
      handleClose(false);
      onCreated?.(created);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create lead'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-white rounded-xl border shadow-xl p-0 max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-6 py-5 rounded-t-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white tracking-tight">New lead</DialogTitle>
            <p className="text-slate-300 text-sm mt-1">Link a customer and capture enquiry details</p>
          </DialogHeader>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitLead();
          }}
          className="p-6 space-y-4 text-gray-900"
        >
          <div className="space-y-2">
            <Label htmlFor="lead-customer" className={labelClass}>Customer *</Label>
            <select
              id="lead-customer"
              value={customerId}
              required
              className={selectClass}
              onChange={(e) => {
                const id = e.target.value;
                setCustomerId(id);
                const cust = customers.find((c) => c.id === id);
                if (cust) {
                  setForm((f) => ({
                    ...f,
                    company: cust.company_name,
                    phone: cust.phone || '',
                    email: cust.email || '',
                  }));
                  fetchContacts(id);
                } else {
                  setCustomerContacts([]);
                }
              }}
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          {customerContacts.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="lead-contact-person" className={labelClass}>Contact person</Label>
              <select
                id="lead-contact-person"
                className={selectClass}
                defaultValue=""
                onChange={(e) => {
                  const c = customerContacts.find((x) => x.id === e.target.value);
                  if (c) {
                    setForm((f) => ({
                      ...f,
                      contact_name: c.contact_person_name,
                      phone: c.phone || f.phone,
                      email: c.email || f.email,
                    }));
                  }
                }}
              >
                <option value="">Optional</option>
                {customerContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contact_person_name}
                    {c.designation ? ` — ${c.designation}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead-company" className={labelClass}>Company</Label>
              <Input id="lead-company" value={form.company} readOnly className="h-11 bg-gray-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-contact-name" className={labelClass}>Contact name</Label>
              <Input
                id="lead-contact-name"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email" className={labelClass}>Email *</Label>
              <Input
                id="lead-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone" className={labelClass}>Phone</Label>
              <Input
                id="lead-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead-category" className={labelClass}>Category</Label>
              <select
                id="lead-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={selectClass}
              >
                <option value="">Select</option>
                {LEAD_CATEGORY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-business-category" className={labelClass}>Business category</Label>
              <select
                id="lead-business-category"
                value={form.sub_category}
                onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
                className={selectClass}
              >
                <option value="">Select</option>
                {BUSINESS_CATEGORY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {carryOrder && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
              <Label htmlFor="lead-vendor" className={labelClass}>
                Vendor <span className="font-normal text-amber-800">(optional now)</span>
              </Label>
              <p className="text-xs text-amber-900/90 -mt-1">
                You can skip this and assign a vendor after creating the lead. The lead will show as pending until then.
              </p>
              <select
                id="lead-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className={selectClass}
              >
                <option value="">Assign later</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.company_name} {v.customer_id ? `(${v.customer_id})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead-source" className={labelClass}>Source</Label>
              <select
                id="lead-source"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className={selectClass}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-status" className={labelClass}>Status</Label>
              <select
                id="lead-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={selectClass}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead-assigned" className={labelClass}>Assigned to</Label>
              <select
                id="lead-assigned"
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
              <Label htmlFor="lead-enquiry-date" className={labelClass}>Enquiry date</Label>
              <Input
                id="lead-enquiry-date"
                type="date"
                value={form.enquiry_date}
                onChange={(e) => setForm({ ...form, enquiry_date: e.target.value })}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-notes" className={labelClass}>Enquiry details</Label>
            <textarea
              id="lead-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
            />
          </div>

          <CgwMultiFilePicker
            label="Attachment"
            accept={LEAD_ATTACHMENT_ACCEPT}
            hint={LEAD_ATTACHMENT_HINT}
            files={attachments}
            onChange={setAttachments}
            addLabel="Attach"
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Enquiry validity (OTX)</p>
            <p className="text-xs text-gray-500 -mt-2">Optional — shown in the enquiry workflow step. If &quot;from&quot; is empty, enquiry date is used.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead-otx-from" className={labelClass}>
                  Enquiry Validity From <span className="font-normal text-gray-500">(optional)</span>
                </Label>
                <Input
                  id="lead-otx-from"
                  type="date"
                  value={form.otx_date_from}
                  onChange={(e) => setForm({ ...form, otx_date_from: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-otx-to" className={labelClass}>
                  Enquiry Validity To <span className="font-normal text-gray-500">(optional)</span>
                </Label>
                <Input
                  id="lead-otx-to"
                  type="date"
                  value={form.otx_date_to}
                  onChange={(e) => setForm({ ...form, otx_date_to: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={submitting}>
              Create lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

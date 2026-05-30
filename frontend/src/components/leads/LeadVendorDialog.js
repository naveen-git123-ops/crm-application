import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Store } from 'lucide-react';

const selectClass =
  'flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900';

export function LeadVendorDialog({
  open,
  lead,
  vendorId,
  vendors,
  afterStatus,
  onVendorIdChange,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md rounded-xl border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-900">
            <Store className="h-5 w-5 text-indigo-600" />
            {afterStatus ? 'Select vendor to continue' : 'Assign vendor'}
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {lead ? `${lead.company} — carry and order` : 'Required for carry and order leads'}
          </p>
        </DialogHeader>
        <select value={vendorId} onChange={(e) => onVendorIdChange(e.target.value)} className={selectClass}>
          <option value="">Select vendor</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.company_name}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={!vendorId}
            onClick={onConfirm}
          >
            {afterStatus ? 'Continue' : 'Save vendor'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

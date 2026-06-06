import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, FileText, Store, AlertCircle } from 'lucide-react';
import { CarryOrderWorkspace } from '@/components/leads/carryOrder/CarryOrderWorkspace';
import { workflowStageLabel } from '@/lib/carryOrderWorkflow';
import { isCarryAndOrder, leadNeedsVendor } from '@/lib/leadUtils';

export function LeadWorkflowDialog({
  open,
  onOpenChange,
  lead,
  apiBase,
  authHeader,
  vendors,
  leadAttachments,
  canEdit,
  onLeadRefresh,
  onAssignVendor,
  onOpenRecord,
}) {
  if (!lead) return null;

  const stageLabel = workflowStageLabel(lead.workflow_stage) || lead.status;
  const pendingVendor = isCarryAndOrder(lead) && leadNeedsVendor(lead);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[min(92vh,920px)] max-h-[min(92vh,920px)] w-[min(1280px,96vw)] max-w-[min(1280px,96vw)] flex-col gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-4">
          <DialogHeader className="space-y-0 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                  Lead workflow
                </p>
                <DialogTitle className="text-xl font-bold text-white mt-0.5 truncate">
                  {lead.company || '—'}
                </DialogTitle>
                <p className="text-sm text-slate-300 mt-1 truncate">
                  {lead.contact_name || 'No contact'}
                  {lead.email ? ` · ${lead.email}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {stageLabel}
                  </span>
                  {lead.sub_category && (
                    <span className="text-xs text-slate-400 capitalize">{lead.sub_category}</span>
                  )}
                  {pendingVendor && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <AlertCircle className="h-3 w-3" />
                      Vendor pending
                    </span>
                  )}
                  {lead.vendor_name && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                      <Store className="h-3.5 w-3.5" />
                      {lead.vendor_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {onOpenRecord && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-0"
                    onClick={() => onOpenRecord(lead)}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Record & activity
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0 bg-white/10 hover:bg-white/20 text-white border-0"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/50 p-4 text-slate-900">
          <CarryOrderWorkspace
            embedded
            lead={lead}
            apiBase={apiBase}
            authHeader={authHeader}
            vendors={vendors || []}
            attachments={leadAttachments || []}
            canEdit={canEdit}
            onRefresh={(id) => onLeadRefresh?.(id)}
            onAssignVendor={onAssignVendor}
            onOpenProfile={onOpenRecord ? () => onOpenRecord(lead) : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

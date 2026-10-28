import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight } from 'lucide-react';

export function LeadStatusDialog({
  open,
  pending,
  comment,
  lostReason,
  competitorName,
  lostAmount,
  onCommentChange,
  onLostReasonChange,
  onCompetitorChange,
  onLostAmountChange,
  onConfirm,
  onCancel,
}) {
  const isLost = pending?.newStatus === 'Lost';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md rounded-xl border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Update stage</DialogTitle>
          {pending && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span className="font-medium">{pending.oldStatus}</span>
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium text-indigo-600">{pending.newStatus}</span>
            </p>
          )}
        </DialogHeader>

        {isLost ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="leadstatusdialog-field-1">Reason for loss *</Label>
              <textarea id="leadstatusdialog-field-1"
                value={lostReason}
                onChange={(e) => onLostReasonChange(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leadstatusdialog-field-2">Competitor / alternative *</Label>
              <Input id="leadstatusdialog-field-2" value={competitorName} onChange={(e) => onCompetitorChange(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leadstatusdialog-field-3">Deal amount (₹) *</Label>
              <Input id="leadstatusdialog-field-3" type="number" min="0" value={lostAmount} onChange={(e) => onLostAmountChange(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="leadstatusdialog-field-4">Reason for change *</Label>
            <textarea id="leadstatusdialog-field-4"
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              rows={4}
              placeholder="Why is this lead moving to the next stage?"
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={onConfirm}
            disabled={
              isLost
                ? !lostReason.trim() || !competitorName.trim() || !lostAmount.trim()
                : !comment.trim()
            }
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

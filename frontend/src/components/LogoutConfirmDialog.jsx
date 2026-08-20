import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { todayISTDateString } from '@/utils/date';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';

const BACKEND_URL = BACKEND_BASE_URL;
const API = API_ENDPOINT;

export const LogoutConfirmDialog = ({ isOpen, onClose, onLogoutConfirmed, user }) => {
  const [workSummary, setWorkSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitWorkLog = async () => {
    if (!workSummary.trim()) {
      toast.error('Please enter your day summary');
      return;
    }

    setIsSubmitting(true);
    try {
      const today = todayISTDateString();
      await axios.post(
        `${API}/daily-work-logs`,
        {
          employee_id: user.employee_id,
          employee_name: user.name,
          log_date: today,
          summary: workSummary.trim()
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Work log submitted successfully');
      setWorkSummary('');
      onLogoutConfirmed();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit work log');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AlertCircle className="h-5 w-5 text-primary" />
            Daily Work Log Required
          </DialogTitle>
          <DialogDescription>
            You haven't logged your work for today. Please submit your daily work summary before logging out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          <div>
            <Label htmlFor="work-summary" className="text-gray-900 font-medium">
              Today's Work Summary
            </Label>
            <textarea
              id="work-summary"
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              placeholder="Describe what you worked on today..."
              rows={5}
              className="w-full mt-2 border border-input rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary/50"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitWorkLog}
            disabled={isSubmitting || !workSummary.trim()}
          >
            {isSubmitting ? 'Submitting...' : 'Submit & Logout'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

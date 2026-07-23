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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

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
      const today = new Date().toISOString().slice(0, 10);
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
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
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
              className="w-full mt-2 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="bg-blue-600 text-white hover:bg-blue-700"
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

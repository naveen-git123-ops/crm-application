import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Check, X, Receipt, Image as ImageIcon } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const EXPENSE_CATEGORIES = ['Travel', 'Meals', 'Office Supplies', 'Software', 'Internet', 'Phone', 'Other'];

export const Expenses = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [receiptFile, setReceiptFile] = useState(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    amount: '',
    category: 'Travel',
    description: ''
  });

  useEffect(() => {
    fetchExpenses();
  }, []);

  useEffect(() => {
    if (dialogOpen && user?.employee_id && !formData.employee_id) {
      setFormData(prev => ({
        ...prev,
        employee_id: user.employee_id,
        employee_name: user.name
      }));
    }
  }, [dialogOpen, user]);

  const fetchExpenses = async () => {
    try {
      const response = await axios.get(`${API}/expenses`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setExpenses(response.data);
    } catch (error) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        employee_name: formData.employee_name || user?.name
      };
      const { data } = await axios.post(`${API}/expenses`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (receiptFile) {
        const formDataUpload = new FormData();
        formDataUpload.append('file', receiptFile);
        await axios.post(`${API}/expenses/${data.id}/receipt`, formDataUpload, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      toast.success('Expense submitted successfully');
      setDialogOpen(false);
      setFormData({ employee_id: '', employee_name: '', amount: '', category: 'Travel', description: '' });
      setReceiptFile(null);
      fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit expense');
    }
  };

  const handleExpenseAction = async (expenseId, status) => {
    try {
      await axios.put(`${API}/expenses/${expenseId}/action`, {
        status,
        approver_id: user.id,
        approver_name: user.name
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success(`Expense ${status.toLowerCase()} successfully`);
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to update expense status');
    }
  };

  const canApprove = ['Admin', 'HR', 'Manager'].includes(user?.role);

  const filteredExpenses = expenses.filter(exp => {
    if (activeTab !== 'All' && exp.status !== activeTab) return false;
    if (!canApprove && exp.employee_id !== user?.employee_id) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="expenses-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Employee Expenses</h1>
          <p className="text-gray-600 text-sm mt-1">Submit expenses with receipts for HR approval</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 text-white font-medium hover:bg-blue-700 h-10">
              <Plus className="h-4 w-4 mr-2" />
              Submit Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-white border-0 shadow-2xl p-0">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white">Submit Expense</DialogTitle>
                <p className="text-blue-100 text-sm">Add amount, category, description and optional receipt</p>
              </DialogHeader>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-700">Employee</Label>
                <div className="text-base font-medium text-gray-900">{formData.employee_name || user?.name}</div>
                <div className="text-sm text-gray-600">ID: {user?.employee_id}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label htmlFor="amount" className="text-sm font-semibold text-gray-700">Amount (₹) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                    className="h-11 border border-gray-300"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="category" className="text-sm font-semibold text-gray-700">Category *</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                    required
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-700">Description *</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  placeholder="Brief description of the expense..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-700">Receipt / Screenshot (optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="h-11 border border-gray-300"
                  />
                  {receiptFile && (
                    <span className="text-xs text-gray-500 truncate max-w-[120px]">{receiptFile.name}</span>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Submit</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3 border border-gray-200 bg-white">
        <div className="flex gap-2">
          {['All', 'Pending', 'Approved', 'Rejected'].map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              size="sm"
              className={activeTab === tab ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {filteredExpenses.map((exp) => (
          <Card key={exp.id} className="p-6 border border-gray-200 bg-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{exp.employee_name}</h3>
                    <p className="text-sm text-gray-600">{exp.category} • ₹{Number(exp.amount).toLocaleString('en-IN')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-medium ${
                    exp.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                    exp.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {exp.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{exp.description}</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-xs text-gray-500">
                    Submitted {new Date(exp.created_at).toLocaleDateString()}
                  </span>
                  {exp.receipt_path && (
                    <a
                      href={`${BACKEND_URL}${exp.receipt_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline"
                    >
                      <ImageIcon className="h-4 w-4" />
                      View receipt
                    </a>
                  )}
                </div>
                {exp.approver_name && (
                  <p className="text-xs text-gray-600">{exp.status} by {exp.approver_name}</p>
                )}
              </div>
              {canApprove && exp.status === 'Pending' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white h-9"
                    onClick={() => handleExpenseAction(exp.id, 'Approved')}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white h-9"
                    onClick={() => handleExpenseAction(exp.id, 'Rejected')}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredExpenses.length === 0 && (
        <Card className="p-12 text-center border border-gray-200 bg-white">
          <Receipt className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No expenses found</p>
        </Card>
      )}
    </div>
  );
};

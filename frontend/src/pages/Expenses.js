import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Check, X, Receipt, Image as ImageIcon, Calculator } from 'lucide-react';
import { FilePreviewSimple } from '@/components/FilePreviewSimple';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const EXPENSE_CATEGORIES = ['Travel', 'Meals', 'Office Supplies', 'Software', 'Internet', 'Phone', 'Other'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const Expenses = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pageTab, setPageTab] = useState('Requests');
  const [activeTab, setActiveTab] = useState('All');
  const [receiptFile, setReceiptFile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryMonth, setSummaryMonth] = useState(new Date().getMonth() + 1);
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [previewFileName, setPreviewFileName] = useState('Receipt');
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    amount: '',
    category: 'Travel',
    description: ''
  });

  const fetchSummary = async () => {
    try {
      const res = await axios.get(
        `${API}/expenses/summary-by-employee?month=${summaryMonth}&year=${summaryYear}`,
        authHeaders()
      );
      setSummary(res.data);
    } catch {
      setSummary({ month: summaryMonth, year: summaryYear, employees: [] });
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  useEffect(() => {
    if (user?.role === 'Admin' && summaryMonth && summaryYear) fetchSummary();
  }, [user?.role, summaryMonth, summaryYear]);

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
      if (user?.role === 'Admin') fetchSummary();
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
      if (user?.role === 'Admin') fetchSummary();
    } catch (error) {
      toast.error('Failed to update expense status');
    }
  };

  // Only Admin, HR, Manager can approve/reject; Employee can only submit
  const canApprove = !!user?.role && ['Admin', 'HR', 'Manager'].includes(user.role);

  const filteredExpenses = expenses.filter(exp => {
    if (activeTab !== 'All' && exp.status !== activeTab) return false;
    if (!canApprove && exp.employee_id !== user?.employee_id) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
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
          <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0">
            <div className="bg-blue-600 text-white p-6 rounded-t-lg">
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

      {/* Top-level tabs: Requests | Summary (Summary only for Admin) */}
      {user?.role === 'Admin' && (
        <Card className="p-2 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex gap-1">
            <Button
              variant={pageTab === 'Requests' ? 'default' : 'ghost'}
              size="sm"
              className={pageTab === 'Requests' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100'}
              onClick={() => setPageTab('Requests')}
            >
              <Receipt className="h-4 w-4 mr-2" />
              Requests
            </Button>
            <Button
              variant={pageTab === 'Summary' ? 'default' : 'ghost'}
              size="sm"
              className={pageTab === 'Summary' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-100'}
              onClick={() => setPageTab('Summary')}
            >
              <Calculator className="h-4 w-4 mr-2" />
              Summary
            </Button>
          </div>
        </Card>
      )}

      {pageTab === 'Summary' && user?.role === 'Admin' ? (
        <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Expense summary by employee</h2>
            </div>
            <p className="text-sm text-gray-500">Use this for end-of-month salary compensation</p>
            <div className="flex items-center gap-2">
              <select
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(Number(e.target.value))}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={summaryYear}
                onChange={(e) => setSummaryYear(Number(e.target.value))}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                {[summaryYear - 2, summaryYear - 1, summaryYear, summaryYear + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          {summary?.employees?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee</th>
                    <th className="text-right py-3 px-4 font-semibold text-green-700">Approved (₹)</th>
                    <th className="text-right py-3 px-4 font-semibold text-red-700">Rejected (₹)</th>
                    <th className="text-right py-3 px-4 font-semibold text-amber-700">Pending (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.employees.map((row) => (
                    <tr key={row.employee_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{row.employee_name}</span>
                        <span className="text-gray-500 ml-1">({row.employee_id})</span>
                      </td>
                      <td className="text-right py-3 px-4 font-medium text-green-700">
                        ₹{Number(row.total_approved).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-right py-3 px-4 text-red-600">
                        ₹{Number(row.total_rejected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-right py-3 px-4 text-amber-600">
                        ₹{Number(row.total_pending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4">No expenses in {summary ? MONTHS[summary.month - 1] + ' ' + summary.year : 'selected month'}.</p>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
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
              <Card key={exp.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{exp.employee_name}</h3>
                    <p className="text-sm text-gray-600">{exp.category} • ₹{Number(exp.amount).toLocaleString('en-IN')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-md text-xs font-medium ${
                    exp.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                    exp.status === 'Approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
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
                    <Button
                      variant="link"
                      size="sm"
                      className="text-emerald-600 hover:text-emerald-700 p-0 h-auto"
                      onClick={() => {
                        setPreviewFileUrl(exp.receipt_path);
                        setPreviewFileName(`Receipt-${exp.id}`);
                        setPreviewOpen(true);
                      }}
                    >
                      <ImageIcon className="h-4 w-4 mr-1" />
                      View receipt
                    </Button>
                  )}
                </div>
                {exp.approver_name && (
                  <p className="text-xs text-gray-600">{exp.status} by {exp.approver_name}</p>
                )}
              </div>
              {canApprove && (
                <div className="flex gap-2 flex-wrap">
                  {(exp.status === 'Pending' || exp.status === 'Rejected') && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-9"
                      onClick={() => handleExpenseAction(exp.id, 'Approved')}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  )}
                  {(exp.status === 'Pending' || exp.status === 'Approved') && (
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white h-9"
                      onClick={() => handleExpenseAction(exp.id, 'Rejected')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  )}
                </div>
              )}
              </div>
              </Card>
            ))}
          </div>

          {filteredExpenses.length === 0 && (
            <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
              <Receipt className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-gray-600">No expenses found</p>
            </Card>
          )}
        </>
      )}

      {/* Receipt Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl bg-white rounded-lg border border-gray-200 shadow-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">Receipt Preview</DialogTitle>
          </DialogHeader>
          {previewFileUrl && (
            <FilePreviewSimple fileUrl={previewFileUrl} fileName={previewFileName} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

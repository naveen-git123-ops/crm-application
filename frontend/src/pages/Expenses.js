import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Check, X, Receipt, Image as ImageIcon, Calculator, Loader } from 'lucide-react';
import { FilePreviewSimple } from '@/components/FilePreviewSimple';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const EXPENSE_CATEGORIES = ['Travel', 'Hotel expense/stay', 'Breakfast', 'Lunch', 'Snacks', 'Dinner'];

const CATEGORY_MAX_AMOUNTS = {
  'Travel': 500,
  'Hotel expense/stay': 'As per situation',
  'Breakfast': 40,
  'Lunch': 120,
  'Snacks': 40,
  'Dinner': 120
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const Expenses = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [partialApprovalDialogOpen, setPartialApprovalDialogOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);
  const [selectedExpenseAmount, setSelectedExpenseAmount] = useState(0);
  const [partialAmount, setPartialAmount] = useState('');
  const [partialReason, setPartialReason] = useState('');
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
    // Prevent duplicate submissions
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      // Validate that receipt file is attached
      if (!receiptFile) {
        toast.error('Receipt/attachment is required to submit an expense');
        setIsSubmitting(false);
        return;
      }
      
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        employee_name: formData.employee_name || user?.name
      };
      const { data } = await axios.post(`${API}/expenses`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      // Upload receipt file to S3
      const formDataUpload = new FormData();
      formDataUpload.append('file', receiptFile);
      await axios.post(`${API}/expenses/${data.id}/receipt`, formDataUpload, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success('Expense submitted successfully');
      setDialogOpen(false);
      setFormData({ employee_id: '', employee_name: '', amount: '', category: 'Travel', description: '' });
      setReceiptFile(null);
      fetchExpenses();
      if (user?.role === 'Admin') fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExpenseAction = async (expenseId, status, approvedAmount = null, reason = null) => {
    try {
      const payload = {
        status,
        approver_id: user.id,
        approver_name: user.name
      };
      if (status === 'Partially-Approved') {
        payload.approved_amount = parseFloat(approvedAmount);
        payload.approval_reason = reason;
      }
      await axios.put(`${API}/expenses/${expenseId}/action`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (status === 'Partially-Approved') {
        toast.success(`₹${approvedAmount} approved with reason: "${reason}"`);
      } else {
        toast.success(`Expense ${status === 'Accountant-Approved' ? 'approved by accountant' : status.toLowerCase()} successfully`);
      }
      fetchExpenses();
      if (user?.role === 'Admin') fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update expense status');
    }
  };

  const handlePartialApprovalSubmit = async () => {
    if (!partialAmount || parseFloat(partialAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!partialReason || partialReason.trim() === '') {
      toast.error('Please provide a reason for partial approval');
      return;
    }
    if (parseFloat(partialAmount) > selectedExpenseAmount) {
      toast.error('Approved amount cannot exceed total expense amount');
      return;
    }
    await handleExpenseAction(selectedExpenseId, 'Partially-Approved', partialAmount, partialReason);
    setPartialApprovalDialogOpen(false);
    setPartialAmount('');
    setPartialReason('');
  };

  const openPartialApprovalDialog = (expenseId, expenseAmount) => {
    setSelectedExpenseId(expenseId);
    setSelectedExpenseAmount(expenseAmount);
    setPartialAmount(expenseAmount * 0.5);
    setPartialReason('');
    setPartialApprovalDialogOpen(true);
  };

  // Check if user can approve (Accountant or Admin)
  const canApprove = !!user?.role && ['Admin', 'Accountant'].includes(user.role);
  
  // Check if user is Accountant
  const isAccountant = user?.role === 'Accountant';
  
  // Check if user is Admin
  const isAdmin = user?.role === 'Admin';
  
  // Helper function to get status label and styling
  const getStatusDisplay = (expense) => {
    switch (expense.status) {
      case 'Pending':
        return { label: 'Pending Accountant Approval', color: 'bg-amber-50 text-amber-700', bgColor: 'bg-amber-100' };
      case 'Partially-Approved':
        return { label: `Partially Approved (₹${Number(expense.accountant_approved_amount || 0).toLocaleString('en-IN')})`, color: 'bg-purple-50 text-purple-700', bgColor: 'bg-purple-100' };
      case 'Accountant-Approved':
        return { label: 'Pending Admin Approval', color: 'bg-blue-50 text-blue-700', bgColor: 'bg-blue-100' };
      case 'Approved':
        return { label: 'Approved', color: 'bg-green-50 text-green-700', bgColor: 'bg-green-100' };
      case 'Rejected':
        return { label: 'Rejected', color: 'bg-red-50 text-red-700', bgColor: 'bg-red-100' };
      default:
        return { label: expense.status, color: 'bg-gray-50 text-gray-700', bgColor: 'bg-gray-100' };
    }
  };
  
  // Determine if user can approve this expense (based on role and current status)
  const canAccountantApprove = (expense) => isAccountant && expense.status === 'Pending' && expense.receipt_path;
  const canAdminApprove = (expense) => isAdmin && (expense.status === 'Accountant-Approved' || expense.status === 'Partially-Approved') && expense.receipt_path;
  const canPartiallyApprove = (expense) => isAccountant && expense.status === 'Pending' && expense.receipt_path;
  const canReject = (expense) => canApprove && (expense.status === 'Pending' || expense.status === 'Accountant-Approved' || expense.status === 'Partially-Approved') && expense.receipt_path;

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
          <p className="text-gray-600 text-sm mt-1">Submit expenses with receipts for 2-level approval (Accountant → Admin)</p>
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
                <p className="text-blue-100 text-sm">Add amount, category, description and receipt (receipt is required)</p>
              </DialogHeader>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-blue-900">📋 Approval Process</p>
                <p className="text-xs text-blue-800">You can request any amount. The Accountant will review and approve, reject, or partially approve based on company policy. Category amounts shown are suggestions only.</p>
              </div>
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
                    <option value="">Select a category</option>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {formData.category && (
                    <p className="text-xs text-gray-600">
                      Maximum suggested: ₹{CATEGORY_MAX_AMOUNTS[formData.category]}
                    </p>
                  )}
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
                <Label className="text-sm font-semibold text-gray-700">Receipt / Screenshot *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="h-11 border border-gray-300"
                    disabled={isSubmitting}
                    required
                  />
                  {receiptFile && (
                    <span className="text-xs text-gray-500 truncate max-w-[120px]">{receiptFile.name}</span>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting} 
                  className={`text-white ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                      Uploading to S3...
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
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
          {/* Approval Workflow Info */}
          {canApprove && (
            <Card className="p-4 rounded-lg border border-blue-200 bg-blue-50 shadow-sm">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-blue-900">📋 2-Level Approval Workflow</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-blue-800">
                  <div>
                    <p className="font-semibold text-blue-900">Level 1: Accountant</p>
                    <p>Reviews expenses in "Pending" status</p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">→ After Accountant Approves</p>
                    <p>Moves to "Pending Admin Approval"</p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">Level 2: Admin</p>
                    <p>Final approval for full "Approved" status</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex gap-2">
              {['All', 'Pending', 'Partially-Approved', 'Accountant-Approved', 'Approved', 'Rejected'].map((tab) => (
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
                  {(() => {
                    const statusInfo = getStatusDisplay(exp);
                    return (
                      <span className={`px-3 py-1 rounded-md text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    );
                  })()}
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
                {/* Show approval chain status */}
                <div className="space-y-2 border-t border-gray-200 pt-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${exp.accountant_approver_name ? (exp.status === 'Partially-Approved' ? 'bg-purple-500' : 'bg-green-500') : 'bg-gray-300'}`}></span>
                    <div>
                      <p className="text-xs font-medium text-gray-700">
                        Level 1 - Accountant Approval
                        {exp.accountant_approver_name ? (
                          exp.status === 'Partially-Approved' ? ` (Partial: ₹${Number(exp.accountant_approved_amount).toLocaleString('en-IN')}) ${exp.accountant_approver_name}` : ` ✓ ${exp.accountant_approver_name}`
                        ) : ' (Pending)'}
                      </p>
                      {exp.accountant_approval_reason && exp.status === 'Partially-Approved' && (
                        <p className="text-xs text-gray-600 mt-1">Reason: {exp.accountant_approval_reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${exp.admin_approver_name ? 'bg-green-500' : exp.accountant_approver_name ? 'bg-yellow-500' : 'bg-gray-300'}`}></span>
                    <p className="text-xs font-medium text-gray-700">
                      Level 2 - Admin Approval
                      {exp.admin_approver_name ? ` ✓ ${exp.admin_approver_name}` : exp.accountant_approver_name ? ' (Ready)' : ' (Waiting)'}
                    </p>
                  </div>
                  {exp.status === 'Rejected' && exp.approver_name && (
                    <p className="text-xs font-medium text-red-600">✗ Rejected by {exp.approver_name}</p>
                  )}
                </div>
              </div>
              {canApprove && (
                <div className="flex gap-2 flex-wrap">
                  {canAccountantApprove(exp) && (
                    <>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white h-9"
                        onClick={() => handleExpenseAction(exp.id, 'Accountant-Approved')}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve (Accountant)
                      </Button>
                      {canPartiallyApprove(exp) && (
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700 text-white h-9"
                          onClick={() => openPartialApprovalDialog(exp.id, exp.amount)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Partially Approve
                        </Button>
                      )}
                    </>
                  )}
                  {canAdminApprove(exp) && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-9"
                      onClick={() => handleExpenseAction(exp.id, 'Approved')}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve (Admin)
                    </Button>
                  )}
                  {canReject(exp) && (
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

      {/* Partial Approval Dialog */}
      <Dialog open={partialApprovalDialogOpen} onOpenChange={setPartialApprovalDialogOpen}>
        <DialogContent className="max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0">
          <div className="bg-purple-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Partially Approve Expense</DialogTitle>
              <p className="text-purple-100 text-sm mt-1">Approve a portion of the expense with a reason</p>
            </DialogHeader>
          </div>
          <div className="space-y-6 p-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-700">Total Expense Amount</Label>
              <div className="text-2xl font-bold text-gray-900">₹{Number(selectedExpenseAmount).toLocaleString('en-IN')}</div>
            </div>
            <div className="space-y-3">
              <Label htmlFor="partial-amount" className="text-sm font-semibold text-gray-700">Amount to Approve (₹) *</Label>
              <Input
                id="partial-amount"
                type="number"
                step="0.01"
                min="0"
                max={selectedExpenseAmount}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className="h-11 border border-gray-300"
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500">Max: ₹{Number(selectedExpenseAmount).toLocaleString('en-IN')}</p>
            </div>
            <div className="space-y-3">
              <Label htmlFor="partial-reason" className="text-sm font-semibold text-gray-700">Reason for Partial Approval *</Label>
              <textarea
                id="partial-reason"
                value={partialReason}
                onChange={(e) => setPartialReason(e.target.value)}
                placeholder="e.g., Only receipts for ₹300 were verified. Remaining requires additional documentation."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setPartialApprovalDialogOpen(false)}>Cancel</Button>
              <Button type="button" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePartialApprovalSubmit}>Submit Partial Approval</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

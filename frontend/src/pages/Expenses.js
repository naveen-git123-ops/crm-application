import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import {
  StandardAppDialogContent,
  StandardAppDialogHeader,
  StandardAppDialogBody,
  StandardAppDialogFooter,
  standardFormLabelClass,
  standardTextInputClass,
  standardSelectClass,
  standardTextareaClass,
  standardCancelButtonClass,
  standardPrimaryButtonClass,
} from '@/components/StandardAppDialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Check, X, Receipt, Image as ImageIcon, Calculator, Loader, Paperclip, ChevronDown, ChevronRight, User, Upload, ArrowRight } from 'lucide-react';
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
  const [optionalAttachment1, setOptionalAttachment1] = useState(null);
  const [optionalAttachment2, setOptionalAttachment2] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryMonth, setSummaryMonth] = useState(new Date().getMonth() + 1);
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const [summaryEmployeeFilter, setSummaryEmployeeFilter] = useState('');
  const [requestEmployeeFilter, setRequestEmployeeFilter] = useState('');
  const [expandedEmployees, setExpandedEmployees] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [previewFileName, setPreviewFileName] = useState('Receipt');
  const [partialApprovalDialogOpen, setPartialApprovalDialogOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);
  const [selectedExpenseAmount, setSelectedExpenseAmount] = useState(0);
  const [partialAmount, setPartialAmount] = useState('');
  const [partialReason, setPartialReason] = useState('');
  const [receiptRetryDialogOpen, setReceiptRetryDialogOpen] = useState(false);
  const [vehicleClaimsSummary, setVehicleClaimsSummary] = useState({});
  const [retryExpenseId, setRetryExpenseId] = useState(null);
  const [retryReceiptFile, setRetryReceiptFile] = useState(null);
  const [isRetryingReceipt, setIsRetryingReceipt] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    amount: '',
    category: 'Travel',
    description: ''
  });
  /** Selected row for desktop split (receipt + detail) */
  const [detailExpenseId, setDetailExpenseId] = useState(null);

  const fetchVehicleClaimsSummary = async () => {
    try {
      const res = await axios.get(
        `${API}/fuel-expense-claims?month=${summaryMonth}&year=${summaryYear}`,
        authHeaders()
      );
      // Group by employee_id
      const claimsByEmployee = {};
      if (Array.isArray(res.data)) {
        res.data.forEach(claim => {
          if (!claimsByEmployee[claim.employee_id]) {
            claimsByEmployee[claim.employee_id] = 0;
          }
          claimsByEmployee[claim.employee_id] += (claim.approved_amount || 0);
        });
      }
      setVehicleClaimsSummary(claimsByEmployee);
    } catch (err) {
      console.log('Error fetching vehicle claims:', err);
      setVehicleClaimsSummary({});
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await axios.get(
        `${API}/expenses/summary-by-employee?month=${summaryMonth}&year=${summaryYear}`,
        authHeaders()
      );
      setSummary(res.data);
      // Also fetch vehicle claims
      fetchVehicleClaimsSummary();
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
    // Reset employee filter when summary changes
    setSummaryEmployeeFilter('');
  }, [summaryMonth, summaryYear]);

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
    let expenseCreated = false;
    
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
      
      expenseCreated = true;
      let receiptUploadSuccess = false;
      
      // Upload receipt file to S3
      try {
        const formDataUpload = new FormData();
        formDataUpload.append('file', receiptFile);
        await axios.post(`${API}/expenses/${data.id}/receipt`, formDataUpload, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        receiptUploadSuccess = true;
      } catch (uploadError) {
        console.error('Receipt upload failed:', uploadError);
        // Expense was created, but receipt upload failed
        toast.warning('Expense created, but receipt upload failed. Please retry uploading the receipt.');
      }
      
      // Upload optional attachments to S3
      let optionalAttachmentErrors = [];
      if (optionalAttachment1) {
        try {
          const formDataUpload = new FormData();
          formDataUpload.append('file', optionalAttachment1);
          formDataUpload.append('attachment_index', 1);
          await axios.post(`${API}/expenses/${data.id}/attachment`, formDataUpload, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'multipart/form-data'
            }
          });
        } catch (uploadError) {
          console.error('Optional attachment 1 upload failed:', uploadError);
          optionalAttachmentErrors.push('Attachment 1');
        }
      }
      
      if (optionalAttachment2) {
        try {
          const formDataUpload = new FormData();
          formDataUpload.append('file', optionalAttachment2);
          formDataUpload.append('attachment_index', 2);
          await axios.post(`${API}/expenses/${data.id}/attachment`, formDataUpload, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'multipart/form-data'
            }
          });
        } catch (uploadError) {
          console.error('Optional attachment 2 upload failed:', uploadError);
          optionalAttachmentErrors.push('Attachment 2');
        }
      }
      
      if (receiptUploadSuccess) {
        if (optionalAttachmentErrors.length > 0) {
          toast.success(`Expense submitted with receipt, but ${optionalAttachmentErrors.join(', ')} failed to upload`);
        } else {
          toast.success('Expense submitted successfully with all attachments');
        }
      }
      
      setDialogOpen(false);
      setFormData({ employee_id: '', employee_name: '', amount: '', category: 'Travel', description: '' });
      setReceiptFile(null);
      setOptionalAttachment1(null);
      setOptionalAttachment2(null);
      fetchExpenses();
      if (user?.role === 'Admin') fetchSummary();
    } catch (error) {
      if (expenseCreated) {
        toast.error('Expense created but receipt upload failed. Please retry.');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to submit expense');
      }
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

  const handleReceiptRetry = async () => {
    if (!retryReceiptFile) {
      toast.error('Please select a receipt file');
      return;
    }
    
    setIsRetryingReceipt(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', retryReceiptFile);
      await axios.post(`${API}/expenses/${retryExpenseId}/receipt`, formDataUpload, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('Receipt uploaded successfully');
      setReceiptRetryDialogOpen(false);
      setRetryReceiptFile(null);
      setRetryExpenseId(null);
      fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload receipt');
    } finally {
      setIsRetryingReceipt(false);
    }
  };

  // Check if user can approve (Accountant or Admin)
  const canApprove = !!user?.role && ['Admin', 'Accountant'].includes(user.role);
  
  // Check if user is Accountant
  const isAccountant = user?.role === 'Accountant';
  
  // Check if user is Admin
  const isAdmin = user?.role === 'Admin';
  
  // Helper function to get status label and styling
  const getStatusDisplay = (expense) => {
    const base = 'inline-flex max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold ring-1';
    switch (expense.status) {
      case 'Pending':
        return {
          label: 'Pending accountant',
          color: `${base} bg-amber-50 text-amber-900 ring-amber-200/80`
        };
      case 'Partially-Approved':
        return {
          label: `Partial ₹${Number(expense.accountant_approved_amount || 0).toLocaleString('en-IN')}`,
          color: `${base} bg-violet-50 text-violet-900 ring-violet-200/80`
        };
      case 'Accountant-Approved':
        return {
          label: 'Pending admin',
          color: `${base} bg-sky-50 text-sky-900 ring-sky-200/80`
        };
      case 'Approved':
        return {
          label: 'Approved',
          color: `${base} bg-emerald-50 text-emerald-900 ring-emerald-200/80`
        };
      case 'Rejected':
        return {
          label: 'Rejected',
          color: `${base} bg-rose-50 text-rose-900 ring-rose-200/80`
        };
      default:
        return {
          label: expense.status,
          color: `${base} bg-slate-100 text-slate-800 ring-slate-200/80`
        };
    }
  };
  
  // Determine if user can approve this expense (based on role and current status)
  const canAccountantApprove = (expense) => isAccountant && expense.status === 'Pending' && expense.receipt_path;
  const canAdminApprove = (expense) => isAdmin && (expense.status === 'Accountant-Approved' || expense.status === 'Partially-Approved') && expense.receipt_path;
  const canPartiallyApprove = (expense) => isAccountant && expense.status === 'Pending' && expense.receipt_path;
  const canReject = (expense) => canApprove && (expense.status === 'Pending' || expense.status === 'Accountant-Approved' || expense.status === 'Partially-Approved') && expense.receipt_path;
  
  // Check if Accountant can see but receipt is missing
  const needsReceiptForApproval = (expense) => isAccountant && expense.status === 'Pending' && !expense.receipt_path;

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((exp) => {
        if (activeTab !== 'All' && exp.status !== activeTab) return false;
        if (!canApprove && exp.employee_id !== user?.employee_id) return false;
        if (requestEmployeeFilter && exp.employee_id !== requestEmployeeFilter) return false;
        return true;
      }),
    [expenses, activeTab, canApprove, user?.employee_id, requestEmployeeFilter]
  );

  const expensesForUser = useMemo(
    () =>
      expenses.filter((exp) => {
        if (!canApprove && exp.employee_id !== user?.employee_id) return false;
        return true;
      }),
    [expenses, canApprove, user?.employee_id]
  );

  const requestEmployeeOptions = useMemo(() => {
    const byEmployee = new Map();
    expensesForUser.forEach((exp) => {
      const id = exp.employee_id || '';
      if (!id || byEmployee.has(id)) return;
      byEmployee.set(id, {
        employee_id: id,
        employee_name: exp.employee_name || id
      });
    });
    return Array.from(byEmployee.values()).sort((a, b) =>
      String(a.employee_name || '').localeCompare(String(b.employee_name || ''))
    );
  }, [expensesForUser]);

  const expenseKpis = useMemo(() => {
    let pending = 0;
    let level1 = 0;
    let level2 = 0;
    for (const e of expensesForUser) {
      const amt = Number(e.amount) || 0;
      if (e.status === 'Pending') pending += amt;
      if (e.status === 'Accountant-Approved') level1 += amt;
      if (e.status === 'Partially-Approved') level1 += Number(e.accountant_approved_amount || 0);
      if (e.status === 'Approved') level2 += amt;
    }
    return { pending, level1, level2 };
  }, [expensesForUser]);

  const detailExpense = useMemo(
    () => filteredExpenses.find((e) => e.id === detailExpenseId) || null,
    [filteredExpenses, detailExpenseId]
  );

  useEffect(() => {
    if (user?.role === 'Admin' && pageTab === 'Summary') return;
    if (filteredExpenses.length === 0) {
      setDetailExpenseId(null);
      return;
    }
    setDetailExpenseId((cur) =>
      cur && filteredExpenses.some((e) => e.id === cur) ? cur : filteredExpenses[0].id
    );
  }, [filteredExpenses, pageTab, user?.role]);

  const employeeInitial = (name) => {
    const s = String(name || '?').trim();
    return s ? s[0].toUpperCase() : '?';
  };

  const l1StatusUi = (exp) => {
    if (exp.status === 'Pending')
      return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100" title="Pending" />;
    if (exp.status === 'Rejected' && !exp.accountant_approver_name)
      return <span className="text-[10px] font-semibold text-rose-600">—</span>;
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/80">
        OK
      </span>
    );
  };

  const l2StatusUi = (exp) => {
    if (exp.status === 'Approved')
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80">
          OK
        </span>
      );
    if (exp.status === 'Accountant-Approved' || exp.status === 'Partially-Approved')
      return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100" title="Awaiting admin" />;
    if (exp.status === 'Pending') return <span className="text-[10px] font-semibold text-slate-400">—</span>;
    if (exp.status === 'Rejected')
      return <span className="text-[10px] font-semibold text-rose-600">—</span>;
    return <span className="text-[10px] font-semibold text-slate-400">—</span>;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div
      className="relative space-y-5 pb-32 text-slate-800 antialiased md:pb-8 [font-family:ui-sans-serif,system-ui,-apple-system,Segoe_UI,Roboto,Inter,sans-serif]"
      data-testid="expenses-page"
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <StandardAppDialogContent size="md" className="max-h-[min(88dvh,40rem)] flex flex-col">
            <StandardAppDialogHeader
              title="Submit Expense"
              subtitle="Add amount, category, description, and a receipt. Receipt is required for approval."
              icon={Receipt}
            />
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <StandardAppDialogBody className="flex-1 space-y-5">
                <div className="rounded-xl border border-sky-100/90 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-sm ring-1 ring-sky-100/50">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-sky-900/85">
                    Approval process
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    You can request any amount. The accountant will review and approve, reject, or partially approve based on company policy. Category amounts are suggestions only.
                  </p>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm ring-1 ring-slate-100">
                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-red-500 to-rose-500" aria-hidden />
                  <div className="pl-3">
                    <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                      <User className="h-3.5 w-3.5 text-red-500" aria-hidden />
                      Employee
                    </div>
                    <div className="mt-1.5 text-base font-semibold text-slate-900">
                      {formData.employee_name || user?.name}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-600">ID {user?.employee_id}</div>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount" className={standardFormLabelClass}>
                      Amount (₹) *
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                      className={standardTextInputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category" className={standardFormLabelClass}>
                      Category *
                    </Label>
                    <div className="relative">
                      <select
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className={standardSelectClass}
                        required
                      >
                        <option value="">Select a category</option>
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                    {formData.category && (
                      <p className="text-xs text-slate-500">
                        Suggested max: ₹{CATEGORY_MAX_AMOUNTS[formData.category]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className={standardFormLabelClass}>
                    Description *
                  </Label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                    placeholder="Brief description of the expense..."
                    rows={3}
                    className={standardTextareaClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label className={standardFormLabelClass}>Receipt / screenshot *</Label>
                  <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 p-3 ring-1 ring-inset ring-slate-100/60 transition-colors hover:border-red-200/80 hover:bg-red-50/20">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                        className="h-10 min-w-[8rem] flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm shadow-none file:mr-2 file:rounded-lg file:border-0 file:bg-gradient-to-br file:from-red-500 file:to-rose-600 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-white file:shadow-md file:shadow-red-500/20"
                        disabled={isSubmitting}
                        required
                      />
                      {receiptFile && (
                        <span
                          className="max-w-[200px] truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80"
                          title={receiptFile.name}
                        >
                          ✓ {receiptFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className={standardFormLabelClass}>Additional attachment 1 (optional)</Label>
                  <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setOptionalAttachment1(e.target.files?.[0] || null)}
                        className="h-10 min-w-[8rem] flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm shadow-none file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-800"
                        disabled={isSubmitting}
                      />
                      {optionalAttachment1 && (
                        <span className="max-w-[180px] truncate text-xs text-slate-600" title={optionalAttachment1.name}>
                          ✓ {optionalAttachment1.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className={standardFormLabelClass}>Additional attachment 2 (optional)</Label>
                  <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setOptionalAttachment2(e.target.files?.[0] || null)}
                        className="h-10 min-w-[8rem] flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm shadow-none file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-800"
                        disabled={isSubmitting}
                      />
                      {optionalAttachment2 && (
                        <span className="max-w-[180px] truncate text-xs text-slate-600" title={optionalAttachment2.name}>
                          ✓ {optionalAttachment2.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </StandardAppDialogBody>

              <StandardAppDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSubmitting}
                  className={standardCancelButtonClass}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className={
                    isSubmitting
                      ? 'h-12 cursor-not-allowed rounded-xl bg-slate-300 font-semibold text-white'
                      : standardPrimaryButtonClass
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
              </StandardAppDialogFooter>
            </form>
          </StandardAppDialogContent>
        </Dialog>

      {/* Top-level tabs: Requests | Summary (Summary only for Admin) */}
      {user?.role === 'Admin' && (
        <Card className="rounded-2xl border-0 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60">
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-9 gap-2 rounded-xl px-4 text-sm font-semibold ${
                pageTab === 'Requests'
                  ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setPageTab('Requests')}
            >
              <Receipt className="h-4 w-4" />
              Requests
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-9 gap-2 rounded-xl px-4 text-sm font-semibold ${
                pageTab === 'Summary'
                  ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setPageTab('Summary')}
            >
              <Calculator className="h-4 w-4" />
              Summary
            </Button>
          </div>
        </Card>
      )}

      {pageTab === 'Summary' && user?.role === 'Admin' ? (
        <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-5 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-md shadow-sky-500/25">
                <Calculator className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Summary by employee</h2>
                <p className="mt-0.5 text-sm text-slate-500">Payroll and month-end reconciliation.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0">
              <select
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(Number(e.target.value))}
                className="h-10 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={summaryYear}
                onChange={(e) => setSummaryYear(Number(e.target.value))}
                className="h-10 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20"
              >
                {[summaryYear - 2, summaryYear - 1, summaryYear, summaryYear + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={summaryEmployeeFilter}
                onChange={(e) => setSummaryEmployeeFilter(e.target.value)}
                className="h-10 min-w-[10rem] rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All employees</option>
                {summary?.employees?.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.employee_name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-4 sm:p-5">
          {summary?.employees?.length > 0 ? (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200/60">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-3 py-3 text-left" />
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-right text-emerald-700">Approved</th>
                    <th className="px-4 py-3 text-right text-sky-700">Fuel</th>
                    <th className="bg-violet-50/80 px-4 py-3 text-right font-bold text-violet-900">Total pay</th>
                    <th className="px-4 py-3 text-right text-rose-700">Rejected</th>
                    <th className="px-4 py-3 text-right text-amber-700">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.employees
                    .filter(row => !summaryEmployeeFilter || row.employee_id === summaryEmployeeFilter)
                    .map((row) => {
                    const fuelApproved = vehicleClaimsSummary[row.employee_id] || 0;
                    const totalToPay = (row.total_approved || 0) + fuelApproved;
                    const isExpanded = expandedEmployees[row.employee_id];
                    const employeeExpenses = expenses.filter(exp => exp.employee_id === row.employee_id && new Date(exp.created_at).getMonth() === summaryMonth - 1 && new Date(exp.created_at).getFullYear() === summaryYear);
                    
                    return (
                      <React.Fragment key={row.employee_id}>
                        <tr key={`main-${row.employee_id}`} className="border-b border-slate-50 transition-colors hover:bg-slate-50/60">
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedEmployees(prev => ({ ...prev, [row.employee_id]: !prev[row.employee_id] }))}
                              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-sky-700 hover:ring-1 hover:ring-slate-200"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900">{row.employee_name}</span>
                            <span className="ml-1 text-slate-500">({row.employee_id})</span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-emerald-800">
                            ₹{Number(row.total_approved).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-sky-800">
                            ₹{Number(fuelApproved).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="bg-violet-50/50 px-4 py-3 text-right text-base font-bold tabular-nums text-violet-950">
                            ₹{Number(totalToPay).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-rose-700">
                            ₹{Number(row.total_rejected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-amber-800">
                            ₹{Number(row.total_pending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`detail-${row.employee_id}`} className="border-b border-slate-100 bg-slate-50/50">
                            <td colSpan="7" className="p-4">
                              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                                <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Line items</h4>
                                {employeeExpenses.length > 0 ? (
                                  <div className="space-y-2">
                                    {employeeExpenses.map(expense => (
                                      <div key={expense.id} className="flex flex-wrap gap-4 rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-sm ring-1 ring-slate-100/80">
                                        <div className="min-w-[140px] flex-1">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</p>
                                          <p className="font-semibold text-slate-900">{expense.category}</p>
                                        </div>
                                        <div className="min-w-[100px] flex-1">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Amount</p>
                                          <p className="font-semibold tabular-nums text-slate-900">₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="min-w-[120px] flex-[2]">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
                                          <p className="text-slate-800">{expense.description}</p>
                                        </div>
                                        <div className="min-w-[100px] flex-1">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
                                          <p className={`font-semibold ${
                                            expense.status === 'Approved' ? 'text-emerald-700' :
                                            expense.status === 'Partially-Approved' ? 'text-violet-700' :
                                            expense.status === 'Accountant-Approved' ? 'text-sky-700' :
                                            expense.status === 'Rejected' ? 'text-rose-700' :
                                            'text-amber-700'
                                          }`}>{expense.status}</p>
                                        </div>
                                        {expense.status === 'Partially-Approved' && (
                                          <div className="min-w-[100px] flex-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Approved</p>
                                            <p className="font-semibold tabular-nums text-slate-900">₹{Number(expense.accountant_approved_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                          </div>
                                        )}
                                        {expense.accountant_approval_reason && (
                                          <div className="min-w-[150px] flex-[2]">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reason</p>
                                            <p className="text-slate-800">{expense.accountant_approval_reason}</p>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-500">No expenses for this employee in the selected month.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No data for {summary ? `${MONTHS[summary.month - 1]} ${summary.year}` : 'this period'}.</p>
          )}
          </div>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Employee expenses</h2>
              <p className="mt-1 text-xs text-slate-500">
                Totals below include all your visible claims (every status). Use filters for the list.
              </p>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-stretch">
              <div className="grid flex-1 grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-3 lg:border-b-0">
                <div className="flex flex-col justify-center px-4 py-4 sm:py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total pending</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    ₹{Number(expenseKpis.pending).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Awaiting accountant</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{
                        width: `${Math.min(100, Math.round((expenseKpis.pending / Math.max(expenseKpis.pending, expenseKpis.level1, expenseKpis.level2, 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-center px-4 py-4 sm:py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Level 1 cleared</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    ₹{Number(expenseKpis.level1).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Through accountant</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{
                        width: `${Math.min(100, Math.round((expenseKpis.level1 / Math.max(expenseKpis.pending, expenseKpis.level1, expenseKpis.level2, 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
                <div className="col-span-2 flex flex-col justify-center border-t border-slate-100 px-4 py-4 sm:col-span-1 sm:border-t-0 sm:py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Level 2 approved</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    ₹{Number(expenseKpis.level2).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Admin final</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{
                        width: `${Math.min(100, Math.round((expenseKpis.level2 / Math.max(expenseKpis.pending, expenseKpis.level1, expenseKpis.level2, 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="hidden items-center justify-center border-t border-slate-100 p-4 md:flex lg:w-52 lg:border-l lg:border-t-0 lg:px-5">
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:bg-sky-700 lg:w-auto"
                  onClick={() => setDialogOpen(true)}
                >
                  Submit expense
                  <Plus className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Approval Workflow Info */}
          {canApprove && (
            <Card className="rounded-2xl border-0 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/60">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Receipt className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Two-step approval</h3>
              </div>
              <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <p className="font-semibold text-slate-900">1 · Accountant</p>
                  <p className="mt-1 leading-relaxed">Reviews pending claims and receipt.</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <p className="font-semibold text-slate-900">2 · Handoff</p>
                  <p className="mt-1 leading-relaxed">Approved items move to admin queue.</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <p className="font-semibold text-slate-900">3 · Admin</p>
                  <p className="mt-1 leading-relaxed">Final sign-off marks expense approved.</p>
                </div>
              </div>
            </Card>
          )}

          <Card className="rounded-2xl border-0 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {['All', 'Pending', 'Partially-Approved', 'Accountant-Approved', 'Approved', 'Rejected'].map((tab) => (
                  <Button
                    key={tab}
                    variant="ghost"
                    size="sm"
                    className={`h-9 shrink-0 whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${
                      activeTab === tab
                        ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </Button>
                ))}
              </div>
              <div className="ml-auto w-full sm:w-auto">
                <select
                  value={requestEmployeeFilter}
                  onChange={(e) => setRequestEmployeeFilter(e.target.value)}
                  className="h-9 w-full min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">All employees</option>
                  {requestEmployeeOptions.map((emp) => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.employee_name} ({emp.employee_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_min(38vw,26rem)] lg:items-start lg:gap-5">
            <div className="min-w-0 space-y-4">
              <Card className="hidden overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 lg:block">
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Requests summary</h2>
                  <p className="text-xs text-slate-400">Select a row to preview the receipt and notes.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-3">Employee</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">Date</th>
                        <th className="px-3 py-3 text-right">Amount</th>
                        <th className="max-w-[200px] px-3 py-3">Description</th>
                        <th className="px-3 py-3 text-center">L1</th>
                        <th className="px-3 py-3 text-center">L2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                            No requests match this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredExpenses.map((exp) => (
                          <tr
                            key={exp.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setDetailExpenseId(exp.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setDetailExpenseId(exp.id);
                              }
                            }}
                            className={`cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/60 ${
                              detailExpenseId === exp.id ? 'bg-sky-50/50 ring-1 ring-inset ring-sky-100' : ''
                            }`}
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                                  {employeeInitial(exp.employee_name)}
                                </span>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">{exp.employee_name}</div>
                                  <div className="text-xs text-slate-500">{exp.employee_id}</div>
                                </div>
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{exp.category}</td>
                            <td className="px-3 py-3 text-slate-700">
                              {exp.created_at
                                ? new Date(exp.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
                                : '—'}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                              ₹{Number(exp.amount).toLocaleString('en-IN')}
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-3 text-slate-600" title={exp.description}>
                              {exp.description}
                            </td>
                            <td className="px-3 py-3 text-center">{l1StatusUi(exp)}</td>
                            <td className="px-3 py-3 text-center">{l2StatusUi(exp)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="space-y-4 lg:hidden">
            {filteredExpenses.map((exp) => (
              <Card
                key={exp.id}
                className={`cursor-pointer overflow-hidden rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 transition-shadow ${
                  detailExpenseId === exp.id ? 'ring-2 ring-sky-200 shadow-md' : ''
                }`}
                onClick={() => setDetailExpenseId(exp.id)}
              >
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employee</p>
                      <h3 className="text-lg font-bold text-slate-900">{exp.employee_name}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {exp.category}
                        <span className="text-slate-400"> · </span>
                        <span className="tabular-nums text-slate-900">₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                      </p>
                    </div>
                    {(() => {
                      const statusInfo = getStatusDisplay(exp);
                      return <span className={statusInfo.color}>{statusInfo.label}</span>;
                    })()}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[10px] font-bold uppercase text-slate-600 shadow-sm ring-1 ring-slate-200">
                      L1
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Accountant</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden />
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[10px] font-bold uppercase text-slate-600 shadow-sm ring-1 ring-slate-200">
                      L2
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Admin</span>
                  </div>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <p className="text-sm leading-relaxed text-slate-700">{exp.description}</p>
                  <p className="text-xs text-slate-400">
                    Submitted {new Date(exp.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </p>
                  <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attachments</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {exp.receipt_path && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50/50 hover:text-sky-900"
                          onClick={() => {
                            setPreviewFileUrl(exp.receipt_path);
                            setPreviewFileName(`Receipt-${exp.id}`);
                            setPreviewOpen(true);
                          }}
                        >
                          <ImageIcon className="h-4 w-4 text-sky-600" />
                          Receipt
                        </Button>
                      )}
                      {exp.attachment_path_1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50/50 hover:text-sky-900"
                          onClick={() => {
                            setPreviewFileUrl(exp.attachment_path_1);
                            setPreviewFileName(`Attachment 1-${exp.id}`);
                            setPreviewOpen(true);
                          }}
                        >
                          <ImageIcon className="h-4 w-4 text-slate-500" />
                          Attachment 1
                        </Button>
                      )}
                      {exp.attachment_path_2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50/50 hover:text-sky-900"
                          onClick={() => {
                            setPreviewFileUrl(exp.attachment_path_2);
                            setPreviewFileName(`Attachment 2-${exp.id}`);
                            setPreviewOpen(true);
                          }}
                        >
                          <ImageIcon className="h-4 w-4 text-slate-500" />
                          Attachment 2
                        </Button>
                      )}
                      {!exp.receipt_path && !exp.attachment_path_1 && !exp.attachment_path_2 && (
                        <p className="text-xs italic text-slate-400">No attachments</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3 ring-1 ring-slate-100/80">
                    <div className="flex gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          exp.accountant_approver_name
                            ? exp.status === 'Partially-Approved'
                              ? 'bg-violet-500'
                              : 'bg-emerald-500'
                            : 'bg-slate-300'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Accountant</p>
                        <p className="text-xs text-slate-600">
                          {exp.accountant_approver_name
                            ? exp.status === 'Partially-Approved'
                              ? `Partial ₹${Number(exp.accountant_approved_amount).toLocaleString('en-IN')} · ${exp.accountant_approver_name}`
                              : `Approved · ${exp.accountant_approver_name}`
                            : 'Pending'}
                        </p>
                        {exp.accountant_approval_reason && exp.status === 'Partially-Approved' && (
                          <p className="mt-1 text-xs text-slate-500">Reason: {exp.accountant_approval_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          exp.admin_approver_name ? 'bg-emerald-500' : exp.accountant_approver_name ? 'bg-amber-400' : 'bg-slate-300'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Admin</p>
                        <p className="text-xs text-slate-600">
                          {exp.admin_approver_name
                            ? `Approved · ${exp.admin_approver_name}`
                            : exp.accountant_approver_name
                              ? 'Awaiting review'
                              : 'Waiting on accountant'}
                        </p>
                      </div>
                    </div>
                    {exp.status === 'Rejected' && exp.approver_name && (
                      <p className="text-xs font-semibold text-rose-700">Rejected by {exp.approver_name}</p>
                    )}
                  </div>
                  {canApprove && (
                    <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap">
                      {canAccountantApprove(exp) && (
                        <>
                          <Button
                            size="sm"
                            className="h-10 gap-1.5 rounded-xl bg-slate-900 font-semibold text-white shadow-sm hover:bg-slate-800"
                            onClick={() => handleExpenseAction(exp.id, 'Accountant-Approved')}
                          >
                            <Check className="h-4 w-4" />
                            Approve (accountant)
                          </Button>
                          {canPartiallyApprove(exp) && (
                            <Button
                              size="sm"
                              className="h-10 gap-1.5 rounded-xl border border-violet-200 bg-violet-50 font-semibold text-violet-900 hover:bg-violet-100"
                              onClick={() => openPartialApprovalDialog(exp.id, exp.amount)}
                            >
                              <Check className="h-4 w-4" />
                              Partial approve
                            </Button>
                          )}
                        </>
                      )}
                      {needsReceiptForApproval(exp) && (
                        <>
                          <div className="flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                            Receipt required before approval
                          </div>
                          {exp.employee_id === user?.employee_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 gap-1.5 rounded-xl border-amber-300 text-amber-900 hover:bg-amber-50"
                              onClick={() => {
                                setRetryExpenseId(exp.id);
                                setReceiptRetryDialogOpen(true);
                              }}
                            >
                              <Paperclip className="h-4 w-4" />
                              Upload receipt
                            </Button>
                          )}
                        </>
                      )}
                      {canAdminApprove(exp) && (
                        <Button
                          size="sm"
                          className="h-10 gap-1.5 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700"
                          onClick={() => handleExpenseAction(exp.id, 'Approved')}
                        >
                          <Check className="h-4 w-4" />
                          Approve (admin)
                        </Button>
                      )}
                      {canReject(exp) && (
                        <Button
                          size="sm"
                          className="h-10 gap-1.5 rounded-xl bg-rose-600 font-semibold text-white shadow-sm hover:bg-rose-700"
                          onClick={() => handleExpenseAction(exp.id, 'Rejected')}
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              </Card>
            ))}
              </div>
            </div>

            <aside className="sticky top-4 hidden max-h-[calc(100dvh-5.5rem)] min-h-[320px] w-full flex-col overflow-y-auto rounded-2xl border-0 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 lg:flex">
              {detailExpense ? (
                <>
                  <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Receipt & detail</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      ₹{Number(detailExpense.amount).toLocaleString('en-IN')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(() => {
                        const s = getStatusDisplay(detailExpense);
                        return <span className={s.color}>{s.label}</span>;
                      })()}
                      <span className="text-xs text-slate-500">{detailExpense.employee_name}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">PDF / receipt</p>
                      <div className="mt-2 max-h-[min(52vh,420px)] overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-inner ring-1 ring-slate-100">
                        {detailExpense.receipt_path ? (
                          <FilePreviewSimple
                            fileUrl={detailExpense.receipt_path}
                            fileName={`Receipt-${detailExpense.id}`}
                          />
                        ) : (
                          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
                            <Receipt className="h-10 w-10 text-slate-300" />
                            No receipt uploaded yet.
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Description</p>
                      <div className="mt-2 rounded-xl border border-slate-200/90 bg-slate-50/50 px-3 py-2 text-sm leading-relaxed text-slate-800">
                        {detailExpense.description || '—'}
                      </div>
                    </div>
                    {detailExpense.accountant_approval_reason && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Approver reason</p>
                        <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-sm text-violet-950">
                          {detailExpense.accountant_approval_reason}
                        </div>
                      </div>
                    )}
                    {canApprove && (
                      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                        {canAccountantApprove(detailExpense) && (
                          <>
                            <Button
                              size="sm"
                              className="h-10 w-full gap-1.5 rounded-xl bg-slate-900 font-semibold text-white shadow-sm hover:bg-slate-800"
                              onClick={() => handleExpenseAction(detailExpense.id, 'Accountant-Approved')}
                            >
                              <Check className="h-4 w-4" />
                              Approve (accountant)
                            </Button>
                            {canPartiallyApprove(detailExpense) && (
                              <Button
                                size="sm"
                                className="h-10 w-full gap-1.5 rounded-xl border border-violet-200 bg-violet-50 font-semibold text-violet-900 hover:bg-violet-100"
                                onClick={() => openPartialApprovalDialog(detailExpense.id, detailExpense.amount)}
                              >
                                <Check className="h-4 w-4" />
                                Partial approve
                              </Button>
                            )}
                          </>
                        )}
                        {needsReceiptForApproval(detailExpense) && detailExpense.employee_id === user?.employee_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 w-full gap-1.5 rounded-xl border-amber-300 bg-amber-50 font-semibold text-amber-950 hover:bg-amber-100"
                            onClick={() => {
                              setRetryExpenseId(detailExpense.id);
                              setReceiptRetryDialogOpen(true);
                            }}
                          >
                            <Paperclip className="h-4 w-4" />
                            Retry receipt upload
                          </Button>
                        )}
                        {canAdminApprove(detailExpense) && (
                          <Button
                            size="sm"
                            className="h-10 w-full gap-1.5 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700"
                            onClick={() => handleExpenseAction(detailExpense.id, 'Approved')}
                          >
                            <Check className="h-4 w-4" />
                            Approve (admin)
                          </Button>
                        )}
                        {canReject(detailExpense) && (
                          <Button
                            size="sm"
                            className="h-10 w-full gap-1.5 rounded-xl bg-rose-600 font-semibold text-white shadow-sm hover:bg-rose-700"
                            onClick={() => handleExpenseAction(detailExpense.id, 'Rejected')}
                          >
                            <X className="h-4 w-4" />
                            Reject
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-500">
                  <Receipt className="h-10 w-10 text-slate-200" />
                  Select a request to preview the receipt here.
                </div>
              )}
            </aside>
          </div>

          {filteredExpenses.length === 0 && (
            <Card className="rounded-2xl border-0 bg-white py-16 text-center shadow-[0_4px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60">
              <Receipt className="mx-auto mb-3 h-12 w-12 text-slate-200" />
              <p className="font-medium text-slate-700">No expenses in this view</p>
              <p className="mt-1 text-sm text-slate-500">Try another status filter or submit a new expense.</p>
            </Card>
          )}
        </>
      )}

      {/* Receipt Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <StandardAppDialogContent size="xl" className="max-h-[min(90dvh,85vh)]">
          <StandardAppDialogHeader
            title="Receipt Preview"
            subtitle={previewFileName || 'Attachment'}
            icon={ImageIcon}
          />
          <StandardAppDialogBody className="min-h-0 flex-1 py-4">
            {previewFileUrl ? (
              <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-inner ring-1 ring-slate-100">
                <FilePreviewSimple fileUrl={previewFileUrl} fileName={previewFileName} />
              </div>
            ) : null}
          </StandardAppDialogBody>
        </StandardAppDialogContent>
      </Dialog>

      {/* Partial Approval Dialog */}
      <Dialog open={partialApprovalDialogOpen} onOpenChange={setPartialApprovalDialogOpen}>
        <StandardAppDialogContent size="md">
          <StandardAppDialogHeader
            title="Partially approve expense"
            subtitle="Approve a portion of the claimed amount and record why."
            icon={Calculator}
          />
          <StandardAppDialogBody className="space-y-5 pb-2">
            <div className="space-y-2">
              <Label className={standardFormLabelClass}>Total expense amount</Label>
              <div className="flex h-14 items-center rounded-xl border border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 shadow-inner ring-1 ring-slate-100/80">
                <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                  ₹{Number(selectedExpenseAmount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partial-amount" className={standardFormLabelClass}>
                Amount to approve (₹) *
              </Label>
              <Input
                id="partial-amount"
                type="number"
                step="0.01"
                min="0"
                max={selectedExpenseAmount}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className={standardTextInputClass}
                placeholder="0.00"
              />
              <p className="text-xs text-slate-500">
                Max ₹{Number(selectedExpenseAmount).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partial-reason" className={standardFormLabelClass}>
                Reason *
              </Label>
              <textarea
                id="partial-reason"
                value={partialReason}
                onChange={(e) => setPartialReason(e.target.value)}
                placeholder="e.g. Only part of the receipt matched policy."
                rows={3}
                className={standardTextareaClass}
              />
            </div>
          </StandardAppDialogBody>
          <StandardAppDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPartialApprovalDialogOpen(false)}
              className={standardCancelButtonClass}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={standardPrimaryButtonClass}
              onClick={handlePartialApprovalSubmit}
            >
              Submit partial approval
            </Button>
          </StandardAppDialogFooter>
        </StandardAppDialogContent>
      </Dialog>

      {/* Receipt Retry Upload Dialog */}
      <Dialog open={receiptRetryDialogOpen} onOpenChange={setReceiptRetryDialogOpen}>
        <StandardAppDialogContent size="md">
          <StandardAppDialogHeader
            title="Upload receipt"
            subtitle="Add the missing receipt so this expense can continue review."
            icon={Upload}
          />
          <StandardAppDialogBody>
            <div className="space-y-2">
              <Label className={standardFormLabelClass}>Receipt / screenshot *</Label>
              <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 p-3 ring-1 ring-inset ring-slate-100/60 transition-colors hover:border-red-200/80 hover:bg-red-50/20">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setRetryReceiptFile(e.target.files?.[0] || null)}
                    className="h-10 min-w-[8rem] flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm shadow-none file:mr-2 file:rounded-lg file:border-0 file:bg-gradient-to-br file:from-red-500 file:to-rose-600 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-white file:shadow-md file:shadow-red-500/20"
                    disabled={isRetryingReceipt}
                    required
                  />
                  {retryReceiptFile && (
                    <span
                      className="max-w-[200px] truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80"
                      title={retryReceiptFile.name}
                    >
                      ✓ {retryReceiptFile.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </StandardAppDialogBody>
          <StandardAppDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReceiptRetryDialogOpen(false);
                setRetryReceiptFile(null);
              }}
              disabled={isRetryingReceipt}
              className={standardCancelButtonClass}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isRetryingReceipt}
              className={
                isRetryingReceipt
                  ? 'h-12 cursor-not-allowed rounded-xl bg-slate-300 font-semibold text-white'
                  : standardPrimaryButtonClass
              }
              onClick={handleReceiptRetry}
            >
              {isRetryingReceipt ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Paperclip className="mr-2 h-4 w-4" />
                  Upload receipt
                </>
              )}
            </Button>
          </StandardAppDialogFooter>
        </StandardAppDialogContent>
      </Dialog>

      <Button
        type="button"
        aria-label="Submit expense"
        className="fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30 md:hidden bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="h-7 w-7" />
      </Button>
    </div>
  );
};

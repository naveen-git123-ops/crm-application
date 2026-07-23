import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Plus,
  Target,
  List,
  Filter,
  Phone,
  Mail,
  Building2,
  User,
  IndianRupee,
  Edit2,
  Trash2,
  Activity,
  ChevronRight,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const SOURCES = ['Website', 'Referral', 'Cold Call', 'Social Media', 'Partner', 'Exhibition', 'Other'];
const STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Note'];

const CATEGORY_OPTIONS = [
  'Project',
  'Automation',
  'Instruments',
  'Electrical &utility',
  'Ion exchange',
  'ssd',
  'ion exchange chemical',
  'cgw noc',
  'cgwa flow metre',
];

const defaultLeadForm = {
  contact_name: '',
  company: '',
  email: '',
  phone: '',
  source: 'Other',
  status: 'New',
  value: '',
  notes: '',
  assigned_to_employee_id: '',
  assigned_to_name: '',
  category: '',
  sub_category: '',
  contacts: [
    { name: '', designation: '', email: '', number: '' }
  ],
};

export const Leads = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_status: {} });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('pipeline'); // 'pipeline' | 'list'
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterAssigned, setFilterAssigned] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [formData, setFormData] = useState({ ...defaultLeadForm });
  const [activityForm, setActivityForm] = useState({ activity_type: 'Note', summary: '' });

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  /** Sales can only edit/delete/comment on leads they created; Admin and Manager can do all. */
  const canEditLead = (lead) => {
    if (!lead || !user) return false;
    if (['Admin', 'Manager'].includes(user.role)) return true;
    if (user.role === 'Sales') return String(lead.created_by_employee_id || '') === String(user.employee_id || '');
    return false;
  };

  useEffect(() => {
    fetchLeads();
    fetchStats();
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [filterStatus, filterSource, filterAssigned]);

  const fetchLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterSource) params.append('source', filterSource);
      if (filterAssigned) params.append('assigned_to_employee_id', filterAssigned);
      const { data } = await axios.get(`${API}/leads?${params}`, { headers: authHeader() });
      setLeads(data);
    } catch (e) {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await axios.get(`${API}/leads/stats`, { headers: authHeader() });
      setStats(data);
    } catch {
      // ignore
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data } = await axios.get(`${API}/employees`, { headers: authHeader() });
      setEmployees(data);
    } catch {
      toast.error('Failed to load employees');
    }
  };

  const openDetail = async (lead) => {
    setSelectedLead(lead);
    setDetailSheetOpen(true);
    try {
      const { data } = await axios.get(`${API}/leads/${lead.id}/activities`, { headers: authHeader() });
      setActivities(data);
    } catch {
      setActivities([]);
    }
  };

  const handleAddLead = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        value: formData.value ? parseFloat(formData.value) : null,
        assigned_to_employee_id: formData.assigned_to_employee_id || null,
        assigned_to_name: formData.assigned_to_name || null,
      };
      await axios.post(`${API}/leads`, payload, { headers: authHeader() });
      toast.success('Lead created');
      setAddDialogOpen(false);
      setFormData(defaultLeadForm);
      fetchLeads();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create lead');
    }
  };

  const handleUpdateLead = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;
    try {
      const payload = {
        ...formData,
        value: formData.value ? parseFloat(formData.value) : null,
        assigned_to_employee_id: formData.assigned_to_employee_id || null,
        assigned_to_name: formData.assigned_to_name || null,
      };
      await axios.put(`${API}/leads/${selectedLead.id}`, payload, { headers: authHeader() });
      toast.success('Lead updated');
      setEditDialogOpen(false);
      setSelectedLead(null);
      fetchLeads();
      fetchStats();
      if (detailSheetOpen) {
        setSelectedLead({ ...selectedLead, ...formData });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update lead');
    }
  };

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      const lead = leads.find((l) => l.id === leadId);
      await axios.put(
        `${API}/leads/${leadId}`,
        { ...lead, status: newStatus },
        { headers: authHeader() }
      );
      toast.success('Status updated');
      fetchLeads();
      fetchStats();
      if (selectedLead?.id === leadId) setSelectedLead({ ...selectedLead, status: newStatus });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm('Delete this lead?')) return;
    try {
      await axios.delete(`${API}/leads/${leadId}`, { headers: authHeader() });
      toast.success('Lead deleted');
      setDetailSheetOpen(false);
      setSelectedLead(null);
      fetchLeads();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!selectedLead || !activityForm.summary.trim()) return;
    try {
      await axios.post(
        `${API}/leads/${selectedLead.id}/activities`,
        { activity_type: activityForm.activity_type, summary: activityForm.summary.trim() },
        { headers: authHeader() }
      );
      toast.success('Activity added');
      setActivityForm({ activity_type: 'Note', summary: '' });
      const { data } = await axios.get(`${API}/leads/${selectedLead.id}/activities`, { headers: authHeader() });
      setActivities(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add activity');
    }
  };

  const assigneeOptions = employees.map((emp) => ({
    value: emp.employee_id,
    label: `${emp.name} (${emp.employee_id})`,
  }));

  const filteredLeads = leads;
  const pipelineGroups = STATUSES.map((status) => ({
    status,
    leads: filteredLeads.filter((l) => l.status === status),
  }));

  if (loading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="leads-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Leads</h1>
          <p className="text-gray-600 text-sm mt-1">
            Manage leads and sales pipeline • {stats.total} total
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 text-white hover:bg-blue-700 h-10">
              <Plus className="h-4 w-4 mr-2" />
              Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0 max-h-[90vh] overflow-y-auto">
            <div className="bg-blue-600 text-white p-6 rounded-t-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white">New Lead</DialogTitle>
                <p className="text-blue-100 text-sm">Capture contact and company details</p>
              </DialogHeader>
            </div>
            <form onSubmit={handleAddLead} className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Contact Name *</Label>
                  <Input
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    required
                    placeholder="John Doe"
                    className="h-11 border border-gray-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Company *</Label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    required
                    placeholder="Acme Inc"
                    className="h-11 border border-gray-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="john@company.com"
                    className="h-11 border border-gray-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="h-11 border border-gray-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Source</Label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Status</Label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Value (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="0"
                    className="h-11 border border-gray-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Assigned To</Label>
                  <select
                    value={formData.assigned_to_employee_id}
                    onChange={(e) => {
                      const opt = assigneeOptions.find((o) => o.value === e.target.value);
                      setFormData({
                        ...formData,
                        assigned_to_employee_id: e.target.value,
                        assigned_to_name: opt ? opt.label.split(' (')[0] : null,
                      });
                    }}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                  >
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Notes</Label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Brief notes..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Label className="text-sm font-semibold text-gray-700">Category</Label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                >
                  <option value="">Select category</option>
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Label className="text-sm font-semibold text-gray-700">Sub Category</Label>
                <Input
                  value={formData.sub_category}
                  onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                  placeholder="Enter sub category"
                  className="flex-1"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Contacts</Label>
                {formData.contacts.map((c, idx) => (
                  <div key={idx} className="flex gap-2 mb-2 flex-wrap">
                    <Input
                      value={c.name}
                      onChange={e => {
                        const contacts = [...formData.contacts];
                        contacts[idx].name = e.target.value;
                        setFormData({ ...formData, contacts });
                      }}
                      placeholder="Name"
                      className="border border-gray-300"
                    />
                    <Input
                      value={c.designation}
                      onChange={e => {
                        const contacts = [...formData.contacts];
                        contacts[idx].designation = e.target.value;
                        setFormData({ ...formData, contacts });
                      }}
                      placeholder="Designation"
                      className="border border-gray-300"
                    />
                    <Input
                      value={c.email}
                      onChange={e => {
                        const contacts = [...formData.contacts];
                        contacts[idx].email = e.target.value;
                        setFormData({ ...formData, contacts });
                      }}
                      placeholder="Email"
                      className="border border-gray-300"
                    />
                    <Input
                      value={c.number}
                      onChange={e => {
                        const contacts = [...formData.contacts];
                        contacts[idx].number = e.target.value;
                        setFormData({ ...formData, contacts });
                      }}
                      placeholder="Number"
                      className="border border-gray-300"
                    />
                    {formData.contacts.length > 1 && (
                      <Button type="button" size="icon" variant="outline" className="h-9 w-9 text-red-600 border-red-200 hover:bg-red-100" onClick={() => {
                        setFormData({ ...formData, contacts: formData.contacts.filter((_, i) => i !== idx) });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setFormData({ ...formData, contacts: [...formData.contacts, { name: '', designation: '', email: '', number: '' }] })}>
                  <Plus className="h-4 w-4 mr-1" /> Add Contact
                </Button>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Create Lead
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters & view toggle */}
      <Card className="p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
          <div className="flex gap-2 [&_button]:min-h-[44px]">
            <Button
              variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'pipeline' ? 'bg-blue-50 text-blue-700' : ''}
              onClick={() => setViewMode('pipeline')}
            >
              <Target className="h-4 w-4 mr-1" />
              Pipeline
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'list' ? 'bg-blue-50 text-blue-700' : ''}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 min-h-[44px] text-sm text-gray-900 bg-white flex-1 min-w-0 sm:flex-initial"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white"
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white"
            >
              <option value="">All assignees</option>
              {assigneeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Pipeline view */}
      {viewMode === 'pipeline' && (
        <div className="overflow-x-auto pb-4 -webkit-overflow-scrolling-touch" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-3 sm:gap-4 min-w-max">
            {pipelineGroups.map(({ status, leads: groupLeads }) => (
              <div
                key={status}
                className="w-56 sm:w-64 flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-800">{status}</span>
                  <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                    {groupLeads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      className="p-3 cursor-pointer hover:shadow-md transition-shadow border border-gray-200 bg-white"
                      onClick={() => openDetail(lead)}
                    >
                      <p className="font-medium text-gray-900 truncate">{lead.contact_name}</p>
                      <p className="text-xs text-gray-600 truncate">{lead.company}</p>
                      {lead.value != null && lead.value > 0 && (
                        <p className="text-xs text-blue-600 mt-1">₹{Number(lead.value).toLocaleString('en-IN')}</p>
                      )}
                      <div className="flex justify-between items-center mt-2">
                        {canEditLead(lead) ? (
                          <select
                            value={lead.status}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleStatusChange(lead.id, e.target.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs rounded border border-gray-200 px-2 py-1 bg-white text-gray-900"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-600">{lead.status}</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto table-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Company</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Source</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Value</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Assigned</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => openDetail(lead)}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{lead.contact_name}</p>
                      <p className="text-xs text-gray-600">{lead.email}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{lead.company}</td>
                    <td className="py-3 px-4 text-gray-700">{lead.source}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      {lead.value != null && lead.value > 0
                        ? `₹${Number(lead.value).toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{lead.assigned_to_name || '—'}</td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {canEditLead(lead) && (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLead(lead);
                              setFormData({
                                contact_name: lead.contact_name,
                                company: lead.company,
                                email: lead.email,
                                phone: lead.phone || '',
                                source: lead.source,
                                status: lead.status,
                                value: lead.value ?? '',
                                notes: lead.notes || '',
                                assigned_to_employee_id: lead.assigned_to_employee_id || '',
                                assigned_to_name: lead.assigned_to_name || '',
                                category: lead.category || '',
                                sub_category: lead.sub_category || '',
                                contacts: Array.isArray(lead.contacts) ? lead.contacts : (lead.contacts ? [lead.contacts] : [{ name: '', designation: '', email: '', number: '' }]),
                              });
                              setEditDialogOpen(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLead(lead.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLeads.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <Target className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No leads yet. Add your first lead to get started.</p>
            </div>
          )}
        </Card>
      )}

      {/* Lead detail sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg bg-white overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selectedLead.contact_name}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">{selectedLead.company}</p>
                  <span className="px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                    {selectedLead.status}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <a href={`mailto:${selectedLead.email}`} className="text-blue-600 hover:underline">
                      {selectedLead.email}
                    </a>
                  </div>
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <a href={`tel:${selectedLead.phone}`} className="text-gray-700">
                        {selectedLead.phone}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-700">{selectedLead.source}</span>
                  </div>
                  {selectedLead.value != null && selectedLead.value > 0 && (
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">₹{Number(selectedLead.value).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {selectedLead.assigned_to_name && (
                    <p className="text-gray-600">Assigned to: {selectedLead.assigned_to_name}</p>
                  )}
                  {selectedLead.created_by_name && (
                    <p className="text-gray-600">Created by: {selectedLead.created_by_name}</p>
                  )}
                </div>
                {selectedLead.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedLead.notes}</p>
                  </div>
                )}
                {/* Category & Sub Category */}
                {(selectedLead.category || selectedLead.sub_category) && (
                  <div className="space-y-1">
                    {selectedLead.category && (
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Category</p>
                    )}
                    {selectedLead.category && (
                      <p className="text-sm text-gray-700">{selectedLead.category}</p>
                    )}
                    {selectedLead.sub_category && (
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sub Category</p>
                    )}
                    {selectedLead.sub_category && (
                      <p className="text-sm text-gray-700">{selectedLead.sub_category}</p>
                    )}
                  </div>
                )}
                {/* Contacts */}
                {Array.isArray(selectedLead.contacts) && selectedLead.contacts.length > 0 && (
                  <div className="space-y-1 mt-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Contacts</p>
                    <div className="space-y-2">
                      {selectedLead.contacts.map((c, idx) => (
                        <div key={idx} className="flex flex-wrap gap-4 border border-gray-100 rounded p-2">
                          {c.name && <span className="font-medium text-gray-800">{c.name}</span>}
                          {c.designation && <span className="text-gray-600">{c.designation}</span>}
                          {c.email && <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a>}
                          {c.number && <a href={`tel:${c.number}`} className="text-gray-700">{c.number}</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {canEditLead(selectedLead) && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFormData({
                          contact_name: selectedLead.contact_name,
                          company: selectedLead.company,
                          email: selectedLead.email,
                          phone: selectedLead.phone || '',
                          source: selectedLead.source,
                          status: selectedLead.status,
                          value: selectedLead.value ?? '',
                          notes: selectedLead.notes || '',
                          assigned_to_employee_id: selectedLead.assigned_to_employee_id || '',
                          assigned_to_name: selectedLead.assigned_to_name || '',
                          category: selectedLead.category || '',
                          sub_category: selectedLead.sub_category || '',
                          contacts: Array.isArray(selectedLead.contacts) ? selectedLead.contacts : (selectedLead.contacts ? [selectedLead.contacts] : [{ name: '', designation: '', email: '', number: '' }]),
                        });
                        setDetailSheetOpen(false);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteLead(selectedLead.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                )}

                <hr className="border-gray-200" />

                <div>
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-1 mb-2">
                    <Activity className="h-4 w-4" />
                    Activity
                  </p>
                  {canEditLead(selectedLead) && (
                  <form onSubmit={handleAddActivity} className="flex gap-2 mb-4">
                    <select
                      value={activityForm.activity_type}
                      onChange={(e) => setActivityForm({ ...activityForm, activity_type: e.target.value })}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
                    >
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <Input
                      value={activityForm.summary}
                      onChange={(e) => setActivityForm({ ...activityForm, summary: e.target.value })}
                      placeholder="Add activity..."
                      className="flex-1"
                    />
                    <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                      Add
                    </Button>
                  </form>
                  )}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {activities.map((act) => (
                      <div
                        key={act.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm"
                      >
                        <span className="font-medium text-blue-600">{act.activity_type}</span>
                        <p className="text-gray-700 mt-0.5">{act.summary}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {act.created_by_name} • {new Date(act.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {activities.length === 0 && (
                      <p className="text-sm text-gray-500">No activities yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit lead dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0 max-h-[90vh] overflow-y-auto">
          <div className="bg-blue-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Edit Lead</DialogTitle>
            </DialogHeader>
          </div>
          <form onSubmit={handleUpdateLead} className="space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Contact Name *</Label>
                <Input
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  required
                  className="h-11 border border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Company *</Label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  required
                  className="h-11 border border-gray-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="h-11 border border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-11 border border-gray-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Source</Label>
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Value (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  className="h-11 border border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Assigned To</Label>
                <select
                  value={formData.assigned_to_employee_id}
                  onChange={(e) => {
                    const opt = assigneeOptions.find((o) => o.value === e.target.value);
                    setFormData({
                      ...formData,
                      assigned_to_employee_id: e.target.value,
                      assigned_to_name: opt ? opt.label.split(' (')[0] : null,
                    });
                  }}
                  className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Notes</Label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Label className="text-sm font-semibold text-gray-700">Category</Label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900"
              >
                <option value="">Select category</option>
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Label className="text-sm font-semibold text-gray-700">Sub Category</Label>
              <Input
                value={formData.sub_category}
                onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                placeholder="Enter sub category"
                className="flex-1"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Contacts</Label>
              {formData.contacts.map((c, idx) => (
                <div key={idx} className="flex gap-2 mb-2 flex-wrap">
                  <Input
                    value={c.name}
                    onChange={e => {
                      const contacts = [...formData.contacts];
                      contacts[idx].name = e.target.value;
                      setFormData({ ...formData, contacts });
                    }}
                    placeholder="Name"
                    className="border border-gray-300"
                  />
                  <Input
                    value={c.designation}
                    onChange={e => {
                      const contacts = [...formData.contacts];
                      contacts[idx].designation = e.target.value;
                      setFormData({ ...formData, contacts });
                    }}
                    placeholder="Designation"
                    className="border border-gray-300"
                  />
                  <Input
                    value={c.email}
                    onChange={e => {
                      const contacts = [...formData.contacts];
                      contacts[idx].email = e.target.value;
                      setFormData({ ...formData, contacts });
                    }}
                    placeholder="Email"
                    className="border border-gray-300"
                  />
                  <Input
                    value={c.number}
                    onChange={e => {
                      const contacts = [...formData.contacts];
                      contacts[idx].number = e.target.value;
                      setFormData({ ...formData, contacts });
                    }}
                    placeholder="Number"
                    className="border border-gray-300"
                  />
                  {formData.contacts.length > 1 && (
                    <Button type="button" size="icon" variant="outline" className="h-9 w-9 text-red-600 border-red-200 hover:bg-red-100" onClick={() => {
                      setFormData({ ...formData, contacts: formData.contacts.filter((_, i) => i !== idx) });
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setFormData({ ...formData, contacts: [...formData.contacts, { name: '', designation: '', email: '', number: '' }] })}>
                <Plus className="h-4 w-4 mr-1" /> Add Contact
              </Button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { LeadKpiStrip } from '@/components/leads/LeadKpiStrip';
import { LeadCrmHub } from '@/components/leads/LeadCrmHub';
import { LeadCreateDialog } from '@/components/leads/LeadCreateDialog';
import { LeadVendorDialog } from '@/components/leads/LeadVendorDialog';
import { LeadStatusDialog } from '@/components/leads/LeadStatusDialog';
import { LeadProfileSheet } from '@/components/leads/LeadProfileSheet';
import { LeadWorkflowDialog } from '@/components/leads/LeadWorkflowDialog';
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  STATUS_COLORS,
  isCarryAndOrder,
  leadNeedsVendor,
  isForwardStatusChange,
  getLeadInitials,
} from '@/lib/leadUtils';
import { getApiErrorMessage } from '@/lib/apiErrors';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

export const Leads = () => {
  const { user } = useAuth();
  const location = useLocation();

  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_status: {} });
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterAssigned, setFilterAssigned] = useState('');
  const [sortBy, setSortBy] = useState('updated');

  const [selectedLead, setSelectedLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [leadAttachments, setLeadAttachments] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorLead, setVendorLead] = useState(null);
  const [vendorId, setVendorId] = useState('');
  const [vendorAfterStatus, setVendorAfterStatus] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [statusComment, setStatusComment] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [lostAmount, setLostAmount] = useState('');

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    [],
  );

  const canEditLead = useCallback(
    (lead) => {
      if (!lead || !user) return false;
      if (['Admin', 'Manager'].includes(user.role)) return true;
      if (user.role === 'Sales') {
        return String(lead.created_by_employee_id || '') === String(user.employee_id || '');
      }
      return false;
    },
    [user],
  );

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== '__pipeline__') params.append('status', filterStatus);
      if (filterSource) params.append('source', filterSource);
      if (filterAssigned) params.append('assigned_to_employee_id', filterAssigned);
      const { data } = await axios.get(`${API}/leads?${params}`, { headers: authHeader() });
      setLeads(data);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSource, filterAssigned, authHeader]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/leads/stats`, { headers: authHeader() });
      setStats(data);
    } catch {
      /* optional */
    }
  }, [authHeader]);

  const loadLeadDetails = useCallback(
    async (leadId) => {
      try {
      const [act, hist, att] = await Promise.all([
          axios.get(`${API}/leads/${leadId}/activities`, { headers: authHeader() }),
          axios.get(`${API}/leads/${leadId}/status-history`, { headers: authHeader() }),
          axios.get(`${API}/leads/${leadId}/attachments`, { headers: authHeader() }),
        ]);
      setActivities(act.data);
      setStatusHistory(hist.data);
      setLeadAttachments(att.data);
      } catch {
        setActivities([]);
      setStatusHistory([]);
      setLeadAttachments([]);
    }
  },
    [authHeader],
  );

  const refreshLead = useCallback(
    async (leadId) => {
      const { data } = await axios.get(`${API}/leads/${leadId}`, { headers: authHeader() });
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data : l)));
      setSelectedLead((prev) => (prev?.id === leadId ? data : prev));
      return data;
    },
    [authHeader],
  );

  useEffect(() => {
    fetchLeads();
    fetchStats();
    axios.get(`${API}/employees`, { headers: authHeader() }).then((r) => setEmployees(r.data)).catch(() => {});
    axios.get(`${API}/customers?entity_type=0`, { headers: authHeader() }).then((r) => setCustomers(r.data)).catch(() => {});
    axios.get(`${API}/customers?entity_type=1`, { headers: authHeader() }).then((r) => setVendors(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (location.state?.highlightLeadId && leads.length > 0) {
      const lead = leads.find((l) => l.id === location.state.highlightLeadId);
      if (lead) selectLead(lead, { openProfile: true });
    }
  }, [location.state?.highlightLeadId, leads]);

  const assigneeOptions = useMemo(
    () => employees.map((e) => ({ value: e.employee_id, label: `${e.name} (${e.employee_id})` })),
    [employees],
  );

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filterStatus === '__pipeline__') {
        if (['Won', 'Lost'].includes(lead.status)) return false;
      } else if (filterStatus && lead.status !== filterStatus) return false;
      if (filterSource && lead.source !== filterSource) return false;
      if (filterAssigned && lead.assigned_to_employee_id !== filterAssigned) return false;
      if (!q) return true;
      return (
        (lead.contact_name || '').toLowerCase().includes(q)
        || (lead.company || '').toLowerCase().includes(q)
        || (lead.email || '').toLowerCase().includes(q)
        || (lead.vendor_name || '').toLowerCase().includes(q)
        || (lead.sub_category || '').toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery, filterStatus, filterSource, filterAssigned]);

  const carryOrderPendingVendor = useMemo(
    () => filteredLeads.filter((l) => leadNeedsVendor(l)).length,
    [filteredLeads],
  );

  const pipelineValue = useMemo(
    () => filteredLeads
      .filter((l) => !['Won', 'Lost'].includes(l.status))
      .reduce((sum, l) => sum + (Number(l.value) || 0), 0),
    [filteredLeads],
  );

  const selectLead = async (lead, { openProfile = false, openWorkflow = true } = {}) => {
    setSelectedLead(lead);
    await loadLeadDetails(lead.id);
    if (openProfile) {
      setWorkflowOpen(false);
      setProfileOpen(true);
    } else if (openWorkflow) {
      setProfileOpen(false);
      setWorkflowOpen(true);
    }
  };

  const closeWorkflow = (open) => {
    setWorkflowOpen(open);
    if (!open) setSelectedLead(null);
  };

  const openLeadRecord = (lead) => {
    if (lead) setSelectedLead(lead);
    setProfileOpen(true);
  };

  const openVendorDialog = (lead, { afterStatus = false } = {}) => {
    setVendorLead(lead);
    setVendorId(lead.vendor_id || '');
    setVendorAfterStatus(afterStatus);
    setVendorOpen(true);
  };

  const saveVendor = async () => {
    if (!vendorLead || !vendorId) {
      toast.error('Select a vendor');
      return;
    }
    const name = vendors.find((v) => v.id === vendorId)?.company_name;
    try {
      await axios.put(
        `${API}/leads/${vendorLead.id}`,
        { vendor_id: vendorId, vendor_name: name },
        { headers: authHeader() },
      );
      await refreshLead(vendorLead.id);
      setVendorOpen(false);
      const after = vendorAfterStatus && pendingStatus;
      setVendorLead(null);
      setVendorId('');
      setVendorAfterStatus(false);
      if (after) setStatusOpen(true);
      else toast.success('Vendor saved');
      fetchLeads();
      fetchStats();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save vendor'));
    }
  };

  const requestStatusChange = (lead, newStatus) => {
    if (!canEditLead(lead)) return;
    setPendingStatus({ leadId: lead.id, oldStatus: lead.status, newStatus });
    setStatusComment('');
    setLostReason('');
    setCompetitorName('');
    setLostAmount('');
    if (isForwardStatusChange(lead.status, newStatus) && leadNeedsVendor(lead)) {
      openVendorDialog(lead, { afterStatus: true });
      return;
    }
    setStatusOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus) return;
    const payload = {
      status: pendingStatus.newStatus,
      status_change_comment: pendingStatus.newStatus === 'Lost' ? lostReason.trim() : statusComment.trim(),
    };
    if (pendingStatus.newStatus === 'Lost') {
      payload.lost_reason = lostReason.trim();
      payload.competitor_name = competitorName.trim();
      payload.lost_amount = lostAmount.trim();
    }
    try {
      await axios.put(`${API}/leads/${pendingStatus.leadId}`, payload, { headers: authHeader() });
      toast.success('Stage updated');
      setStatusOpen(false);
      setPendingStatus(null);
      await refreshLead(pendingStatus.leadId);
      await loadLeadDetails(pendingStatus.leadId);
      fetchLeads();
      fetchStats();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update stage'));
    }
  };

  const handleStatusFilter = (status) => setFilterStatus(status);

  const pageHeaderActions = useMemo(
    () => (
      <Button
        size="sm"
        className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add lead
      </Button>
    ),
    [],
  );

  useRegisterPageHeader({
    subtitle: 'Sales pipeline & lead registry',
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6" data-testid="leads-page">
      <LeadKpiStrip
        stats={stats}
        pipelineValue={pipelineValue}
        carryOrderPendingVendor={carryOrderPendingVendor}
      />

      <LeadCrmHub
        filteredLeads={filteredLeads}
        selectedLead={selectedLead}
        stats={stats}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterStatus={filterStatus}
        onSelectStatusFilter={handleStatusFilter}
        filterSource={filterSource}
        onFilterSource={setFilterSource}
        filterAssigned={filterAssigned}
        onFilterAssigned={setFilterAssigned}
        sortBy={sortBy}
        onSortBy={setSortBy}
        statuses={LEAD_STATUSES}
        sources={LEAD_SOURCES}
        assigneeOptions={assigneeOptions}
        statusColors={STATUS_COLORS}
        onSelectLead={(lead, opts) => selectLead(lead, opts)}
        onAssignVendor={(lead) => openVendorDialog(lead)}
        isCarryAndOrder={isCarryAndOrder}
        leadNeedsVendor={leadNeedsVendor}
        getLeadInitials={getLeadInitials}
      />

      <LeadWorkflowDialog
        open={workflowOpen && !!selectedLead}
        onOpenChange={closeWorkflow}
        lead={selectedLead}
        apiBase={API}
        authHeader={authHeader}
        vendors={vendors}
        leadAttachments={leadAttachments}
        canEdit={selectedLead ? canEditLead(selectedLead) : false}
        onLeadRefresh={refreshLead}
        onAssignVendor={(lead) => openVendorDialog(lead)}
        onOpenRecord={openLeadRecord}
      />

      <LeadCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiBase={API}
        authHeader={authHeader}
        customers={customers}
        vendors={vendors}
        assigneeOptions={assigneeOptions}
        onCreated={(created) => {
          fetchLeads();
          fetchStats();
          if (created?.id) {
            selectLead(created);
          }
        }}
      />

      <LeadVendorDialog
        open={vendorOpen}
        lead={vendorLead}
        vendorId={vendorId}
        vendors={vendors}
        afterStatus={vendorAfterStatus}
        onVendorIdChange={setVendorId}
        onConfirm={saveVendor}
        onCancel={() => {
          setVendorOpen(false);
          setVendorLead(null);
          setVendorId('');
          setVendorAfterStatus(false);
          setPendingStatus(null);
        }}
      />

      <LeadStatusDialog
        open={statusOpen}
        pending={pendingStatus}
        comment={statusComment}
        lostReason={lostReason}
        competitorName={competitorName}
        lostAmount={lostAmount}
        onCommentChange={setStatusComment}
        onLostReasonChange={setLostReason}
        onCompetitorChange={setCompetitorName}
        onLostAmountChange={setLostAmount}
        onConfirm={confirmStatusChange}
        onCancel={() => {
          setStatusOpen(false);
          setPendingStatus(null);
        }}
      />

      <LeadProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        lead={selectedLead}
        activities={activities}
        statusHistory={statusHistory}
        canEdit={selectedLead && canEditLead(selectedLead)}
        apiBase={API}
        authHeader={authHeader}
        vendors={vendors}
        assigneeOptions={assigneeOptions}
        onLeadUpdated={async () => {
          if (selectedLead) {
            await refreshLead(selectedLead.id);
            await loadLeadDetails(selectedLead.id);
            fetchLeads();
            fetchStats();
          }
        }}
        onDeleted={() => {
          setSelectedLead(null);
          setWorkflowOpen(false);
          setProfileOpen(false);
          fetchLeads();
          fetchStats();
        }}
        onAssignVendor={(lead) => openVendorDialog(lead)}
        onRequestStatusChange={requestStatusChange}
      />
    </div>
  );
};

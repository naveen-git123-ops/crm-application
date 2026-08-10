import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Edit2, Store, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { CarryOrderWorkspace } from '@/components/leads/carryOrder/CarryOrderWorkspace';
import { LeadEditDialog } from '@/components/leads/LeadEditDialog';
import { LeadVendorDialog } from '@/components/leads/LeadVendorDialog';
import { canManageAllLeads, userHasPermission } from '@/lib/permissions';
import { isCarryAndOrder, leadNeedsVendor } from '@/lib/leadUtils';
import { workflowStageLabel } from '@/lib/carryOrderWorkflow';
import { getApiErrorMessage } from '@/lib/apiErrors';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

/** Open enquiry details in a new browser tab. */
export function openViewLeadTab(leadId) {
  if (!leadId) return;
  window.open(`/viewlead/${leadId}`, '_blank', 'noopener,noreferrer');
}

export default function ViewLead() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    [],
  );

  const [lead, setLead] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');

  const canManageEveryLead = canManageAllLeads(user);
  const canEditLead = useCallback(
    (row) => {
      if (!user) return false;
      if (canManageEveryLead) return true;
      if (!row) return false;
      const empId = String(user.employee_id || '');
      const isOwn =
        String(row.created_by_employee_id || '') === empId
        || String(row.assigned_to_employee_id || '') === empId;
      if ((user.role || '').trim().toLowerCase() === 'sales' && isOwn) return true;
      if (userHasPermission(user, 'leads') && isOwn) return true;
      return false;
    },
    [user, canManageEveryLead],
  );

  const loadLead = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [leadRes, attRes] = await Promise.all([
        axios.get(`${API}/leads/${leadId}`, { headers: authHeader() }),
        axios.get(`${API}/leads/${leadId}/attachments`, { headers: authHeader() }).catch(() => ({ data: [] })),
      ]);
      setLead(leadRes.data);
      setAttachments(attRes.data || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load enquiry'));
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId, authHeader]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  useEffect(() => {
    axios.get(`${API}/customers?entity_type=0`, { headers: authHeader() }).then((r) => setCustomers(r.data || [])).catch(() => {});
    axios.get(`${API}/customers?entity_type=1`, { headers: authHeader() }).then((r) => setVendors(r.data || [])).catch(() => {});
    axios.get(`${API}/employees`, { headers: authHeader() }).then((r) => setEmployees(r.data || [])).catch(() => {});
  }, [authHeader]);

  const assigneeOptions = employees.map((e) => ({
    value: e.employee_id || e.id,
    label: `${e.name} (${e.employee_id || e.id})`,
  }));

  const canEdit = canEditLead(lead);
  const stageLabel = workflowStageLabel(lead?.workflow_stage) || lead?.status;
  const pendingVendor = lead && isCarryAndOrder(lead) && leadNeedsVendor(lead);

  const handleDelete = async () => {
    if (!lead || !canEdit) return;
    if (!window.confirm(`Delete enquiry for "${lead.company}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/leads/${lead.id}`, { headers: authHeader() });
      toast.success('Enquiry deleted');
      navigate('/leads');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete enquiry'));
    }
  };

  const saveVendor = async () => {
    if (!lead || !vendorId) {
      toast.error('Select a vendor');
      return;
    }
    const name = vendors.find((v) => v.id === vendorId)?.company_name;
    try {
      await axios.put(
        `${API}/leads/${lead.id}`,
        { vendor_id: vendorId, vendor_name: name },
        { headers: authHeader() },
      );
      toast.success('Vendor saved');
      setVendorOpen(false);
      await loadLead();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save vendor'));
    }
  };

  useRegisterPageHeader({
    subtitle: lead ? `Enquiry · ${lead.id}` : 'Enquiry details',
    actions: lead ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="border-slate-300" asChild>
          <Link to="/leads">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to leads
          </Link>
        </Button>
        {canEdit && (
          <>
            <Button size="sm" variant="outline" className="border-slate-300" onClick={() => setEditOpen(true)}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </>
        )}
      </div>
    ) : null,
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
        <p className="text-lg font-semibold text-slate-800">Enquiry not found</p>
        <p className="text-sm text-slate-500">ID: {leadId}</p>
        <Button asChild variant="outline">
          <Link to="/leads">Back to leads</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8" data-testid="view-lead-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <span className="font-semibold text-slate-900 truncate max-w-[min(100%,20rem)]">
          {lead.company || '—'}
        </span>
        <span className="text-slate-300 hidden sm:inline">·</span>
        <span className="text-slate-600 truncate max-w-[16rem]">
          {lead.contact_name || 'No contact'}
          {lead.email ? ` · ${lead.email}` : ''}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
          {stageLabel}
        </span>
        {lead.vendor_name && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <Store className="h-3.5 w-3.5" />
            {lead.vendor_name}
          </span>
        )}
        {pendingVendor && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            <AlertCircle className="h-3 w-3" />
            Vendor pending
          </span>
        )}
        <span className="ml-auto text-[11px] font-mono text-slate-400 truncate max-w-[12rem]" title={lead.id}>
          {lead.id}
        </span>
      </div>

      <CarryOrderWorkspace
        embedded
        lead={lead}
        apiBase={API}
        authHeader={authHeader}
        vendors={vendors || []}
        attachments={attachments || []}
        canEdit={canEdit}
        onRefresh={loadLead}
        onAssignVendor={() => {
          setVendorId(lead.vendor_id || '');
          setVendorOpen(true);
        }}
      />

      <LeadEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        lead={lead}
        apiBase={API}
        authHeader={authHeader}
        customers={customers}
        vendors={vendors}
        assigneeOptions={assigneeOptions}
        onUpdated={async () => {
          await loadLead();
        }}
      />

      <LeadVendorDialog
        open={vendorOpen}
        lead={lead}
        vendorId={vendorId}
        vendors={vendors}
        afterStatus={false}
        onVendorIdChange={setVendorId}
        onConfirm={saveVendor}
        onCancel={() => {
          setVendorOpen(false);
          setVendorId('');
        }}
      />
    </div>
  );
}

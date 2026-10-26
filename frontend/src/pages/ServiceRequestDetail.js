import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { DETAIL_TABS, serviceApi } from '@/lib/serviceUtils';
import { PriorityBadge, StatusBadge, useReasonPrompt } from '@/components/service/ServiceFields';
import {
  CustomerTab, FilesTab, HistoryTab, InspectionTab, OverviewTab, VisitsTab, WorkLogTab, errorText,
} from '@/components/service/ServiceTabs';
import { VendorTab } from '@/components/service/VendorTab';
import { ReportTab } from '@/components/service/ReportTab';

const TAB_COMPONENTS = {
  overview: OverviewTab,
  customer: CustomerTab,
  inspection: InspectionTab,
  worklog: WorkLogTab,
  visits: VisitsTab,
  files: FilesTab,
  vendor: VendorTab,
  report: ReportTab,
  history: HistoryTab,
};

export function ServiceRequestDetail() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState(null);
  const [meta, setMeta] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [error, setError] = useState('');
  const { ask, dialog } = useReasonPrompt();

  const load = useCallback(async () => {
    try {
      setDetail(await serviceApi.get(`/service-requests/${serviceId}`));
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load this service request'));
    }
  }, [serviceId]);

  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([serviceApi.get('/service/meta'), serviceApi.get('/service/lookups')])
      .then(([m, l]) => { if (!cancelled) { setMeta(m); setLookups(l); } })
      .catch((err) => { if (!cancelled) setError(errorText(err, 'Could not load service settings')); });
    return () => { cancelled = true; };
  }, []);

  /** Runs a mutation that returns the refreshed detail. Failures are shown and re-thrown so forms keep their input. */
  const run = useCallback(async (call, success) => {
    try {
      const result = await call();
      if (result && result.service) setDetail(result);
      if (success) toast.success(success);
      return result;
    } catch (err) {
      toast.error(errorText(err, 'The change could not be saved'));
      throw err;
    }
  }, []);

  /** Locked requests need a reason for every change. Resolves true when saved, false if the user cancelled. */
  const withLock = useCallback((title, fn) => {
    if (!detail?.locked) return fn('').then(() => true);
    return new Promise((resolve) => {
      ask({
        title,
        description: 'This request is completed or closed. The change and your reason are recorded in the history.',
        confirmLabel: 'Save change',
        // If fn throws, the dialog stays open (the caller already showed the error) so the reason is not lost.
        run: async (reason) => {
          await fn(reason);
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  }, [detail?.locked, ask]);

  const tab = useMemo(() => {
    const wanted = searchParams.get('tab');
    return detail && detail.tabs.includes(wanted) ? wanted : 'overview';
  }, [searchParams, detail]);

  const setTab = (value) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const actions = useMemo(() => (
    <Button variant="outline" size="sm" onClick={() => navigate('/service-maintenance')}>
      <ArrowLeft className="mr-1 h-4 w-4" />All service requests
    </Button>
  ), [navigate]);

  useRegisterPageHeader({
    subtitle: detail ? `${detail.service.service_code} · ${detail.service.customer_name || ''}` : 'Service request',
    actions,
    enabled: true,
  });

  if (error && !detail) {
    return (
      <div className="p-6">
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/service-maintenance')}>Back to the list</Button>
      </div>
    );
  }
  if (!detail || !meta || !lookups) return <div className="p-6 text-sm text-slate-500">Loading service request…</div>;

  const s = detail.service;
  const caps = detail.caps;
  const canWork = Boolean(detail.can_edit) && (!detail.locked || caps.manage);

  const saveSection = async (section, value) => {
    const done = await withLock('Reason for editing a locked request', (reason) => run(
      () => serviceApi.put(`/service-requests/${s.id}/sections/${section}`, { value, reason }),
      'Saved',
    ));
    if (!done) throw new Error('cancelled');
  };

  const ctx = {
    id: s.id, detail, meta, lookups, run, reload: load, withLock, ask, canWork, caps,
    locked: detail.locked, saveSection,
  };
  const Panel = TAB_COMPONENTS[tab];

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="service-detail">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{s.service_code}</h2>
          <StatusBadge status={s.status} />
          <PriorityBadge priority={s.priority} />
          {detail.overdue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">Overdue</span>}
          <span className="text-sm text-slate-600">{s.service_type} · {s.customer_type} customer</span>
        </div>
        <div className="mt-1 text-sm text-slate-700">
          {s.customer_name}{s.product_name ? ` · ${s.product_name}` : ''}
          {s.lead_id && (
            <>
              {' · Lead: '}
              <Link className="text-indigo-700 hover:underline" to={`/viewlead/${s.lead_id}`}>{s.lead_label || 'Open lead'}</Link>
            </>
          )}
        </div>
        {detail.locked && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <Lock className="h-3.5 w-3.5" />
            This request is {s.status.toLowerCase()}.
            {caps.manage ? ' You can change it as a service manager; each change needs a reason.' : ' Only a service manager can change it.'}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max">
            {detail.tabs.map((key) => <TabsTrigger key={key} value={key}>{DETAIL_TABS[key] || key}</TabsTrigger>)}
          </TabsList>
        </div>
      </Tabs>

      <div>{Panel ? <Panel ctx={ctx} /> : null}</div>
      {dialog}
    </div>
  );
}

export default ServiceRequestDetail;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronLeft, ChevronRight, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CUSTOMER_TYPE_COPY, INSTALLATION_PRODUCT_CATEGORIES, SITE_VISIT_ACK_CATEGORY, serviceApi, serviceTypesForCustomer, uid, workflowsForServiceTypes } from '@/lib/serviceUtils';
import { cn } from '@/lib/utils';
import { FieldGrid, FormField, MultiPicker, ReadRow } from '@/components/service/ServiceFields';

const STEP_LABEL = {
  type: 'Customer type',
  customer: 'Customer',
  call: 'Call details',
  visit: 'Site visit',
  classify: 'Service and product',
  review: 'Review',
};

function stepIdsFor() {
  return ['type', 'customer', 'call', 'visit', 'classify', 'review'];
}

const blankClassify = {
  lead_id: '', product_id: '', amc_id: '', product_name: '', product_model: '', serial_number: '',
  quantity: '1', planned_date: '', installation_requirements: '', problem_category: '',
};

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function customerFromService(service) {
  if (!service?.customer_id) return null;
  return {
    id: service.customer_id,
    customer_id: service.customer_code,
    company_name: service.customer_name,
    contact_person_name: service.contact_person,
    phone: service.mobile,
    email: service.email,
    address_line: service.site_address,
    city: service.city,
    state: service.state,
    pincode: service.pincode,
  };
}

function firstIncompleteStep({
  customerType, customer, details, siteVisitRequired, ack, hasAckFile,
  serviceTypesSelected, productTypesSelected, classify, selectedWorkflows, leadRequired,
}) {
  const ids = stepIdsFor();
  const errorsFor = (id) => {
    if (id === 'type' && !customerType) return true;
    if (id === 'customer' && !customer) return true;
    if (id === 'call') {
      return !details.contact_person.trim() || !validMobile(details.mobile) || !details.site_address.trim()
        || details.problem_description.trim().length < 5;
    }
    if (id === 'visit') {
      if (siteVisitRequired == null) return true;
      if (siteVisitRequired && (!ack.acknowledged || !ack.name.trim() || !ack.notes.trim() || !hasAckFile)) return true;
    }
    if (id === 'classify') {
      if (serviceTypesSelected.length === 0) return true;
      if (selectedWorkflows.has('installation') && productTypesSelected.length === 0) return true;
      if (selectedWorkflows.has('installation') && (!classify.product_name.trim() || !classify.product_model.trim() || !classify.planned_date)) return true;
      if (selectedWorkflows.has('repair') && !classify.problem_category) return true;
      if (leadRequired && !classify.lead_id) return true;
    }
    return false;
  };
  const index = ids.findIndex(errorsFor);
  return index === -1 ? ids.length - 1 : index;
}

const blankDetails = {
  priority: 'Medium', contact_person: '', mobile: '', email: '', site_address: '', city: '',
  state: '', pincode: '', customer_notes: '', problem_description: '',
};

const blankCustomer = {
  company_name: '', contact_person_name: '', phone: '', email: '', address_line: '', city: '', state: '',
  pincode: '', gst_number: '',
};

const blankAck = { acknowledged: false, name: '', notes: '' };

const validMobile = (v) => {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

function errorList(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(String);
  return [getApiErrorMessage(err, fallback)];
}

function ChoiceRow({ selected, onSelect, title, subtitle, badge }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        selected ? 'border-indigo-400 bg-indigo-50' : 'border-border bg-white hover:bg-muted',
      )}
    >
      <span className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border', selected ? 'border-indigo-600 bg-indigo-600 ring-2 ring-indigo-200' : 'border-input')} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{title}</span>
        {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {badge}
    </button>
  );
}

export function CreateServiceRequest({ open, onClose, meta, onCreated, draftId = null }) {
  const [step, setStep] = useState(0);
  const [customerType, setCustomerType] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(blankCustomer);
  const [details, setDetails] = useState(blankDetails);
  const [siteVisitRequired, setSiteVisitRequired] = useState(null);
  const [ack, setAck] = useState(blankAck);
  const [ackFile, setAckFile] = useState(null);
  const [serviceTypesSelected, setServiceTypesSelected] = useState([]);
  const [productTypesSelected, setProductTypesSelected] = useState([]);
  const [classify, setClassify] = useState(blankClassify);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ category: '', name: '', model: '', serial_number: '' });
  const [profile, setProfile] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [draftService, setDraftService] = useState(null);
  const [ackFileOnRecord, setAckFileOnRecord] = useState(false);
  const requestId = useRef(uid());
  const loadedDraft = useRef(null);

  const reset = useCallback(() => {
    setStep(0); setCustomerType(''); setQuery(''); setResults([]); setCustomer(null);
    setNewCustomerOpen(false); setNewCustomer(blankCustomer); setDetails(blankDetails);
    setSiteVisitRequired(null); setAck(blankAck); setAckFile(null);
    setServiceTypesSelected([]); setProductTypesSelected([]); setClassify(blankClassify);
    setNewProductOpen(false); setNewProduct({ category: '', name: '', model: '', serial_number: '' });
    setDraftService(null); setAckFileOnRecord(false); setProfile(null); setErrors([]);
    requestId.current = uid();
    loadedDraft.current = null;
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    if (!draftId) {
      reset();
      return undefined;
    }
    if (loadedDraft.current === draftId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const detail = await serviceApi.get(`/service-requests/${draftId}`);
        if (cancelled) return;
        const service = detail.service || {};
        const intake = detail.data?.intake || {};
        const acknowledgement = intake.acknowledgement || {};
        const nextDetails = {
          priority: service.priority || 'Medium',
          contact_person: service.contact_person || '',
          mobile: service.mobile || '',
          email: service.email || '',
          site_address: service.site_address || '',
          city: service.city || '',
          state: service.state || '',
          pincode: service.pincode || '',
          customer_notes: service.customer_notes || '',
          problem_description: service.problem_description || '',
        };
        const nextAck = {
          acknowledged: Boolean(acknowledgement.acknowledged),
          name: acknowledgement.name || service.contact_person || '',
          notes: acknowledgement.notes || '',
        };
        const nextTypes = service.service_types?.length ? service.service_types : (service.service_type ? [service.service_type] : []);
        const nextProducts = service.product_types?.length ? service.product_types : (service.product_category ? [service.product_category] : []);
        const nextClassify = {
          ...blankClassify,
          lead_id: service.lead_id || '',
          product_id: service.product_id || '',
          amc_id: service.amc_id || '',
          product_name: service.product_name || '',
          product_model: service.product_model || '',
          serial_number: service.serial_number || '',
          quantity: service.quantity || '1',
          planned_date: service.planned_date || '',
          installation_requirements: service.installation_requirements || '',
          problem_category: service.problem_category || '',
        };
        const hasAckFile = (detail.attachments || []).some((file) => file.category === SITE_VISIT_ACK_CATEGORY);
        const nextCustomer = customerFromService(service);
        const visitRequired = typeof intake.site_visit_required === 'boolean' ? intake.site_visit_required : null;
        const workflows = workflowsForServiceTypes(nextTypes, meta);
        setCustomerType(service.customer_type || '');
        setCustomer(nextCustomer);
        setDetails(nextDetails);
        setSiteVisitRequired(visitRequired);
        setAck(nextAck);
        setAckFile(null);
        setAckFileOnRecord(hasAckFile);
        setServiceTypesSelected(nextTypes);
        setProductTypesSelected(nextProducts);
        setClassify(nextClassify);
        setDraftService(service);
        loadedDraft.current = service.id;
        setErrors([]);
        requestId.current = service.client_request_id || uid();
        setStep(firstIncompleteStep({
          customerType: service.customer_type || '',
          customer: nextCustomer,
          details: nextDetails,
          siteVisitRequired: visitRequired,
          ack: nextAck,
          hasAckFile,
          serviceTypesSelected: nextTypes,
          productTypesSelected: nextProducts,
          classify: nextClassify,
          selectedWorkflows: workflows,
          leadRequired: service.customer_type === 'Existing' && meta?.config?.require_lead_for_existing !== false,
        }));
      } catch (err) {
        if (!cancelled) {
          setErrors(errorList(err, 'Could not open this draft'));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, draftId, reset, meta]);

  useEffect(() => {
    if (!open || step !== 1 || newCustomerOpen) return undefined;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setResults(await serviceApi.get('/service/customers', { q: query }));
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Could not search customers'));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, step, query, newCustomerOpen]);

  const pickCustomer = (c) => {
    setCustomer(c);
    setDetails((prev) => ({
      ...prev,
      contact_person: c.contact_person_name || prev.contact_person || '',
      mobile: c.phone || prev.mobile || '',
      email: c.email || prev.email || '',
      site_address: c.address_line || prev.site_address || '',
      city: c.city || prev.city || '',
      state: c.state || prev.state || '',
      pincode: c.pincode || prev.pincode || '',
    }));
  };

  const createCustomer = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const created = await serviceApi.post('/service/customers', newCustomer);
      toast.success(`Customer ${created.customer_id} added`);
      setNewCustomerOpen(false);
      setNewCustomer(blankCustomer);
      pickCustomer(created);
    } catch (err) {
      setErrors(errorList(err, 'Could not add the customer'));
    } finally {
      setBusy(false);
    }
  };

  const registerProduct = async () => {
    if (!customer) return;
    setBusy(true);
    setErrors([]);
    try {
      const created = await serviceApi.post('/service/products', {
        ...newProduct, customer_id: customer.id, lead_id: classify.lead_id || null,
      });
      const next = await serviceApi.get(`/service/customers/${customer.id}/profile`);
      setProfile(next);
      setClassify((prev) => ({ ...prev, product_id: created.id }));
      setNewProductOpen(false);
      setNewProduct({ category: '', name: '', model: '', serial_number: '' });
    } catch (err) {
      setErrors(errorList(err, 'Could not register the product'));
    } finally {
      setBusy(false);
    }
  };

  const setDetail = (key) => (value) => setDetails((prev) => ({ ...prev, [key]: value }));
  const stepIds = stepIdsFor();
  const safeStep = Math.min(step, stepIds.length - 1);
  const current = stepIds[safeStep];
  const typeOptions = serviceTypesForCustomer(customerType, meta);
  const selectedWorkflows = workflowsForServiceTypes(serviceTypesSelected, meta);
  const leadRequired = customerType === 'Existing' && meta?.config?.require_lead_for_existing !== false;

  useEffect(() => {
    if (current !== 'classify' || !customer) return undefined;
    let cancelled = false;
    serviceApi.get(`/service/customers/${customer.id}/profile`)
      .then((value) => { if (!cancelled) setProfile(value); })
      .catch(() => { if (!cancelled) setProfile({ leads: [], products: [], amcs: [] }); });
    return () => { cancelled = true; };
  }, [current, customer]);

  const stepErrors = (id) => {
    const out = [];
    if (id === 'type' && !customerType) out.push('Choose New or Existing customer');
    if (id === 'customer' && !customer) out.push('Select a customer, or add a new one');
    if (id === 'call') {
      if (!details.contact_person.trim()) out.push('Name is required');
      if (!validMobile(details.mobile)) out.push('A valid phone number is required');
      if (!details.site_address.trim()) out.push('Address is required');
      if (details.pincode && !/^\d{6}$/.test(details.pincode)) out.push('PIN code must be 6 digits');
      if (details.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) out.push('Email address is not valid');
      if (details.problem_description.trim().length < 5) out.push('Describe the problem the customer reported');
    }
    if (id === 'visit') {
      if (siteVisitRequired == null) out.push('Say whether a site visit is required');
      if (siteVisitRequired) {
        if (!ack.acknowledged) out.push('Record the customer acknowledgement for the site visit');
        if (!ack.name.trim()) out.push('Enter the name of the person who acknowledged the site visit');
        if (!ack.notes.trim()) out.push('Acknowledgement notes are required');
        if (!ackFile && !ackFileOnRecord) out.push('Attach the customer acknowledgement');
      }
    }
    if (id === 'classify') {
      if (serviceTypesSelected.length === 0) out.push('Select at least one service type');
      if (selectedWorkflows.has('installation') && productTypesSelected.length === 0) out.push('Select at least one product type');
      if (selectedWorkflows.has('installation')) {
        if (!classify.product_name.trim()) out.push('Product name is required');
        if (!classify.product_model.trim()) out.push('Product model is required');
        if (!(Number(classify.quantity) > 0)) out.push('Quantity must be greater than zero');
        if (!classify.planned_date) out.push('Planned date is required');
      }
      if (selectedWorkflows.has('repair') && !classify.problem_category) out.push('Problem category is required');
      if (customerType === 'Existing' && leadRequired && !classify.lead_id) out.push('Select the existing lead this service belongs to');
      if (customerType === 'Existing' && !classify.product_id) out.push('Select the affected product, or register it');
      if (selectedWorkflows.has('amc') && meta?.config?.amc_required !== false && !classify.amc_id) out.push('Select an active AMC contract');
    }
    return out;
  };

  const next = () => {
    const problems = stepErrors(current);
    setErrors(problems);
    if (problems.length === 0) setStep((s) => Math.min(s + 1, stepIds.length - 1));
  };

  const back = () => {
    setErrors([]);
    setStep((s) => Math.max(0, s - 1));
  };

  const chooseVisit = (required) => {
    setSiteVisitRequired(required);
    setErrors([]);
    if (required) {
      setAck((current) => ({ ...current, name: current.name || details.contact_person }));
    }
  };

  const persistDraftFields = async (id, payload) => {
    try {
      await serviceApi.put(`/service-requests/${id}`, {
        contact_person: payload.contact_person,
        mobile: payload.mobile,
        email: payload.email,
        site_address: payload.site_address,
        city: payload.city,
        state: payload.state,
        pincode: payload.pincode,
        customer_notes: payload.customer_notes,
        problem_description: payload.problem_description,
        problem_category: payload.problem_category,
        priority: payload.priority,
        service_type: payload.service_type,
        product_category: payload.product_category,
        product_name: payload.product_name,
        product_model: payload.product_model,
        serial_number: payload.serial_number,
        quantity: payload.quantity,
        planned_date: payload.planned_date,
        installation_requirements: payload.installation_requirements,
        lead_id: payload.lead_id,
        product_id: payload.product_id,
      });
    } catch {
      /* older servers ignore some of these fields */
    }
  };

  const submitExistingDraft = async (id) => {
    try {
      const submitted = await serviceApi.post(`/service-requests/${id}/submit`, {});
      if (submitted?.service?.status && submitted.service.status !== 'Draft') return submitted;
    } catch (err) {
      if (err?.response?.status && err.response.status !== 404) throw err;
    }
    const submitted = await serviceApi.post(`/service-requests/${id}/status`, { status: 'New' });
    if (submitted?.service?.status && submitted.service.status !== 'Draft') return submitted;
    throw new Error('The draft was saved, but it could not be submitted');
  };

  const submit = async (asDraft) => {
    if (!asDraft) {
      const problems = stepIds.flatMap((id) => stepErrors(id));
      if (problems.length > 0) {
        setErrors(problems);
        return;
      }
    }
    if (!customer) {
      setErrors(['Select a customer, or add a new one']);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const serviceTypes = serviceTypesSelected.map((item) => String(item || '').trim()).filter(Boolean);
      const productTypes = productTypesSelected.map((item) => String(item || '').trim()).filter(Boolean);
      const existingId = draftService?.id || draftId || null;
      const payload = {
        ...details,
        ...classify,
        customer_type: customerType,
        customer_id: customer.id,
        site_visit_required: siteVisitRequired,
        site_visit_acknowledgement: siteVisitRequired ? ack : null,
        client_request_id: requestId.current,
        draft_id: existingId,
        save_as_draft: asDraft,
        service_types: serviceTypes,
        service_type: serviceTypes[0],
        product_types: productTypes,
        product_category: productTypes[0],
        lead_id: classify.lead_id || null,
        product_id: classify.product_id || null,
        amc_id: selectedWorkflows.has('amc') ? classify.amc_id || null : null,
      };
      let detail = await serviceApi.post('/service-requests', payload);
      const savedId = detail?.service?.id;
      if (existingId) {
        await persistDraftFields(existingId, payload);
      }
      if (!asDraft && detail?.service?.status === 'Draft') {
        try {
          detail = await submitExistingDraft(savedId || existingId);
        } catch (submitErr) {
          const fresh = await serviceApi.post('/service-requests', {
            ...payload,
            client_request_id: uid(),
            draft_id: null,
            save_as_draft: false,
          });
          if (fresh?.service?.status === 'Draft') throw submitErr;
          if (existingId) {
            try {
              await serviceApi.post(`/service-requests/${existingId}/status`, {
                status: 'Cancelled',
                reason: `Submitted as ${fresh.service.service_code}`,
              });
            } catch {
              /* the new request is the one that matters */
            }
          }
          detail = fresh;
        }
      }
      if (siteVisitRequired && ackFile && detail?.service?.id) {
        const form = new FormData();
        form.append('file', ackFile);
        form.append('category', SITE_VISIT_ACK_CATEGORY);
        form.append('description', ack.notes);
        try {
          await serviceApi.upload(`/service-requests/${detail.service.id}/attachments`, form);
        } catch (err) {
          toast.error(getApiErrorMessage(err, 'The request was created, but the acknowledgement file did not upload. Add it on the request.'));
        }
      }
      if (asDraft) {
        setDraftService(detail.service);
        loadedDraft.current = detail.service.id;
        if (siteVisitRequired && ackFile) setAckFileOnRecord(true);
        toast.success(`${detail.service.service_code} saved as draft`);
        onCreated?.(detail.service.id, { draft: true, service: detail.service });
        return;
      }
      if (detail?.service?.status === 'Draft') {
        setErrors(['The draft was saved, but it is still a draft. Click Submit request again.']);
        return;
      }
      toast.success(`${detail.service.service_code} submitted`);
      onCreated?.(detail.service.id, { draft: false, service: detail.service });
    } catch (err) {
      setErrors(errorList(err, 'Could not create the service request'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="create-service-dialog">
        <DialogHeader>
          <DialogTitle>{draftService?.service_code ? `Continue draft ${draftService.service_code}` : 'Create service request'}</DialogTitle>
          <DialogDescription>
            Step {safeStep + 1} of {stepIds.length}: {STEP_LABEL[current]}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-1.5 text-xs font-medium">
          {stepIds.map((id, idx) => (
            <li
              key={id}
              className={cn(
                'rounded-full border px-2.5 py-0.5',
                idx === safeStep ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  : idx < safeStep ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground',
              )}
            >
              {idx + 1}. {STEP_LABEL[id]}
            </li>
          ))}
        </ol>

        {errors.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <ul className="list-disc space-y-0.5 pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        {current === 'type' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The person on the call does not choose a service type or product. That is filled in after the site visit, once the problem is known.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {['New', 'Existing'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setCustomerType(type); setErrors([]); }}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    customerType === type ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted',
                  )}
                >
                  <div className="text-base font-semibold text-foreground">{CUSTOMER_TYPE_COPY[type].title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{CUSTOMER_TYPE_COPY[type].hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {current === 'customer' && (
          <div className="space-y-4">
            {!customer && !newCustomerOpen && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input aria-label="Search customer name, ID, phone or contact" className="pl-8" placeholder="Search customer name, ID, phone or contact" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
                  </div>
                  <Button variant="outline" onClick={() => { setNewCustomerOpen(true); setErrors([]); }}>
                    <UserPlus className="mr-1 h-4 w-4" />New customer
                  </Button>
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {results.map((c) => (
                    <ChoiceRow
                      key={c.id}
                      selected={false}
                      onSelect={() => pickCustomer(c)}
                      title={c.company_name}
                      subtitle={[c.customer_id, c.contact_person_name, c.phone, c.city].filter(Boolean).join(' · ')}
                    />
                  ))}
                  {!searching && results.length === 0 && <p className="text-sm text-muted-foreground">No customers match. Add a new customer instead.</p>}
                </div>
              </div>
            )}

            {newCustomerOpen && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <h4 className="text-sm font-semibold">New customer</h4>
                <p className="text-xs text-muted-foreground">This adds the customer to the Customers ledger. Duplicate names are not allowed.</p>
                <FieldGrid>
                  {[
                    { key: 'company_name', label: 'Company name', type: 'text', required: true },
                    { key: 'contact_person_name', label: 'Contact person', type: 'text' },
                    { key: 'phone', label: 'Mobile', type: 'text' },
                    { key: 'email', label: 'Email', type: 'text' },
                    { key: 'gst_number', label: 'GST number', type: 'text' },
                    { key: 'pincode', label: 'PIN code', type: 'text', maxLength: 6 },
                    { key: 'address_line', label: 'Address', type: 'text', wide: true },
                    { key: 'city', label: 'City', type: 'text' },
                    { key: 'state', label: 'State', type: 'text' },
                  ].map((field) => (
                    <FormField key={field.key} field={field} value={newCustomer[field.key]} onChange={(v) => setNewCustomer((p) => ({ ...p, [field.key]: v }))} />
                  ))}
                </FieldGrid>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setNewCustomerOpen(false); setErrors([]); }} disabled={busy}>Cancel</Button>
                  <Button onClick={createCustomer} disabled={busy || !newCustomer.company_name.trim()}>
                    {busy ? 'Adding…' : 'Add customer'}
                  </Button>
                </div>
              </div>
            )}

            {customer && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" />{customer.company_name}
                  </div>
                  <div className="text-xs text-emerald-800">
                    {[customer.customer_id, customer.contact_person_name, customer.phone, customer.city].filter(Boolean).join(' · ')}
                  </div>
                  <p className="mt-2 text-xs text-emerald-900">Next, record what they said on the call.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>Change</Button>
              </div>
            )}
          </div>
        )}

        {current === 'call' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This is the phone call. Write down the name, address, number, notes and the problem in the customer&apos;s words. Service type and product are on the next steps.
            </p>
            <FieldGrid>
              <FormField field={{ key: 'contact_person', label: 'Name', type: 'text', required: true }} value={details.contact_person} onChange={setDetail('contact_person')} />
              <FormField field={{ key: 'mobile', label: 'Phone number', type: 'text', required: true }} value={details.mobile} onChange={setDetail('mobile')} />
              <FormField field={{ key: 'email', label: 'Email', type: 'text' }} value={details.email} onChange={setDetail('email')} />
              <FormField
                field={{ key: 'priority', label: 'Priority', type: 'select' }}
                value={details.priority}
                options={meta?.priorities || []}
                onChange={setDetail('priority')}
              />
              <FormField field={{ key: 'site_address', label: 'Address', type: 'textarea', required: true, wide: true }} value={details.site_address} onChange={setDetail('site_address')} />
              <FormField field={{ key: 'city', label: 'City', type: 'text' }} value={details.city} onChange={setDetail('city')} />
              <FormField field={{ key: 'state', label: 'State', type: 'text' }} value={details.state} onChange={setDetail('state')} />
              <FormField field={{ key: 'pincode', label: 'PIN code', type: 'text', maxLength: 6 }} value={details.pincode} onChange={setDetail('pincode')} />
              <FormField field={{ key: 'problem_description', label: 'Problem', type: 'textarea', required: true, wide: true }} value={details.problem_description} onChange={setDetail('problem_description')} />
              <FormField field={{ key: 'customer_notes', label: 'Notes', type: 'textarea', wide: true }} value={details.customer_notes} onChange={setDetail('customer_notes')} />
            </FieldGrid>
          </div>
        )}

        {current === 'visit' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask whether someone needs to visit the site before the job can be classified. If yes, record that the customer agreed to the visit.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseVisit(true)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  siteVisitRequired === true ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted',
                )}
              >
                <div className="text-base font-semibold text-foreground">Site visit required</div>
                <p className="mt-1 text-sm text-muted-foreground">Someone will visit. Record the customer acknowledgement, then the service and product on the next step.</p>
              </button>
              <button
                type="button"
                onClick={() => chooseVisit(false)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  siteVisitRequired === false ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted',
                )}
              >
                <div className="text-base font-semibold text-foreground">No site visit</div>
                <p className="mt-1 text-sm text-muted-foreground">The executive records the service types and product types on the next step. More than one of each is allowed.</p>
              </button>
            </div>

            {siteVisitRequired === true && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <h4 className="text-sm font-semibold text-foreground">Customer acknowledgement</h4>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={ack.acknowledged}
                    onCheckedChange={(value) => setAck((current) => ({ ...current, acknowledged: value === true }))}
                    aria-label="Customer acknowledged the site visit"
                  />
                  <span>The customer acknowledged the site visit on this call.</span>
                </label>
                <FieldGrid>
                  <FormField
                    field={{ key: 'ack_name', label: 'Acknowledged by', type: 'text', required: true }}
                    value={ack.name}
                    onChange={(value) => setAck((current) => ({ ...current, name: value }))}
                  />
                  <FormField
                    field={{ key: 'ack_notes', label: 'Acknowledgement notes', type: 'textarea', required: true, wide: true }}
                    value={ack.notes}
                    onChange={(value) => setAck((currentAck) => ({ ...currentAck, notes: value }))}
                  />
                </FieldGrid>
                <label className="block text-xs font-medium text-muted-foreground">
                  Acknowledgement file <span className="text-rose-600">*</span>
                  <input
                    type="file"
                    className="mt-1 block w-full text-sm text-foreground"
                    onChange={(event) => setAckFile(event.target.files?.[0] || null)}
                  />
                </label>
                {ackFile && <p className="text-xs text-muted-foreground">{ackFile.name}</p>}
              </div>
            )}
          </div>
        )}

        {current === 'classify' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select every service type that applies. Product type is required only for Installation & Commissioning. For an existing customer, also choose the lead and the registered product.
            </p>
            <FieldGrid>
              <MultiPicker
                label="Service type"
                required
                options={typeOptions}
                selected={serviceTypesSelected}
                onToggle={(value) => setServiceTypesSelected((list) => toggleValue(list, value))}
              />
              {selectedWorkflows.has('installation') && (
                <MultiPicker
                  label="Product type"
                  required
                  options={INSTALLATION_PRODUCT_CATEGORIES}
                  selected={productTypesSelected}
                  onToggle={(value) => setProductTypesSelected((list) => toggleValue(list, value))}
                />
              )}
            </FieldGrid>
            {customerType === 'Existing' && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Lead{leadRequired && <span className="text-rose-600"> *</span>}</h4>
                {!profile ? <p className="text-sm text-muted-foreground">Loading leads and products…</p> : profile.leads.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No lead exists for this customer yet.</p>
                ) : profile.leads.map((lead) => (
                  <ChoiceRow
                    key={lead.id}
                    selected={classify.lead_id === lead.id}
                    onSelect={() => setClassify((prev) => ({ ...prev, lead_id: lead.id }))}
                    title={lead.company || 'Lead'}
                    subtitle={[lead.sub_category || lead.category, lead.status].filter(Boolean).join(' · ')}
                  />
                ))}
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Registered product <span className="text-rose-600">*</span></h4>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewProductOpen((open) => !open)} disabled={busy}>
                    {newProductOpen ? 'Cancel' : 'Register product'}
                  </Button>
                </div>
                {(profile?.products || []).length === 0 && !newProductOpen && <p className="text-sm text-muted-foreground">No registered product yet. Register one, then select it.</p>}
                {newProductOpen && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <FieldGrid>
                      <FormField field={{ key: 'np-category', label: 'Product category', type: 'text', required: true }} value={newProduct.category} onChange={(value) => setNewProduct((prev) => ({ ...prev, category: value }))} />
                      <FormField field={{ key: 'np-name', label: 'Product name', type: 'text', required: true }} value={newProduct.name} onChange={(value) => setNewProduct((prev) => ({ ...prev, name: value }))} />
                      <FormField field={{ key: 'np-model', label: 'Model', type: 'text' }} value={newProduct.model} onChange={(value) => setNewProduct((prev) => ({ ...prev, model: value }))} />
                      <FormField field={{ key: 'np-serial', label: 'Serial number', type: 'text' }} value={newProduct.serial_number} onChange={(value) => setNewProduct((prev) => ({ ...prev, serial_number: value }))} />
                    </FieldGrid>
                    <div className="flex justify-end">
                      <Button type="button" onClick={registerProduct} disabled={busy || !newProduct.name.trim() || !newProduct.category.trim()}>
                        {busy ? 'Saving…' : 'Save product'}
                      </Button>
                    </div>
                  </div>
                )}
                {(profile?.products || []).map((product) => (
                  <ChoiceRow
                    key={product.id}
                    selected={classify.product_id === product.id}
                    onSelect={() => setClassify((prev) => ({ ...prev, product_id: product.id }))}
                    title={product.name}
                    subtitle={[product.category, product.model, product.serial_number].filter(Boolean).join(' · ')}
                  />
                ))}
              </div>
            )}
            {selectedWorkflows.has('installation') && (
              <FieldGrid>
                <FormField field={{ key: 'product_name', label: 'Product name', type: 'text', required: true }} value={classify.product_name} onChange={(value) => setClassify((prev) => ({ ...prev, product_name: value }))} />
                <FormField field={{ key: 'product_model', label: 'Model', type: 'text', required: true }} value={classify.product_model} onChange={(value) => setClassify((prev) => ({ ...prev, product_model: value }))} />
                <FormField field={{ key: 'serial_number', label: 'Serial number', type: 'text' }} value={classify.serial_number} onChange={(value) => setClassify((prev) => ({ ...prev, serial_number: value }))} />
                <FormField field={{ key: 'quantity', label: 'Quantity', type: 'number', required: true }} value={classify.quantity} onChange={(value) => setClassify((prev) => ({ ...prev, quantity: value }))} />
                <FormField field={{ key: 'planned_date', label: 'Planned date', type: 'date', required: true }} value={classify.planned_date} onChange={(value) => setClassify((prev) => ({ ...prev, planned_date: value }))} />
                <FormField field={{ key: 'installation_requirements', label: 'Special requirements', type: 'textarea', wide: true }} value={classify.installation_requirements} onChange={(value) => setClassify((prev) => ({ ...prev, installation_requirements: value }))} />
              </FieldGrid>
            )}
            {selectedWorkflows.has('repair') && (
              <FieldGrid>
                <FormField
                  field={{ key: 'problem_category', label: 'Problem category', type: 'select', required: true }}
                  value={classify.problem_category}
                  options={meta?.config?.problem_categories || []}
                  onChange={(value) => setClassify((prev) => ({ ...prev, problem_category: value }))}
                />
              </FieldGrid>
            )}
            {selectedWorkflows.has('amc') && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold">AMC contract</h4>
                {(profile?.amcs || []).filter((item) => item.effective_status === 'Active').map((contract) => (
                  <ChoiceRow
                    key={contract.id}
                    selected={classify.amc_id === contract.id}
                    onSelect={() => setClassify((prev) => ({ ...prev, amc_id: contract.id }))}
                    title={contract.amc_number}
                    subtitle={`${contract.start_date || ''} to ${contract.end_date || ''}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {current === 'review' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-2">
              <ReadRow label="Customer type">{customerType}</ReadRow>
              <ReadRow label="Customer">{customer?.company_name}</ReadRow>
              <ReadRow label="Name">{details.contact_person}</ReadRow>
              <ReadRow label="Phone">{details.mobile}</ReadRow>
              <ReadRow label="Address">{[details.site_address, details.city, details.state, details.pincode].filter(Boolean).join(', ')}</ReadRow>
              <ReadRow label="Priority">{details.priority}</ReadRow>
              <div className="md:col-span-2"><ReadRow label="Problem">{details.problem_description}</ReadRow></div>
              {details.customer_notes && <div className="md:col-span-2"><ReadRow label="Notes">{details.customer_notes}</ReadRow></div>}
              <ReadRow label="Site visit">{siteVisitRequired ? 'Required' : 'Not required'}</ReadRow>
              {siteVisitRequired && <ReadRow label="Acknowledged by">{ack.name}</ReadRow>}
              {siteVisitRequired && <div className="md:col-span-2"><ReadRow label="Acknowledgement notes">{ack.notes}</ReadRow></div>}
              {siteVisitRequired && <ReadRow label="Acknowledgement file">{ackFile?.name}</ReadRow>}
              <div className="md:col-span-2"><ReadRow label="Service types">{serviceTypesSelected.join(', ')}</ReadRow></div>
              {selectedWorkflows.has('installation') && <div className="md:col-span-2"><ReadRow label="Product types">{productTypesSelected.join(', ')}</ReadRow></div>}
            </div>
            <p className="text-xs text-muted-foreground">
              The first selected service type is saved on the request. The technician can be assigned once this request is created.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={current === 'type' ? onClose : back} disabled={busy}>
            {current === 'type' ? 'Cancel' : (<><ChevronLeft className="mr-1 h-4 w-4" />Back</>)}
          </Button>
          <div className="flex gap-2">
            {current !== 'type' && customer && (
              <Button variant="outline" onClick={() => submit(true)} disabled={busy} title="Open the draft later and click Submit request">Save as draft</Button>
            )}
            {current !== 'review' ? (
              <Button onClick={next} disabled={busy}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            ) : (
              <Button onClick={() => submit(false)} disabled={busy}>{busy ? 'Saving…' : draftService ? 'Submit request' : 'Create request'}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateServiceRequest;

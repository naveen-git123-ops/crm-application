import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  CUSTOMER_TYPE_COPY, INSTALLATION_PRODUCT_CATEGORIES, fmtDate, serviceApi, uid,
} from '@/lib/serviceUtils';
import { cn } from '@/lib/utils';
import { FieldGrid, FormField, ReadRow } from '@/components/service/ServiceFields';

const STEPS = ['Customer type', 'Customer & lead', 'Service details', 'Review'];

const PRODUCT_CATEGORY_FIELD = { key: 'category', label: 'Product category', type: 'text', required: true };

const blankDetails = {
  service_type: '', priority: 'Medium', contact_person: '', mobile: '', email: '', site_address: '', city: '',
  state: '', pincode: '', customer_notes: '', planned_date: '', expected_visit_date: '', expected_completion: '',
  product_category: '', product_name: '', product_model: '', serial_number: '', quantity: '1',
  installation_requirements: '', problem_category: '', problem_description: '', reported_by: '',
  reported_date: '', remarks: '',
};

const blankCustomer = {
  company_name: '', contact_person_name: '', phone: '', email: '', address_line: '', city: '', state: '',
  pincode: '', gst_number: '',
};

const blankProduct = {
  category: '', name: '', model: '', serial_number: '', installation_date: '', warranty_start: '', warranty_end: '',
};

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

export function CreateServiceRequest({ open, onClose, meta, onCreated }) {
  const [step, setStep] = useState(0);
  const [customerType, setCustomerType] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(blankCustomer);
  const [leadId, setLeadId] = useState('');
  const [productId, setProductId] = useState('');
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState(blankProduct);
  const [amcId, setAmcId] = useState('');
  const [details, setDetails] = useState(blankDetails);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(uid());

  const config = meta?.config || {};
  const serviceTypes = useMemo(
    () => (customerType ? meta?.service_types_by_customer?.[customerType] || [] : []),
    [customerType, meta],
  );
  const workflow = meta?.workflow_by_service_type?.[details.service_type] || '';
  const leadRequired = customerType === 'Existing' && config.require_lead_for_existing !== false;

  const reset = useCallback(() => {
    setStep(0); setCustomerType(''); setQuery(''); setResults([]); setCustomer(null); setProfile(null);
    setNewCustomerOpen(false); setNewCustomer(blankCustomer); setLeadId(''); setProductId('');
    setNewProductOpen(false); setNewProduct(blankProduct); setAmcId(''); setDetails(blankDetails); setErrors([]);
    requestId.current = uid();
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // Customer search (debounced).
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

  const loadProfile = useCallback(async (c) => {
    setProfileLoading(true);
    try {
      setProfile(await serviceApi.get(`/service/customers/${c.id}/profile`));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load the customer'));
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const pickCustomer = (c) => {
    setCustomer(c);
    setLeadId('');
    setProductId('');
    setAmcId('');
    setNewProductOpen(false);
    loadProfile(c);
    setDetails((prev) => ({
      ...prev,
      contact_person: c.contact_person_name || '',
      mobile: c.phone || '',
      email: c.email || '',
      site_address: c.address_line || '',
      city: c.city || '',
      state: c.state || '',
      pincode: c.pincode || '',
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
    setBusy(true);
    setErrors([]);
    try {
      const created = await serviceApi.post('/service/products', { ...newProduct, customer_id: customer.id, lead_id: leadId || null });
      toast.success('Product registered');
      setNewProductOpen(false);
      setNewProduct(blankProduct);
      await loadProfile(customer);
      setProductId(created.id);
    } catch (err) {
      setErrors(errorList(err, 'Could not register the product'));
    } finally {
      setBusy(false);
    }
  };

  const selectedProduct = profile?.products?.find((p) => p.id === productId);
  const selectedLead = profile?.leads?.find((l) => l.id === leadId);
  const usableAmcs = useMemo(() => (profile?.amcs || []).filter((a) => {
    if (a.effective_status !== 'Active') return false;
    const covered = a.covered_product_ids || [];
    return !productId || covered.length === 0 || covered.includes(productId);
  }), [profile, productId]);

  // An active contract covering the product is picked automatically for AMC visits.
  useEffect(() => {
    if (details.service_type === 'AMC Visit' && !amcId && usableAmcs.length === 1) setAmcId(usableAmcs[0].id);
  }, [details.service_type, usableAmcs, amcId]);

  const setDetail = (key) => (value) => setDetails((prev) => ({ ...prev, [key]: value }));

  const stepErrors = (index) => {
    const out = [];
    if (index === 0 && !customerType) out.push('Choose New or Existing customer');
    if (index === 1) {
      if (!customer) out.push('Select a customer, or add a new one');
      if (customer && leadRequired && !leadId) out.push('Select the existing lead this service belongs to');
      if (customer && customerType === 'Existing' && !productId) out.push('Select the affected product, or register it');
    }
    if (index === 2) {
      if (!details.service_type) out.push('Select the service type');
      if (!details.contact_person.trim()) out.push('Contact person is required');
      if (!validMobile(details.mobile)) out.push('A valid mobile number is required');
      if (!details.site_address.trim()) out.push('Site address is required');
      if (details.pincode && !/^\d{6}$/.test(details.pincode)) out.push('PIN code must be 6 digits');
      if (details.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) out.push('Email address is not valid');
      if (workflow === 'installation') {
        if (!details.product_category.trim()) out.push('Product category is required');
        if (!details.product_name.trim()) out.push('Product name is required');
        if (!details.product_model.trim()) out.push('Product model is required');
        if (!(Number(details.quantity) > 0)) out.push('Quantity must be greater than zero');
        if (!details.planned_date) out.push('Installation / planned date is required');
      }
      if (workflow === 'repair') {
        if (!details.problem_category) out.push('Problem category is required');
        if (details.problem_description.trim().length < 5) out.push('Describe the problem');
      }
      if (workflow === 'amc' && config.amc_required !== false && !amcId) out.push('Select an active AMC contract');
      const start = details.planned_date || details.expected_visit_date;
      if (start && details.expected_completion && details.expected_completion < start) {
        out.push('Expected completion cannot be before the planned / visit date');
      }
    }
    return out;
  };

  const next = () => {
    const problems = stepErrors(step);
    setErrors(problems);
    if (problems.length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    setErrors([]);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = async (asDraft) => {
    if (!asDraft) {
      const problems = [0, 1, 2].flatMap(stepErrors);
      if (problems.length > 0) {
        setErrors(problems);
        return;
      }
    }
    setBusy(true);
    setErrors([]);
    try {
      const payload = {
        ...details,
        customer_type: customerType,
        customer_id: customer.id,
        lead_id: leadId || null,
        product_id: productId || null,
        amc_id: workflow === 'amc' ? amcId || null : null,
        client_request_id: requestId.current,
        save_as_draft: asDraft,
      };
      const detail = await serviceApi.post('/service-requests', payload);
      toast.success(detail.created === false
        ? `${detail.service.service_code} was already created`
        : `${detail.service.service_code} ${asDraft ? 'saved as draft' : 'created'}`);
      onCreated?.(detail.service.id);
      onClose();
    } catch (err) {
      setErrors(errorList(err, 'Could not create the service request'));
    } finally {
      setBusy(false);
    }
  };

  const typeOptions = serviceTypes;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="create-service-dialog">
        <DialogHeader>
          <DialogTitle>Create service request</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-1.5 text-xs font-medium">
          {STEPS.map((label, idx) => (
            <li
              key={label}
              className={cn(
                'rounded-full border px-2.5 py-0.5',
                idx === step ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  : idx < step ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground',
              )}
            >
              {idx + 1}. {label}
            </li>
          ))}
        </ol>

        {errors.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <ul className="list-disc space-y-0.5 pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        {step === 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {['New', 'Existing'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => { setCustomerType(type); setDetails((d) => ({ ...d, service_type: '' })); setErrors([]); }}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  customerType === type ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:bg-muted',
                )}
              >
                <div className="text-base font-semibold text-foreground">{CUSTOMER_TYPE_COPY[type].title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{CUSTOMER_TYPE_COPY[type].hint}</p>
                <p className="mt-2 text-xs text-muted-foreground">{(meta?.service_types_by_customer?.[type] || []).join(' · ')}</p>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
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
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                      <CheckCircle2 className="h-4 w-4" />{customer.company_name}
                    </div>
                    <div className="text-xs text-emerald-800">
                      {[customer.customer_id, customer.contact_person_name, customer.phone, customer.city].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setCustomer(null); setProfile(null); setLeadId(''); setProductId(''); }}>
                    Change
                  </Button>
                </div>

                {profileLoading && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading leads and products…</p>}

                {profile && (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Lead{leadRequired && <span className="text-rose-600"> *</span>}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">The service is linked to the lead you pick.</span>
                      </h4>
                      {profile.leads.length === 0 ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          No lead exists for this customer.
                          {leadRequired ? ' Create the lead from the Leads screen first, then come back.' : ' You can continue without one.'}
                        </p>
                      ) : (
                        <div className="max-h-48 space-y-1.5 overflow-y-auto">
                          {!leadRequired && (
                            <ChoiceRow selected={!leadId} onSelect={() => setLeadId('')} title="No lead" />
                          )}
                          {profile.leads.map((lead) => (
                            <ChoiceRow
                              key={lead.id}
                              selected={leadId === lead.id}
                              onSelect={() => setLeadId(lead.id)}
                              title={`${lead.company || 'Lead'} — ${lead.sub_category || lead.category || 'Enquiry'}`}
                              subtitle={[lead.contact_name, lead.enquiry_date ? fmtDate(lead.enquiry_date) : null].filter(Boolean).join(' · ')}
                              badge={<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{lead.status}</span>}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {customerType === 'Existing' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-foreground">Affected product <span className="text-rose-600">*</span></h4>
                          {!newProductOpen && (
                            <Button variant="outline" size="sm" onClick={() => { setNewProductOpen(true); setErrors([]); }}>
                              <Plus className="mr-1 h-3.5 w-3.5" />Register product
                            </Button>
                          )}
                        </div>
                        {!newProductOpen && (profile.products.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No registered products for this customer yet.</p>
                        ) : (
                          <div className="max-h-48 space-y-1.5 overflow-y-auto">
                            {profile.products.map((p) => (
                              <ChoiceRow
                                key={p.id}
                                selected={productId === p.id}
                                onSelect={() => setProductId(p.id)}
                                title={p.name}
                                subtitle={[p.category, p.model, p.serial_number ? `S/N ${p.serial_number}` : null, p.warranty_status ? `Warranty: ${p.warranty_status}` : null].filter(Boolean).join(' · ')}
                              />
                            ))}
                          </div>
                        ))}
                        {newProductOpen && (
                          <div className="space-y-3 rounded-lg border border-border p-3">
                            <FieldGrid>
                              <div className="space-y-1">
                                <FormField field={PRODUCT_CATEGORY_FIELD} value={newProduct.category} onChange={(v) => setNewProduct((p) => ({ ...p, category: v }))} />
                              </div>
                              {[
                                { key: 'name', label: 'Product name', type: 'text', required: true },
                                { key: 'model', label: 'Model', type: 'text' },
                                { key: 'serial_number', label: 'Serial number', type: 'text' },
                                { key: 'installation_date', label: 'Installation date', type: 'date' },
                                { key: 'warranty_start', label: 'Warranty start', type: 'date' },
                                { key: 'warranty_end', label: 'Warranty end', type: 'date' },
                              ].map((field) => (
                                <FormField key={field.key} field={field} value={newProduct[field.key]} onChange={(v) => setNewProduct((p) => ({ ...p, [field.key]: v }))} />
                              ))}
                            </FieldGrid>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => { setNewProductOpen(false); setErrors([]); }} disabled={busy}>Cancel</Button>
                              <Button onClick={registerProduct} disabled={busy || !newProduct.name.trim() || !newProduct.category.trim()}>
                                {busy ? 'Saving…' : 'Register product'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <FieldGrid>
              <FormField
                field={{ key: 'service_type', label: 'Service type', type: 'select', required: true }}
                value={details.service_type}
                options={typeOptions}
                onChange={(v) => { setDetail('service_type')(v); setAmcId(''); }}
              />
              <FormField
                field={{ key: 'priority', label: 'Priority', type: 'select' }}
                value={details.priority}
                options={meta?.priorities || []}
                onChange={setDetail('priority')}
              />
            </FieldGrid>

            <h4 className="text-sm font-semibold text-foreground">Contact and site</h4>
            <FieldGrid>
              <FormField field={{ key: 'contact_person', label: 'Contact person', type: 'text', required: true }} value={details.contact_person} onChange={setDetail('contact_person')} />
              <FormField field={{ key: 'mobile', label: 'Mobile', type: 'text', required: true }} value={details.mobile} onChange={setDetail('mobile')} />
              <FormField field={{ key: 'email', label: 'Email', type: 'text' }} value={details.email} onChange={setDetail('email')} />
              <FormField field={{ key: 'pincode', label: 'PIN code', type: 'text', maxLength: 6 }} value={details.pincode} onChange={setDetail('pincode')} />
              <FormField field={{ key: 'site_address', label: workflow === 'installation' ? 'Installation / site address' : 'Site address', type: 'textarea', required: true, wide: true }} value={details.site_address} onChange={setDetail('site_address')} />
              <FormField field={{ key: 'city', label: 'City', type: 'text' }} value={details.city} onChange={setDetail('city')} />
              <FormField field={{ key: 'state', label: 'State', type: 'text' }} value={details.state} onChange={setDetail('state')} />
            </FieldGrid>

            {workflow === 'installation' && (
              <>
                <h4 className="text-sm font-semibold text-foreground">Product to install</h4>
                <FieldGrid>
                  <div className="space-y-1">
                    <FormField
                      field={{ key: 'product_category', label: 'Product category', type: 'text', required: true }}
                      value={details.product_category}
                      onChange={setDetail('product_category')}
                    />
                    <div className="flex flex-wrap gap-1">
                      {INSTALLATION_PRODUCT_CATEGORIES.map((c) => (
                        <button key={c} type="button" className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted" onClick={() => setDetail('product_category')(c)}>{c}</button>
                      ))}
                    </div>
                  </div>
                  <FormField field={{ key: 'product_name', label: 'Product name', type: 'text', required: true }} value={details.product_name} onChange={setDetail('product_name')} />
                  <FormField field={{ key: 'product_model', label: 'Model', type: 'text', required: true }} value={details.product_model} onChange={setDetail('product_model')} />
                  <FormField field={{ key: 'serial_number', label: 'Serial number (if known)', type: 'text' }} value={details.serial_number} onChange={setDetail('serial_number')} />
                  <FormField field={{ key: 'quantity', label: 'Quantity', type: 'number', required: true }} value={details.quantity} onChange={setDetail('quantity')} />
                  <FormField field={{ key: 'planned_date', label: 'Installation date', type: 'date', required: true }} value={details.planned_date} onChange={setDetail('planned_date')} />
                  <FormField field={{ key: 'installation_requirements', label: 'Special requirements', type: 'textarea', wide: true }} value={details.installation_requirements} onChange={setDetail('installation_requirements')} />
                </FieldGrid>
              </>
            )}

            {workflow === 'repair' && (
              <>
                <h4 className="text-sm font-semibold text-foreground">Problem</h4>
                <FieldGrid>
                  <FormField
                    field={{ key: 'problem_category', label: 'Problem category', type: 'select', required: true }}
                    value={details.problem_category}
                    options={config.problem_categories || []}
                    onChange={setDetail('problem_category')}
                  />
                  <FormField field={{ key: 'reported_date', label: 'Reported date', type: 'date' }} value={details.reported_date} onChange={setDetail('reported_date')} />
                  <FormField field={{ key: 'problem_description', label: 'Problem description', type: 'textarea', required: true, wide: true }} value={details.problem_description} onChange={setDetail('problem_description')} />
                  <FormField field={{ key: 'reported_by', label: 'Reported by', type: 'text' }} value={details.reported_by} onChange={setDetail('reported_by')} />
                  <FormField field={{ key: 'expected_visit_date', label: 'Expected visit date', type: 'date' }} value={details.expected_visit_date} onChange={setDetail('expected_visit_date')} />
                </FieldGrid>
                {selectedProduct && <p className="text-xs text-muted-foreground">Product: {selectedProduct.name} {selectedProduct.serial_number ? `(S/N ${selectedProduct.serial_number})` : ''}</p>}
              </>
            )}

            {workflow === 'amc' && (
              <>
                <h4 className="text-sm font-semibold text-foreground">AMC contract</h4>
                {usableAmcs.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    No active AMC contract covers this customer{selectedProduct ? ` and ${selectedProduct.name}` : ''}. Add a contract from "AMC contracts" on the Service & Maintenance page before booking a visit.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {usableAmcs.map((a) => (
                      <ChoiceRow
                        key={a.id}
                        selected={amcId === a.id}
                        onSelect={() => setAmcId(a.id)}
                        title={a.amc_number}
                        subtitle={`${fmtDate(a.start_date)} – ${fmtDate(a.end_date)} · ${a.visits_used}${a.planned_visits ? ` of ${a.planned_visits}` : ''} visits used`}
                      />
                    ))}
                  </div>
                )}
                <FieldGrid>
                  <FormField field={{ key: 'planned_date', label: 'Planned visit date', type: 'date' }} value={details.planned_date} onChange={setDetail('planned_date')} />
                </FieldGrid>
              </>
            )}

            <FieldGrid>
              {workflow !== 'installation' && workflow !== 'amc' && (
                <FormField field={{ key: 'planned_date', label: 'Planned date', type: 'date' }} value={details.planned_date} onChange={setDetail('planned_date')} />
              )}
              <FormField field={{ key: 'expected_completion', label: 'Expected completion', type: 'date' }} value={details.expected_completion} onChange={setDetail('expected_completion')} />
              <FormField field={{ key: 'customer_notes', label: 'Notes', type: 'textarea', wide: true }} value={details.customer_notes} onChange={setDetail('customer_notes')} />
            </FieldGrid>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-2">
              <ReadRow label="Customer type">{customerType}</ReadRow>
              <ReadRow label="Customer">{customer?.company_name}</ReadRow>
              <ReadRow label="Lead">{selectedLead ? `${selectedLead.company} — ${selectedLead.sub_category || selectedLead.category || selectedLead.status}` : 'None'}</ReadRow>
              <ReadRow label="Service type">{details.service_type}</ReadRow>
              <ReadRow label="Priority">{details.priority}</ReadRow>
              <ReadRow label="Contact">{[details.contact_person, details.mobile].filter(Boolean).join(' · ')}</ReadRow>
              <ReadRow label="Site address">{[details.site_address, details.city, details.pincode].filter(Boolean).join(', ')}</ReadRow>
              {workflow === 'installation' && (
                <ReadRow label="Product">{[details.product_name, details.product_model, `Qty ${details.quantity}`].filter(Boolean).join(' · ')}</ReadRow>
              )}
              {workflow !== 'installation' && selectedProduct && (
                <ReadRow label="Product">{[selectedProduct.name, selectedProduct.serial_number].filter(Boolean).join(' · ')}</ReadRow>
              )}
              {workflow === 'repair' && <ReadRow label="Problem">{`${details.problem_category}: ${details.problem_description}`}</ReadRow>}
              <ReadRow label="Planned date">{fmtDate(details.planned_date || details.expected_visit_date)}</ReadRow>
              <ReadRow label="Expected completion">{fmtDate(details.expected_completion)}</ReadRow>
            </div>
            <p className="text-xs text-muted-foreground">
              After creating the request you can assign a technician and add documents, drawings, program files and photos from the request screen.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={step === 0 ? onClose : back} disabled={busy}>
            {step === 0 ? 'Cancel' : (<><ChevronLeft className="mr-1 h-4 w-4" />Back</>)}
          </Button>
          <div className="flex gap-2">
            {step > 0 && customer && (
              <Button variant="outline" onClick={() => submit(true)} disabled={busy}>Save as draft</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={busy}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            ) : (
              <Button onClick={() => submit(false)} disabled={busy}>{busy ? 'Creating…' : 'Create request'}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateServiceRequest;

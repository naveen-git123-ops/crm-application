import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone, Filter, X, FileText, Eye, Upload } from 'lucide-react';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;

const CGW_MEDIA_KEYS = ['flow_meter', 'telemetry', 'service_report', 'calibration_certificate', 'tax_invoice'];
const CGW_MEDIA_LABELS = {
  flow_meter: 'Flow meter (photo)',
  telemetry: 'Telemetry (photo)',
  service_report: 'Service report (photo)',
  calibration_certificate: 'Calibration certificate (photo)',
  tax_invoice: 'Tax invoice (photo)',
};
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
/** When true, shows the “Daily past-due renewal email” admin card (CGW inventory). */
const SHOW_CGW_DIGEST_EMAIL_SECTION = false;
const EMPTY_EQUIPMENT_ROW = {
  equipment_name: '',
  flowmeter_details: '',
  product_code: '',
  model_no: ''
};
const EMPTY_FORM = {
  customer_id: '',
  customer_name: '',
  location: '',
  contact_person: '',
  equipment_name: '',
  flowmeter_details: '',
  product_code: '',
  model_no: '',
  system_mobile_number: '',
  person_mobile_number: '',
  email_id: '',
  date_of_commissioning: '',
  url_link: '',
  user_id: '',
  password: '',
  status: 'Active',
  renewal_date: '',
  review: '',
  remarks: ''
};
const FILTER_FIELDS = [
  'customer_name',
  'location',
  'contact_person',
  'equipment_name',
  'flowmeter_details',
  'product_code',
  'model_no',
  'system_mobile_number',
  'person_mobile_number',
  'email_id',
  'date_of_commissioning',
  'url_link',
  'user_id',
  'password',
  'status',
  'renewal_date',
  'review',
  'calibration_certificate',
  'remarks'
];
const FILTER_LABELS = {
  customer_name: 'Customer Name',
  location: 'Location',
  contact_person: 'Contact Person',
  equipment_name: 'Equipment Name',
  flowmeter_details: 'Flowmeter/Piezometer Details',
  product_code: 'Product Code',
  model_no: 'Model No',
  system_mobile_number: 'System Mobile Number',
  person_mobile_number: 'Person Mobile Number',
  email_id: 'Email ID',
  date_of_commissioning: 'Date of Commissioning',
  url_link: 'URL Link',
  user_id: 'User ID',
  password: 'Password',
  status: 'Status',
  renewal_date: 'Renewal Date',
  review: 'Review',
  calibration_certificate: 'Calibration Certificate',
  remarks: 'Remarks'
};

/** Parse commissioning / renewal strings (YYYY-MM-DD, DD/MM/YYYY, or Date.parse). */
function parseGridDate(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    const dt = new Date(y, m, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    const y = parseInt(dmy[3], 10);
    const dt = new Date(y, m, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** overdue = renewal date before today; dueSoon = within next 30 days; ok = later; empty = no date */
function renewalUrgency(renewalDateRaw) {
  const dt = parseGridDate(renewalDateRaw);
  if (!dt) return 'empty';
  const today = startOfLocalDay(new Date());
  const renewal = startOfLocalDay(dt);
  if (renewal.getTime() < today.getTime()) return 'overdue';
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 30);
  if (renewal.getTime() <= limit.getTime()) return 'dueSoon';
  return 'ok';
}

function nocValidUrgency(isoDateRaw) {
  return renewalUrgency(isoDateRaw);
}

function RenewalDateCell({ groupEditActive, inlineEditData, groupAnchor, onChange }) {
  const rawForUrgency = groupEditActive ? inlineEditData.renewal_date : groupAnchor.renewal_date;
  const urgency = renewalUrgency(rawForUrgency);

  if (groupEditActive) {
    return (
      <div className="flex flex-col gap-0.5 min-w-[108px]">
        <Input
          type="date"
          value={inlineEditData.renewal_date}
          onChange={(e) => onChange('renewal_date', e.target.value)}
          className="h-7 text-[11px] px-2"
        />
        {urgency === 'overdue' && (
          <span className="text-[10px] font-semibold text-red-600 leading-tight">Still past due — pick a future date</span>
        )}
        {urgency === 'dueSoon' && (
          <span className="text-[10px] font-medium text-amber-700 leading-tight">Due within 30 days</span>
        )}
      </div>
    );
  }
  const display = groupAnchor.renewal_date || '—';
  return (
    <div className="flex flex-col gap-0.5 min-w-[108px]">
      <span
        className={`font-mono tabular-nums text-[11px] font-semibold ${
          urgency === 'overdue'
            ? 'text-red-700'
            : urgency === 'dueSoon'
              ? 'text-amber-800'
              : urgency === 'ok'
                ? 'text-gray-800'
                : 'text-gray-400'
        }`}
      >
        {display}
      </span>
      {urgency === 'overdue' && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 leading-tight">Past due</span>
      )}
      {urgency === 'dueSoon' && (
        <span className="text-[10px] font-medium text-amber-700 leading-tight">Due in ≤30 days</span>
      )}
    </div>
  );
}

/** Stacked NOC validity dates per equipment row (same customer group). */
function NocValidUptoColumnCell({ groupRows = [] }) {
  return (
    <div className="space-y-1.5 min-w-[112px]">
      {(groupRows || []).map((r) => {
        const v = r.noc_valid_upto;
        const nu = v ? nocValidUrgency(v) : 'empty';
        const label = (r.equipment_name || r.inventory_id || '—').slice(0, 22);
        return (
          <div key={r.id} className="rounded border border-gray-100 bg-gray-50/60 px-1.5 py-1">
            <p className="text-[9px] text-gray-500 truncate mb-0.5" title={r.inventory_id}>
              {label}
            </p>
            {v ? (
              <p className="text-[11px] font-mono tabular-nums leading-tight">
                <span
                  className={
                    nu === 'overdue'
                      ? 'text-red-600 font-bold'
                      : nu === 'dueSoon'
                        ? 'text-amber-800 font-semibold'
                        : 'text-gray-800 font-medium'
                  }
                >
                  {v}
                </span>
                {nu === 'overdue' ? (
                  <span className="ml-1 text-[10px] font-bold text-red-600 uppercase tracking-wide">Expired</span>
                ) : null}
              </p>
            ) : (
              <span className="text-[11px] text-gray-400">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CGWFlowMetre = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [equipmentRows, setEquipmentRows] = useState([EMPTY_EQUIPMENT_ROW]);
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditData, setInlineEditData] = useState(EMPTY_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [selectedFilterField, setSelectedFilterField] = useState('customer_name');
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [columnFilters, setColumnFilters] = useState(
    FILTER_FIELDS.reduce((acc, key) => ({ ...acc, [key]: '' }), {})
  );
  const [digestNotificationEmail, setDigestNotificationEmail] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestScheduleTz, setDigestScheduleTz] = useState('');
  const [digestSaving, setDigestSaving] = useState(false);

  const [nocDialogOpen, setNocDialogOpen] = useState(false);
  const [nocTargetItem, setNocTargetItem] = useState(null);
  const [nocFile, setNocFile] = useState(null);
  const [nocLocalPreview, setNocLocalPreview] = useState('');
  const [nocForm, setNocForm] = useState({
    project_name: '',
    noc_no: '',
    application_no: '',
    valid_from: '',
    valid_upto: '',
  });
  const [nocSaving, setNocSaving] = useState(false);
  /** Managers: false when opened via Preview/View — right panel locked until NOC button or "Edit NOC details". */
  const [nocSideFieldsEditable, setNocSideFieldsEditable] = useState(false);
  const [nocRemotePreviewUrl, setNocRemotePreviewUrl] = useState('');
  const [nocRemotePreviewLoading, setNocRemotePreviewLoading] = useState(false);
  const nocRemoteBlobRef = useRef(null);

  const nocDocHref = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const clearNocLocalPreview = () => {
    setNocLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  const revokeNocRemoteBlob = useCallback(() => {
    if (nocRemoteBlobRef.current) {
      URL.revokeObjectURL(nocRemoteBlobRef.current);
      nocRemoteBlobRef.current = null;
    }
    setNocRemotePreviewUrl('');
    setNocRemotePreviewLoading(false);
  }, []);

  /** S3 (or compatible) URLs: direct iframe hits wrong Content-Type / disposition → use authenticated stream + blob. */
  const isNocStreamableRemoteUrl = (full) =>
    !!full &&
    /^https?:\/\//i.test(full) &&
    (full.includes('.amazonaws.com') || full.includes('.digitaloceanspaces.com'));

  const openNocDialog = (item, { startInPreviewMode = false } = {}) => {
    revokeNocRemoteBlob();
    clearNocLocalPreview();
    setNocFile(null);
    setNocTargetItem(item);
    setNocForm({
      project_name: item.noc_project_name || '',
      noc_no: item.noc_no || '',
      application_no: item.noc_application_no || '',
      valid_from: item.noc_valid_from || '',
      valid_upto: item.noc_valid_upto || '',
    });
    const canEditNoc = ['Admin', 'HR'].includes(user?.role);
    setNocSideFieldsEditable(canEditNoc && !startInPreviewMode);
    setNocDialogOpen(true);
  };

  const closeNocDialog = () => {
    revokeNocRemoteBlob();
    clearNocLocalPreview();
    setNocFile(null);
    setNocTargetItem(null);
    setNocSideFieldsEditable(false);
    setNocDialogOpen(false);
  };

  const handleNocFilePicked = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }
    clearNocLocalPreview();
    const u = URL.createObjectURL(f);
    setNocLocalPreview(u);
    setNocFile(f);
  };

  const handleNocSave = async () => {
    if (!nocTargetItem) return;
    const hasExisting = !!(nocTargetItem.noc_document_url && String(nocTargetItem.noc_document_url).trim());
    if (!nocFile && !hasExisting) {
      toast.error('Select a NOC PDF to upload.');
      return;
    }
    setNocSaving(true);
    try {
      const fd = new FormData();
      if (nocFile) fd.append('file', nocFile);
      fd.append('project_name', nocForm.project_name || '');
      fd.append('noc_no', nocForm.noc_no || '');
      fd.append('application_no', nocForm.application_no || '');
      fd.append('valid_from', nocForm.valid_from || '');
      fd.append('valid_upto', nocForm.valid_upto || '');
      await axios.post(`${API}/cgw-flow-metres/${nocTargetItem.id}/noc`, fd, {
        headers: authHeaders(),
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      toast.success('NOC saved');
      closeNocDialog();
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save NOC');
    } finally {
      setNocSaving(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchItems();
  }, []);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    if (!nocDialogOpen) {
      revokeNocRemoteBlob();
      return undefined;
    }
    if (nocLocalPreview || !nocTargetItem?.noc_document_url) {
      revokeNocRemoteBlob();
      return undefined;
    }
    const full = nocDocHref(nocTargetItem.noc_document_url);
    if (!isNocStreamableRemoteUrl(full)) {
      revokeNocRemoteBlob();
      return undefined;
    }

    let cancelled = false;
    revokeNocRemoteBlob();
    setNocRemotePreviewLoading(true);

    (async () => {
      try {
        const res = await axios.get(`${API}/files/stream`, {
          params: { file_url: full },
          headers: authHeaders(),
          responseType: 'blob',
        });
        if (cancelled) return;
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const u = URL.createObjectURL(blob);
        nocRemoteBlobRef.current = u;
        setNocRemotePreviewUrl(u);
      } catch (err) {
        if (!cancelled) {
          toast.error(err.response?.data?.detail || 'Could not load NOC preview');
        }
      } finally {
        if (!cancelled) setNocRemotePreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (nocRemoteBlobRef.current) {
        URL.revokeObjectURL(nocRemoteBlobRef.current);
        nocRemoteBlobRef.current = null;
      }
      setNocRemotePreviewUrl('');
      setNocRemotePreviewLoading(false);
    };
  }, [nocDialogOpen, nocTargetItem?.id, nocTargetItem?.noc_document_url, nocLocalPreview, revokeNocRemoteBlob]);

  useEffect(() => {
    if (!SHOW_CGW_DIGEST_EMAIL_SECTION) return undefined;
    if (!['Admin', 'HR'].includes(user?.role)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/settings/cgw-renewal-digest`, { headers: authHeaders() });
        if (cancelled) return;
        setDigestNotificationEmail(res.data.notification_email || '');
        setDigestEnabled(!!res.data.enabled);
        setDigestScheduleTz(res.data.schedule_timezone || '');
      } catch {
        if (!cancelled) {
          toast.error('Could not load renewal digest settings');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = items.filter(item => {
      const matchesGlobal =
        !term ||
        item.customer_name?.toLowerCase().includes(term) ||
        item.equipment_name?.toLowerCase().includes(term) ||
        item.location?.toLowerCase().includes(term) ||
        item.inventory_id?.toLowerCase().includes(term) ||
        item.product_code?.toLowerCase().includes(term) ||
        item.model_no?.toLowerCase().includes(term);

      const matchesColumns = Object.entries(columnFilters).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;
        return String(item[key] ?? '').toLowerCase().includes(filterValue);
      });

      return matchesGlobal && matchesColumns;
    });
    setFilteredItems(filtered);
  }, [searchTerm, columnFilters, items]);

  const groupedItems = useMemo(() => {
    const map = new Map();
    for (const item of filteredItems) {
      const key = item.customer_id || item.customer_name || item.id;
      if (!map.has(key)) {
        map.set(key, { key, rows: [] });
      }
      map.get(key).rows.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems]);

  const totalGroups = groupedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const pagedGroups = useMemo(
    () => groupedItems.slice(pageStartIndex, pageStartIndex + pageSize),
    [groupedItems, pageStartIndex, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, columnFilters, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/cgw-flow-metres`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setItems(response.data);
      setFilteredItems(response.data);
    } catch (error) {
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { equipment_name, flowmeter_details, product_code, model_no, ...base } = formData;
      const payload = {
        ...base,
        equipments: equipmentRows
          .map(r => ({
            equipment_name: (r.equipment_name || '').trim() || null,
            flowmeter_details: (r.flowmeter_details || '').trim() || null,
            product_code: (r.product_code || '').trim() || null,
            model_no: (r.model_no || '').trim() || null
          }))
          .filter(r => r.equipment_name || r.flowmeter_details || r.product_code || r.model_no)
      };

      if (!payload.equipments.length) {
        toast.error('Please add at least one equipment row');
        return;
      }

      await axios.post(`${API}/cgw-flow-metres/bulk`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory items added successfully');
      setDialogOpen(false);
      resetForm();
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await axios.delete(`${API}/cgw-flow-metres/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory item deleted successfully');
      fetchItems();
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const handleEdit = (item) => {
    setInlineEditId(item.id);
    setInlineEditData({
      customer_id: item.customer_id,
      customer_name: item.customer_name,
      location: item.location || '',
      contact_person: item.contact_person || '',
      equipment_name: item.equipment_name || '',
      flowmeter_details: item.flowmeter_details || '',
      product_code: item.product_code || '',
      model_no: item.model_no || '',
      system_mobile_number: item.system_mobile_number || '',
      person_mobile_number: item.person_mobile_number || '',
      email_id: item.email_id || '',
      date_of_commissioning: item.date_of_commissioning || '',
      url_link: item.url_link || '',
      user_id: item.user_id || '',
      password: item.password || '',
      status: item.status,
      renewal_date: item.renewal_date || '',
      review: item.review || '',
      remarks: item.remarks || ''
    });
  };

  const handleInlineChange = (field, value) => {
    setInlineEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleInlineSave = async (id) => {
    try {
      await axios.put(`${API}/cgw-flow-metres/${id}`, inlineEditData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory item updated successfully');
      setInlineEditId(null);
      setInlineEditData(EMPTY_FORM);
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Update failed');
    }
  };

  const handleInlineCancel = () => {
    setInlineEditId(null);
    setInlineEditData(EMPTY_FORM);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEquipmentRows([EMPTY_EQUIPMENT_ROW]);
  };

  const handleCustomerChange = (e) => {
    const selectedCustomer = customers.find(c => c.id === e.target.value);
    if (selectedCustomer) {
      setFormData({
        ...formData,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.company_name
      });
    }
  };

  const canManage = ['Admin', 'HR'].includes(user?.role);
  const nocReadOnly = !canManage;

  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaDialogItem, setMediaDialogItem] = useState(null);
  const [mediaActiveCategory, setMediaActiveCategory] = useState('flow_meter');
  const [mediaSelectedFileId, setMediaSelectedFileId] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const mediaFileInputRef = useRef(null);
  const mediaPickCategoryRef = useRef(null);

  useEffect(() => {
    if (!mediaDialogOpen || !mediaDialogItem) return;
    const list = mediaDialogItem.cgw_attachments?.[mediaActiveCategory] || [];
    setMediaSelectedFileId((prev) => {
      if (prev && list.some((a) => a.id === prev)) return prev;
      return list[0]?.id || null;
    });
  }, [mediaDialogOpen, mediaDialogItem, mediaActiveCategory]);

  const openMediaDialog = (item, category = 'flow_meter') => {
    setMediaDialogItem(item);
    setMediaActiveCategory(CGW_MEDIA_KEYS.includes(category) ? category : 'flow_meter');
    setMediaSelectedFileId(null);
    setMediaDialogOpen(true);
  };

  const closeMediaDialog = () => {
    setMediaDialogOpen(false);
    setMediaDialogItem(null);
    setMediaSelectedFileId(null);
  };

  const getAttachList = (item, cat) => item?.cgw_attachments?.[cat] || [];

  const triggerMediaFilePick = (cat) => {
    if (!canManage) return;
    mediaPickCategoryRef.current = cat;
    mediaFileInputRef.current?.click();
  };

  const handleMediaFilesSelected = async (e) => {
    const files = e.target.files;
    e.target.value = '';
    const cat = mediaPickCategoryRef.current;
    mediaPickCategoryRef.current = null;
    if (!files?.length || !cat || !mediaDialogItem || !canManage) return;
    const list = Array.from(files);
    setMediaUploading(true);
    try {
      for (const f of list) {
        const fd = new FormData();
        fd.append('category', cat);
        fd.append('file', f);
        await axios.post(`${API}/cgw-flow-metres/${mediaDialogItem.id}/media-attachments`, fd, {
          headers: authHeaders(),
          timeout: 120000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
      }
      toast.success(list.length > 1 ? `${list.length} files uploaded` : 'File uploaded');
      const res = await axios.get(`${API}/cgw-flow-metres/${mediaDialogItem.id}`, { headers: authHeaders() });
      setMediaDialogItem(res.data);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setMediaUploading(false);
    }
  };

  const handleDeleteMediaFile = async (cat, attId) => {
    if (!mediaDialogItem || !canManage) return;
    if (!window.confirm('Remove this file from the server and this inventory row?')) return;
    try {
      await axios.delete(
        `${API}/cgw-flow-metres/${mediaDialogItem.id}/media-attachments/${cat}/${encodeURIComponent(attId)}`,
        { headers: authHeaders() }
      );
      toast.success('Attachment removed');
      const res = await axios.get(`${API}/cgw-flow-metres/${mediaDialogItem.id}`, { headers: authHeaders() });
      setMediaDialogItem(res.data);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const mediaPreviewHref = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const mediaIsImage = (url) => /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(url || '');
  const mediaIsPdf = (url) => /\.pdf(\?|#|$)/i.test(url || '');

  const handleApplyColumnFilter = () => {
    setColumnFilters(
      FILTER_FIELDS.reduce((acc, key) => ({ ...acc, [key]: key === selectedFilterField ? selectedFilterValue : '' }), {})
    );
    setShowColumnFilter(false);
  };

  const handleClearColumnFilter = () => {
    setSelectedFilterValue('');
    setColumnFilters(FILTER_FIELDS.reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
    setShowColumnFilter(false);
  };

  const saveDigestSettings = async () => {
    setDigestSaving(true);
    try {
      const res = await axios.put(
        `${API}/settings/cgw-renewal-digest`,
        { notification_email: digestNotificationEmail, enabled: digestEnabled },
        { headers: authHeaders() }
      );
      setDigestNotificationEmail(res.data.notification_email || '');
      setDigestEnabled(!!res.data.enabled);
      setDigestScheduleTz(res.data.schedule_timezone || '');
      toast.success('Renewal digest settings saved');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save digest settings');
    } finally {
      setDigestSaving(false);
    }
  };

  const runDigestNow = async () => {
    try {
      const res = await axios.post(`${API}/settings/cgw-renewal-digest/run-now`, {}, { headers: authHeaders() });
      const d = res.data || {};
      const msg = d.message || 'Digest finished.';
      if (d.email_sent) {
        toast.success(msg);
      } else {
        toast.error(msg);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to run digest job');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="cgw-flow-metre-page">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 relative">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search across all columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 border border-gray-300 h-9 rounded-md text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => setShowColumnFilter((prev) => !prev)}
              title="Filter specific column"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 text-white hover:bg-blue-700" data-testid="add-item-button">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Flow Metre
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-xl p-0">
              <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">Add New Flow Metre</DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    Create a new inventory item
                  </p>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6">
                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label htmlFor="customer_id" className="text-sm font-medium text-gray-700">Select Customer *</Label>
                  <select
                    id="customer_id"
                    value={formData.customer_id}
                    onChange={handleCustomerChange}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Choose a customer...</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-medium text-gray-700">Location</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_person" className="text-sm font-medium text-gray-700">Contact Person</Label>
                    <Input
                      id="contact_person"
                      value={formData.contact_person}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="system_mobile_number" className="text-sm font-medium text-gray-700">System Mobile</Label>
                    <Input
                      id="system_mobile_number"
                      value={formData.system_mobile_number}
                      onChange={(e) => setFormData({ ...formData, system_mobile_number: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person_mobile_number" className="text-sm font-medium text-gray-700">Person Mobile</Label>
                    <Input
                      id="person_mobile_number"
                      value={formData.person_mobile_number}
                      onChange={(e) => setFormData({ ...formData, person_mobile_number: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email_id" className="text-sm font-medium text-gray-700">Email</Label>
                    <Input
                      id="email_id"
                      type="email"
                      value={formData.email_id}
                      onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date_of_commissioning" className="text-sm font-medium text-gray-700">Date of Commissioning</Label>
                    <Input
                      id="date_of_commissioning"
                      type="date"
                      value={formData.date_of_commissioning}
                      onChange={(e) => setFormData({ ...formData, date_of_commissioning: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="renewal_date" className="text-sm font-medium text-gray-700">Renewal Date</Label>
                    <Input
                      id="renewal_date"
                      type="date"
                      value={formData.renewal_date}
                      onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user_id" className="text-sm font-medium text-gray-700">User ID</Label>
                    <Input
                      id="user_id"
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium text-gray-700">Status</Label>
                    <select
                      id="status"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>

                {/* URL Link */}
                <div className="space-y-2">
                  <Label htmlFor="url_link" className="text-sm font-medium text-gray-700">URL Link</Label>
                  <Input
                    id="url_link"
                    type="url"
                    value={formData.url_link}
                    onChange={(e) => setFormData({ ...formData, url_link: e.target.value })}
                    className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                {/* Equipments (multiple rows) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Equipments</Label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Add multiple equipment lines under the same customer.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                      onClick={() => setEquipmentRows(prev => [...prev, { ...EMPTY_EQUIPMENT_ROW }])}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Row
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {equipmentRows.map((row, idx) => (
                      <Card key={idx} className="p-4 border border-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid grid-cols-2 gap-4 flex-1">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-gray-700">Equipment Name</Label>
                              <Input
                                value={row.equipment_name}
                                onChange={(e) => setEquipmentRows(prev => prev.map((r, i) => i === idx ? ({ ...r, equipment_name: e.target.value }) : r))}
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-gray-700">Flowmeter/Piezometer Details</Label>
                              <Input
                                value={row.flowmeter_details}
                                onChange={(e) => setEquipmentRows(prev => prev.map((r, i) => i === idx ? ({ ...r, flowmeter_details: e.target.value }) : r))}
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-gray-700">Product Code</Label>
                              <Input
                                value={row.product_code}
                                onChange={(e) => setEquipmentRows(prev => prev.map((r, i) => i === idx ? ({ ...r, product_code: e.target.value }) : r))}
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-gray-700">Model No</Label>
                              <Input
                                value={row.model_no}
                                onChange={(e) => setEquipmentRows(prev => prev.map((r, i) => i === idx ? ({ ...r, model_no: e.target.value }) : r))}
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 border-gray-200 text-red-600 hover:bg-red-50 shrink-0"
                            disabled={equipmentRows.length === 1}
                            onClick={() => setEquipmentRows(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Review & Remarks */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="review" className="text-sm font-medium text-gray-700">Review</Label>
                    <textarea
                      id="review"
                      value={formData.review}
                      onChange={(e) => setFormData({ ...formData, review: e.target.value })}
                      rows="2"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="remarks" className="text-sm font-medium text-gray-700">Remarks</Label>
                    <textarea
                      id="remarks"
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      rows="2"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                    Add Item
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
        {showColumnFilter && (
          <Card className="absolute right-0 top-11 z-30 w-80 p-3 border border-gray-200 shadow-lg bg-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-800">Filter specific column</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-gray-600"
                onClick={() => setShowColumnFilter(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <select
                value={selectedFilterField}
                onChange={(e) => setSelectedFilterField(e.target.value)}
                className="w-full h-9 rounded border border-gray-300 px-2 text-sm bg-white"
              >
                {FILTER_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {FILTER_LABELS[field]}
                  </option>
                ))}
              </select>
              <Input
                value={selectedFilterValue}
                onChange={(e) => setSelectedFilterValue(e.target.value)}
                placeholder="Type value to filter..."
                className="h-9 text-sm"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={handleClearColumnFilter}>
                  Clear
                </Button>
                <Button type="button" size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApplyColumnFilter}>
                  Apply
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {canManage && SHOW_CGW_DIGEST_EMAIL_SECTION && (
        <Card className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900">Daily past-due renewal email</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Each morning at <span className="font-medium text-gray-800">9:00</span>
                {digestScheduleTz ? (
                  <> ({digestScheduleTz})</>
                ) : null}
                , the server emails a list of all CGW rows whose renewal date is already past, including customer name and contact details for follow-up. Requires SMTP variables in the server environment (
                <span className="font-mono text-[11px]">SMTP_SERVER</span>,{' '}
                <span className="font-mono text-[11px]">SMTP_USERNAME</span>,{' '}
                <span className="font-mono text-[11px]">SMTP_PASSWORD</span>,{' '}
                <span className="font-mono text-[11px]">SENDER_EMAIL</span>).
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="digest_notification_email" className="text-xs font-medium text-gray-700">
                Notification email (digest recipient)
              </Label>
              <Input
                id="digest_notification_email"
                type="email"
                placeholder="team@company.com"
                value={digestNotificationEmail}
                onChange={(e) => setDigestNotificationEmail(e.target.value)}
                className="h-9 text-sm border-gray-300"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none pb-1">
              <input
                type="checkbox"
                checked={digestEnabled}
                onChange={(e) => setDigestEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-800">Enable daily digest</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700 h-9"
              disabled={digestSaving}
              onClick={saveDigestSettings}
            >
              {digestSaving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button type="button" variant="outline" className="h-9 border-gray-300" onClick={runDigestNow}>
              Send digest now
            </Button>
          </div>
        </Card>
      )}

      {/* Excel-like Grid */}
      {filteredItems.length > 0 ? (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-auto table-scroll max-h-[calc(100vh-155px)] scrollbar-thin" style={{ scrollbarWidth: 'auto' }}>
            <table className="w-full text-xs min-w-[2300px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100">
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">SL NO</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">CUSTOMER NAME</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap min-w-[108px] align-top">
                    <span className="block leading-snug">NOC</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-gray-500 leading-tight">Per equipment row</span>
                  </th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap min-w-[120px] align-top">
                    <span className="block leading-snug">PHOTOS / DOCS</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-gray-500 leading-tight">S3 · per row</span>
                  </th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">LOCATION</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">CONTACT PERSON</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">NAME OF EQUIPMENT</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">FLOWMETER/PIEZOMETER DETAILS</th>
                  <th colSpan="2" className="text-center py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">TELEMETRIC SYSTEM</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">SYSTEM MOBILE NUMBER</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">PERSON MOBILE NUMBER</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">EMAIL ID</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">DATE OF COMMISSONING</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">URL LINK</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">USER ID</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">PASSWORD</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">STATUS</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 align-top min-w-[132px] whitespace-normal">
                    <span className="block leading-snug">RENEWAL DATE WILL BE</span>
                    <span className="mt-1 block text-[10px] font-normal text-gray-500 leading-tight">
                      <span className="text-red-600 font-semibold">Red</span> = past due ·{' '}
                      <span className="text-amber-700 font-semibold">Amber</span> = ≤30 days
                    </span>
                  </th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 align-top min-w-[120px] whitespace-normal">
                    <span className="block leading-snug">NOC VALID UPTO</span>
                    <span className="mt-1 block text-[10px] font-normal text-gray-500 leading-tight">
                      <span className="text-red-600 font-semibold">Red</span> = expired ·{' '}
                      <span className="text-amber-700 font-semibold">Amber</span> = ≤30 days
                    </span>
                  </th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">REVIEW</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">REMARKS</th>
                  {canManage && (
                    <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">ACTIONS</th>
                  )}
                </tr>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-700 whitespace-nowrap">PRODUCT CODE</th>
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-700 whitespace-nowrap">MODEL NO</th>
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((group, groupIndex) => {
                  const groupEditActive = group.rows.some(r => r.id === inlineEditId);
                  const groupAnchor = group.rows[0];
                  const rawRenewal = groupEditActive ? inlineEditData.renewal_date : groupAnchor.renewal_date;
                  const renewalU = renewalUrgency(rawRenewal);
                  const rowRenewalClass =
                    renewalU === 'overdue'
                      ? 'border-b border-red-100 hover:bg-red-50/40 bg-red-50/20'
                      : renewalU === 'dueSoon'
                        ? 'border-b border-amber-100 hover:bg-amber-50/35 bg-amber-50/12'
                        : 'border-b border-gray-100 hover:bg-gray-50/50';

                  return group.rows.map((item, rowIndex) => (
                    <tr key={item.id} className={`${rowRenewalClass} align-top`}>
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-900 whitespace-nowrap">
                          {pageStartIndex + groupIndex + 1}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 font-medium text-gray-900 whitespace-nowrap">
                          {groupEditActive ? (
                            <Input value={inlineEditData.customer_name} onChange={(e) => handleInlineChange('customer_name', e.target.value)} className="h-7 text-[11px] px-2" />
                          ) : (groupAnchor.customer_name || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 align-top min-w-[108px] border-r border-gray-100 bg-white">
                          <div className="space-y-2">
                            {group.rows.map((inv) => (
                              <div key={inv.id} className="rounded border border-gray-200 bg-gray-50/80 p-1.5">
                                <p className="text-[9px] font-mono text-gray-500 mb-1 truncate" title={inv.inventory_id}>
                                  {inv.inventory_id}
                                </p>
                                {canManage ? (
                                  <div className="flex flex-col gap-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-1 text-[9px] border-gray-200"
                                      onClick={() => openNocDialog(inv)}
                                    >
                                      <FileText className="h-3 w-3 mr-0.5 shrink-0" />
                                      NOC
                                    </Button>
                                    {inv.noc_document_url ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1 text-[9px] text-blue-700"
                                        onClick={() => openNocDialog(inv, { startInPreviewMode: true })}
                                      >
                                        <Eye className="h-3 w-3 mr-0.5" />
                                        Preview
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : inv.noc_document_url ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-1 text-[9px]"
                                    onClick={() => openNocDialog(inv, { startInPreviewMode: true })}
                                  >
                                    <Eye className="h-3 w-3 mr-0.5" />
                                    View
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-gray-400">—</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 align-top min-w-[120px] border-r border-gray-100 bg-white">
                          <div className="space-y-2">
                            {group.rows.map((inv) => (
                              <div key={inv.id} className="rounded border border-gray-200 bg-gray-50/80 p-1.5">
                                <p className="text-[9px] font-mono text-gray-500 mb-1 truncate">{inv.inventory_id}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-1 text-[9px] border-gray-200 w-full"
                                  onClick={() => openMediaDialog(inv, 'flow_meter')}
                                >
                                  Files (S3)
                                </Button>
                                <div className="text-[8px] text-gray-500 mt-1 leading-tight space-y-0.5">
                                  {CGW_MEDIA_KEYS.map((k) => {
                                    const n = (inv.cgw_attachments?.[k] || []).length;
                                    if (!n) return null;
                                    return (
                                      <div key={`${inv.id}-${k}`}>
                                        {CGW_MEDIA_LABELS[k].split('(')[0].trim().slice(0, 10)}: {n}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? <Input value={inlineEditData.location} onChange={(e) => handleInlineChange('location', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.location || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? <Input value={inlineEditData.contact_person} onChange={(e) => handleInlineChange('contact_person', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.contact_person || '—')}
                        </td>
                      )}

                      {/* equipment-specific columns */}
                      <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                        {inlineEditId === item.id ? <Input value={inlineEditData.equipment_name} onChange={(e) => handleInlineChange('equipment_name', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.equipment_name || '—')}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 min-w-[160px]">
                        {inlineEditId === item.id ? <Input value={inlineEditData.flowmeter_details} onChange={(e) => handleInlineChange('flowmeter_details', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.flowmeter_details || '—')}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                        {inlineEditId === item.id ? <Input value={inlineEditData.product_code} onChange={(e) => handleInlineChange('product_code', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.product_code || '—')}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                        {inlineEditId === item.id ? <Input value={inlineEditData.model_no} onChange={(e) => handleInlineChange('model_no', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.model_no || '—')}
                      </td>

                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? <Input value={inlineEditData.system_mobile_number} onChange={(e) => handleInlineChange('system_mobile_number', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.system_mobile_number || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? (
                            <Input value={inlineEditData.person_mobile_number} onChange={(e) => handleInlineChange('person_mobile_number', e.target.value)} className="h-7 text-[11px] px-2" />
                          ) : groupAnchor.person_mobile_number ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                              {groupAnchor.person_mobile_number}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 min-w-[180px]">
                          {groupEditActive ? (
                            <Input value={inlineEditData.email_id} onChange={(e) => handleInlineChange('email_id', e.target.value)} className="h-7 text-[11px] px-2" />
                          ) : groupAnchor.email_id ? (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                              <span>{groupAnchor.email_id}</span>
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? <Input type="date" value={inlineEditData.date_of_commissioning} onChange={(e) => handleInlineChange('date_of_commissioning', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.date_of_commissioning || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-blue-700 min-w-[140px] break-all">
                          {groupEditActive ? <Input value={inlineEditData.url_link} onChange={(e) => handleInlineChange('url_link', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.url_link || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? <Input value={inlineEditData.user_id} onChange={(e) => handleInlineChange('user_id', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.user_id || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                          {groupEditActive ? <Input value={inlineEditData.password} onChange={(e) => handleInlineChange('password', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.password || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2">
                          {groupEditActive ? (
                            <select
                              value={inlineEditData.status}
                              onChange={(e) => handleInlineChange('status', e.target.value)}
                              className="h-7 text-[11px] px-2 border border-gray-300 rounded w-full"
                            >
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                              <option value="Maintenance">Maintenance</option>
                            </select>
                          ) : (
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                              groupAnchor.status === 'Active' ? 'bg-green-50 text-green-700' :
                              groupAnchor.status === 'Maintenance' ? 'bg-yellow-50 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {groupAnchor.status || '—'}
                            </span>
                          )}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 whitespace-nowrap align-top">
                          <RenewalDateCell
                            groupEditActive={groupEditActive}
                            inlineEditData={inlineEditData}
                            groupAnchor={groupAnchor}
                            onChange={handleInlineChange}
                          />
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 align-top border-l border-gray-100 bg-white">
                          <NocValidUptoColumnCell groupRows={group.rows} />
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 min-w-[160px]">
                          {groupEditActive ? <Input value={inlineEditData.review} onChange={(e) => handleInlineChange('review', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.review || '—')}
                        </td>
                      )}
                      {rowIndex === 0 && (
                        <td rowSpan={group.rows.length} className="py-1.5 px-2 text-gray-600 min-w-[160px]">
                          {groupEditActive ? <Input value={inlineEditData.remarks} onChange={(e) => handleInlineChange('remarks', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.remarks || '—')}
                        </td>
                      )}

                      {canManage && (
                        <td className="py-1.5 px-2">
                          <div className="flex gap-1.5">
                            {inlineEditId === item.id ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 border-gray-200 text-xs text-green-700 hover:bg-green-50"
                                  onClick={() => handleInlineSave(item.id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                                  onClick={handleInlineCancel}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                                  onClick={() => handleEdit(item)}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 border-gray-200 text-xs text-red-600 hover:bg-red-50"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 bg-white px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div className="text-gray-600">
              Showing customer groups <span className="font-medium text-gray-900">{totalGroups === 0 ? 0 : pageStartIndex + 1}</span> to{' '}
              <span className="font-medium text-gray-900">{Math.min(pageStartIndex + pageSize, totalGroups)}</span> of{' '}
              <span className="font-medium text-gray-900">{totalGroups}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded border border-gray-300 px-2 text-xs bg-white"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-gray-700 min-w-[84px] text-center">
                Page {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No inventory items found</p>
        </Card>
      )}

      <Dialog
        open={nocDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeNocDialog();
        }}
      >
        <DialogContent
          className={cn(
            'flex flex-col gap-0 p-0 overflow-hidden border-0 bg-white max-w-[96vw] w-[96vw]',
            'max-h-[92vh] h-[92vh] rounded-lg shadow-xl',
            'left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]'
          )}
        >
          <div className="bg-slate-800 text-white px-4 py-3 pr-14 shrink-0 border-b border-slate-700">
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-base font-semibold text-white m-0 flex items-center gap-2">
                <FileText className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  NOC — {nocTargetItem?.inventory_id || ''} · {nocTargetItem?.customer_name || ''}
                </span>
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-0 overflow-hidden">
            <div className="relative flex-1 min-h-[40vh] lg:min-h-0 bg-neutral-900 border-b lg:border-b-0 lg:border-r border-gray-200">
              {(() => {
                const rawUrl = nocTargetItem?.noc_document_url;
                const fullHref = rawUrl ? nocDocHref(rawUrl) : '';
                const useStream = isNocStreamableRemoteUrl(fullHref);
                const directSrc =
                  !nocLocalPreview && fullHref && !useStream ? fullHref : '';
                const iframeSrc = nocLocalPreview || nocRemotePreviewUrl || directSrc;

                if (iframeSrc) {
                  return (
                    <iframe title="NOC PDF" src={iframeSrc} className="absolute inset-0 h-full w-full border-0 bg-white" />
                  );
                }
                if (useStream && nocRemotePreviewLoading) {
                  return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-100 p-6 text-center text-sm text-gray-600">
                      <span>Loading PDF…</span>
                    </div>
                  );
                }
                if (useStream && fullHref && !nocRemotePreviewLoading && !nocRemotePreviewUrl) {
                  return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 p-6 text-center text-sm text-gray-600">
                      <p>Preview could not be loaded. You can still open the file in a new tab.</p>
                      <a
                        href={fullHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 font-medium underline hover:text-blue-800"
                      >
                        Open NOC PDF
                      </a>
                    </div>
                  );
                }
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-6 text-center text-sm text-gray-500">
                    {nocReadOnly
                      ? 'No NOC document on file for this row.'
                      : canManage && !nocSideFieldsEditable
                        ? 'Preview only. Use Edit NOC details on the right to change the PDF or metadata.'
                        : 'Select a PDF (right) to preview here, or open an existing NOC from the grid.'}
                  </div>
                );
              })()}
            </div>
            <div className="w-full lg:w-[380px] shrink-0 overflow-y-auto p-4 space-y-3 bg-white">
              {canManage && !nocSideFieldsEditable && (
                <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
                  <p className="text-[11px] text-amber-950 mb-2">
                    Fields are locked in preview. Click below to upload a new PDF or edit metadata.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full border-amber-300 text-amber-950 hover:bg-amber-100"
                    onClick={() => setNocSideFieldsEditable(true)}
                  >
                    Edit NOC details
                  </Button>
                </div>
              )}
              {!nocReadOnly && nocSideFieldsEditable && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">NOC PDF</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleNocFilePicked}
                      className="h-9 text-xs"
                    />
                    <Upload className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                  </div>
                  <p className="text-[11px] text-gray-500">Same flow as Documents: PDF only, max 25 MB.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Project name</Label>
                <Input
                  value={nocForm.project_name}
                  onChange={(e) => setNocForm((p) => ({ ...p, project_name: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">NOC No</Label>
                <Input
                  value={nocForm.noc_no}
                  onChange={(e) => setNocForm((p) => ({ ...p, noc_no: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Application No</Label>
                <Input
                  value={nocForm.application_no}
                  onChange={(e) => setNocForm((p) => ({ ...p, application_no: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Valid from</Label>
                <Input
                  type="date"
                  value={nocForm.valid_from}
                  onChange={(e) => setNocForm((p) => ({ ...p, valid_from: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Valid up to</Label>
                <Input
                  type="date"
                  value={nocForm.valid_upto}
                  onChange={(e) => setNocForm((p) => ({ ...p, valid_upto: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {!nocReadOnly && nocSideFieldsEditable && (
                  <Button
                    type="button"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    disabled={nocSaving}
                    onClick={handleNocSave}
                  >
                    {nocSaving ? 'Saving…' : 'Save NOC'}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={closeNocDialog}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={mediaFileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,image/*,application/pdf"
        multiple
        className="hidden"
        onChange={handleMediaFilesSelected}
      />

      <Dialog
        open={mediaDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeMediaDialog();
        }}
      >
        <DialogContent
          className={cn(
            'flex flex-col gap-0 p-0 overflow-hidden border-0 bg-white max-w-[96vw] w-[96vw]',
            'max-h-[90vh] h-[90vh] rounded-lg shadow-xl',
            'left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]'
          )}
        >
          <div className="bg-slate-800 text-white px-4 py-3 pr-14 shrink-0 border-b border-slate-700">
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-base font-semibold text-white m-0 flex items-center gap-2">
                <FileText className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  Photos & documents (S3) — {mediaDialogItem?.inventory_id} · {mediaDialogItem?.customer_name}
                </span>
              </DialogTitle>
            </DialogHeader>
          </div>
          <p className="px-4 py-2 text-[11px] text-amber-900 bg-amber-50 border-b border-amber-100 shrink-0">
            Uploads require S3 to be configured on the server. Preview opens here — no download needed for images/PDF.
          </p>
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
            {CGW_MEDIA_KEYS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={mediaActiveCategory === k ? 'default' : 'outline'}
                className={`h-8 text-[10px] px-2 ${mediaActiveCategory === k ? 'bg-blue-600' : ''}`}
                onClick={() => setMediaActiveCategory(k)}
              >
                {CGW_MEDIA_LABELS[k]}
                <span className="ml-1 opacity-80">({getAttachList(mediaDialogItem, k).length})</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col min-h-0 bg-white">
              <div className="p-2 border-b border-gray-100 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700">Files in tab</span>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-[10px]"
                    disabled={mediaUploading}
                    onClick={() => triggerMediaFilePick(mediaActiveCategory)}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Add files
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {(getAttachList(mediaDialogItem, mediaActiveCategory).length ? (
                  getAttachList(mediaDialogItem, mediaActiveCategory).map((att) => (
                    <div
                      key={att.id}
                      className={`flex items-start justify-between gap-1 rounded border px-2 py-1.5 text-[11px] ${
                        mediaSelectedFileId === att.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        className="text-left flex-1 min-w-0 truncate text-gray-800 hover:underline"
                        onClick={() => setMediaSelectedFileId(att.id)}
                        title={att.file_name}
                      >
                        {att.file_name}
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          className="text-red-600 shrink-0 text-[10px] hover:underline"
                          onClick={() => handleDeleteMediaFile(mediaActiveCategory, att.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-gray-500 p-2">No files in this category yet.</p>
                ))}
              </div>
            </div>
            <div className="relative flex-1 min-h-[240px] md:min-h-0 bg-neutral-900">
              {(() => {
                const mList = getAttachList(mediaDialogItem, mediaActiveCategory);
                const sel = mList.find((a) => a.id === mediaSelectedFileId) || mList[0];
                const href = sel ? mediaPreviewHref(sel.url) : '';
                if (!href) {
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-500 p-6 text-center">
                      Select a file from the list to preview.
                    </div>
                  );
                }
                if (mediaIsPdf(href)) {
                  return <iframe title="Preview" src={href} className="absolute inset-0 h-full w-full border-0 bg-white" />;
                }
                if (mediaIsImage(href)) {
                  return (
                    <div className="absolute inset-0 overflow-auto bg-gray-100 flex items-center justify-center p-2">
                      <img src={href} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  );
                }
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600 p-4 text-center">
                    Inline preview is not available for this file type. URL is stored on the row in S3.
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="px-4 py-2 border-t border-gray-200 bg-white shrink-0 flex justify-end">
            <Button type="button" variant="outline" onClick={closeMediaDialog}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CGWFlowMetre;

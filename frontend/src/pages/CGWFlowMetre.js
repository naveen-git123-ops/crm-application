import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Minus, Edit, Trash2, Search, Mail, Phone, Filter, X, FileText, Eye, Upload, Download, History } from 'lucide-react';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';
import PiezometerAddWizardStep, {
  EMPTY_PIEZO_ROW,
  EMPTY_PIEZO_FILES,
  piezoRowToPersist,
} from './PiezometerAddWizardStep';
import { CgwMultiFilePicker, normalizeFileList } from '@/components/CgwMultiFilePicker';

const API = API_ENDPOINT;

/** Categories persisted in cgw_attachments_json (aligned with server CGW_MEDIA_ATTACHMENT_KEYS). */
const CGW_MEDIA_KEYS = [
  'bw_geo_flowmeter',
  'calibration_certificate',
  'service_report',
  'telemetry',
  'telemetry_excel_prior',
  'telemetry_service_prior',
  'piezometer_bw',
  'piezometer_calibration',
  'piezometer_telemetry',
  'piezometer_excel_prior',
  'piezometer_service_report',
  'water_quality_certificate',
  'cte',
  'cto',
  'rwss_watco_phed_noc',
  'approval_letter',
  'rain_water_harvesting_data',
  'additional_doc',
];
const CGW_MEDIA_LABELS = {
  bw_geo_flowmeter: 'BW / flowmeter GEO photos',
  calibration_certificate: 'Calibration certificate (photo)',
  service_report: 'Service report (photo)',
  telemetry: 'Telemetry device photos',
  telemetry_excel_prior: 'Telemetry Excel (prior year)',
  telemetry_service_prior: 'Telemetry service (prior year)',
  piezometer_bw: 'Piezometer BW photos',
  piezometer_calibration: 'Piezometer calibration',
  piezometer_telemetry: 'Piezometer telemetry photos',
  piezometer_excel_prior: 'Piezometer Excel (prior)',
  piezometer_service_report: 'Piezometer service report',
  water_quality_certificate: 'Water quality certificate',
  cte: 'CTE',
  cto: 'CTO',
  rwss_watco_phed_noc: 'RWSS/WATCO/PHED NOC',
  approval_letter: 'Approval letter',
  rain_water_harvesting_data: 'Rain water harvesting data',
  additional_doc: 'Additional document',
};

/** Wizard-aligned grid sections: colspan when expanded vs collapsed (single summary column). */
const CGW_GRID_SECTION_COLSPANS = {
  /** Includes leading CUSTOMER ID (business code from customers list). */
  customer: { open: 7, collapsed: 1 },
  noc: { open: 8, collapsed: 1 },
  flowMetre: { open: 23, collapsed: 1 },
  piezometer: { open: 6, collapsed: 1 },
  /** Wizard step 5 only (no lifecycle fields — those are not on the create form). */
  lifecycleAdditional: { open: 7, collapsed: 1 },
};
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
/** When true, shows the “Daily past-due renewal email” admin card (CGW inventory). */
const SHOW_CGW_DIGEST_EMAIL_SECTION = false;
const EMPTY_EQUIPMENT_ROW = {
  equipment_name: '',
  flowmeter_details: '',
  product_code: '',
  model_no: '',
  flow_meter_make: 'UPC',
  flow_meter_size: '',
  flow_meter_serial: '',
  calibration_valid_from: '',
  calibration_valid_to: '',
  telemetry_applicable: '',
  telemetry_company: '',
  telemetry_company_other: '',
  telemetry_communication_via: '',
  telemetry_sim_provider: '',
  telemetry_sim_provider_other: '',
  telemetry_sim_number: '',
  telemetry_sim_valid_from: '',
  telemetry_sim_valid_to: '',
  telemetry_product_code: '',
  telemetry_serial_number: '',
  telemetry_portal_url: '',
  telemetry_username: '',
  telemetry_password: '',
  telemetry_valid_from: '',
  telemetry_valid_to: '',
  telemetry_uploaded_previous_year: '',
  telemetry_previous_serial_pick: '',
  telemetry_previous_serial_free: '',
  telemetry_previous_data_available: '',
  telemetry_previous_data_from: '',
  telemetry_previous_data_to: '',
  additional_document_type: '',
};

/** Map UI equipment row to API payload (drops UI-only pick/free serial fields). */
function equipmentRowToApiPayload(r) {
  const pick = (r.telemetry_previous_serial_pick || '').trim();
  const free = (r.telemetry_previous_serial_free || '').trim();
  const telemetry_previous_serial = pick === '__manual__' ? free : pick;
  const {
    telemetry_previous_serial_pick: _p,
    telemetry_previous_serial_free: _f,
    ...rest
  } = r;
  return { ...rest, telemetry_previous_serial: telemetry_previous_serial || null };
}

/** True if this line should be included in bulk create (pending files count for the same row index). */
function equipmentRowIncludeInBulk(r, bundle = {}) {
  const b = bundle || {};
  if ((r.flow_meter_serial || '').trim()) return true;
  if ((r.flow_meter_size || '').trim()) return true;
  if ((r.calibration_valid_from || '').trim() || (r.calibration_valid_to || '').trim()) return true;
  if (normalizeFileList(b.calibration_cert).length > 0) return true;
  if (
    normalizeFileList(b.water_quality_certificate).length > 0 ||
    normalizeFileList(b.cte).length > 0 ||
    normalizeFileList(b.cto).length > 0 ||
    normalizeFileList(b.rwss_watco_phed_noc).length > 0 ||
    normalizeFileList(b.approval_letter).length > 0 ||
    normalizeFileList(b.rain_water_harvesting_data).length > 0 ||
    normalizeFileList(b.additional_doc).length > 0
  ) {
    return true;
  }
  if (normalizeFileList(b.bwGeoPhotos).length > 0) return true;
  if (normalizeFileList(b.telemetryPhotoFiles).length > 0) return true;
  if (normalizeFileList(b.telemetry_excel).length > 0 || normalizeFileList(b.telemetry_service).length > 0) return true;
  if (normalizeFileList(b.service_report).length > 0) return true;
  if (r.telemetry_applicable === 'yes') return true;
  if (
    (r.telemetry_product_code || '').trim() ||
    (r.telemetry_serial_number || '').trim() ||
    (r.telemetry_portal_url || '').trim() ||
    (r.telemetry_username || '').trim() ||
    (r.telemetry_password || '').trim() ||
    (r.telemetry_valid_from || '').trim() ||
    (r.telemetry_valid_to || '').trim()
  ) {
    return true;
  }
  if ((r.additional_document_type || '').trim()) return true;
  if (
    (r.telemetry_uploaded_previous_year || '').trim() ||
    (r.telemetry_previous_data_available || '').trim() ||
    (r.telemetry_previous_data_from || '').trim() ||
    (r.telemetry_previous_data_to || '').trim()
  ) {
    return true;
  }
  return false;
}
const EMPTY_FORM = {
  customer_id: '',
  customer_name: '',
  location: '',
  contact_person: '',
  equipment_name: '',
  flowmeter_details: '',
  product_code: '',
  model_no: '',
  flow_meter_make: 'UPC',
  flow_meter_size: '',
  flow_meter_serial: '',
  calibration_valid_from: '',
  calibration_valid_to: '',
  telemetry_applicable: '',
  telemetry_company: '',
  telemetry_company_other: '',
  telemetry_communication_via: '',
  telemetry_sim_provider: '',
  telemetry_sim_provider_other: '',
  telemetry_sim_number: '',
  telemetry_sim_valid_from: '',
  telemetry_sim_valid_to: '',
  telemetry_product_code: '',
  telemetry_serial_number: '',
  telemetry_portal_url: '',
  telemetry_username: '',
  telemetry_password: '',
  telemetry_valid_from: '',
  telemetry_valid_to: '',
  telemetry_uploaded_previous_year: '',
  telemetry_previous_serial: '',
  telemetry_previous_data_available: '',
  telemetry_previous_data_from: '',
  telemetry_previous_data_to: '',
  piezometer_details_json: '',
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
/** Per-row pending uploads in add wizard (all attachment fields are File arrays). */
const EMPTY_EQUIPMENT_FLOW_FILES = () => ({
  bwGeoPhotos: [],
  telemetryPhotoFiles: [],
  calibration_cert: [],
  service_report: [],
  telemetry_excel: [],
  telemetry_service: [],
  water_quality_certificate: [],
  cte: [],
  cto: [],
  rwss_watco_phed_noc: [],
  approval_letter: [],
  rain_water_harvesting_data: [],
  additional_doc: [],
});

const EMPTY_NOC_FORM = {
  bhuneer_user_id: '',
  bhuneer_password: '',
  nocap_user_id: '',
  nocap_password: '',
  project_name: '',
  project_address: '',
  communication_address: '',
  noc_no: '',
  application_no: '',
  project_status: '',
  noc_type: '',
  valid_from: '',
  valid_upto: '',
  permitted_m3_per_day: '',
  permitted_m3_per_year: '',
  existing_bw_count: '',
  total_proposed_bw_count: '',
  flowmeter_applicable: '',
  flowmeter_count: '',
  piezometer_applicable: '',
  piezometer_count: '',
};
const FILTER_FIELDS = [
  'customer_name',
  'location',
  'contact_person',
  'equipment_name',
  'flowmeter_details',
  'flow_meter_make',
  'flow_meter_size',
  'flow_meter_serial',
  'calibration_valid_from',
  'calibration_valid_to',
  'product_code',
  'model_no',
  'telemetry_company',
  'telemetry_serial_number',
  'noc_piezometer_applicable',
  'noc_piezometer_count',
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
  flow_meter_make: 'Flow Meter Make',
  flow_meter_size: 'Flow Meter Size',
  flow_meter_serial: 'Flow Meter Serial',
  calibration_valid_from: 'Calibration Valid From',
  calibration_valid_to: 'Calibration Valid To',
  product_code: 'Product Code',
  model_no: 'Model No',
  telemetry_company: 'Telemetry Company',
  telemetry_serial_number: 'Telemetry Serial Number',
  noc_piezometer_applicable: 'NOC Piezometer Applicable',
  noc_piezometer_count: 'NOC Piezometer Count',
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
const FILTER_GROUPS = [
  { label: 'Customer & NOC', fields: ['customer_name', 'location', 'contact_person', 'noc_piezometer_applicable', 'noc_piezometer_count'] },
  { label: 'Flow Metre', fields: ['equipment_name', 'flowmeter_details', 'flow_meter_make', 'flow_meter_size', 'flow_meter_serial', 'calibration_valid_from', 'calibration_valid_to'] },
  { label: 'Telemetry', fields: ['product_code', 'model_no', 'telemetry_company', 'telemetry_serial_number'] },
  { label: 'Contact & Access', fields: ['system_mobile_number', 'person_mobile_number', 'email_id', 'url_link', 'user_id', 'password'] },
  { label: 'Lifecycle', fields: ['date_of_commissioning', 'status', 'renewal_date', 'review', 'calibration_certificate', 'remarks'] },
];

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
function NocValidUptoColumnCell({ groupRows = [], customerLineIdBase = '' }) {
  const base = String(customerLineIdBase || '').trim();
  return (
    <div className="space-y-1.5 min-w-[112px]">
      {(groupRows || []).map((r, i) => {
        const v = r.noc_valid_upto;
        const nu = v ? nocValidUrgency(v) : 'empty';
        const label =
          base && base !== '—'
            ? `${base}-${i + 1}`
            : (r.equipment_name || r.inventory_id || '—').slice(0, 22);
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

function piezometerSummaryCellText(item) {
  const applicable = (item?.noc_piezometer_applicable || '').toString().trim().toLowerCase();
  const nocCountRaw = (item?.noc_piezometer_count || '').toString().trim();
  let detailsCount = 0;
  try {
    const parsed = typeof item?.piezometer_details_json === 'string'
      ? JSON.parse(item.piezometer_details_json)
      : item?.piezometer_details_json;
    detailsCount = Array.isArray(parsed?.piezometers) ? parsed.piezometers.length : 0;
  } catch (_e) {
    detailsCount = 0;
  }
  if (!applicable && !nocCountRaw && !detailsCount) return '—';
  return `${applicable === 'yes' ? 'Yes' : applicable === 'no' ? 'No' : '—'} | NOC: ${nocCountRaw || '—'} | Entered: ${detailsCount || 0}`;
}

function cgwFirstAttachmentCategory(item) {
  for (const k of CGW_MEDIA_KEYS) {
    if ((item?.cgw_attachments?.[k] || []).length > 0) return k;
  }
  return '';
}

function AttachmentPreviewCell({ item, category, onPreview }) {
  const count = (item?.cgw_attachments?.[category] || []).length;
  if (!count) return <span className="text-xs text-gray-400">—</span>;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-[10px] text-blue-700"
      onClick={() => onPreview(item, category)}
    >
      <Eye className="h-3 w-3 mr-1" />
      Preview ({count})
    </Button>
  );
}

function CgwGridSectionHeader({ title, isOpen, onToggle }) {
  return (
    <div className="flex items-center justify-center gap-1.5 px-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 shrink-0 text-current hover:bg-white/50"
        title={isOpen ? 'Collapse section' : 'Expand section'}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </Button>
      <span className="text-center text-xs font-semibold leading-tight">{title}</span>
    </div>
  );
}

function formatTelemetryCompanyDisplay(item) {
  const c = (item?.telemetry_company || '').trim();
  const o = (item?.telemetry_company_other || '').trim();
  if (c === 'other' && o) return o;
  if (c) return c;
  return '—';
}

function formatTelemetrySimLine(item) {
  const p = (item?.telemetry_sim_provider || '').trim();
  const po = (item?.telemetry_sim_provider_other || '').trim();
  const prov = p === 'other' && po ? po : p || '';
  const num = (item?.telemetry_sim_number || '').trim();
  const vf = item?.telemetry_sim_valid_from || '';
  const vt = item?.telemetry_sim_valid_to || '';
  const bits = [prov, num].filter(Boolean);
  if (vf || vt) bits.push(`${vf || '—'}→${vt || '—'}`);
  return bits.length ? bits.join(' · ') : '—';
}

function formatTelemetryPriorLine(item) {
  const y = (item?.telemetry_uploaded_previous_year || '').trim();
  if (!y) return '—';
  const serial = (item?.telemetry_previous_serial || '').trim();
  const da = (item?.telemetry_previous_data_available || '').trim();
  const df = item?.telemetry_previous_data_from || '';
  const dt = item?.telemetry_previous_data_to || '';
  const bits = [y === 'yes' ? 'Prior yr: yes' : y === 'no' ? 'Prior yr: no' : y];
  if (serial) bits.push(`Ser: ${serial}`);
  if (da) bits.push(`Data: ${da}`);
  if (df || dt) bits.push(`${df || '—'}→${dt || '—'}`);
  return bits.join(' · ');
}

const CGWFlowMetre = () => {
  const { user } = useAuth();
  const hasCgwAccess = user?.role === 'Admin' || (Array.isArray(user?.permissions) && user.permissions.includes('cgw-flow-metre'));
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [equipmentRows, setEquipmentRows] = useState([EMPTY_EQUIPMENT_ROW]);
  /** Per equipment row index: optional files uploaded after inventory row exists (S3). */
  const [equipmentFlowFiles, setEquipmentFlowFiles] = useState([EMPTY_EQUIPMENT_FLOW_FILES()]);
  const [telemetrySerialOptions, setTelemetrySerialOptions] = useState([]);
  const [addStep, setAddStep] = useState(1);
  const [piezometerRows, setPiezometerRows] = useState([]);
  const [piezometerFiles, setPiezometerFiles] = useState([]);
  const [addNocForm, setAddNocForm] = useState(EMPTY_NOC_FORM);
  const [addNocFile, setAddNocFile] = useState(null);
  /** Local blob URL for NOC PDF preview in Add wizard step 2 (same pattern as NOC popup). */
  const [addNocPdfObjectUrl, setAddNocPdfObjectUrl] = useState('');
  const [addNocPdfPreviewVisible, setAddNocPdfPreviewVisible] = useState(true);
  /** True while add-wizard bulk create + uploads are in flight (piezometer Submit or Add Item). */
  const [addWizardSubmitting, setAddWizardSubmitting] = useState(false);
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
  /** Inventory table: wizard-aligned column groups; collapsed groups show one summary column each. */
  const [cgwGridSectionsOpen, setCgwGridSectionsOpen] = useState({
    customer: true,
    noc: true,
    flowMetre: true,
    piezometer: true,
    lifecycleAdditional: true,
  });
  const toggleCgwGridSection = (key) =>
    setCgwGridSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const [digestNotificationEmail, setDigestNotificationEmail] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestScheduleTz, setDigestScheduleTz] = useState('');
  const [digestSaving, setDigestSaving] = useState(false);

  const [nocDialogOpen, setNocDialogOpen] = useState(false);
  const [nocTargetItem, setNocTargetItem] = useState(null);
  const [nocFile, setNocFile] = useState(null);
  const [nocLocalPreview, setNocLocalPreview] = useState('');
  const [nocForm, setNocForm] = useState({
    bhuneer_user_id: '',
    bhuneer_password: '',
    nocap_user_id: '',
    nocap_password: '',
    project_name: '',
    project_address: '',
    communication_address: '',
    noc_no: '',
    application_no: '',
    project_status: '',
    noc_type: '',
    valid_from: '',
    valid_upto: '',
    permitted_m3_per_day: '',
    permitted_m3_per_year: '',
    existing_bw_count: '',
    total_proposed_bw_count: '',
    flowmeter_applicable: '',
    flowmeter_count: '',
    piezometer_applicable: '',
    piezometer_count: '',
  });
  const [nocSaving, setNocSaving] = useState(false);
  /** Managers: false when opened via Preview/View — right panel locked until NOC button or "Edit NOC details". */
  const [nocSideFieldsEditable, setNocSideFieldsEditable] = useState(false);
  const [nocRemotePreviewUrl, setNocRemotePreviewUrl] = useState('');
  const [nocRemotePreviewLoading, setNocRemotePreviewLoading] = useState(false);
  const nocRemoteBlobRef = useRef(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const formatHistoryDateTime = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

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
      bhuneer_user_id: item.noc_bhuneer_user_id || '',
      bhuneer_password: item.noc_bhuneer_password || '',
      nocap_user_id: item.noc_nocap_user_id || '',
      nocap_password: item.noc_nocap_password || '',
      project_name: item.noc_project_name || '',
      project_address: item.noc_project_address || '',
      communication_address: item.noc_communication_address || '',
      noc_no: item.noc_no || '',
      application_no: item.noc_application_no || '',
      project_status: item.noc_project_status || '',
      noc_type: item.noc_type || '',
      valid_from: item.noc_valid_from || '',
      valid_upto: item.noc_valid_upto || '',
      permitted_m3_per_day: item.noc_permitted_m3_per_day || '',
      permitted_m3_per_year: item.noc_permitted_m3_per_year || '',
      existing_bw_count: item.noc_existing_bw_count || '',
      total_proposed_bw_count: item.noc_total_proposed_bw_count || '',
      flowmeter_applicable: item.noc_flowmeter_applicable || '',
      flowmeter_count: item.noc_flowmeter_count || '',
      piezometer_applicable: item.noc_piezometer_applicable || '',
      piezometer_count: item.noc_piezometer_count || '',
    });
    const canEditNoc = hasCgwAccess;
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
      fd.append('project_address', nocForm.project_address || '');
      fd.append('communication_address', nocForm.communication_address || '');
      fd.append('noc_no', nocForm.noc_no || '');
      fd.append('application_no', nocForm.application_no || '');
      fd.append('project_status', nocForm.project_status || '');
      fd.append('noc_type', nocForm.noc_type || '');
      fd.append('valid_from', nocForm.valid_from || '');
      fd.append('valid_upto', nocForm.valid_upto || '');
      fd.append('permitted_m3_per_day', nocForm.permitted_m3_per_day || '');
      fd.append('permitted_m3_per_year', nocForm.permitted_m3_per_year || '');
      fd.append('existing_bw_count', nocForm.existing_bw_count || '');
      fd.append('total_proposed_bw_count', nocForm.total_proposed_bw_count || '');
      fd.append('flowmeter_applicable', nocForm.flowmeter_applicable || '');
      fd.append('flowmeter_count', nocForm.flowmeter_count || '');
      fd.append('piezometer_applicable', nocForm.piezometer_applicable || '');
      fd.append('piezometer_count', nocForm.piezometer_count || '');
      fd.append('bhuneer_user_id', nocForm.bhuneer_user_id || '');
      fd.append('bhuneer_password', nocForm.bhuneer_password || '');
      fd.append('nocap_user_id', nocForm.nocap_user_id || '');
      fd.append('nocap_password', nocForm.nocap_password || '');
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

  useEffect(() => {
    return () => {
      if (addNocPdfObjectUrl) URL.revokeObjectURL(addNocPdfObjectUrl);
    };
  }, [addNocPdfObjectUrl]);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  /** Piezometer step follows flow metre when NOC says piezometers apply (count optional → defaults to 1). */
  const needsPiezometerWizardStep = useMemo(() => {
    if (String(addNocForm.piezometer_applicable || '').toLowerCase() !== 'yes') return false;
    const raw = String(addNocForm.piezometer_count ?? '').trim();
    if (raw === '') return true;
    const n = parseInt(raw, 10);
    return !Number.isNaN(n) && n > 0;
  }, [addNocForm.piezometer_applicable, addNocForm.piezometer_count]);

  const piezometerWizardCount = useMemo(() => {
    if (!needsPiezometerWizardStep) return 0;
    const raw = String(addNocForm.piezometer_count ?? '').trim();
    if (raw === '') return 1;
    const n = parseInt(raw, 10);
    return !Number.isNaN(n) && n > 0 ? n : 1;
  }, [needsPiezometerWizardStep, addNocForm.piezometer_count]);

  const addWizardFinalStep = needsPiezometerWizardStep ? 5 : 4;

  const addWizardStepDefs = useMemo(() => {
    const s = [
      { n: 1, title: 'Customer' },
      { n: 2, title: 'NOC' },
      { n: 3, title: 'Flow metre details' },
    ];
    if (needsPiezometerWizardStep) s.push({ n: 4, title: 'Piezometer' });
    s.push({ n: needsPiezometerWizardStep ? 5 : 4, title: 'Additional attachment' });
    return s;
  }, [needsPiezometerWizardStep]);

  useEffect(() => {
    if (!needsPiezometerWizardStep && addStep > 4) setAddStep(4);
  }, [needsPiezometerWizardStep, addStep]);

  useEffect(() => {
    if (!dialogOpen || piezometerWizardCount <= 0) return;
    setPiezometerRows((prev) => {
      if (prev.length === piezometerWizardCount) return prev;
      const next = prev.slice(0, piezometerWizardCount);
      while (next.length < piezometerWizardCount) next.push({ ...EMPTY_PIEZO_ROW });
      return next;
    });
    setPiezometerFiles((prev) => {
      if (prev.length === piezometerWizardCount) return prev;
      const next = prev.slice(0, piezometerWizardCount);
      while (next.length < piezometerWizardCount) next.push(EMPTY_PIEZO_FILES());
      return next;
    });
  }, [dialogOpen, piezometerWizardCount]);

  useEffect(() => {
    if (!dialogOpen || addStep < 3 || addStep > 4 || !formData.customer_id) {
      setTelemetrySerialOptions([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(
          `${API}/cgw-flow-metres/customer/${formData.customer_id}/telemetry-serial-options`,
          { headers: authHeaders() }
        );
        if (!cancelled) setTelemetrySerialOptions(Array.isArray(res.data?.serials) ? res.data.serials : []);
      } catch {
        if (!cancelled) setTelemetrySerialOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, addStep, formData.customer_id]);

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
    if (!hasCgwAccess) return undefined;
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
  }, [hasCgwAccess]);

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

  const customerCodeById = useMemo(() => {
    const map = new Map();
    for (const customer of customers) {
      map.set(customer.id, customer.customer_id);
    }
    return map;
  }, [customers]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const customerBizId = (customerCodeById.get(item.customer_id) || '').toString().toLowerCase();
      const matchesGlobal =
        !term ||
        customerBizId.includes(term) ||
        item.customer_id?.toLowerCase().includes(term) ||
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
  }, [searchTerm, columnFilters, items, customerCodeById]);

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

  const IMAGE_UPLOAD_TARGET_BYTES = 4 * 1024 * 1024; // 4 MB per image after compression
  const NON_IMAGE_SOFT_LIMIT_BYTES = 8 * 1024 * 1024; // proxy-safe guidance for pdf/xls/csv etc.

  const isLikelyImageFile = (file) => {
    if (!file) return false;
    if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');
  };

  const compressImageFile = async (file, targetBytes = IMAGE_UPLOAD_TARGET_BYTES) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Could not read image for compression'));
        i.src = objectUrl;
      });
      const maxDimension = 1920;
      const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
      const outW = Math.max(1, Math.round(img.width * scale));
      const outH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable for image compression');
      ctx.drawImage(img, 0, 0, outW, outH);

      let quality = 0.82;
      let best = null;
      while (quality >= 0.45) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) break;
        best = blob;
        if (blob.size <= targetBytes) break;
        quality -= 0.08;
      }
      if (!best) return file;
      const compressed = new File([best], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      return compressed.size < file.size ? compressed : file;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const prepareFileForUpload = async (file) => {
    if (!isLikelyImageFile(file)) {
      if (file.size > NON_IMAGE_SOFT_LIMIT_BYTES) {
        throw new Error(
          `File "${file.name}" is too large (${Math.ceil(file.size / (1024 * 1024))} MB). Non-image files cannot be auto-compressed; please upload a smaller file.`,
        );
      }
      return file;
    }
    if (file.size <= IMAGE_UPLOAD_TARGET_BYTES) return file;
    const compressed = await compressImageFile(file, IMAGE_UPLOAD_TARGET_BYTES);
    if (compressed.size > NON_IMAGE_SOFT_LIMIT_BYTES) {
      throw new Error(
        `Image "${file.name}" is still too large after compression (${Math.ceil(compressed.size / (1024 * 1024))} MB). Please upload a smaller image.`,
      );
    }
    return compressed;
  };

  const postCgwMediaFormData = async (inventoryRowId, fd) => {
    try {
      await axios.post(`${API}/cgw-flow-metres/${inventoryRowId}/media-attachments`, fd, {
        headers: authHeaders(),
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status === 413) {
        throw new Error(
          'Upload rejected by server (413: Request Entity Too Large). Reduce file size or ask admin to increase API upload limit.',
        );
      }
      throw error;
    }
  };

  const uploadCgwRowAttachments = async (inventoryRowId, category, fileList) => {
    const list = normalizeFileList(fileList);
    if (!list.length) return;
    const prepared = [];
    for (const f of list) {
      prepared.push(await prepareFileForUpload(f));
    }
    const fd = new FormData();
    fd.append('category', category);
    if (prepared.length === 1) {
      fd.append('file', prepared[0]);
    } else {
      for (const f of prepared) {
        fd.append('files', f);
      }
    }
    await postCgwMediaFormData(inventoryRowId, fd);
  };

  const uploadCgwRowAttachment = async (inventoryRowId, category, file) =>
    uploadCgwRowAttachments(inventoryRowId, category, [file]);

  const uploadEquipmentFlowBundle = async (inventoryRowId, bundle, equipmentRow) => {
    const b = bundle || {};
    await uploadCgwRowAttachments(inventoryRowId, 'calibration_certificate', b.calibration_cert);
    await uploadCgwRowAttachments(inventoryRowId, 'service_report', b.service_report);
    await uploadCgwRowAttachments(inventoryRowId, 'water_quality_certificate', b.water_quality_certificate);
    await uploadCgwRowAttachments(inventoryRowId, 'cte', b.cte);
    await uploadCgwRowAttachments(inventoryRowId, 'cto', b.cto);
    await uploadCgwRowAttachments(inventoryRowId, 'rwss_watco_phed_noc', b.rwss_watco_phed_noc);
    await uploadCgwRowAttachments(inventoryRowId, 'approval_letter', b.approval_letter);
    await uploadCgwRowAttachments(inventoryRowId, 'rain_water_harvesting_data', b.rain_water_harvesting_data);
    const addDocs = normalizeFileList(b.additional_doc);
    const typed = (equipmentRow?.additional_document_type || '').trim();
    const renamed = typed
      ? addDocs.map(
          (f) =>
            new File([f], `${typed}_${f.name}`, {
              type: f.type || 'application/octet-stream',
            }),
        )
      : addDocs;
    await uploadCgwRowAttachments(inventoryRowId, 'additional_doc', renamed);
    await uploadCgwRowAttachments(inventoryRowId, 'telemetry_excel_prior', b.telemetry_excel);
    await uploadCgwRowAttachments(inventoryRowId, 'telemetry_service_prior', b.telemetry_service);
    await uploadCgwRowAttachments(inventoryRowId, 'bw_geo_flowmeter', b.bwGeoPhotos);
    await uploadCgwRowAttachments(inventoryRowId, 'telemetry', b.telemetryPhotoFiles);
  };

  const uploadPiezometerFlowBundle = async (inventoryRowId, pb) => {
    const bundle = pb || {};
    await uploadCgwRowAttachments(inventoryRowId, 'piezometer_bw', bundle.bwPhotos);
    await uploadCgwRowAttachments(inventoryRowId, 'piezometer_calibration', bundle.calibrationCert);
    await uploadCgwRowAttachments(inventoryRowId, 'piezometer_telemetry', bundle.telemetryPhotos);
    await uploadCgwRowAttachments(inventoryRowId, 'piezometer_excel_prior', bundle.telemetryExcel);
    await uploadCgwRowAttachments(inventoryRowId, 'piezometer_service_report', bundle.priorTelemetryService);
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (addStep !== addWizardFinalStep) {
      toast.error('Finish all steps before saving.');
      return;
    }
    if (!validateFlowMetreWizardStep()) return;
    if (!validatePiezometerWizardStep()) return;
    if (addWizardSubmitting) return;
    setAddWizardSubmitting(true);
    try {
      if (editMode && editingItemId) {
        const row = equipmentRows[0] || { ...EMPTY_EQUIPMENT_ROW };
        const apiRow = equipmentRowToApiPayload(row);
        const piezometerDetailsPayload =
          needsPiezometerWizardStep
            ? JSON.stringify({
                schema_version: 2,
                noc_piezometer_count: piezometerWizardCount || null,
                piezometers: piezometerRows.map((r) => piezoRowToPersist(r)),
              })
            : null;
        await axios.put(`${API}/cgw-flow-metres/${editingItemId}`, {
          customer_id: formData.customer_id || null,
          customer_name: formData.customer_name || '',
          location: formData.location || '',
          contact_person: formData.contact_person || '',
          flow_meter_make: (apiRow.flow_meter_make || '').trim() || null,
          flow_meter_size: (apiRow.flow_meter_size || '').trim() || null,
          flow_meter_serial: (apiRow.flow_meter_serial || '').trim() || null,
          calibration_valid_from: apiRow.calibration_valid_from || null,
          calibration_valid_to: apiRow.calibration_valid_to || null,
          telemetry_applicable: apiRow.telemetry_applicable || null,
          telemetry_company: apiRow.telemetry_company || null,
          telemetry_company_other: (apiRow.telemetry_company_other || '').trim() || null,
          telemetry_communication_via: apiRow.telemetry_communication_via || null,
          telemetry_sim_provider: apiRow.telemetry_sim_provider || null,
          telemetry_sim_provider_other: (apiRow.telemetry_sim_provider_other || '').trim() || null,
          telemetry_sim_number: (apiRow.telemetry_sim_number || '').trim() || null,
          telemetry_sim_valid_from: apiRow.telemetry_sim_valid_from || null,
          telemetry_sim_valid_to: apiRow.telemetry_sim_valid_to || null,
          telemetry_product_code: (apiRow.telemetry_product_code || '').trim() || null,
          telemetry_serial_number: (apiRow.telemetry_serial_number || '').trim() || null,
          telemetry_portal_url: (apiRow.telemetry_portal_url || '').trim() || null,
          telemetry_username: (apiRow.telemetry_username || '').trim() || null,
          telemetry_password: (apiRow.telemetry_password || '').trim() || null,
          telemetry_valid_from: apiRow.telemetry_valid_from || null,
          telemetry_valid_to: apiRow.telemetry_valid_to || null,
          telemetry_uploaded_previous_year: apiRow.telemetry_uploaded_previous_year || null,
          telemetry_previous_serial: (apiRow.telemetry_previous_serial || '').trim() || null,
          telemetry_previous_data_available: apiRow.telemetry_previous_data_available || null,
          telemetry_previous_data_from: apiRow.telemetry_previous_data_from || null,
          telemetry_previous_data_to: apiRow.telemetry_previous_data_to || null,
          piezometer_details_json: piezometerDetailsPayload,
          system_mobile_number: formData.system_mobile_number || '',
          person_mobile_number: formData.person_mobile_number || '',
          email_id: formData.email_id || '',
          date_of_commissioning: formData.date_of_commissioning || null,
        }, { headers: authHeaders() });

        const bundle = equipmentFlowFiles[0] || {};
        await uploadEquipmentFlowBundle(editingItemId, bundle, row);
        for (const pb of piezometerFiles || []) {
          await uploadPiezometerFlowBundle(editingItemId, pb);
        }

        if (addNocFile) {
          const fd = new FormData();
          fd.append('file', addNocFile);
          fd.append('project_name', addNocForm.project_name || '');
          fd.append('project_address', addNocForm.project_address || '');
          fd.append('communication_address', addNocForm.communication_address || '');
          fd.append('noc_no', addNocForm.noc_no || '');
          fd.append('application_no', addNocForm.application_no || '');
          fd.append('project_status', addNocForm.project_status || '');
          fd.append('noc_type', addNocForm.noc_type || '');
          fd.append('valid_from', addNocForm.valid_from || '');
          fd.append('valid_upto', addNocForm.valid_upto || '');
          fd.append('permitted_m3_per_day', addNocForm.permitted_m3_per_day || '');
          fd.append('permitted_m3_per_year', addNocForm.permitted_m3_per_year || '');
          fd.append('existing_bw_count', addNocForm.existing_bw_count || '');
          fd.append('total_proposed_bw_count', addNocForm.total_proposed_bw_count || '');
          fd.append('flowmeter_applicable', addNocForm.flowmeter_applicable || '');
          fd.append('flowmeter_count', addNocForm.flowmeter_count || '');
          fd.append('piezometer_applicable', addNocForm.piezometer_applicable || '');
          fd.append('piezometer_count', addNocForm.piezometer_applicable === 'yes' ? String(piezometerWizardCount || addNocForm.piezometer_count || '') : '');
          fd.append('bhuneer_user_id', addNocForm.bhuneer_user_id || '');
          fd.append('bhuneer_password', addNocForm.bhuneer_password || '');
          fd.append('nocap_user_id', addNocForm.nocap_user_id || '');
          fd.append('nocap_password', addNocForm.nocap_password || '');
          await axios.post(`${API}/cgw-flow-metres/${editingItemId}/noc`, fd, { headers: authHeaders() });
        } else {
          await axios.put(`${API}/cgw-flow-metres/${editingItemId}`, {
            noc_bhuneer_user_id: addNocForm.bhuneer_user_id || null,
            noc_bhuneer_password: addNocForm.bhuneer_password || null,
            noc_nocap_user_id: (addNocForm.nocap_user_id || '').trim().toLowerCase() || null,
            noc_nocap_password: addNocForm.nocap_password || null,
            noc_project_name: addNocForm.project_name || '',
            noc_project_address: addNocForm.project_address || '',
            noc_communication_address: addNocForm.communication_address || '',
            noc_no: addNocForm.noc_no || '',
            noc_application_no: addNocForm.application_no || '',
            noc_project_status: addNocForm.project_status || '',
            noc_type: addNocForm.noc_type || '',
            noc_valid_from: addNocForm.valid_from || '',
            noc_valid_upto: addNocForm.valid_upto || '',
            noc_permitted_m3_per_day: addNocForm.permitted_m3_per_day || '',
            noc_permitted_m3_per_year: addNocForm.permitted_m3_per_year || '',
            noc_existing_bw_count: addNocForm.existing_bw_count || '',
            noc_total_proposed_bw_count: addNocForm.total_proposed_bw_count || '',
            noc_flowmeter_applicable: addNocForm.flowmeter_applicable || '',
            noc_flowmeter_count: addNocForm.flowmeter_applicable === 'yes' ? (addNocForm.flowmeter_count || '') : '',
            noc_piezometer_applicable: addNocForm.piezometer_applicable || '',
            noc_piezometer_count: addNocForm.piezometer_applicable === 'yes' ? String(piezometerWizardCount || addNocForm.piezometer_count || '') : '',
          }, { headers: authHeaders() });
        }

        toast.success('Inventory item updated successfully');
        setDialogOpen(false);
        resetForm();
        fetchItems();
        return;
      }

      const piezometerDetailsPayload =
        needsPiezometerWizardStep
          ? JSON.stringify({
              schema_version: 2,
              noc_piezometer_count: piezometerWizardCount || null,
              piezometers: piezometerRows.map((r) => piezoRowToPersist(r)),
            })
          : null;
      const {
        equipment_name,
        flowmeter_details,
        product_code,
        model_no,
        flow_meter_make: _fmm,
        flow_meter_size: _fms,
        flow_meter_serial: _fmse,
        calibration_valid_from: _cvf,
        calibration_valid_to: _cvt,
        telemetry_applicable: _ta,
        telemetry_company: _tc,
        telemetry_company_other: _tco,
        telemetry_communication_via: _tcv,
        telemetry_sim_provider: _tsp,
        telemetry_sim_provider_other: _tspo,
        telemetry_sim_number: _tsn,
        telemetry_sim_valid_from: _tsvf,
        telemetry_sim_valid_to: _tsvt,
        telemetry_product_code: _tpc,
        telemetry_serial_number: _tsr,
        telemetry_portal_url: _tpu,
        telemetry_username: _tusr,
        telemetry_password: _tpw,
        telemetry_valid_from: _tvf,
        telemetry_valid_to: _tvt,
        telemetry_uploaded_previous_year: _tupy,
        telemetry_previous_serial: _tps,
        telemetry_previous_data_available: _tpda,
        telemetry_previous_data_from: _tpdf,
        telemetry_previous_data_to: _tpdt,
        piezometer_details_json: _pdj,
        ...base
      } = formData;
      const rowsForSubmit = [];
      for (let i = 0; i < equipmentRows.length; i += 1) {
        const r = equipmentRows[i];
        const bundle = equipmentFlowFiles[i] || {};
        if (!equipmentRowIncludeInBulk(r, bundle)) continue;
        const apiRow = equipmentRowToApiPayload(r);
        const serial = (apiRow.flow_meter_serial || '').trim();
        const tSerial = (apiRow.telemetry_serial_number || '').trim();
        const displayName =
          (apiRow.equipment_name || '').trim() || serial || tSerial || `Flow metre line ${i + 1}`;
        rowsForSubmit.push({
          row: {
            equipment_name: displayName || null,
            flowmeter_details: null,
            product_code: null,
            model_no: null,
            flow_meter_make: (apiRow.flow_meter_make || '').trim() || null,
            flow_meter_size: (apiRow.flow_meter_size || '').trim() || null,
            flow_meter_serial: (apiRow.flow_meter_serial || '').trim() || null,
            calibration_valid_from: apiRow.calibration_valid_from || null,
            calibration_valid_to: apiRow.calibration_valid_to || null,
            telemetry_applicable: apiRow.telemetry_applicable || null,
            telemetry_company: apiRow.telemetry_company || null,
            telemetry_company_other: (apiRow.telemetry_company_other || '').trim() || null,
            telemetry_communication_via: apiRow.telemetry_communication_via || null,
            telemetry_sim_provider: apiRow.telemetry_sim_provider || null,
            telemetry_sim_provider_other: (apiRow.telemetry_sim_provider_other || '').trim() || null,
            telemetry_sim_number: (apiRow.telemetry_sim_number || '').trim() || null,
            telemetry_sim_valid_from: apiRow.telemetry_sim_valid_from || null,
            telemetry_sim_valid_to: apiRow.telemetry_sim_valid_to || null,
            telemetry_product_code: (apiRow.telemetry_product_code || '').trim() || null,
            telemetry_serial_number: (apiRow.telemetry_serial_number || '').trim() || null,
            telemetry_portal_url: (apiRow.telemetry_portal_url || '').trim() || null,
            telemetry_username: (apiRow.telemetry_username || '').trim() || null,
            telemetry_password: (apiRow.telemetry_password || '').trim() || null,
            telemetry_valid_from: apiRow.telemetry_valid_from || null,
            telemetry_valid_to: apiRow.telemetry_valid_to || null,
            telemetry_uploaded_previous_year: apiRow.telemetry_uploaded_previous_year || null,
            telemetry_previous_serial: (apiRow.telemetry_previous_serial || '').trim() || null,
            telemetry_previous_data_available: apiRow.telemetry_previous_data_available || null,
            telemetry_previous_data_from: apiRow.telemetry_previous_data_from || null,
            telemetry_previous_data_to: apiRow.telemetry_previous_data_to || null,
            piezometer_details_json: piezometerDetailsPayload,
          },
          files: bundle,
        });
      }

      if (!rowsForSubmit.length) {
        rowsForSubmit.push({
          row: {
            location: base.location || '',
            contact_person: base.contact_person || '',
            flow_meter_make: null,
            flow_meter_size: null,
            flow_meter_serial: null,
            calibration_valid_from: null,
            calibration_valid_to: null,
            telemetry_applicable: null,
            telemetry_company: null,
            telemetry_company_other: null,
            telemetry_communication_via: null,
            telemetry_sim_provider: null,
            telemetry_sim_provider_other: null,
            telemetry_sim_number: null,
            telemetry_sim_valid_from: null,
            telemetry_sim_valid_to: null,
            telemetry_product_code: null,
            telemetry_serial_number: null,
            telemetry_portal_url: null,
            telemetry_username: null,
            telemetry_password: null,
            telemetry_valid_from: null,
            telemetry_valid_to: null,
            telemetry_uploaded_previous_year: null,
            telemetry_previous_serial: null,
            telemetry_previous_data_available: null,
            telemetry_previous_data_from: null,
            telemetry_previous_data_to: null,
            piezometer_details_json: piezometerDetailsPayload,
          },
          files: equipmentFlowFiles[0] || {},
        });
      }

      const payload = {
        ...base,
        equipments: rowsForSubmit.map((x) => x.row),
      };

      const createdRes = await axios.post(`${API}/cgw-flow-metres/bulk`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const createdRows = Array.isArray(createdRes.data) ? createdRes.data : [];

      for (let i = 0; i < createdRows.length; i += 1) {
        const inv = createdRows[i];
        const bundle = rowsForSubmit[i]?.files;
        if (!inv?.id || !bundle) continue;
        try {
          await uploadEquipmentFlowBundle(inv.id, bundle, equipmentRows[i]);
        } catch (uploadErr) {
          toast.error(uploadErr.response?.data?.detail || 'Saved row but an attachment upload failed');
          fetchItems();
          return;
        }
      }

      if (needsPiezometerWizardStep && createdRows.length && piezometerRows.length) {
        for (let pi = 0; pi < piezometerRows.length; pi += 1) {
          const inv = createdRows[Math.min(pi, createdRows.length - 1)];
          if (!inv?.id) continue;
          const pb = piezometerFiles[pi] || {};
          try {
            await uploadPiezometerFlowBundle(inv.id, pb);
          } catch (pzErr) {
            toast.error(pzErr.response?.data?.detail || 'Piezometer file upload failed');
            fetchItems();
            return;
          }
        }
      }

      const hasNocMeta = !!(
        addNocForm.bhuneer_user_id ||
        addNocForm.bhuneer_password ||
        addNocForm.nocap_user_id ||
        addNocForm.nocap_password ||
        addNocForm.project_name ||
        addNocForm.project_address ||
        addNocForm.communication_address ||
        addNocForm.noc_no ||
        addNocForm.application_no ||
        addNocForm.project_status ||
        addNocForm.noc_type ||
        addNocForm.valid_from ||
        addNocForm.valid_upto ||
        addNocForm.permitted_m3_per_day ||
        addNocForm.permitted_m3_per_year ||
        addNocForm.existing_bw_count ||
        addNocForm.total_proposed_bw_count ||
        addNocForm.flowmeter_applicable ||
        addNocForm.flowmeter_count ||
        addNocForm.piezometer_applicable ||
        addNocForm.piezometer_count ||
        (addNocForm.piezometer_applicable === 'yes' && needsPiezometerWizardStep)
      );

      if (createdRows.length && (addNocFile || hasNocMeta)) {
        for (const row of createdRows) {
          if (addNocFile) {
            const fd = new FormData();
            fd.append('file', addNocFile);
            fd.append('project_name', addNocForm.project_name || '');
            fd.append('project_address', addNocForm.project_address || '');
            fd.append('communication_address', addNocForm.communication_address || '');
            fd.append('noc_no', addNocForm.noc_no || '');
            fd.append('application_no', addNocForm.application_no || '');
            fd.append('project_status', addNocForm.project_status || '');
            fd.append('noc_type', addNocForm.noc_type || '');
            fd.append('valid_from', addNocForm.valid_from || '');
            fd.append('valid_upto', addNocForm.valid_upto || '');
            fd.append('permitted_m3_per_day', addNocForm.permitted_m3_per_day || '');
            fd.append('permitted_m3_per_year', addNocForm.permitted_m3_per_year || '');
            fd.append('existing_bw_count', addNocForm.existing_bw_count || '');
            fd.append('total_proposed_bw_count', addNocForm.total_proposed_bw_count || '');
            fd.append('flowmeter_applicable', addNocForm.flowmeter_applicable || '');
            fd.append('flowmeter_count', addNocForm.flowmeter_count || '');
            fd.append('piezometer_applicable', addNocForm.piezometer_applicable || '');
            fd.append(
              'piezometer_count',
              addNocForm.piezometer_applicable === 'yes'
                ? needsPiezometerWizardStep
                  ? String(piezometerWizardCount)
                  : addNocForm.piezometer_count || ''
                : '',
            );
            fd.append('bhuneer_user_id', addNocForm.bhuneer_user_id || '');
            fd.append('bhuneer_password', addNocForm.bhuneer_password || '');
            fd.append('nocap_user_id', addNocForm.nocap_user_id || '');
            fd.append('nocap_password', addNocForm.nocap_password || '');
            await axios.post(`${API}/cgw-flow-metres/${row.id}/noc`, fd, {
              headers: authHeaders(),
              timeout: 120000,
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
            });
          } else {
            await axios.put(`${API}/cgw-flow-metres/${row.id}`, {
              noc_bhuneer_user_id: addNocForm.bhuneer_user_id || null,
              noc_bhuneer_password: addNocForm.bhuneer_password || null,
              noc_nocap_user_id: (addNocForm.nocap_user_id || '').trim().toLowerCase() || null,
              noc_nocap_password: addNocForm.nocap_password || null,
              noc_project_name: addNocForm.project_name || '',
              noc_project_address: addNocForm.project_address || '',
              noc_communication_address: addNocForm.communication_address || '',
              noc_no: addNocForm.noc_no || '',
              noc_application_no: addNocForm.application_no || '',
              noc_project_status: addNocForm.project_status || '',
              noc_type: addNocForm.noc_type || '',
              noc_valid_from: addNocForm.valid_from || '',
              noc_valid_upto: addNocForm.valid_upto || '',
              noc_permitted_m3_per_day: addNocForm.permitted_m3_per_day || '',
              noc_permitted_m3_per_year: addNocForm.permitted_m3_per_year || '',
              noc_existing_bw_count: addNocForm.existing_bw_count || '',
              noc_total_proposed_bw_count: addNocForm.total_proposed_bw_count || '',
              noc_flowmeter_applicable: addNocForm.flowmeter_applicable || '',
              noc_flowmeter_count: addNocForm.flowmeter_applicable === 'yes' ? (addNocForm.flowmeter_count || '') : '',
              noc_piezometer_applicable: addNocForm.piezometer_applicable || '',
              noc_piezometer_count:
                addNocForm.piezometer_applicable === 'yes'
                  ? needsPiezometerWizardStep
                    ? String(piezometerWizardCount)
                    : addNocForm.piezometer_count || ''
                  : '',
            }, { headers: authHeaders() });
          }
        }
      }

      toast.success('Inventory items added successfully');
      setDialogOpen(false);
      resetForm();
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    } finally {
      setAddWizardSubmitting(false);
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

  const handleDownloadAttachmentsZip = async (item) => {
    try {
      const response = await axios.get(
        `${API}/cgw-flow-metres/${item.id}/attachments/download-zip`,
        {
          headers: authHeaders(),
          responseType: 'blob',
        },
      );
      const customerStem = String(item?.customer_name || 'record').replace(/[^A-Za-z0-9_-]+/g, '') || 'record';
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${customerStem}documents.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Attachments ZIP downloaded');
    } catch (error) {
      const msg = error?.response?.data?.detail || 'Failed to download attachments ZIP';
      toast.error(typeof msg === 'string' ? msg : 'Failed to download attachments ZIP');
    }
  };

  const openHistoryDialog = (item) => {
    setHistoryItem(item || null);
    setHistoryDialogOpen(true);
  };

  const handleEdit = (item) => {
    setEditMode(true);
    setEditingItemId(item.id);
    setFormData((prev) => ({
      ...prev,
      customer_id: item.customer_id || '',
      customer_name: item.customer_name || '',
      location: item.location || '',
      contact_person: item.contact_person || '',
      system_mobile_number: item.system_mobile_number || '',
      person_mobile_number: item.person_mobile_number || '',
      email_id: item.email_id || '',
      date_of_commissioning: item.date_of_commissioning || '',
    }));
    setEquipmentRows([{
      ...EMPTY_EQUIPMENT_ROW,
      flow_meter_make: item.flow_meter_make || 'UPC',
      flow_meter_size: item.flow_meter_size || '',
      flow_meter_serial: item.flow_meter_serial || '',
      calibration_valid_from: item.calibration_valid_from || '',
      calibration_valid_to: item.calibration_valid_to || '',
      telemetry_applicable: item.telemetry_applicable || '',
      telemetry_company: item.telemetry_company || '',
      telemetry_company_other: item.telemetry_company_other || '',
      telemetry_communication_via: item.telemetry_communication_via || '',
      telemetry_sim_provider: item.telemetry_sim_provider || '',
      telemetry_sim_provider_other: item.telemetry_sim_provider_other || '',
      telemetry_sim_number: item.telemetry_sim_number || '',
      telemetry_sim_valid_from: item.telemetry_sim_valid_from || '',
      telemetry_sim_valid_to: item.telemetry_sim_valid_to || '',
      telemetry_product_code: item.telemetry_product_code || '',
      telemetry_serial_number: item.telemetry_serial_number || '',
      telemetry_portal_url: item.telemetry_portal_url || '',
      telemetry_username: item.telemetry_username || '',
      telemetry_password: item.telemetry_password || '',
      telemetry_valid_from: item.telemetry_valid_from || '',
      telemetry_valid_to: item.telemetry_valid_to || '',
      telemetry_uploaded_previous_year: item.telemetry_uploaded_previous_year || '',
      telemetry_previous_serial_pick: item.telemetry_previous_serial || '',
      telemetry_previous_data_available: item.telemetry_previous_data_available || '',
      telemetry_previous_data_from: item.telemetry_previous_data_from || '',
      telemetry_previous_data_to: item.telemetry_previous_data_to || '',
      additional_document_type: item.additional_document_type || '',
    }]);
    setEquipmentFlowFiles([EMPTY_EQUIPMENT_FLOW_FILES()]);
    setAddNocForm({
      bhuneer_user_id: item.noc_bhuneer_user_id || '',
      bhuneer_password: item.noc_bhuneer_password || '',
      nocap_user_id: item.noc_nocap_user_id || '',
      nocap_password: item.noc_nocap_password || '',
      project_name: item.noc_project_name || '',
      project_address: item.noc_project_address || '',
      communication_address: item.noc_communication_address || '',
      noc_no: item.noc_no || '',
      application_no: item.noc_application_no || '',
      project_status: item.noc_project_status || '',
      noc_type: item.noc_type || '',
      valid_from: item.noc_valid_from || '',
      valid_upto: item.noc_valid_upto || '',
      permitted_m3_per_day: item.noc_permitted_m3_per_day || '',
      permitted_m3_per_year: item.noc_permitted_m3_per_year || '',
      existing_bw_count: item.noc_existing_bw_count || '',
      total_proposed_bw_count: item.noc_total_proposed_bw_count || '',
      flowmeter_applicable: item.noc_flowmeter_applicable || '',
      flowmeter_count: item.noc_flowmeter_count || '',
      piezometer_applicable: item.noc_piezometer_applicable || '',
      piezometer_count: item.noc_piezometer_count || '',
    });
    try {
      const parsed = typeof item.piezometer_details_json === 'string' ? JSON.parse(item.piezometer_details_json) : item.piezometer_details_json;
      const pz = Array.isArray(parsed?.piezometers) ? parsed.piezometers : [];
      setPiezometerRows(pz.map((r) => ({ ...EMPTY_PIEZO_ROW, ...r })));
      setPiezometerFiles(Array.from({ length: pz.length }, () => EMPTY_PIEZO_FILES()));
    } catch (_e) {
      setPiezometerRows([]);
      setPiezometerFiles([]);
    }
    setAddStep(1);
    setDialogOpen(true);
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
    setEquipmentFlowFiles([EMPTY_EQUIPMENT_FLOW_FILES()]);
    setAddNocForm(EMPTY_NOC_FORM);
    setAddNocFile(null);
    setAddNocPdfObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setAddNocPdfPreviewVisible(true);
    setPiezometerRows([]);
    setPiezometerFiles([]);
    setAddStep(1);
    setAddWizardSubmitting(false);
    setEditMode(false);
    setEditingItemId(null);
  };

  const handleAddNocWizardFilePicked = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setAddNocPdfObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    if (!f) {
      setAddNocFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }
    const u = URL.createObjectURL(f);
    setAddNocPdfObjectUrl(u);
    setAddNocFile(f);
    setAddNocPdfPreviewVisible(true);
  };

  const validatePiezometerWizardStep = () => {
    if (!needsPiezometerWizardStep) return true;
    const n = piezometerRows.length;
    if (!n || n !== piezometerWizardCount) {
      toast.error('Complete piezometer details for each unit (count must match NOC).');
      return false;
    }
    for (let i = 0; i < n; i += 1) {
      const r = piezometerRows[i];
      if (r.telemetry_applicable === 'yes') {
        if (!r.telemetry_company) {
          toast.error(`Piezometer ${i + 1}: select telemetry company.`);
          return false;
        }
        if (r.telemetry_company === 'other' && !(r.telemetry_company_other || '').trim()) {
          toast.error(`Piezometer ${i + 1}: enter telemetry company (manual).`);
          return false;
        }
        if (r.telemetry_communication_via === 'sim') {
          if (!r.telemetry_sim_provider) {
            toast.error(`Piezometer ${i + 1}: select SIM provider.`);
            return false;
          }
          if (r.telemetry_sim_provider === 'other' && !(r.telemetry_sim_provider_other || '').trim()) {
            toast.error(`Piezometer ${i + 1}: enter SIM provider (manual).`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const validateFlowMetreWizardStep = () => {
    const includedIdx = [];
    for (let i = 0; i < equipmentRows.length; i += 1) {
      const r = equipmentRows[i];
      const bundle = equipmentFlowFiles[i] || {};
      if (equipmentRowIncludeInBulk(r, bundle)) includedIdx.push(i);
    }
    return true;
  };

  const goAddNextStep = () => {
    if (addStep === 1) {
      setAddStep(2);
      return;
    }
    if (addStep === 2) {
      setAddStep(3);
      return;
    }
    if (addStep === 3) {
      if (!validateFlowMetreWizardStep()) return;
      if (needsPiezometerWizardStep) {
        const cnt = piezometerWizardCount;
        if (cnt > 0) {
          setPiezometerRows(Array.from({ length: cnt }, () => ({ ...EMPTY_PIEZO_ROW })));
          setPiezometerFiles(Array.from({ length: cnt }, () => EMPTY_PIEZO_FILES()));
        }
        setAddStep(4);
        return;
      }
      setAddStep(4);
      return;
    }
    if (addStep === 4 && needsPiezometerWizardStep) {
      setAddStep(5);
      return;
    }
  };

  const goAddPrevStep = () => setAddStep((s) => Math.max(1, s - 1));

  const handleCustomerChange = (e) => {
    const selectedCustomer = customers.find(c => c.id === e.target.value);
    if (selectedCustomer) {
      const primaryContact =
        (selectedCustomer.contacts || []).find((c) => Number(c.is_primary) === 1) ||
        (selectedCustomer.contacts || [])[0] ||
        null;
      const primaryAddress =
        (selectedCustomer.addresses || []).find((a) => Number(a.is_primary) === 1) ||
        (selectedCustomer.addresses || [])[0] ||
        null;

      const locationParts = [
        primaryAddress?.address_line || selectedCustomer.address_line || '',
        primaryAddress?.city || selectedCustomer.city || '',
        primaryAddress?.state || selectedCustomer.state || '',
        primaryAddress?.pincode || selectedCustomer.pincode || '',
      ].filter(Boolean);
      const autoLocation = locationParts.join(', ');
      const autoContactPerson =
        primaryContact?.contact_person_name ||
        selectedCustomer.contact_person_name ||
        '';
      const autoPhone = primaryContact?.phone || selectedCustomer.phone || '';
      const autoEmail = primaryContact?.email || selectedCustomer.email || '';

      setFormData((prev) => {
        const pickIfBlank = (existing, incoming) => (String(existing || '').trim() ? existing : (incoming || ''));
        return {
          ...prev,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.company_name,
          location: pickIfBlank(prev.location, autoLocation),
          contact_person: pickIfBlank(prev.contact_person, autoContactPerson),
          person_mobile_number: pickIfBlank(prev.person_mobile_number, autoPhone),
          system_mobile_number: pickIfBlank(prev.system_mobile_number, autoPhone),
          email_id: pickIfBlank(prev.email_id, autoEmail),
        };
      });
    }
  };

  const canManage = hasCgwAccess;
  const nocReadOnly = !canManage;

  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaDialogItem, setMediaDialogItem] = useState(null);
  const [mediaActiveCategory, setMediaActiveCategory] = useState('bw_geo_flowmeter');
  const [mediaSelectedFileId, setMediaSelectedFileId] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaPreviewObjectUrl, setMediaPreviewObjectUrl] = useState('');
  const [mediaPreviewLoading, setMediaPreviewLoading] = useState(false);
  const [mediaPreviewError, setMediaPreviewError] = useState('');
  const mediaFileInputRef = useRef(null);
  const mediaPickCategoryRef = useRef(null);
  const mediaPreviewBlobRef = useRef(null);

  useEffect(() => {
    if (!mediaDialogOpen || !mediaDialogItem) return;
    const list = mediaDialogItem.cgw_attachments?.[mediaActiveCategory] || [];
    setMediaSelectedFileId((prev) => {
      if (prev && list.some((a) => a.id === prev)) return prev;
      return list[0]?.id || null;
    });
  }, [mediaDialogOpen, mediaDialogItem, mediaActiveCategory]);

  const openMediaDialog = (item, category = 'bw_geo_flowmeter') => {
    setMediaDialogItem(item);
    setMediaActiveCategory(CGW_MEDIA_KEYS.includes(category) ? category : 'bw_geo_flowmeter');
    setMediaSelectedFileId(null);
    setMediaDialogOpen(true);
  };

  const closeMediaDialog = () => {
    if (mediaPreviewBlobRef.current) {
      URL.revokeObjectURL(mediaPreviewBlobRef.current);
      mediaPreviewBlobRef.current = null;
    }
    setMediaDialogOpen(false);
    setMediaDialogItem(null);
    setMediaSelectedFileId(null);
    setMediaPreviewObjectUrl('');
    setMediaPreviewLoading(false);
    setMediaPreviewError('');
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
      await uploadCgwRowAttachments(mediaDialogItem.id, cat, list);
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

  const mediaIsStreamableRemoteUrl = (full) =>
    !!full &&
    /^https?:\/\//i.test(full) &&
    (full.includes('.amazonaws.com') || full.includes('.digitaloceanspaces.com'));

  useEffect(() => {
    if (!mediaDialogOpen || !mediaDialogItem) {
      if (mediaPreviewBlobRef.current) {
        URL.revokeObjectURL(mediaPreviewBlobRef.current);
        mediaPreviewBlobRef.current = null;
      }
      setMediaPreviewObjectUrl('');
      setMediaPreviewLoading(false);
      setMediaPreviewError('');
      return undefined;
    }

    const mList = getAttachList(mediaDialogItem, mediaActiveCategory);
    const sel = mList.find((a) => a.id === mediaSelectedFileId) || mList[0] || null;
    const rawHref = sel?.url || '';
    const fullHref = mediaPreviewHref(rawHref);
    const shouldStream = mediaIsStreamableRemoteUrl(fullHref);

    if (mediaPreviewBlobRef.current) {
      URL.revokeObjectURL(mediaPreviewBlobRef.current);
      mediaPreviewBlobRef.current = null;
    }
    setMediaPreviewObjectUrl('');
    setMediaPreviewError('');

    if (!sel || !fullHref || !shouldStream) {
      setMediaPreviewLoading(false);
      return undefined;
    }

    let cancelled = false;
    setMediaPreviewLoading(true);

    (async () => {
      try {
        const res = await axios.get(`${API}/files/stream`, {
          params: { file_url: fullHref },
          headers: authHeaders(),
          responseType: 'blob',
        });
        if (cancelled) return;
        const contentType = res.headers?.['content-type'] || sel?.mime_type || 'application/octet-stream';
        const blob = new Blob([res.data], { type: contentType });
        const u = URL.createObjectURL(blob);
        mediaPreviewBlobRef.current = u;
        setMediaPreviewObjectUrl(u);
      } catch (err) {
        if (!cancelled) {
          setMediaPreviewError(err.response?.data?.detail || 'Could not load file preview');
        }
      } finally {
        if (!cancelled) setMediaPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mediaDialogOpen, mediaDialogItem, mediaActiveCategory, mediaSelectedFileId]);

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
    <div className="space-y-6" data-testid="cgw-flow-metre-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">CGW Flow Metre</h1>
          <p className="text-gray-600 text-sm mt-1 max-w-3xl">
            Inventory, NOCs, and CGWA attachments per customer and equipment row.
            <span className="text-gray-500">
              {' '}
              · {items.length} total {items.length === 1 ? 'row' : 'rows'}
              {filteredItems.length !== items.length ? (
                <>
                  {' '}
                  · {filteredItems.length} {filteredItems.length === 1 ? 'matches' : 'match'} search/filters
                </>
              ) : null}
            </span>
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 h-10"
                onClick={() => setShowColumnFilter((prev) => !prev)}
                title="Filter specific column"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              {showColumnFilter && (
                <Card className="absolute right-0 top-full z-30 mt-1 w-80 p-3 border border-gray-200 shadow-lg bg-white rounded-lg">
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
                      className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      {FILTER_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.fields.map((field) => (
                            <option key={field} value={field}>
                              {FILTER_LABELS[field]}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <Input
                      value={selectedFilterValue}
                      onChange={(e) => setSelectedFilterValue(e.target.value)}
                      placeholder="Type value to filter..."
                      className="h-10 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" className="h-9 text-xs border-gray-300 text-gray-700 hover:bg-gray-50" onClick={handleClearColumnFilter}>
                        Clear
                      </Button>
                      <Button type="button" size="sm" className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={handleApplyColumnFilter}>
                        Apply
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button
                  className="bg-blue-600 text-white hover:bg-blue-700 h-10"
                  data-testid="add-item-button"
                  onClick={resetForm}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Flow Metre
                </Button>
              </DialogTrigger>
            <DialogContent className="flex h-[min(96vh,100dvh)] max-h-[min(96vh,100dvh)] w-[min(1600px,98vw)] max-w-[min(1600px,98vw)] flex-col overflow-hidden bg-white rounded-lg border border-gray-200 shadow-xl p-0">
              <div className="bg-blue-600 text-white p-6 rounded-t-lg shrink-0">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">{editMode ? 'Edit Flow Metre' : 'Add New Flow Metre'}</DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    {editMode ? 'Update existing inventory item' : 'Create a new inventory item'}
                  </p>
                </DialogHeader>
              </div>
              <form
                onSubmit={(e) => e.preventDefault()}
                className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6"
              >
                <div className="flex items-center justify-between gap-2">
                  {addWizardStepDefs.map((step, si) => (
                    <div key={step.n} className="flex items-center gap-2 flex-1">
                      <div
                        className={`h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center ${
                          addStep >= step.n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {step.n}
                      </div>
                      <span className={`text-xs font-medium ${addStep >= step.n ? 'text-blue-700' : 'text-gray-500'}`}>
                        {step.title}
                      </span>
                      {si < addWizardStepDefs.length - 1 ? (
                        <div className={`h-px flex-1 ${addStep > step.n ? 'bg-blue-500' : 'bg-gray-200'}`} />
                      ) : null}
                    </div>
                  ))}
                </div>

                {addStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_id" className="text-sm font-medium text-gray-700">Select Customer</Label>
                      <select
                        id="customer_id"
                        value={formData.customer_id}
                        onChange={handleCustomerChange}
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Location</Label>
                        <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="border border-gray-300 h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Contact Person</Label>
                        <Input value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="border border-gray-300 h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">System Mobile</Label>
                        <Input value={formData.system_mobile_number} onChange={(e) => setFormData({ ...formData, system_mobile_number: e.target.value })} className="border border-gray-300 h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Person Mobile</Label>
                        <Input value={formData.person_mobile_number} onChange={(e) => setFormData({ ...formData, person_mobile_number: e.target.value })} className="border border-gray-300 h-11" />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label className="text-sm font-medium text-gray-700">Email</Label>
                        <Input type="email" value={formData.email_id} onChange={(e) => setFormData({ ...formData, email_id: e.target.value })} className="border border-gray-300 h-11" />
                      </div>
                    </div>
                  </div>
                )}

                {addStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5">
                      <div className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
                        {!addNocFile ? (
                          <>
                            <Label className="text-sm font-medium text-gray-700">NOC PDF (optional)</Label>
                            <Input
                              type="file"
                              accept=".pdf,application/pdf"
                              onChange={handleAddNocWizardFilePicked}
                              className="h-11"
                            />
                            <p className="text-[11px] text-gray-500">
                              If selected, the same NOC PDF is attached to every equipment row you create. Preview below while you fill the form.
                            </p>
                            <p className="text-[11px] text-gray-400 pt-1">Choose a PDF to open an inline preview (same as the NOC popup).</p>
                          </>
                        ) : null}
                        {addNocFile && addNocPdfObjectUrl ? (
                          <div className="space-y-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setAddNocPdfPreviewVisible((v) => !v)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                {addNocPdfPreviewVisible ? 'Hide PDF preview' : 'Show PDF preview'}
                              </Button>
                              <label className="text-[11px] font-medium text-blue-600 hover:text-blue-800 cursor-pointer shrink-0 underline-offset-2 hover:underline">
                                Replace PDF
                                <input
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  onChange={handleAddNocWizardFilePicked}
                                  className="sr-only"
                                />
                              </label>
                              <span className="text-[11px] text-gray-500 truncate max-w-[200px]" title={addNocFile.name}>
                                {addNocFile.name}
                              </span>
                            </div>
                            {addNocPdfPreviewVisible ? (
                              <div className="rounded-md border border-gray-200 overflow-hidden bg-neutral-900">
                                <iframe
                                  title="NOC PDF preview"
                                  src={addNocPdfObjectUrl}
                                  className="h-[min(72vh,720px)] min-h-[320px] w-full border-0 bg-white"
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : addNocFile ? (
                          <p className="text-[11px] text-amber-700 pt-1">Preparing preview…</p>
                        ) : null}
                      </div>
                      <div className="min-w-0 w-full shrink-0 space-y-4 lg:w-[280px]">
                    <div className="rounded-lg border border-gray-200 bg-slate-50/50 p-3 space-y-3">
                      <p className="text-sm font-semibold text-gray-800">BHUNEER / no-cap portal</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">BHUNEER user ID</Label>
                          <Input
                            value={addNocForm.bhuneer_user_id}
                            onChange={(e) => setAddNocForm((p) => ({ ...p, bhuneer_user_id: e.target.value }))}
                            autoComplete="off"
                            className="h-11 border border-gray-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Password</Label>
                          <Input
                            type="password"
                            value={addNocForm.bhuneer_password}
                            onChange={(e) => setAddNocForm((p) => ({ ...p, bhuneer_password: e.target.value }))}
                            autoComplete="new-password"
                            className="h-11 border border-gray-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">No cap user ID</Label>
                          <Input
                            value={addNocForm.nocap_user_id}
                            onChange={(e) =>
                              setAddNocForm((p) => ({ ...p, nocap_user_id: e.target.value.toLowerCase() }))
                            }
                            autoComplete="off"
                            placeholder="stored lowercase"
                            className="h-11 border border-gray-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Password</Label>
                          <Input
                            type="password"
                            value={addNocForm.nocap_password}
                            onChange={(e) => setAddNocForm((p) => ({ ...p, nocap_password: e.target.value }))}
                            autoComplete="new-password"
                            className="h-11 border border-gray-300"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Project name</Label>
                        <Input value={addNocForm.project_name} onChange={(e) => setAddNocForm((p) => ({ ...p, project_name: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Project address</Label>
                        <Input value={addNocForm.project_address} onChange={(e) => setAddNocForm((p) => ({ ...p, project_address: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Communication address</Label>
                        <Input value={addNocForm.communication_address} onChange={(e) => setAddNocForm((p) => ({ ...p, communication_address: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">NOC number</Label>
                        <Input value={addNocForm.noc_no} onChange={(e) => setAddNocForm((p) => ({ ...p, noc_no: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Application number</Label>
                        <Input value={addNocForm.application_no} onChange={(e) => setAddNocForm((p) => ({ ...p, application_no: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Project status</Label>
                        <select
                          value={addNocForm.project_status}
                          onChange={(e) => setAddNocForm((p) => ({ ...p, project_status: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 h-11"
                        >
                          <option value="">Select status</option>
                          <option value="existing_ground_water">Existing ground water</option>
                          <option value="new_ground_water">New ground water</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">NOC type</Label>
                        <select
                          value={addNocForm.noc_type}
                          onChange={(e) => setAddNocForm((p) => ({ ...p, noc_type: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 h-11"
                        >
                          <option value="">Select type</option>
                          <option value="new">New</option>
                          <option value="renewal">Renewal</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Valid from</Label>
                        <Input type="date" value={addNocForm.valid_from} onChange={(e) => setAddNocForm((p) => ({ ...p, valid_from: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Valid up to</Label>
                        <Input type="date" value={addNocForm.valid_upto} onChange={(e) => setAddNocForm((p) => ({ ...p, valid_upto: e.target.value }))} className="h-11" />
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-sm font-semibold text-gray-800 mb-3">Ground water abstraction permitted</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">M3 per day</Label>
                          <Input value={addNocForm.permitted_m3_per_day} onChange={(e) => setAddNocForm((p) => ({ ...p, permitted_m3_per_day: e.target.value }))} className="h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">M3 per year</Label>
                          <Input value={addNocForm.permitted_m3_per_year} onChange={(e) => setAddNocForm((p) => ({ ...p, permitted_m3_per_year: e.target.value }))} className="h-11" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-sm font-semibold text-gray-800 mb-3">Detail of ground water abstraction / dewatering structure</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Existing BW count</Label>
                          <Input value={addNocForm.existing_bw_count} onChange={(e) => setAddNocForm((p) => ({ ...p, existing_bw_count: e.target.value }))} className="h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Total proposed BW count</Label>
                          <Input value={addNocForm.total_proposed_bw_count} onChange={(e) => setAddNocForm((p) => ({ ...p, total_proposed_bw_count: e.target.value }))} className="h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Flowmeter applicable or not</Label>
                          <select
                            value={addNocForm.flowmeter_applicable}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAddNocForm((p) => ({
                                ...p,
                                flowmeter_applicable: v,
                                flowmeter_count: v === 'yes' ? p.flowmeter_count : '',
                              }));
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 h-11"
                          >
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        {addNocForm.flowmeter_applicable === 'yes' && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Flowmeter count</Label>
                            <Input value={addNocForm.flowmeter_count} onChange={(e) => setAddNocForm((p) => ({ ...p, flowmeter_count: e.target.value }))} className="h-11" />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700">Piezometer applicable or not</Label>
                          <select
                            value={addNocForm.piezometer_applicable}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAddNocForm((p) => ({
                                ...p,
                                piezometer_applicable: v,
                                piezometer_count: v === 'yes' ? p.piezometer_count : '',
                              }));
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 h-11"
                          >
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        {addNocForm.piezometer_applicable === 'yes' && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Piezometer count</Label>
                            <Input value={addNocForm.piezometer_count} onChange={(e) => setAddNocForm((p) => ({ ...p, piezometer_count: e.target.value }))} className="h-11" />
                          </div>
                        )}
                      </div>
                    </div>
                      </div>
                    </div>
                  </div>
                )}

                {addStep === 3 && (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Flow metre lines</Label>
                          <p className="text-xs text-gray-500 mt-0.5">One card per flow metre; add rows for multiple units.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setEquipmentRows((prev) => [...prev, { ...EMPTY_EQUIPMENT_ROW }]);
                            setEquipmentFlowFiles((prev) => [...prev, EMPTY_EQUIPMENT_FLOW_FILES()]);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Row
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {equipmentRows.map((row, idx) => {
                          const patchRow = (patch) =>
                            setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                          const flowFiles = equipmentFlowFiles[idx] || {};
                          const patchFlowFiles = (patch) =>
                            setEquipmentFlowFiles((prev) =>
                              prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
                            );
                          return (
                            <Card key={idx} className="p-4 border border-gray-200">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0 space-y-4">
                                  <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
                                    <p className="text-sm font-semibold text-gray-800">Flow metre details</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700">Make</Label>
                                        <Input
                                          value={row.flow_meter_make}
                                          onChange={(e) => patchRow({ flow_meter_make: e.target.value })}
                                          placeholder="UPC"
                                          className="border border-gray-300 h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700">Size of flow metre</Label>
                                        <Input
                                          value={row.flow_meter_size}
                                          onChange={(e) => patchRow({ flow_meter_size: e.target.value })}
                                          className="border border-gray-300 h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700">Serial number</Label>
                                        <Input
                                          value={row.flow_meter_serial}
                                          onChange={(e) => patchRow({ flow_meter_serial: e.target.value })}
                                          className="border border-gray-300 h-11"
                                        />
                                      </div>
                                    </div>
                                    <CgwMultiFilePicker
                                      label="BW with flowmeter GEO tagging photos"
                                      accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                                      imageOnly
                                      files={flowFiles.bwGeoPhotos}
                                      onChange={(bwGeoPhotos) => patchFlowFiles({ bwGeoPhotos })}
                                      hint="Multiple images; uploads after save (S3)."
                                      className="border-t border-gray-200 pt-3"
                                    />
                                  </div>

                                  <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                                    <p className="text-sm font-semibold text-gray-800">Calibration certificate</p>
                                    <CgwMultiFilePicker
                                      label="Certificate (file)"
                                      accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                      files={flowFiles.calibration_cert}
                                      onChange={(calibration_cert) => patchFlowFiles({ calibration_cert })}
                                      hint="Uploads after the row is saved (S3)."
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700">Valid from</Label>
                                        <Input
                                          type="date"
                                          value={row.calibration_valid_from}
                                          onChange={(e) => patchRow({ calibration_valid_from: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700">Valid to</Label>
                                        <Input
                                          type="date"
                                          value={row.calibration_valid_to}
                                          onChange={(e) => patchRow({ calibration_valid_to: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                                    <p className="text-sm font-semibold text-gray-800">Service report</p>
                                    <CgwMultiFilePicker
                                      label="Upload service report"
                                      accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                      files={flowFiles.service_report}
                                      onChange={(service_report) => patchFlowFiles({ service_report })}
                                      hint="Optional; uploads after save (S3)."
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700">Applicable telemetry system?</Label>
                                    <select
                                      value={row.telemetry_applicable}
                                      onChange={(e) => patchRow({ telemetry_applicable: e.target.value })}
                                      className="w-full border border-gray-300 rounded-lg px-3 h-11"
                                    >
                                      <option value="">Select</option>
                                      <option value="yes">Yes</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>

                                  {row.telemetry_applicable === 'yes' ? (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-4">
                                      <p className="text-sm font-semibold text-gray-800">Telemetry system</p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry company</Label>
                                          <select
                                            value={row.telemetry_company}
                                            onChange={(e) => patchRow({ telemetry_company: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 h-11"
                                          >
                                            <option value="">Select</option>
                                            <option value="frinso">FRINSO</option>
                                            <option value="ubiqedge">UBIQEDGE</option>
                                            <option value="other">Other</option>
                                          </select>
                                        </div>
                                        {row.telemetry_company === 'other' ? (
                                          <div className="space-y-2">
                                            <Label className="text-sm font-medium text-gray-700">Company name (manual)</Label>
                                            <Input
                                              value={row.telemetry_company_other}
                                              onChange={(e) => patchRow({ telemetry_company_other: e.target.value })}
                                              className="h-11"
                                            />
                                          </div>
                                        ) : null}
                                        <div className="space-y-2 sm:col-span-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry communication via</Label>
                                          <select
                                            value={row.telemetry_communication_via}
                                            onChange={(e) => patchRow({ telemetry_communication_via: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 h-11 max-w-md"
                                          >
                                            <option value="">Select</option>
                                            <option value="sim">SIM</option>
                                            <option value="wifi">Wi-Fi</option>
                                            <option value="ethernet">Ethernet</option>
                                          </select>
                                        </div>
                                      </div>

                                      {row.telemetry_communication_via === 'sim' ? (
                                        <div className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                                          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Telemetry SIM</p>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-gray-700">SIM provider</Label>
                                              <select
                                                value={row.telemetry_sim_provider}
                                                onChange={(e) => patchRow({ telemetry_sim_provider: e.target.value })}
                                                className="w-full border border-gray-300 rounded-lg px-3 h-11"
                                              >
                                                <option value="">Select</option>
                                                <option value="airtel">Airtel</option>
                                                <option value="jio">Jio</option>
                                                <option value="bsnl">BSNL</option>
                                                <option value="vodafone">Vodafone</option>
                                                <option value="other">Other</option>
                                              </select>
                                            </div>
                                            {row.telemetry_sim_provider === 'other' ? (
                                              <div className="space-y-2">
                                                <Label className="text-sm font-medium text-gray-700">Provider (manual)</Label>
                                                <Input
                                                  value={row.telemetry_sim_provider_other}
                                                  onChange={(e) => patchRow({ telemetry_sim_provider_other: e.target.value })}
                                                  className="h-11"
                                                />
                                              </div>
                                            ) : null}
                                            <div className="space-y-2 sm:col-span-2">
                                              <Label className="text-sm font-medium text-gray-700">SIM number</Label>
                                              <Input
                                                value={row.telemetry_sim_number}
                                                onChange={(e) => patchRow({ telemetry_sim_number: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-gray-700">SIM valid from</Label>
                                              <Input
                                                type="date"
                                                value={row.telemetry_sim_valid_from}
                                                onChange={(e) => patchRow({ telemetry_sim_valid_from: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-gray-700">SIM valid to</Label>
                                              <Input
                                                type="date"
                                                value={row.telemetry_sim_valid_to}
                                                onChange={(e) => patchRow({ telemetry_sim_valid_to: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ) : null}

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry product code</Label>
                                          <Input
                                            value={row.telemetry_product_code}
                                            onChange={(e) => patchRow({ telemetry_product_code: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry serial number</Label>
                                          <Input
                                            value={row.telemetry_serial_number}
                                            onChange={(e) => patchRow({ telemetry_serial_number: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                      </div>

                                      <CgwMultiFilePicker
                                        label="Telemetry device photos"
                                        accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                                        imageOnly
                                        files={flowFiles.telemetryPhotoFiles}
                                        onChange={(telemetryPhotoFiles) => patchFlowFiles({ telemetryPhotoFiles })}
                                        hint="Multiple images; uploads after save (S3)."
                                        className="rounded-md border border-gray-200 bg-white p-3"
                                      />

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-2 sm:col-span-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry portal URL</Label>
                                          <Input
                                            type="url"
                                            value={row.telemetry_portal_url}
                                            onChange={(e) => patchRow({ telemetry_portal_url: e.target.value })}
                                            placeholder="https://…"
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry username</Label>
                                          <Input
                                            value={row.telemetry_username}
                                            onChange={(e) => patchRow({ telemetry_username: e.target.value })}
                                            className="h-11"
                                            autoComplete="off"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry password</Label>
                                          <Input
                                            type="password"
                                            value={row.telemetry_password}
                                            onChange={(e) => patchRow({ telemetry_password: e.target.value })}
                                            className="h-11"
                                            autoComplete="new-password"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry valid from</Label>
                                          <Input
                                            type="date"
                                            value={row.telemetry_valid_from}
                                            onChange={(e) => patchRow({ telemetry_valid_from: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-gray-700">Telemetry valid to</Label>
                                          <Input
                                            type="date"
                                            value={row.telemetry_valid_to}
                                            onChange={(e) => patchRow({ telemetry_valid_to: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700">Telemetry uploaded in previous year?</Label>
                                        <select
                                          value={row.telemetry_uploaded_previous_year}
                                          onChange={(e) => patchRow({ telemetry_uploaded_previous_year: e.target.value })}
                                          className="w-full border border-gray-300 rounded-lg px-3 h-11 max-w-md"
                                        >
                                          <option value="">Select</option>
                                          <option value="yes">Yes</option>
                                          <option value="no">No</option>
                                        </select>
                                      </div>

                                      {row.telemetry_uploaded_previous_year === 'yes' ? (
                                        <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3 space-y-3">
                                          <div className="space-y-2">
                                            <Label className="text-sm font-medium text-gray-700">Prior telemetry serial number</Label>
                                            <select
                                              value={row.telemetry_previous_serial_pick}
                                              onChange={(e) => patchRow({ telemetry_previous_serial_pick: e.target.value })}
                                              className="w-full border border-gray-300 rounded-lg px-3 h-11"
                                            >
                                              <option value="">Select serial</option>
                                              {telemetrySerialOptions.map((s) => (
                                                <option key={s} value={s}>
                                                  {s}
                                                </option>
                                              ))}
                                              <option value="__manual__">Other (enter manually)</option>
                                            </select>
                                          </div>
                                          {row.telemetry_previous_serial_pick === '__manual__' ? (
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-gray-700">Serial number (manual)</Label>
                                              <Input
                                                value={row.telemetry_previous_serial_free}
                                                onChange={(e) => patchRow({ telemetry_previous_serial_free: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                          ) : null}

                                          <div className="space-y-2">
                                            <Label className="text-sm font-medium text-gray-700">Old telemetry data available?</Label>
                                            <select
                                              value={row.telemetry_previous_data_available}
                                              onChange={(e) => patchRow({ telemetry_previous_data_available: e.target.value })}
                                              className="w-full border border-gray-300 rounded-lg px-3 h-11 max-w-md"
                                            >
                                              <option value="">Select</option>
                                              <option value="yes">Yes</option>
                                              <option value="no">No</option>
                                            </select>
                                          </div>

                                          {row.telemetry_previous_data_available === 'yes' ? (
                                            <div className="space-y-3 pt-1 border-t border-gray-200">
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                  <Label className="text-sm font-medium text-gray-700">Old data from</Label>
                                                  <Input
                                                    type="date"
                                                    value={row.telemetry_previous_data_from}
                                                    onChange={(e) => patchRow({ telemetry_previous_data_from: e.target.value })}
                                                    className="h-11"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-sm font-medium text-gray-700">Old data to</Label>
                                                  <Input
                                                    type="date"
                                                    value={row.telemetry_previous_data_to}
                                                    onChange={(e) => patchRow({ telemetry_previous_data_to: e.target.value })}
                                                    className="h-11"
                                                  />
                                                </div>
                                              </div>
                                              <CgwMultiFilePicker
                                                label="Upload Excel data"
                                                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                                                files={flowFiles.telemetry_excel}
                                                onChange={(telemetry_excel) => patchFlowFiles({ telemetry_excel })}
                                              />
                                              <CgwMultiFilePicker
                                                label="Prior-year telemetry service report"
                                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                                files={flowFiles.telemetry_service}
                                                onChange={(telemetry_service) => patchFlowFiles({ telemetry_service })}
                                                hint="Optional; uploads as prior-year telemetry report."
                                              />
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 px-3 border-gray-200 text-red-600 hover:bg-red-50 shrink-0"
                                  disabled={equipmentRows.length === 1}
                                  onClick={() => {
                                    setEquipmentRows((prev) => prev.filter((_, i) => i !== idx));
                                    setEquipmentFlowFiles((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove
                                </Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {addStep === 4 && needsPiezometerWizardStep ? (
                  <div className="rounded-lg border border-gray-200 bg-slate-50/40 p-4">
                    <PiezometerAddWizardStep
                      piezometerRows={piezometerRows}
                      setPiezometerRows={setPiezometerRows}
                      piezometerFiles={piezometerFiles}
                      setPiezometerFiles={setPiezometerFiles}
                      telemetrySerialOptions={telemetrySerialOptions}
                      countLabel={`${piezometerWizardCount} piezometer${piezometerWizardCount !== 1 ? 's' : ''} (NOC count ${String(addNocForm.piezometer_count || '').trim() || '—'})`}
                    />
                  </div>
                ) : null}

                {addStep === (needsPiezometerWizardStep ? 5 : 4) ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                      <p className="text-sm font-semibold text-gray-800">Additional attachment</p>
                      {equipmentRows.map((row, idx) => {
                        const flowFiles = equipmentFlowFiles[idx] || {};
                        const patchFlowFiles = (patch) =>
                          setEquipmentFlowFiles((prev) =>
                            prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
                          );
                        const patchRow = (patch) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                        const docAccept =
                          '.pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.csv,application/pdf,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
                        return (
                          <div key={`add-attach-${idx}`} className="rounded-md border border-gray-200 bg-gray-50/60 p-3 space-y-3">
                            <p className="text-xs font-semibold text-gray-700">Flow metre line {idx + 1}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <CgwMultiFilePicker
                                label="Water quality certificate"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.water_quality_certificate}
                                onChange={(water_quality_certificate) => patchFlowFiles({ water_quality_certificate })}
                              />
                              <CgwMultiFilePicker
                                label="CTE"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.cte}
                                onChange={(cte) => patchFlowFiles({ cte })}
                              />
                              <CgwMultiFilePicker
                                label="CTO"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.cto}
                                onChange={(cto) => patchFlowFiles({ cto })}
                              />
                              <CgwMultiFilePicker
                                label="RWSS/WATCO/PHED NOC"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.rwss_watco_phed_noc}
                                onChange={(rwss_watco_phed_noc) => patchFlowFiles({ rwss_watco_phed_noc })}
                              />
                              <CgwMultiFilePicker
                                label="Approval letter"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.approval_letter}
                                onChange={(approval_letter) => patchFlowFiles({ approval_letter })}
                              />
                              <CgwMultiFilePicker
                                label="Rain water harvesting data"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.rain_water_harvesting_data}
                                onChange={(rain_water_harvesting_data) => patchFlowFiles({ rain_water_harvesting_data })}
                              />
                            </div>
                            <div className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                              <p className="text-sm font-semibold text-gray-800">Additional doc</p>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-gray-700">Document type</Label>
                                <Input
                                  value={row.additional_document_type}
                                  onChange={(e) => patchRow({ additional_document_type: e.target.value })}
                                  className="h-11"
                                />
                              </div>
                              <CgwMultiFilePicker
                                label="Doc"
                                accept={docAccept}
                                files={flowFiles.additional_doc}
                                onChange={(additional_doc) => patchFlowFiles({ additional_doc })}
                                hint="Optional."
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-between gap-3 pt-2">
                  <div>
                    {addStep > 1 && (
                      <Button type="button" variant="outline" onClick={goAddPrevStep} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                        Back
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                      Cancel
                    </Button>
                    {addStep < addWizardFinalStep ? (
                      <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={goAddNextStep}>
                        Next
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={addWizardSubmitting}
                        className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        onClick={handleSubmit}
                      >
                        {addWizardSubmitting ? 'Saving…' : editMode ? 'Update Item' : 'Add Item'}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <Card className="p-4 sm:p-5 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search across all columns…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border border-gray-300 h-10 rounded-lg text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </Card>

      {canManage && SHOW_CGW_DIGEST_EMAIL_SECTION && (
        <Card className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
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

      {/* Inventory grid */}
      {filteredItems.length > 0 ? (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-auto table-scroll max-h-[calc(100vh-220px)] scrollbar-thin" style={{ scrollbarWidth: 'auto' }}>
            <table className="w-full text-sm min-w-[8400px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {cgwGridSectionsOpen.customer ? (
                    <th
                      colSpan={CGW_GRID_SECTION_COLSPANS.customer.open}
                      className="text-center py-2.5 px-2 font-semibold text-sky-900 bg-sky-100/80 border-r border-sky-200"
                    >
                      <CgwGridSectionHeader title="1 · Customer" isOpen={cgwGridSectionsOpen.customer} onToggle={() => toggleCgwGridSection('customer')} />
                    </th>
                  ) : (
                    <th rowSpan={2} className="align-middle text-center py-2 px-2 font-semibold text-sky-900 bg-sky-100/80 border-r border-sky-200 min-w-[100px]">
                      <CgwGridSectionHeader title="1 · Customer" isOpen={cgwGridSectionsOpen.customer} onToggle={() => toggleCgwGridSection('customer')} />
                    </th>
                  )}
                  {cgwGridSectionsOpen.noc ? (
                    <th colSpan={CGW_GRID_SECTION_COLSPANS.noc.open} className="text-center py-2.5 px-2 font-semibold text-cyan-900 bg-cyan-100/80 border-r border-cyan-200">
                      <CgwGridSectionHeader title="2 · NOC" isOpen={cgwGridSectionsOpen.noc} onToggle={() => toggleCgwGridSection('noc')} />
                    </th>
                  ) : (
                    <th rowSpan={2} className="align-middle text-center py-2 px-2 font-semibold text-cyan-900 bg-cyan-100/80 border-r border-cyan-200 min-w-[100px]">
                      <CgwGridSectionHeader title="2 · NOC" isOpen={cgwGridSectionsOpen.noc} onToggle={() => toggleCgwGridSection('noc')} />
                    </th>
                  )}
                  {cgwGridSectionsOpen.flowMetre ? (
                    <th colSpan={CGW_GRID_SECTION_COLSPANS.flowMetre.open} className="text-center py-2.5 px-2 font-semibold text-indigo-900 bg-indigo-100/80 border-r border-indigo-200">
                      <CgwGridSectionHeader title="3 · Flow metre details" isOpen={cgwGridSectionsOpen.flowMetre} onToggle={() => toggleCgwGridSection('flowMetre')} />
                    </th>
                  ) : (
                    <th rowSpan={2} className="align-middle text-center py-2 px-2 font-semibold text-indigo-900 bg-indigo-100/80 border-r border-indigo-200 min-w-[120px]">
                      <CgwGridSectionHeader title="3 · Flow metre details" isOpen={cgwGridSectionsOpen.flowMetre} onToggle={() => toggleCgwGridSection('flowMetre')} />
                    </th>
                  )}
                  {cgwGridSectionsOpen.piezometer ? (
                    <th colSpan={CGW_GRID_SECTION_COLSPANS.piezometer.open} className="text-center py-2.5 px-2 font-semibold text-violet-900 bg-violet-100/80 border-r border-violet-200">
                      <CgwGridSectionHeader title="4 · Piezometer" isOpen={cgwGridSectionsOpen.piezometer} onToggle={() => toggleCgwGridSection('piezometer')} />
                    </th>
                  ) : (
                    <th rowSpan={2} className="align-middle text-center py-2 px-2 font-semibold text-violet-900 bg-violet-100/80 border-r border-violet-200 min-w-[100px]">
                      <CgwGridSectionHeader title="4 · Piezometer" isOpen={cgwGridSectionsOpen.piezometer} onToggle={() => toggleCgwGridSection('piezometer')} />
                    </th>
                  )}
                  {cgwGridSectionsOpen.lifecycleAdditional ? (
                    <th colSpan={CGW_GRID_SECTION_COLSPANS.lifecycleAdditional.open} className="text-center py-2.5 px-2 font-semibold text-amber-900 bg-amber-100/80 border-r border-amber-200">
                      <CgwGridSectionHeader title="5 · Additional attachment" isOpen={cgwGridSectionsOpen.lifecycleAdditional} onToggle={() => toggleCgwGridSection('lifecycleAdditional')} />
                    </th>
                  ) : (
                    <th rowSpan={2} className="align-middle text-center py-2 px-2 font-semibold text-amber-900 bg-amber-100/80 border-r border-amber-200 min-w-[120px]">
                      <CgwGridSectionHeader title="5 · Additional attachment" isOpen={cgwGridSectionsOpen.lifecycleAdditional} onToggle={() => toggleCgwGridSection('lifecycleAdditional')} />
                    </th>
                  )}
                  {canManage && (
                    <th rowSpan={2} className="text-left py-3 px-4 font-semibold text-gray-700 whitespace-nowrap border-l border-gray-200 align-middle bg-gray-50">
                      ACTIONS
                    </th>
                  )}
                </tr>
                <tr className="border-b border-gray-200 bg-gray-50/90">
                  {cgwGridSectionsOpen.customer ? (
                    <>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">CUSTOMER ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">CUSTOMER NAME</th>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">LOCATION</th>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">CONTACT PERSON</th>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">SYSTEM MOBILE</th>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">PERSON MOBILE</th>
                      <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">EMAIL ID</th>
                    </>
                  ) : null}
                  {cgwGridSectionsOpen.noc ? (
                    <>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap min-w-[108px] align-top">
                        <span className="block leading-snug">NOC</span>
                        <span className="mt-0.5 block text-[10px] font-normal text-gray-500 leading-tight">Per equipment row</span>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">PROJECT NAME</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">NOC NUMBER</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">APPLICATION NO</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">NOC VALID FROM</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 align-top min-w-[120px] whitespace-normal">
                        <span className="block leading-snug">NOC VALID UPTO</span>
                        <span className="mt-1 block text-[10px] font-normal text-gray-500 leading-tight">
                          <span className="text-red-600 font-semibold">Red</span> = expired · <span className="text-amber-700 font-semibold">Amber</span> = ≤30 days
                        </span>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">NOC TYPE</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">PROJECT STATUS</th>
                    </>
                  ) : null}
                  {cgwGridSectionsOpen.flowMetre ? (
                    <>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">FLOW METER MAKE</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">FLOW METER SIZE</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">FLOW METER SERIAL</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">CALIBRATION FROM</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">CALIBRATION TO</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEMETRY APPLICABLE</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEMETRY COMPANY</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">COMM VIA</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">SIM / VALIDITY</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM PRODUCT CODE</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM SERIAL</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM PORTAL URL</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM USER</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM PASSWORD</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM VALID FROM</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">TELEM VALID TO</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 whitespace-nowrap">PRIOR TELEMETRY</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-fuchsia-900 bg-fuchsia-50/90 whitespace-nowrap">FLOW BW GEO</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-fuchsia-900 bg-fuchsia-50/90 whitespace-nowrap">FLOW CALIBRATION</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-fuchsia-900 bg-fuchsia-50/90 whitespace-nowrap">FLOW SERVICE</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-fuchsia-900 bg-fuchsia-50/90 whitespace-nowrap">TELEMETRY PHOTOS</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-fuchsia-900 bg-fuchsia-50/90 whitespace-nowrap">TELEMETRY EXCEL</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-fuchsia-900 bg-fuchsia-50/90 whitespace-nowrap">TELEMETRY SERVICE</th>
                    </>
                  ) : null}
                  {cgwGridSectionsOpen.piezometer ? (
                    <>
                      <th className="text-left py-2.5 px-4 font-semibold text-violet-900 bg-violet-50 whitespace-nowrap">PIEZOMETER (NOC | ENTERED)</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-violet-900 bg-violet-50 whitespace-nowrap">PIEZO BW</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-violet-900 bg-violet-50 whitespace-nowrap">PIEZO CALIBRATION</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-violet-900 bg-violet-50 whitespace-nowrap">PIEZO TELEMETRY</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-violet-900 bg-violet-50 whitespace-nowrap">PIEZO EXCEL</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-violet-900 bg-violet-50 whitespace-nowrap">PIEZO SERVICE</th>
                    </>
                  ) : null}
                  {cgwGridSectionsOpen.lifecycleAdditional ? (
                    <>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">WATER QUALITY</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">CTE</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">CTO</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">RWSS/WATCO/PHED</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">APPROVAL LETTER</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">RAIN WATER</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-amber-900 bg-amber-50/90 whitespace-nowrap">ADDITIONAL DOC</th>
                    </>
                  ) : null}
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

                  const customerLineIdBase = String(
                    customerCodeById.get(groupAnchor.customer_id) || groupAnchor.customer_id || ''
                  ).trim();

                  return group.rows.map((item, rowIndex) => (
                    <tr key={item.id} className={`${rowRenewalClass} align-top`}>
                      {cgwGridSectionsOpen.customer ? (
                        <>
                          {/* Customer ID on every sub-row (no rowspan) so line 2+ still shows id + CUST…-n */}
                          <td className="py-3 px-4 text-gray-800 whitespace-nowrap bg-sky-50/40 font-mono text-[11px] align-top">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold">
                                {customerCodeById.get(groupAnchor.customer_id) || groupAnchor.customer_id || '—'}
                              </span>
                              {group.rows.length > 1 ? (
                                <span
                                  className="text-[9px] font-medium text-sky-950/80 tabular-nums"
                                  title="Sub-line within this customer"
                                >
                                  {customerLineIdBase && customerLineIdBase !== '—'
                                    ? `${customerLineIdBase}-${rowIndex + 1}`
                                    : `Line ${rowIndex + 1}`}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 font-medium text-gray-900 whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? (
                                <Input value={inlineEditData.customer_name} onChange={(e) => handleInlineChange('customer_name', e.target.value)} className="h-7 text-[11px] px-2" />
                              ) : (groupAnchor.customer_name || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? <Input value={inlineEditData.location} onChange={(e) => handleInlineChange('location', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.location || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? <Input value={inlineEditData.contact_person} onChange={(e) => handleInlineChange('contact_person', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.contact_person || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? <Input value={inlineEditData.system_mobile_number} onChange={(e) => handleInlineChange('system_mobile_number', e.target.value)} className="h-7 text-[11px] px-2" /> : (groupAnchor.system_mobile_number || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap bg-sky-50/40">
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
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 min-w-[180px] bg-sky-50/40">
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
                        </>
                      ) : rowIndex === 0 ? (
                        <td rowSpan={group.rows.length} className="py-3 px-3 text-gray-800 bg-sky-50/40 align-top max-w-[200px]">
                          <p className="text-[11px] font-mono font-semibold text-gray-900 truncate" title={String(customerCodeById.get(groupAnchor.customer_id) || groupAnchor.customer_id || '')}>
                            {customerCodeById.get(groupAnchor.customer_id) || groupAnchor.customer_id || '—'}
                          </p>
                          {group.rows.length > 1 ? (
                            <p className="text-[9px] font-mono text-sky-900/90 mt-1 leading-snug">
                              {customerLineIdBase && customerLineIdBase !== '—'
                                ? group.rows.map((_, i) => `${customerLineIdBase}-${i + 1}`).join(' · ')
                                : `${group.rows.length} lines`}
                            </p>
                          ) : null}
                          <p className="text-xs font-medium text-gray-900 truncate mt-1" title={groupAnchor.customer_name || ''}>
                            {groupAnchor.customer_name || '—'}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1 leading-snug line-clamp-3" title={groupAnchor.location || ''}>
                            {groupAnchor.location || '—'}
                          </p>
                        </td>
                      ) : null}

                      {cgwGridSectionsOpen.noc ? (
                        <>
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 align-top min-w-[108px] border-r border-cyan-100 bg-cyan-50/35">
                              <div className="space-y-2">
                                {group.rows.map((inv, invIdx) => {
                                  const subLineId =
                                    customerLineIdBase && customerLineIdBase !== '—'
                                      ? `${customerLineIdBase}-${invIdx + 1}`
                                      : inv.inventory_id || `—`;
                                  return (
                                  <div key={inv.id} className="rounded border border-gray-200 bg-gray-50/80 p-1.5">
                                    <p className="text-[9px] font-mono font-semibold text-gray-800 mb-0.5 truncate" title={subLineId}>
                                      {subLineId}
                                    </p>
                                    {customerLineIdBase && inv.inventory_id ? (
                                      <p className="text-[8px] font-mono text-gray-400 mb-1 truncate" title={inv.inventory_id}>
                                        {inv.inventory_id}
                                      </p>
                                    ) : null}
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
                                  );
                                })}
                              </div>
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 text-xs bg-cyan-50/35 max-w-[200px]">
                              <span className="line-clamp-4" title={groupAnchor.noc_project_name || ''}>{groupAnchor.noc_project_name || '—'}</span>
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap bg-cyan-50/35">{groupAnchor.noc_no || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap bg-cyan-50/35">{groupAnchor.noc_application_no || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 whitespace-nowrap font-mono text-[11px] bg-cyan-50/35">{groupAnchor.noc_valid_from || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 align-top bg-cyan-50/35">
                              <NocValidUptoColumnCell groupRows={group.rows} customerLineIdBase={customerLineIdBase} />
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 text-xs bg-cyan-50/35">{groupAnchor.noc_type || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-gray-600 text-xs bg-cyan-50/35">{groupAnchor.noc_project_status || '—'}</td>
                          )}
                        </>
                      ) : rowIndex === 0 ? (
                        <td rowSpan={group.rows.length} className="py-3 px-3 text-gray-800 bg-cyan-50/35 align-top text-xs">
                          <p className="font-mono font-medium">{groupAnchor.noc_no || groupAnchor.noc_application_no || '—'}</p>
                          <p className="text-[10px] text-gray-500 mt-1 line-clamp-2" title={groupAnchor.noc_project_name || ''}>
                            {groupAnchor.noc_project_name || ''}
                          </p>
                        </td>
                      ) : null}

                      {cgwGridSectionsOpen.flowMetre ? (
                        <>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input value={inlineEditData.flow_meter_make} onChange={(e) => handleInlineChange('flow_meter_make', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.flow_meter_make || '—')}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input value={inlineEditData.flow_meter_size} onChange={(e) => handleInlineChange('flow_meter_size', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.flow_meter_size || '—')}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap font-mono bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input value={inlineEditData.flow_meter_serial} onChange={(e) => handleInlineChange('flow_meter_serial', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.flow_meter_serial || '—')}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input type="date" value={inlineEditData.calibration_valid_from} onChange={(e) => handleInlineChange('calibration_valid_from', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.calibration_valid_from || '—')}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input type="date" value={inlineEditData.calibration_valid_to} onChange={(e) => handleInlineChange('calibration_valid_to', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.calibration_valid_to || '—')}
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-xs bg-indigo-50/35">{item.telemetry_applicable || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-xs bg-indigo-50/35 max-w-[140px]">
                            <span className="line-clamp-3" title={formatTelemetryCompanyDisplay(item)}>{formatTelemetryCompanyDisplay(item)}</span>
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-xs bg-indigo-50/35">{item.telemetry_communication_via || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-[11px] bg-indigo-50/35 max-w-[200px]">
                            <span className="line-clamp-3" title={formatTelemetrySimLine(item)}>{formatTelemetrySimLine(item)}</span>
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-xs font-mono bg-indigo-50/35">{item.telemetry_product_code || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-xs font-mono bg-indigo-50/35">{item.telemetry_serial_number || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-[11px] bg-indigo-50/35 max-w-[200px]">
                            {item.telemetry_portal_url ? (
                              <a href={item.telemetry_portal_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline break-all line-clamp-2">
                                {item.telemetry_portal_url}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-xs bg-indigo-50/35">{item.telemetry_username || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-xs bg-indigo-50/35">{item.telemetry_password ? '••••••' : '—'}</td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap font-mono text-[11px] bg-indigo-50/35">{item.telemetry_valid_from || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap font-mono text-[11px] bg-indigo-50/35">{item.telemetry_valid_to || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-[10px] bg-indigo-50/35 max-w-[220px]">
                            <span className="line-clamp-4 whitespace-normal" title={formatTelemetryPriorLine(item)}>{formatTelemetryPriorLine(item)}</span>
                          </td>
                          <td className="py-3 px-4 bg-fuchsia-50/30 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="bw_geo_flowmeter" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-fuchsia-50/30 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="calibration_certificate" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-fuchsia-50/30 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="service_report" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-fuchsia-50/30 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="telemetry" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-fuchsia-50/30 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="telemetry_excel_prior" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-fuchsia-50/30 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="telemetry_service_prior" onPreview={openMediaDialog} />
                          </td>
                        </>
                      ) : (
                        <td className="py-3 px-3 text-gray-800 bg-indigo-50/35 text-xs align-top">
                          <p className="font-mono font-medium">{item.flow_meter_serial || item.inventory_id || '—'}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{formatTelemetryCompanyDisplay(item)}</p>
                        </td>
                      )}

                      {cgwGridSectionsOpen.piezometer ? (
                        <>
                          <td className="py-3 px-4 text-gray-600 min-w-[220px] bg-violet-50/35 text-xs">
                            {piezometerSummaryCellText(item)}
                          </td>
                          <td className="py-3 px-4 bg-violet-50/20 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="piezometer_bw" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-violet-50/20 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="piezometer_calibration" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-violet-50/20 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="piezometer_telemetry" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-violet-50/20 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="piezometer_excel_prior" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-violet-50/20 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="piezometer_service_report" onPreview={openMediaDialog} />
                          </td>
                        </>
                      ) : (
                        <td className="py-3 px-3 text-gray-800 bg-violet-50/35 text-[11px] align-top max-w-[200px]">
                          <span className="line-clamp-4" title={piezometerSummaryCellText(item)}>{piezometerSummaryCellText(item)}</span>
                        </td>
                      )}

                      {cgwGridSectionsOpen.lifecycleAdditional ? (
                        <>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="water_quality_certificate" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="cte" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="cto" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="rwss_watco_phed_noc" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="approval_letter" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="rain_water_harvesting_data" onPreview={openMediaDialog} />
                          </td>
                          <td className="py-3 px-4 bg-amber-50/25 whitespace-nowrap">
                            <AttachmentPreviewCell item={item} category="additional_doc" onPreview={openMediaDialog} />
                          </td>
                        </>
                      ) : (
                        <td className="py-3 px-3 text-gray-800 bg-amber-50/30 text-xs align-top">
                          {(() => {
                            const cats = ['water_quality_certificate', 'cte', 'cto', 'rwss_watco_phed_noc', 'approval_letter', 'rain_water_harvesting_data', 'additional_doc'];
                            const n = cats.reduce((acc, k) => acc + (item?.cgw_attachments?.[k]?.length || 0), 0);
                            return (
                              <>
                                <p className="font-medium text-gray-900">Step 5 files</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{n ? `${n} file(s)` : 'None'}</p>
                              </>
                            );
                          })()}
                        </td>
                      )}

                      {canManage && (
                        <td className="py-3 px-4">
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
                                  className="h-7 w-7 p-0 border-gray-200 text-xs text-slate-700 hover:bg-slate-50"
                                  title="History"
                                  onClick={() => openHistoryDialog(item)}
                                >
                                  <History className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                                  title="Edit"
                                  onClick={() => handleEdit(item)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 border-gray-200 text-xs text-blue-700 hover:bg-blue-50"
                                  title="Download attachments ZIP"
                                  onClick={() => handleDownloadAttachmentsZip(item)}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 border-gray-200 text-xs text-red-600 hover:bg-red-50"
                                  title="Delete"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
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
          <div className="border-t border-gray-200 bg-gray-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
            <div className="text-gray-600">
              Showing customer groups <span className="font-medium text-gray-900">{totalGroups === 0 ? 0 : pageStartIndex + 1}</span> to{' '}
              <span className="font-medium text-gray-900">{Math.min(pageStartIndex + pageSize, totalGroups)}</span> of{' '}
              <span className="font-medium text-gray-900">{totalGroups}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-10 rounded-lg border border-gray-300 px-2 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-gray-700 min-w-[88px] text-center text-sm">
                Page {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
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
            'flex flex-col gap-0 p-0 overflow-hidden border-0 bg-white max-w-[min(1800px,99vw)] w-[min(1800px,99vw)]',
            'max-h-[min(96vh,100dvh)] h-[min(96vh,100dvh)] rounded-lg shadow-xl',
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
            <div className="relative min-h-[52vh] flex-1 min-w-0 basis-0 bg-neutral-900 border-b lg:min-h-0 lg:border-b-0 lg:border-r lg:border-gray-200">
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
            <div className="w-full shrink-0 space-y-2 overflow-y-auto border-t border-gray-200 bg-white p-3 lg:w-[min(280px,26vw)] lg:max-w-[280px] lg:border-l lg:border-t-0 lg:border-gray-200">
              <div className="rounded-md border border-gray-200 bg-gray-50/70 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-800">BHUNEER / no-cap portal</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">BHUNEER user ID</Label>
                  <Input
                    value={nocForm.bhuneer_user_id}
                    onChange={(e) => setNocForm((p) => ({ ...p, bhuneer_user_id: e.target.value }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="off"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">Password</Label>
                  <Input
                    type="password"
                    value={nocForm.bhuneer_password}
                    onChange={(e) => setNocForm((p) => ({ ...p, bhuneer_password: e.target.value }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="new-password"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">No cap user ID</Label>
                  <Input
                    value={nocForm.nocap_user_id}
                    onChange={(e) => setNocForm((p) => ({ ...p, nocap_user_id: e.target.value.toLowerCase() }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="off"
                    placeholder="stored lowercase"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">Password</Label>
                  <Input
                    type="password"
                    value={nocForm.nocap_password}
                    onChange={(e) => setNocForm((p) => ({ ...p, nocap_password: e.target.value }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="new-password"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
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
                <Label className="text-xs font-medium text-gray-700">Project address</Label>
                <Input
                  value={nocForm.project_address}
                  onChange={(e) => setNocForm((p) => ({ ...p, project_address: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Communication address</Label>
                <Input
                  value={nocForm.communication_address}
                  onChange={(e) => setNocForm((p) => ({ ...p, communication_address: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Project status</Label>
                <select
                  value={nocForm.project_status}
                  onChange={(e) => setNocForm((p) => ({ ...p, project_status: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="w-full border border-gray-300 rounded-md px-2 h-9 text-sm"
                >
                  <option value="">—</option>
                  <option value="existing_ground_water">Existing ground water</option>
                  <option value="new_ground_water">New ground water</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">NOC type</Label>
                <select
                  value={nocForm.noc_type}
                  onChange={(e) => setNocForm((p) => ({ ...p, noc_type: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="w-full border border-gray-300 rounded-md px-2 h-9 text-sm"
                >
                  <option value="">—</option>
                  <option value="new">New</option>
                  <option value="renewal">Renewal</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">M3 per day</Label>
                <Input
                  value={nocForm.permitted_m3_per_day}
                  onChange={(e) => setNocForm((p) => ({ ...p, permitted_m3_per_day: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">M3 per year</Label>
                <Input
                  value={nocForm.permitted_m3_per_year}
                  onChange={(e) => setNocForm((p) => ({ ...p, permitted_m3_per_year: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Existing BW count</Label>
                <Input
                  value={nocForm.existing_bw_count}
                  onChange={(e) => setNocForm((p) => ({ ...p, existing_bw_count: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Total proposed BW count</Label>
                <Input
                  value={nocForm.total_proposed_bw_count}
                  onChange={(e) => setNocForm((p) => ({ ...p, total_proposed_bw_count: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="rounded-md border border-gray-100 p-2 space-y-2">
                <p className="text-[11px] font-semibold text-gray-700">Dewatering / structure</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">Flowmeter applicable</Label>
                  <select
                    value={nocForm.flowmeter_applicable}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNocForm((p) => ({
                        ...p,
                        flowmeter_applicable: v,
                        flowmeter_count: v === 'yes' ? p.flowmeter_count : '',
                      }));
                    }}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    className="w-full border border-gray-300 rounded-md px-2 h-9 text-sm"
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {nocForm.flowmeter_applicable === 'yes' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-700">Flowmeter count</Label>
                    <Input
                      value={nocForm.flowmeter_count}
                      onChange={(e) => setNocForm((p) => ({ ...p, flowmeter_count: e.target.value }))}
                      disabled={nocReadOnly || !nocSideFieldsEditable}
                      className="h-9 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">Piezometer applicable</Label>
                  <select
                    value={nocForm.piezometer_applicable}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNocForm((p) => ({
                        ...p,
                        piezometer_applicable: v,
                        piezometer_count: v === 'yes' ? p.piezometer_count : '',
                      }));
                    }}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    className="w-full border border-gray-300 rounded-md px-2 h-9 text-sm"
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {nocForm.piezometer_applicable === 'yes' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-700">Piezometer count</Label>
                    <Input
                      value={nocForm.piezometer_count}
                      onChange={(e) => setNocForm((p) => ({ ...p, piezometer_count: e.target.value }))}
                      disabled={nocReadOnly || !nocSideFieldsEditable}
                      className="h-9 text-sm"
                    />
                  </div>
                )}
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

      <Dialog
        open={historyDialogOpen}
        onOpenChange={(open) => {
          setHistoryDialogOpen(open);
          if (!open) setHistoryItem(null);
        }}
      >
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Created by</p>
              <p className="font-medium text-gray-900">{historyItem?.created_by_name || '—'}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Created date</p>
              <p className="font-medium text-gray-900">{formatHistoryDateTime(historyItem?.created_at)}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Last modified by</p>
              <p className="font-medium text-gray-900">{historyItem?.last_modified_by_name || historyItem?.created_by_name || '—'}</p>
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
                const shouldStream = mediaIsStreamableRemoteUrl(href);
                const previewSrc = shouldStream ? mediaPreviewObjectUrl : href;
                const effectivePdf = shouldStream ? mediaIsPdf(sel?.file_name || href) : mediaIsPdf(href);
                const effectiveImage = shouldStream ? mediaIsImage(sel?.file_name || href) : mediaIsImage(href);
                if (!href) {
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-500 p-6 text-center">
                      Select a file from the list to preview.
                    </div>
                  );
                }
                if (shouldStream && mediaPreviewLoading) {
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600 p-6 text-center">
                      Loading file preview...
                    </div>
                  );
                }
                if (shouldStream && mediaPreviewError) {
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600 p-6 text-center">
                      {mediaPreviewError}
                    </div>
                  );
                }
                if (effectivePdf && previewSrc) {
                  return <iframe title="Preview" src={previewSrc} className="absolute inset-0 h-full w-full border-0 bg-white" />;
                }
                if (effectiveImage && previewSrc) {
                  return (
                    <div className="absolute inset-0 overflow-auto bg-gray-100 flex items-center justify-center p-2">
                      <img src={previewSrc} alt="" className="max-h-full max-w-full object-contain" />
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

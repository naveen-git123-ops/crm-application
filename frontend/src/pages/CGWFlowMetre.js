import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/page';
import { Plus, Minus, Edit, Trash2, Search, Mail, Phone, Filter, X, FileText, Eye, Upload, Download, History, Save, Calendar, Check, SearchX, FolderOpen, ChevronDown, MapPin } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { userCanDeleteCgw, userCanManageCgw, userCanEditCgwRecord, userCanEditSubmittedCgw, isAdminUser } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import PiezometerAddWizardStep, {
  EMPTY_PIEZO_ROW,
  EMPTY_PIEZO_FILES,
  piezoRowToPersist,
} from './PiezometerAddWizardStep';
import { CgwMultiFilePicker, normalizeFileList } from '@/components/CgwMultiFilePicker';
import { CgwCustomerPreviewDialog } from '@/components/CgwCustomerPreviewDialog';

const API = API_ENDPOINT;
export const VIEW_CGWA_PATH = '/view-cgwa';
export const CREATE_CGWA_PATH = '/create-cgwa';
export const DRAFTS_CGWA_PATH = '/my-cgwa-drafts';

function parseCgwWizardDraft(item) {
  try {
    const raw = item?.wizard_draft_json;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

const DRAFT_STEP_TITLES = {
  1: 'Customer',
  2: 'NOC',
  3: 'Flow metre',
  4: 'Piezometer',
  5: 'Additional attachment',
};

const CGW_STEP_HINTS = {
  Customer: 'Choose the customer and confirm the contact details.',
  NOC: 'Upload the NOC document and record its validity period.',
  'Flow metre': 'Add every flow metre with its calibration and telemetry details.',
  'Flow metre details': 'Add every flow metre with its calibration and telemetry details.',
  Piezometer: 'Record piezometer details and supporting files.',
  'Additional attachment': 'Attach any remaining approvals, certificates and documents.',
};

function cgwDraftProgressLabel(item) {
  const snap = parseCgwWizardDraft(item);
  const step = Math.max(1, Number(snap?.addStep) || 1);
  const title = DRAFT_STEP_TITLES[step] || `Step ${step}`;
  return `Step ${step} · ${title}`;
}

/** Categories persisted in cgw_attachments_json (aligned with server CGW_MEDIA_ATTACHMENT_KEYS). */
const CGW_MEDIA_KEYS = [
  'bw_geo_flowmeter',
  'calibration_certificate',
  'service_report',
  'telemetry',
  'telemetry_excel_prior',
  'telemetry_service_prior',
  'telemetry_service_report',
  'piezometer_bw',
  'piezometer_calibration',
  'piezometer_telemetry',
  'piezometer_excel_prior',
  'piezometer_service_report',
  'piezometer_service',
  'piezometer_telemetry_service',
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
  telemetry_service_report: 'Telemetry service report',
  piezometer_bw: 'Piezometer BW photos',
  piezometer_calibration: 'Piezometer calibration',
  piezometer_telemetry: 'Piezometer telemetry photos',
  piezometer_excel_prior: 'Piezometer Excel (prior)',
  piezometer_service_report: 'Piezometer prior-year service report',
  piezometer_service: 'Piezometer service report',
  piezometer_telemetry_service: 'Piezometer telemetry service report',
  water_quality_certificate: 'Water quality certificate',
  cte: 'CTE',
  cto: 'CTO',
  rwss_watco_phed_noc: 'RWSS/WATCO/PHED NOC',
  approval_letter: 'Approval letter',
  rain_water_harvesting_data: 'Rain water harvesting data',
  additional_doc: 'Additional document',
};

function cgwUploadCategoryLabel(category) {
  if (category === 'noc') return 'NOC PDF';
  return CGW_MEDIA_LABELS[category] || category || 'File';
}

function cgwIdSortParts(id) {
  const match = String(id || '').trim().toUpperCase().match(/^CGWA(\d+)(?:-(\d+))?$/);
  if (!match) return [Number.MAX_SAFE_INTEGER, String(id || '')];
  return [parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : 0];
}

function compareCgwaIds(a, b) {
  const [aRoot, aSuffix] = cgwIdSortParts(a);
  const [bRoot, bSuffix] = cgwIdSortParts(b);
  if (aRoot !== bRoot) return aRoot - bRoot;
  if (typeof aSuffix === 'number' && typeof bSuffix === 'number' && aSuffix !== bSuffix) {
    return aSuffix - bSuffix;
  }
  return String(a || '').localeCompare(String(b || ''));
}

/** True for dropped connections, timeouts and gateway hiccups, where trying the same request again is safe and useful. */
function isTransientNetworkError(error) {
  if (!error || error.__cancel) return false;
  if (!error.response) {
    return (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      /network error|timeout/i.test(String(error.message || ''))
    );
  }
  return [408, 425, 429, 502, 503, 504].includes(Number(error.response.status));
}

/**
 * Retries an idempotent request (file upload, draft overwrite) a couple of times when the connection
 * drops. Never use it for requests that create records, or a lost response could create duplicates.
 */
async function withNetworkRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || i === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

/** Record save succeeded; list any files that did not upload so the user can retry on the record. */
function notifyCgwSaveWithUploads(successMsg, failures) {
  const list = Array.isArray(failures) ? failures.filter(Boolean) : [];
  if (!list.length) {
    toast.success(successMsg);
    return;
  }
  toast.success(`${successMsg} Open the record to upload the failed file(s) again.`);
  const seen = new Set();
  const unique = list.filter((f) => {
    const key = `${f.category || ''}::${f.fileName || 'file'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const listed = unique
    .map((f) => `${cgwUploadCategoryLabel(f.category)}: "${f.fileName || 'file'}"`)
    .join('; ');
  const networkHint = unique.some((f) => f.network)
    ? ' The connection dropped while uploading. Your data is saved; check your internet and upload these files again from the record.'
    : '';
  toast.error(`File upload failed — ${listed}.${networkHint}`, { duration: 16000 });
}

/** Wizard-aligned grid sections: colspan when expanded vs collapsed (single summary column). */
const CGW_GRID_SECTION_COLSPANS = {
  /** Includes leading CGWA unique ID (inventory_id), then customer fields. */
  customer: { open: 7, collapsed: 2 },
  noc: { open: 8, collapsed: 1 },
  flowMetre: { open: 23, collapsed: 1 },
  piezometer: { open: 6, collapsed: 1 },
  /** Wizard step 5 only (no lifecycle fields — those are not on the create form). */
  lifecycleAdditional: { open: 7, collapsed: 1 },
};

/** Frozen View CGWA columns (CGWA ID + customer name) while the grid scrolls sideways. */
const cgwStickyId = 'sticky left-0 min-w-[148px] w-[148px] max-w-[148px]';
const cgwStickyName = 'sticky left-[148px] min-w-[200px] w-[200px] max-w-[200px]';
const cgwStickyIdHead = `${cgwStickyId} z-40 bg-muted border-r border-border`;
const cgwStickyNameHead = `${cgwStickyName} z-40 bg-muted shadow-[6px_0_10px_-6px_rgba(15,23,42,0.12)]`;
const cgwStickyPairHead = 'sticky left-0 z-40 bg-muted border-r border-border';
const cgwStickyIdCell = `${cgwStickyId} z-20 bg-card border-r border-border`;
const cgwStickyNameCell = `${cgwStickyName} z-20 bg-card shadow-[6px_0_10px_-6px_rgba(15,23,42,0.12)]`;
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
  flow_meter_commissioning_date: '',
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
  telemetry_commissioning_date: '',
  telemetry_sim_changed_count: '',
  telemetry_recharge_count: '',
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
  telemetry_service_report: [],
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

/** Map wizard pending-file bundle keys → API attachment category keys. */
const FLOW_BUNDLE_TO_API_CATEGORY = {
  bwGeoPhotos: 'bw_geo_flowmeter',
  calibration_cert: 'calibration_certificate',
  service_report: 'service_report',
  telemetry_service_report: 'telemetry_service_report',
  telemetryPhotoFiles: 'telemetry',
  telemetry_excel: 'telemetry_excel_prior',
  telemetry_service: 'telemetry_service_prior',
  water_quality_certificate: 'water_quality_certificate',
  cte: 'cte',
  cto: 'cto',
  rwss_watco_phed_noc: 'rwss_watco_phed_noc',
  approval_letter: 'approval_letter',
  rain_water_harvesting_data: 'rain_water_harvesting_data',
  additional_doc: 'additional_doc',
};

const PIEZO_BUNDLE_TO_API_CATEGORY = {
  bwPhotos: 'piezometer_bw',
  calibrationCert: 'piezometer_calibration',
  telemetryPhotos: 'piezometer_telemetry',
  telemetryExcel: 'piezometer_excel_prior',
  priorTelemetryService: 'piezometer_service_report',
  serviceReport: 'piezometer_service',
  telemetryServiceReport: 'piezometer_telemetry_service',
};

const WIZARD_DRAFT_VERSION = 1;

function buildWizardSnapshot({
  addStep,
  formData,
  equipmentRows,
  addNocForm,
  piezometerRows,
}) {
  return {
    version: WIZARD_DRAFT_VERSION,
    addStep,
    formData,
    equipmentRows,
    addNocForm,
    piezometerRows,
  };
}

function appendCgwNocFormData(fd, form, piezometerCount = '') {
  fd.append('project_name', form.project_name || '');
  fd.append('project_address', form.project_address || '');
  fd.append('communication_address', form.communication_address || '');
  fd.append('noc_no', form.noc_no || '');
  fd.append('application_no', form.application_no || '');
  fd.append('project_status', form.project_status || '');
  fd.append('noc_type', form.noc_type || '');
  fd.append('valid_from', form.valid_from || '');
  fd.append('valid_upto', form.valid_upto || '');
  fd.append('permitted_m3_per_day', form.permitted_m3_per_day || '');
  fd.append('permitted_m3_per_year', form.permitted_m3_per_year || '');
  fd.append('existing_bw_count', form.existing_bw_count || '');
  fd.append('total_proposed_bw_count', form.total_proposed_bw_count || '');
  fd.append('flowmeter_applicable', form.flowmeter_applicable || '');
  fd.append('flowmeter_count', form.flowmeter_count || '');
  fd.append('piezometer_applicable', form.piezometer_applicable || '');
  fd.append(
    'piezometer_count',
    form.piezometer_applicable === 'yes' ? String(piezometerCount || form.piezometer_count || '') : '',
  );
  fd.append('bhuneer_user_id', form.bhuneer_user_id || '');
  fd.append('bhuneer_password', form.bhuneer_password || '');
  fd.append('nocap_user_id', form.nocap_user_id || '');
  fd.append('nocap_password', form.nocap_password || '');
}

function equipmentRowFromItem(item) {
  const prevSerial = (item?.telemetry_previous_serial || '').trim();
  return {
    ...EMPTY_EQUIPMENT_ROW,
    equipment_name: item?.equipment_name || '',
    flowmeter_details: item?.flowmeter_details || '',
    product_code: item?.product_code || '',
    model_no: item?.model_no || '',
    flow_meter_make: item?.flow_meter_make || 'UPC',
    flow_meter_size: item?.flow_meter_size || '',
    flow_meter_serial: item?.flow_meter_serial || '',
    flow_meter_commissioning_date: item?.flow_meter_commissioning_date || '',
    calibration_valid_from: item?.calibration_valid_from || '',
    calibration_valid_to: item?.calibration_valid_to || '',
    telemetry_applicable: item?.telemetry_applicable || '',
    telemetry_company: item?.telemetry_company || '',
    telemetry_company_other: item?.telemetry_company_other || '',
    telemetry_communication_via: item?.telemetry_communication_via || '',
    telemetry_sim_provider: item?.telemetry_sim_provider || '',
    telemetry_sim_provider_other: item?.telemetry_sim_provider_other || '',
    telemetry_sim_number: item?.telemetry_sim_number || '',
    telemetry_sim_valid_from: item?.telemetry_sim_valid_from || '',
    telemetry_sim_valid_to: item?.telemetry_sim_valid_to || '',
    telemetry_product_code: item?.telemetry_product_code || '',
    telemetry_serial_number: item?.telemetry_serial_number || '',
    telemetry_commissioning_date: item?.telemetry_commissioning_date || '',
    telemetry_sim_changed_count: item?.telemetry_sim_changed_count || '',
    telemetry_recharge_count: item?.telemetry_recharge_count || '',
    telemetry_portal_url: item?.telemetry_portal_url || '',
    telemetry_username: item?.telemetry_username || '',
    telemetry_password: item?.telemetry_password || '',
    telemetry_valid_from: item?.telemetry_valid_from || '',
    telemetry_valid_to: item?.telemetry_valid_to || '',
    telemetry_uploaded_previous_year: item?.telemetry_uploaded_previous_year || '',
    telemetry_previous_serial_pick: prevSerial,
    telemetry_previous_serial_free: '',
    telemetry_previous_data_available: item?.telemetry_previous_data_available || '',
    telemetry_previous_data_from: item?.telemetry_previous_data_from || '',
    telemetry_previous_data_to: item?.telemetry_previous_data_to || '',
    additional_document_type: item?.additional_document_type || '',
  };
}

function formDataFromItem(item) {
  return {
    ...EMPTY_FORM,
    customer_id: item?.customer_id || '',
    customer_name: item?.customer_name || '',
    location: item?.location || '',
    contact_person: item?.contact_person || '',
    system_mobile_number: item?.system_mobile_number || '',
    person_mobile_number: item?.person_mobile_number || '',
    email_id: item?.email_id || '',
    date_of_commissioning: item?.date_of_commissioning || '',
    url_link: item?.url_link || '',
    user_id: item?.user_id || '',
    password: item?.password || '',
    status: item?.status || 'Active',
    renewal_date: item?.renewal_date || '',
    review: item?.review || '',
    remarks: item?.remarks || '',
  };
}

function nocFormFromItem(item) {
  return {
    bhuneer_user_id: item?.noc_bhuneer_user_id || '',
    bhuneer_password: item?.noc_bhuneer_password || '',
    nocap_user_id: item?.noc_nocap_user_id || '',
    nocap_password: item?.noc_nocap_password || '',
    project_name: item?.noc_project_name || '',
    project_address: item?.noc_project_address || '',
    communication_address: item?.noc_communication_address || '',
    noc_no: item?.noc_no || '',
    application_no: item?.noc_application_no || '',
    project_status: item?.noc_project_status || '',
    noc_type: item?.noc_type || '',
    valid_from: item?.noc_valid_from || '',
    valid_upto: item?.noc_valid_upto || '',
    permitted_m3_per_day: item?.noc_permitted_m3_per_day || '',
    permitted_m3_per_year: item?.noc_permitted_m3_per_year || '',
    existing_bw_count: item?.noc_existing_bw_count || '',
    total_proposed_bw_count: item?.noc_total_proposed_bw_count || '',
    flowmeter_applicable: item?.noc_flowmeter_applicable || '',
    flowmeter_count: item?.noc_flowmeter_count || '',
    piezometer_applicable: item?.noc_piezometer_applicable || '',
    piezometer_count: item?.noc_piezometer_count || '',
  };
}

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
  permitted_m3_per_year: '',
  permitted_m3_per_day: '',
  existing_bw_count: '',
  total_proposed_bw_count: '',
  flowmeter_applicable: '',
  flowmeter_count: '',
  piezometer_applicable: '',
  piezometer_count: '',
};

function nocFormFromRecord(rec) {
  return {
    bhuneer_user_id: rec?.bhuneer_user_id || '',
    bhuneer_password: rec?.bhuneer_password || '',
    nocap_user_id: rec?.nocap_user_id || '',
    nocap_password: rec?.nocap_password || '',
    project_name: rec?.project_name || '',
    project_address: rec?.project_address || '',
    communication_address: rec?.communication_address || '',
    noc_no: rec?.noc_no || '',
    application_no: rec?.application_no || '',
    project_status: rec?.project_status || '',
    noc_type: rec?.noc_type || '',
    valid_from: rec?.valid_from || '',
    valid_upto: rec?.valid_upto || '',
    permitted_m3_per_day: rec?.permitted_m3_per_day || '',
    permitted_m3_per_year: rec?.permitted_m3_per_year || '',
    existing_bw_count: rec?.existing_bw_count || '',
    total_proposed_bw_count: rec?.total_proposed_bw_count || '',
    flowmeter_applicable: rec?.flowmeter_applicable || '',
    flowmeter_count: rec?.flowmeter_count || '',
    piezometer_applicable: rec?.piezometer_applicable || '',
    piezometer_count: rec?.piezometer_count || '',
  };
}

function nocRecordsFromItem(item) {
  const list = Array.isArray(item?.noc_records) ? item.noc_records.filter(Boolean) : [];
  if (list.length) return list;
  const fallback = nocFormFromItem(item);
  if (item?.noc_document_url || fallback.noc_no || fallback.valid_from || fallback.valid_upto) {
    return [{
      id: 'legacy-current',
      document_url: item?.noc_document_url || '',
      file_name: 'NOC PDF',
      ...fallback,
    }];
  }
  return [];
}

function collectNocSearchValues(item) {
  const records = nocRecordsFromItem(item);
  const nocNumbers = [item?.noc_no, ...records.map((r) => r?.noc_no)]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  const applicationNumbers = [
    item?.noc_application_no,
    item?.application_no,
    ...records.map((r) => r?.application_no),
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  const projectNames = [item?.noc_project_name, ...records.map((r) => r?.project_name)]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return { nocNumbers, applicationNumbers, projectNames };
}

function listIncludesTerm(values, term) {
  if (!term) return true;
  return values.some((v) => v.includes(term));
}

function itemMatchesGlobalSearch(item, term, customerBizId = '') {
  if (!term) return true;
  const { nocNumbers, applicationNumbers, projectNames } = collectNocSearchValues(item);
  const fields = [
    customerBizId,
    item?.customer_id,
    item?.customer_name,
    item?.inventory_id,
    item?.location,
    item?.contact_person,
    item?.system_mobile_number,
    item?.person_mobile_number,
    item?.email_id,
    item?.equipment_name,
    item?.flowmeter_details,
    item?.product_code,
    item?.model_no,
    item?.flow_meter_make,
    item?.flow_meter_size,
    item?.flow_meter_serial,
    item?.telemetry_company,
    item?.telemetry_serial_number,
    item?.noc_project_name,
    item?.noc_type,
    item?.noc_project_status,
    item?.remarks,
    ...nocNumbers,
    ...applicationNumbers,
    ...projectNames,
  ];
  return fields.some((value) => String(value || '').toLowerCase().includes(term));
}

function isoToday() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function nocPeriodStatus(rec, today = isoToday()) {
  const vf = String(rec?.valid_from || '').slice(0, 10);
  const vu = String(rec?.valid_upto || '').slice(0, 10);
  if (vu && vu < today) return 'expired';
  if (vf && vf > today) return 'upcoming';
  if ((vf && vf <= today) && (!vu || vu >= today)) return 'active';
  return 'saved';
}

function pickCurrentNocRecord(records) {
  if (!records?.length) return null;
  const today = isoToday();
  const covering = records.filter((rec) => nocPeriodStatus(rec, today) === 'active');
  const pool = covering.length ? covering : records;
  return [...pool].sort((a, b) => String(b.valid_upto || '').localeCompare(String(a.valid_upto || '')))[0];
}

function formatNocPeriod(rec) {
  const vf = rec?.valid_from || '—';
  const vu = rec?.valid_upto || '—';
  return `${vf} → ${vu}`;
}
const FILTER_FIELDS = [
  'customer_name',
  'location',
  'contact_person',
  'noc_no',
  'noc_application_no',
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
  noc_no: 'NOC Number',
  noc_application_no: 'Application Number',
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
  { label: 'Customer & NOC', fields: ['customer_name', 'location', 'contact_person', 'noc_no', 'noc_application_no', 'noc_piezometer_applicable', 'noc_piezometer_count'] },
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

const NOC_VALID_UPTO_FILTER_OPTIONS = [
  { value: '', label: 'All NOC validity' },
  { value: 'expired', label: 'Expired (past valid upto)' },
  { value: 'expiring_90', label: 'Expiring in 90 days' },
  { value: 'expired_or_expiring_90', label: 'Expired or expiring in 90 days' },
];

const TELEM_VALID_TO_FILTER_OPTIONS = [
  { value: '', label: 'All telemetry validity' },
  { value: 'expired', label: 'Expired (past valid to)' },
  { value: 'expiring_90', label: 'Expiring in 90 days' },
  { value: 'expired_or_expiring_90', label: 'Expired or expiring in 90 days' },
];

function isNocValidUptoExpired(nocValidUptoRaw) {
  const dt = parseGridDate(nocValidUptoRaw);
  if (!dt) return false;
  const today = startOfLocalDay(new Date());
  return startOfLocalDay(dt).getTime() < today.getTime();
}

function isNocValidUptoExpiringWithinDays(nocValidUptoRaw, days) {
  const dt = parseGridDate(nocValidUptoRaw);
  if (!dt) return false;
  const today = startOfLocalDay(new Date());
  const validUpto = startOfLocalDay(dt);
  if (validUpto.getTime() < today.getTime()) return false;
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return validUpto.getTime() <= limit.getTime();
}

function matchesNocValidUptoFilter(nocValidUptoRaw, filter) {
  if (!filter) return true;
  if (!nocValidUptoRaw) return false;
  if (filter === 'expired') return isNocValidUptoExpired(nocValidUptoRaw);
  if (filter === 'expiring_90') return isNocValidUptoExpiringWithinDays(nocValidUptoRaw, 90);
  if (filter === 'expired_or_expiring_90') {
    return isNocValidUptoExpired(nocValidUptoRaw) || isNocValidUptoExpiringWithinDays(nocValidUptoRaw, 90);
  }
  return true;
}

/** Same rules as NOC valid upto — used for telemetry_valid_to column and filter. */
const matchesTelemValidToFilter = matchesNocValidUptoFilter;

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
          className="h-7 text-xs px-2"
        />
        {urgency === 'overdue' && (
          <span className="text-[11px] font-semibold text-red-600 leading-tight">Still past due — pick a future date</span>
        )}
        {urgency === 'dueSoon' && (
          <span className="text-[11px] font-medium text-amber-700 leading-tight">Due within 30 days</span>
        )}
      </div>
    );
  }
  const display = groupAnchor.renewal_date || '—';
  return (
    <div className="flex flex-col gap-0.5 min-w-[108px]">
      <span
        className={`font-mono tabular-nums text-xs font-semibold ${
          urgency === 'overdue'
            ? 'text-red-700'
            : urgency === 'dueSoon'
              ? 'text-amber-800'
              : urgency === 'ok'
                ? 'text-foreground'
                : 'text-muted-foreground'
        }`}
      >
        {display}
      </span>
      {urgency === 'overdue' && (
        <span className="text-[11px] font-bold uppercase tracking-wide text-red-600 leading-tight">Past due</span>
      )}
      {urgency === 'dueSoon' && (
        <span className="text-[11px] font-medium text-amber-700 leading-tight">Due in ≤30 days</span>
      )}
    </div>
  );
}

/** Single telemetry valid-to date with expired / due-soon styling (per grid row). */
function TelemValidToCell({ value }) {
  const tu = value ? renewalUrgency(value) : 'empty';
  if (!value) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 min-w-[108px]">
      <p className="text-xs font-mono tabular-nums leading-tight">
        <span
          className={
            tu === 'overdue'
              ? 'text-red-600 font-bold'
              : tu === 'dueSoon'
                ? 'text-amber-800 font-semibold'
                : 'text-foreground font-medium'
          }
        >
          {value}
        </span>
        {tu === 'overdue' ? (
          <span className="ml-1 text-[11px] font-bold text-red-600 uppercase tracking-wide">Expired</span>
        ) : null}
      </p>
      {tu === 'dueSoon' ? (
        <span className="text-[11px] font-medium text-amber-700 leading-tight">≤30 days</span>
      ) : null}
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
        const label = (r.inventory_id || r.equipment_name || '—').slice(0, 22);
        return (
          <div key={r.id} className="rounded border border-border bg-muted/60 px-1.5 py-1">
            <p className="text-[11px] text-muted-foreground truncate mb-0.5 font-mono" title={r.inventory_id}>
              {label}
            </p>
            {v ? (
              <p className="text-xs font-mono tabular-nums leading-tight">
                <span
                  className={
                    nu === 'overdue'
                      ? 'text-red-600 font-bold'
                      : nu === 'dueSoon'
                        ? 'text-amber-800 font-semibold'
                        : 'text-foreground font-medium'
                  }
                >
                  {v}
                </span>
                {nu === 'overdue' ? (
                  <span className="ml-1 text-[11px] font-bold text-red-600 uppercase tracking-wide">Expired</span>
                ) : null}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
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
  if (!count) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="No files">
        —
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs text-primary hover:bg-accent hover:text-accent-foreground"
      aria-label={`Preview ${count} ${count === 1 ? 'file' : 'files'}: ${cgwUploadCategoryLabel(category)}`}
      onClick={() => onPreview(item, category)}
    >
      <Eye className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
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
        className="h-8 w-8 p-0 shrink-0 text-current hover:bg-white/50"
        title={isOpen ? 'Collapse section' : 'Expand section'}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} section ${title}`}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        {isOpen ? <Minus className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
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

const CGW_MOBILE_FILE_GROUPS = [
  {
    title: 'Flow metre files',
    keys: ['bw_geo_flowmeter', 'calibration_certificate', 'service_report', 'telemetry', 'telemetry_excel_prior', 'telemetry_service_prior'],
  },
  {
    title: 'Piezometer files',
    keys: ['piezometer_bw', 'piezometer_calibration', 'piezometer_telemetry', 'piezometer_excel_prior', 'piezometer_service_report'],
  },
  {
    title: 'Additional files',
    keys: ['water_quality_certificate', 'cte', 'cto', 'rwss_watco_phed_noc', 'approval_letter', 'rain_water_harvesting_data', 'additional_doc'],
  },
];

/** Compact validity tile used on the mobile cards (colour + text, never colour alone). */
function CgwValidityChip({ label, value }) {
  const u = value ? renewalUrgency(value) : 'empty';
  const tone =
    u === 'overdue'
      ? 'border-red-200 bg-red-50 text-red-700'
      : u === 'dueSoon'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : u === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-border bg-muted text-muted-foreground';
  return (
    <div className={cn('min-w-0 rounded-lg border px-1.5 py-1.5', tone)}>
      <p className="truncate text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums">{value || '—'}</p>
      {u === 'overdue' ? (
        <p className="text-[10px] font-bold uppercase leading-tight">Expired</p>
      ) : u === 'dueSoon' ? (
        <p className="text-[10px] font-semibold leading-tight">Within 30 days</p>
      ) : null}
    </div>
  );
}

function CgwMobileSection({ title, rows }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '—');
  return (
    <section>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</h4>
      {visible.length ? (
        <dl className="mt-1.5 divide-y divide-border/70">
          {visible.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 py-2 text-sm">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-right font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Nothing recorded.</p>
      )}
    </section>
  );
}

/** Phone-friendly card for one customer group (replaces the 60-column grid below md). */
function CgwMobileGroupCard({ group, canManage, canDeleteCgw, onOpenGroup, onEdit, onDelete, onOpenNoc, onOpenMedia }) {
  const [expanded, setExpanded] = useState(false);
  const anchor = group.rows[0] || {};
  const name = anchor.customer_name || 'Unnamed customer';
  const urgency = renewalUrgency(anchor.renewal_date);
  const accent =
    urgency === 'overdue' ? 'border-l-red-500' : urgency === 'dueSoon' ? 'border-l-amber-400' : 'border-l-primary/40';
  const phone = (anchor.person_mobile_number || anchor.system_mobile_number || '').toString().trim();
  const email = (anchor.email_id || '').toString().trim();
  const panelId = `cgw-mobile-panel-${anchor.id}`;
  const unitCount = group.rows.length;
  const isDraft = (item) => String(item?.status || '').toLowerCase() === 'draft';
  const actionBtn = 'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <article
      aria-label={`CGWA records for ${name}`}
      className={cn('overflow-hidden rounded-2xl border border-l-4 border-border bg-card shadow-soft', accent)}
    >
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-base font-bold leading-snug text-foreground">{name}</h3>
            {anchor.location ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{anchor.location}</span>
              </p>
            ) : null}
            {anchor.contact_person ? (
              <p className="mt-0.5 text-sm text-muted-foreground">Contact: {anchor.contact_person}</p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {unitCount} {unitCount === 1 ? 'unit' : 'units'}
          </span>
        </div>
        {phone || email ? (
          <div className="mt-3 flex gap-2">
            {phone ? (
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={actionBtn} aria-label={`Call ${anchor.contact_person || name} on ${phone}`}>
                <Phone className="h-4 w-4" aria-hidden="true" /> Call
              </a>
            ) : null}
            {email ? (
              <a href={`mailto:${email}`} className={actionBtn} aria-label={`Email ${email}`}>
                <Mail className="h-4 w-4" aria-hidden="true" /> Email
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-border bg-muted/40 p-3">
        {group.rows.map((item) => {
          const serialLine = [item.flow_meter_make, item.flow_meter_size, item.flow_meter_serial].filter(Boolean).join(' · ');
          return (
            <div key={item.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-primary">{item.inventory_id || '—'}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{serialLine || 'No flow metre details yet'}</p>
                </div>
                {isDraft(item) ? (
                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">Draft</span>
                ) : null}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <CgwValidityChip label="NOC upto" value={item.noc_valid_upto} />
                <CgwValidityChip label="Calib." value={item.calibration_valid_to} />
                <CgwValidityChip label="Telem." value={item.telemetry_valid_to} />
              </div>
              {canManage || item.noc_document_url ? (
                <div className="mt-2.5 flex gap-2">
                  {canManage ? (
                    <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => onOpenNoc(item)}>
                      <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" /> NOC
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => onOpenNoc(item, { startInPreviewMode: true })}>
                      <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" /> View NOC
                    </Button>
                  )}
                  {canManage ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-11 shrink-0 rounded-xl p-0"
                      aria-label={`${isDraft(item) ? 'Continue draft for' : 'Edit'} ${item.customer_name || item.inventory_id || 'record'}`}
                      onClick={() => onEdit(item)}
                    >
                      <Edit className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                  {canManage && canDeleteCgw ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-11 shrink-0 rounded-xl p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${item.customer_name || item.inventory_id || 'record'}`}
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex divide-x divide-border border-t border-border">
        <button
          type="button"
          className="flex h-12 flex-1 items-center justify-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide details' : 'All details'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="flex h-12 flex-1 items-center justify-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => onOpenGroup(group)}
        >
          <Eye className="h-4 w-4" aria-hidden="true" /> Open
        </button>
      </div>

      {expanded ? (
        <div id={panelId} className="space-y-5 border-t border-border p-4">
          <CgwMobileSection
            title="NOC"
            rows={[
              ['NOC number', anchor.noc_no],
              ['Application no.', anchor.noc_application_no],
              ['Project', anchor.noc_project_name],
              ['Type', anchor.noc_type],
              ['Project status', anchor.noc_project_status],
              ['Valid from', anchor.noc_valid_from],
              ['Renewal date', anchor.renewal_date],
            ]}
          />
          {group.rows.map((item) => {
            const fileSections = CGW_MOBILE_FILE_GROUPS.map((g) => ({
              title: g.title,
              files: g.keys
                .map((k) => ({ key: k, count: (item?.cgw_attachments?.[k] || []).length }))
                .filter((f) => f.count > 0),
            })).filter((g) => g.files.length > 0);
            return (
              <div key={item.id} className="space-y-4 rounded-xl border border-border bg-muted/30 p-3">
                <p className="font-mono text-xs font-bold text-primary">{item.inventory_id || '—'}</p>
                <CgwMobileSection
                  title="Flow metre"
                  rows={[
                    ['Make', item.flow_meter_make],
                    ['Size', item.flow_meter_size],
                    ['Serial', item.flow_meter_serial],
                    ['Calibration from', item.calibration_valid_from],
                    ['Telemetry', item.telemetry_applicable],
                    ['Company', formatTelemetryCompanyDisplay(item)],
                    ['Communication', item.telemetry_communication_via],
                    ['SIM', formatTelemetrySimLine(item)],
                    ['Product code', item.telemetry_product_code],
                    ['Telemetry serial', item.telemetry_serial_number],
                    [
                      'Portal',
                      item.telemetry_portal_url ? (
                        <a href={item.telemetry_portal_url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                          Open portal
                        </a>
                      ) : null,
                    ],
                    ['Username', item.telemetry_username],
                    ['Valid from', item.telemetry_valid_from],
                    ['Prior year', formatTelemetryPriorLine(item)],
                  ]}
                />
                <CgwMobileSection title="Piezometer" rows={[['Summary', piezometerSummaryCellText(item)]]} />
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Files</h4>
                  {fileSections.length ? (
                    <div className="mt-2 space-y-3">
                      {fileSections.map((g) => (
                        <div key={g.title}>
                          <p className="mb-1.5 text-xs font-semibold text-foreground">{g.title}</p>
                          <div className="flex flex-wrap gap-2">
                            {g.files.map((f) => (
                              <button
                                key={f.key}
                                type="button"
                                onClick={() => onOpenMedia(item, f.key)}
                                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`Preview ${f.count} ${f.count === 1 ? 'file' : 'files'}: ${cgwUploadCategoryLabel(f.key)}`}
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                {cgwUploadCategoryLabel(f.key)} ({f.count})
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground">No files uploaded.</p>
                  )}
                </section>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

const CGWFlowMetre = ({ mode = 'view' }) => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { id: routeEditId } = useParams();
  const isCreateScreen = mode === 'create';
  const isViewScreen = mode === 'view';
  const isDraftsScreen = mode === 'drafts';
  const isListScreen = isViewScreen || isDraftsScreen;
  const wizardActive = isCreateScreen;
  const hasCgwAccess = userCanManageCgw(user);
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(mode !== 'create');
  const [editHydrating, setEditHydrating] = useState(mode === 'create');
  const [editMode, setEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);
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
  const [addNocUploading, setAddNocUploading] = useState(false);
  const [wizardSavedNocPreviewUrl, setWizardSavedNocPreviewUrl] = useState('');
  const [wizardSavedNocPreviewLoading, setWizardSavedNocPreviewLoading] = useState(false);
  const addNocPdfUrlRef = useRef('');
  const wizardSavedNocBlobRef = useRef(null);
  const skipCreateHydrateRef = useRef(null);
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
  const [nocValidUptoFilter, setNocValidUptoFilter] = useState('');
  const [telemValidToFilter, setTelemValidToFilter] = useState('');
  /** Inventory table: wizard-aligned column groups; collapsed groups show one summary column each. */
  const [cgwGridSectionsOpen, setCgwGridSectionsOpen] = useState({
    customer: false,
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
  const [customerPreviewOpen, setCustomerPreviewOpen] = useState(false);
  const [customerPreviewGroup, setCustomerPreviewGroup] = useState(null);
  const [customerPreviewCode, setCustomerPreviewCode] = useState('');
  const [nocTargetItem, setNocTargetItem] = useState(null);
  const [nocFile, setNocFile] = useState(null);
  const [nocLocalPreview, setNocLocalPreview] = useState('');
  const [nocSaveMode, setNocSaveMode] = useState('update');
  const [nocSelectedRecordId, setNocSelectedRecordId] = useState(null);
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
    const records = nocRecordsFromItem(item);
    const current = pickCurrentNocRecord(records) || records[records.length - 1] || null;
    setNocSaveMode('update');
    setNocSelectedRecordId(current?.id || null);
    setNocForm(current ? nocFormFromRecord(current) : { ...EMPTY_NOC_FORM });
    const canEditNoc = userCanEditSubmittedCgw(user);
    setNocSideFieldsEditable(canEditNoc && !startInPreviewMode);
    setNocDialogOpen(true);
  };

  const closeNocDialog = () => {
    revokeNocRemoteBlob();
    clearNocLocalPreview();
    setNocFile(null);
    setNocTargetItem(null);
    setNocSaveMode('update');
    setNocSelectedRecordId(null);
    setNocSideFieldsEditable(false);
    setNocDialogOpen(false);
  };

  const selectNocPeriod = (rec) => {
    if (!rec) return;
    clearNocLocalPreview();
    setNocFile(null);
    setNocSaveMode('update');
    setNocSelectedRecordId(rec.id);
    setNocForm(nocFormFromRecord(rec));
    setNocSideFieldsEditable(false);
  };

  const startAddNocPeriod = (mode = 'add') => {
    const records = nocRecordsFromItem(nocTargetItem);
    const latest = pickCurrentNocRecord(records) || records[records.length - 1];
    clearNocLocalPreview();
    setNocFile(null);
    setNocSaveMode(mode);
    setNocSelectedRecordId(null);
    setNocForm({
      ...(latest ? nocFormFromRecord(latest) : { ...EMPTY_NOC_FORM }),
      noc_no: '',
      application_no: '',
      noc_type: mode === 'renew' ? 'renewal' : 'new',
      valid_from: mode === 'renew' && latest?.valid_upto ? latest.valid_upto : '',
      valid_upto: '',
    });
    setNocSideFieldsEditable(true);
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
    const modeAtSave = nocSaveMode || 'update';
    const records = nocRecordsFromItem(nocTargetItem);
    const selected = records.find((r) => r.id === nocSelectedRecordId);
    const hasExisting = !!(selected?.document_url || nocTargetItem.noc_document_url);
    const addingPeriod = modeAtSave === 'add' || modeAtSave === 'renew';
    if (!nocFile && (addingPeriod || !hasExisting)) {
      toast.error('Select a NOC PDF for this validity period.');
      return;
    }
    if (!(nocForm.valid_from || '').trim() || !(nocForm.valid_upto || '').trim()) {
      toast.error('Enter valid from and valid up to dates for this NOC period.');
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
      fd.append('save_mode', modeAtSave);
      if (modeAtSave === 'update' && nocSelectedRecordId) {
        fd.append('noc_record_id', nocSelectedRecordId);
      }
      const res = await axios.post(`${API}/cgw-flow-metres/${nocTargetItem.id}/noc`, fd, {
        headers: authHeaders(),
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      const saved = res.data;
      setNocTargetItem(saved);
      const nextRecords = nocRecordsFromItem(saved);
      const prevIds = new Set(records.map((r) => r.id).filter(Boolean));
      const added = nextRecords.find((r) => r.id && !prevIds.has(r.id));
      const current = pickCurrentNocRecord(nextRecords) || nextRecords[nextRecords.length - 1];
      const nextSelected = addingPeriod
        ? (added?.id || current?.id)
        : (nocSelectedRecordId || current?.id);
      setNocSaveMode('update');
      setNocSelectedRecordId(nextSelected);
      setNocForm(nocFormFromRecord(
        nextRecords.find((r) => r.id === nextSelected) || current || {},
      ));
      setNocFile(null);
      clearNocLocalPreview();
      setNocSideFieldsEditable(false);
      toast.success(modeAtSave === 'renew' ? 'NOC renewed for the new period' : modeAtSave === 'add' ? 'NOC period added' : 'NOC saved');
      fetchItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save NOC'));
    } finally {
      setNocSaving(false);
    }
  };

  useEffect(() => {
    refreshUser?.();
    fetchCustomers();
    if (isListScreen) {
      fetchItems();
    } else {
      setLoading(false);
    }
  }, [isListScreen]);

  const revokeAddNocLocalPdfUrl = useCallback(() => {
    if (addNocPdfUrlRef.current) {
      URL.revokeObjectURL(addNocPdfUrlRef.current);
      addNocPdfUrlRef.current = '';
    }
    setAddNocPdfObjectUrl('');
  }, []);

  const revokeWizardSavedNocPreview = useCallback(() => {
    if (wizardSavedNocBlobRef.current) {
      URL.revokeObjectURL(wizardSavedNocBlobRef.current);
      wizardSavedNocBlobRef.current = null;
    }
    setWizardSavedNocPreviewUrl('');
    setWizardSavedNocPreviewLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (addNocPdfUrlRef.current) URL.revokeObjectURL(addNocPdfUrlRef.current);
      if (wizardSavedNocBlobRef.current) URL.revokeObjectURL(wizardSavedNocBlobRef.current);
    };
  }, []);

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
    if (!wizardActive || piezometerWizardCount <= 0) return;
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
  }, [wizardActive, piezometerWizardCount]);

  useEffect(() => {
    if (!wizardActive || addStep < 3 || addStep > 4 || !formData.customer_id) {
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
  }, [wizardActive, addStep, formData.customer_id]);

  useEffect(() => {
    if (!nocDialogOpen) {
      revokeNocRemoteBlob();
      return undefined;
    }
    const records = nocRecordsFromItem(nocTargetItem);
    const addingPeriod = nocSaveMode === 'add' || nocSaveMode === 'renew';
    const selected = addingPeriod
      ? null
      : (records.find((r) => r.id === nocSelectedRecordId) || pickCurrentNocRecord(records));
    const rawUrl = selected?.document_url || '';
    if (nocLocalPreview || !rawUrl) {
      revokeNocRemoteBlob();
      return undefined;
    }
    const full = nocDocHref(rawUrl);
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
          toast.error(getApiErrorMessage(err, 'Could not load NOC preview'));
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
  }, [nocDialogOpen, nocTargetItem, nocSelectedRecordId, nocLocalPreview, nocSaveMode, revokeNocRemoteBlob]);

  useEffect(() => {
    const savedUrl = editingItem?.noc_document_url;
    if (!isCreateScreen || addNocPdfObjectUrl || !savedUrl) {
      revokeWizardSavedNocPreview();
      return undefined;
    }
    const full = nocDocHref(savedUrl);
    if (!isNocStreamableRemoteUrl(full)) {
      revokeWizardSavedNocPreview();
      setWizardSavedNocPreviewUrl(full);
      return undefined;
    }

    let cancelled = false;
    revokeWizardSavedNocPreview();
    setWizardSavedNocPreviewLoading(true);

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
        wizardSavedNocBlobRef.current = u;
        setWizardSavedNocPreviewUrl(u);
      } catch (err) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(err, 'Could not load NOC preview'));
        }
      } finally {
        if (!cancelled) setWizardSavedNocPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCreateScreen, editingItem?.noc_document_url, addNocPdfObjectUrl, revokeWizardSavedNocPreview]);

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
    return Array.from(map.values()).map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => compareCgwaIds(a.inventory_id, b.inventory_id)),
    }));
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
      const isDraft = String(item?.status || '').toLowerCase() === 'draft';
      if (isDraftsScreen) {
        if (!isDraft) return false;
        if (!isAdminUser(user)) {
          const owner = (item.created_by_name || '').trim().toLowerCase();
          const me = (user?.name || '').trim().toLowerCase();
          if (owner && me && owner !== me) return false;
        }
      } else if (isViewScreen && isDraft) {
        return false;
      }

      const { nocNumbers, applicationNumbers } = collectNocSearchValues(item);
      const customerBizId = (customerCodeById.get(item.customer_id) || '').toString().toLowerCase();
      const matchesGlobal = itemMatchesGlobalSearch(item, term, customerBizId);

      const matchesColumns = Object.entries(columnFilters).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;
        if (key === 'noc_no') return listIncludesTerm(nocNumbers, filterValue);
        if (key === 'noc_application_no') return listIncludesTerm(applicationNumbers, filterValue);
        return String(item[key] ?? '').toLowerCase().includes(filterValue);
      });

      const matchesNocValidity = matchesNocValidUptoFilter(item.noc_valid_upto, nocValidUptoFilter);
      const matchesTelemValidity = matchesTelemValidToFilter(item.telemetry_valid_to, telemValidToFilter);

      return matchesGlobal && matchesColumns && matchesNocValidity && matchesTelemValidity;
    });
    if (isDraftsScreen) {
      filtered.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    }
    setFilteredItems(filtered);
  }, [searchTerm, columnFilters, nocValidUptoFilter, telemValidToFilter, items, customerCodeById, isDraftsScreen, isViewScreen, user]);

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
  }, [searchTerm, columnFilters, nocValidUptoFilter, telemValidToFilter, pageSize]);

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
      await withNetworkRetry(() =>
        axios.post(`${API}/cgw-flow-metres/${inventoryRowId}/media-attachments`, fd, {
          headers: authHeaders(),
          timeout: 120000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );
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
    const failures = [];
    if (!list.length) return failures;
    for (const raw of list) {
      try {
        const prepared = await prepareFileForUpload(raw);
        const fd = new FormData();
        fd.append('category', category);
        fd.append('file', prepared);
        await postCgwMediaFormData(inventoryRowId, fd);
      } catch (err) {
        failures.push({
          category,
          fileName: raw?.name || 'file',
          network: isTransientNetworkError(err),
          reason: getApiErrorMessage(err, 'upload failed'),
        });
      }
    }
    return failures;
  };

  const uploadCgwRowAttachment = async (inventoryRowId, category, file) =>
    uploadCgwRowAttachments(inventoryRowId, category, [file]);

  const uploadEquipmentFlowBundle = async (inventoryRowId, bundle, equipmentRow) => {
    const b = bundle || {};
    const failures = [];
    const run = async (category, files) => {
      const result = await uploadCgwRowAttachments(inventoryRowId, category, files);
      if (result?.length) failures.push(...result);
    };
    await run('calibration_certificate', b.calibration_cert);
    await run('service_report', b.service_report);
    await run('telemetry_service_report', b.telemetry_service_report);
    await run('water_quality_certificate', b.water_quality_certificate);
    await run('cte', b.cte);
    await run('cto', b.cto);
    await run('rwss_watco_phed_noc', b.rwss_watco_phed_noc);
    await run('approval_letter', b.approval_letter);
    await run('rain_water_harvesting_data', b.rain_water_harvesting_data);
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
    await run('additional_doc', renamed);
    await run('telemetry_excel_prior', b.telemetry_excel);
    await run('telemetry_service_prior', b.telemetry_service);
    await run('bw_geo_flowmeter', b.bwGeoPhotos);
    await run('telemetry', b.telemetryPhotoFiles);
    return failures;
  };

  const uploadPiezometerFlowBundle = async (inventoryRowId, pb) => {
    const bundle = pb || {};
    const failures = [];
    const run = async (category, files) => {
      const result = await uploadCgwRowAttachments(inventoryRowId, category, files);
      if (result?.length) failures.push(...result);
    };
    await run('piezometer_bw', bundle.bwPhotos);
    await run('piezometer_calibration', bundle.calibrationCert);
    await run('piezometer_telemetry', bundle.telemetryPhotos);
    await run('piezometer_excel_prior', bundle.telemetryExcel);
    await run('piezometer_service_report', bundle.priorTelemetryService);
    await run('piezometer_service', bundle.serviceReport);
    await run('piezometer_telemetry_service', bundle.telemetryServiceReport);
    return failures;
  };

  const isDraftRecord = (item) => String(item?.status || '').toLowerCase() === 'draft';

  const getSavedAttachments = (apiCategory) => {
    if (!editingItem?.cgw_attachments || !apiCategory) return [];
    return editingItem.cgw_attachments[apiCategory] || [];
  };

  const populateWizardFromItem = (item, snapshot = null) => {
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
    setFormData(snap?.formData ? { ...EMPTY_FORM, ...snap.formData } : formDataFromItem(item));
    setAddNocForm(snap?.addNocForm ? { ...EMPTY_NOC_FORM, ...snap.addNocForm } : nocFormFromItem(item));
    const eqRows = snap?.equipmentRows?.length
      ? snap.equipmentRows.map((r) => ({ ...EMPTY_EQUIPMENT_ROW, ...r }))
      : [equipmentRowFromItem(item)];
    setEquipmentRows(eqRows);
    setEquipmentFlowFiles(eqRows.map(() => EMPTY_EQUIPMENT_FLOW_FILES()));
    let pz = [];
    if (snap?.piezometerRows?.length) {
      pz = snap.piezometerRows.map((r) => ({ ...EMPTY_PIEZO_ROW, ...r }));
    } else {
      try {
        const parsed = typeof item.piezometer_details_json === 'string'
          ? JSON.parse(item.piezometer_details_json)
          : item.piezometer_details_json;
        pz = Array.isArray(parsed?.piezometers)
          ? parsed.piezometers.map((r) => ({ ...EMPTY_PIEZO_ROW, ...r }))
          : [];
      } catch (_e) {
        pz = [];
      }
    }
    setPiezometerRows(pz);
    setPiezometerFiles(Array.from({ length: pz.length }, () => EMPTY_PIEZO_FILES()));
    setAddStep(Math.min(Math.max(Number(snap?.addStep) || 1, 1), addWizardFinalStep));
    setAddNocFile(null);
    revokeAddNocLocalPdfUrl();
    setAddNocPdfPreviewVisible(true);
  };

  const handleSaveDraft = async () => {
    if (!(formData.customer_id || '').trim()) {
      toast.error('Select a customer before saving a draft.');
      return;
    }
    const continuingDraft = editMode && isDraftRecord(editingItem);
    if (continuingDraft && addStep === addWizardFinalStep) {
      await handleSubmit();
      return;
    }
    setDraftSaving(true);
    try {
      const wizard = buildWizardSnapshot({
        addStep,
        formData,
        equipmentRows,
        addNocForm,
        piezometerRows,
      });
      const body = {
        wizard,
        customer_id: formData.customer_id,
        customer_name: formData.customer_name || '',
      };
      let saved;
      if (editingItemId) {
        const res = await withNetworkRetry(() =>
          axios.put(`${API}/cgw-flow-metres/${editingItemId}/draft`, body, {
            headers: authHeaders(),
          }),
        );
        saved = res.data;
      } else {
        const res = await axios.post(`${API}/cgw-flow-metres/draft`, body, { headers: authHeaders() });
        saved = res.data;
        setEditingItemId(saved.id);
        setEditMode(true);
      }
      setEditingItem(saved);
      const uploadFailures = [];
      if (saved?.id) {
        for (let i = 0; i < equipmentRows.length; i += 1) {
          uploadFailures.push(
            ...(await uploadEquipmentFlowBundle(saved.id, equipmentFlowFiles[i] || {}, equipmentRows[i])),
          );
        }
        for (let pi = 0; pi < (piezometerFiles || []).length; pi += 1) {
          uploadFailures.push(...(await uploadPiezometerFlowBundle(saved.id, piezometerFiles[pi] || {})));
        }
        if (addNocFile) {
          try {
            const fd = new FormData();
            fd.append('file', addNocFile);
            appendCgwNocFormData(fd, addNocForm, piezometerWizardCount);
            await withNetworkRetry(() =>
              axios.post(`${API}/cgw-flow-metres/${saved.id}/noc`, fd, {
                headers: authHeaders(),
                timeout: 120000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
              }),
            );
          } catch (nocErr) {
            uploadFailures.push({
              category: 'noc',
              fileName: addNocFile.name || 'NOC PDF',
              network: isTransientNetworkError(nocErr),
              reason: getApiErrorMessage(nocErr, 'upload failed'),
            });
          }
        }
        // The draft is already saved; a failed refresh must not turn that into a "failed to save" error.
        try {
          const fresh = await axios.get(`${API}/cgw-flow-metres/${saved.id}`, { headers: authHeaders() });
          setEditingItem(fresh.data);
        } catch (_refreshErr) {
          /* the draft stays saved; the list reloads it */
        }
        // Pending local picks are now on the server — show as saved files with preview/delete.
        setEquipmentFlowFiles(equipmentRows.map(() => EMPTY_EQUIPMENT_FLOW_FILES()));
        setPiezometerFiles(Array.from({ length: piezometerRows.length }, () => EMPTY_PIEZO_FILES()));
        setAddNocFile(null);
      }
      const continuingDraft = editMode && isDraftRecord(editingItem || saved);
      notifyCgwSaveWithUploads(
        continuingDraft ? 'Draft saved' : 'Draft saved. Open My Drafts to continue later.',
        uploadFailures,
      );
      resetForm();
      navigate(continuingDraft ? VIEW_CGWA_PATH : DRAFTS_CGWA_PATH);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save draft'));
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (addStep !== addWizardFinalStep) {
      toast.error('Finish all steps before saving.');
      return;
    }
    if (!validateFlowMetreWizardStep()) return;
    if (!validatePiezometerWizardStep()) return;
    if (!editMode && !(formData.customer_id || '').trim()) {
      toast.error('Please select a customer before saving.');
      return;
    }
    if (addWizardSubmitting) return;
    setAddWizardSubmitting(true);
    const submittingDraft = editMode && isDraftRecord(editingItem);
    const draftIdToRemove = submittingDraft ? editingItemId : null;
    const useSingleRowEdit = editMode && editingItemId && (!submittingDraft || equipmentRows.length <= 1);
    let recordsAlreadySaved = false;
    const finalStatus =
      (formData.status || '').trim().toLowerCase() === 'draft'
        ? 'Active'
        : (formData.status || 'Active');
    try {
      if (useSingleRowEdit) {
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
          flow_meter_commissioning_date: apiRow.flow_meter_commissioning_date || null,
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
          telemetry_commissioning_date: apiRow.telemetry_commissioning_date || null,
          telemetry_sim_changed_count: (apiRow.telemetry_sim_changed_count || '').trim() || null,
          telemetry_recharge_count: (apiRow.telemetry_recharge_count || '').trim() || null,
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
          status: submittingDraft ? 'Active' : finalStatus,
          ...(submittingDraft ? { wizard_draft_json: null } : {}),
        }, { headers: authHeaders() });

        const bundle = equipmentFlowFiles[0] || {};
        const uploadFailures = [];
        uploadFailures.push(...(await uploadEquipmentFlowBundle(editingItemId, bundle, row)));
        for (const pb of piezometerFiles || []) {
          uploadFailures.push(...(await uploadPiezometerFlowBundle(editingItemId, pb)));
        }

        const nocMetaPut = {
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
          status: submittingDraft ? 'Active' : finalStatus,
          ...(submittingDraft ? { wizard_draft_json: null } : {}),
        };

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
          try {
            await withNetworkRetry(() =>
              axios.post(`${API}/cgw-flow-metres/${editingItemId}/noc`, fd, {
                headers: authHeaders(),
                timeout: 120000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
              }),
            );
          } catch (nocErr) {
            uploadFailures.push({
              category: 'noc',
              fileName: addNocFile.name || 'NOC PDF',
              network: isTransientNetworkError(nocErr),
              reason: getApiErrorMessage(nocErr, 'upload failed'),
            });
            try {
              await withNetworkRetry(() =>
                axios.put(`${API}/cgw-flow-metres/${editingItemId}`, nocMetaPut, { headers: authHeaders() }),
              );
            } catch (_metaErr) {
              /* record already saved; user can edit NOC after opening it */
            }
          }
        } else {
          try {
            await withNetworkRetry(() =>
              axios.put(`${API}/cgw-flow-metres/${editingItemId}`, nocMetaPut, { headers: authHeaders() }),
            );
          } catch (metaErr) {
            uploadFailures.push({
              category: 'noc',
              fileName: 'NOC details',
              network: isTransientNetworkError(metaErr),
              reason: getApiErrorMessage(metaErr, 'save failed'),
            });
          }
        }

        notifyCgwSaveWithUploads(
          submittingDraft ? 'Draft submitted successfully' : 'Inventory item updated successfully',
          uploadFailures,
        );
        resetForm();
        navigate(VIEW_CGWA_PATH);
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
            flow_meter_commissioning_date: apiRow.flow_meter_commissioning_date || null,
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
            telemetry_commissioning_date: apiRow.telemetry_commissioning_date || null,
            telemetry_sim_changed_count: (apiRow.telemetry_sim_changed_count || '').trim() || null,
            telemetry_recharge_count: (apiRow.telemetry_recharge_count || '').trim() || null,
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
            flow_meter_commissioning_date: null,
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
            telemetry_commissioning_date: null,
            telemetry_sim_changed_count: null,
            telemetry_recharge_count: null,
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
        customer_id: formData.customer_id,
        customer_name: formData.customer_name || '',
        location: base.location || null,
        contact_person: base.contact_person || null,
        system_mobile_number: base.system_mobile_number || null,
        person_mobile_number: base.person_mobile_number || null,
        email_id: base.email_id || null,
        date_of_commissioning: base.date_of_commissioning || null,
        url_link: base.url_link || null,
        user_id: base.user_id || null,
        password: base.password || null,
        status: finalStatus,
        renewal_date: base.renewal_date || null,
        review: base.review || null,
        remarks: base.remarks || null,
        equipments: rowsForSubmit.map((x) => x.row),
      };

      const createdRes = await axios.post(`${API}/cgw-flow-metres/bulk`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const createdRows = Array.isArray(createdRes.data) ? createdRes.data : [];
      recordsAlreadySaved = createdRows.length > 0;
      const uploadFailures = [];

      for (let i = 0; i < createdRows.length; i += 1) {
        const inv = createdRows[i];
        const bundle = rowsForSubmit[i]?.files;
        if (!inv?.id || !bundle) continue;
        uploadFailures.push(...(await uploadEquipmentFlowBundle(inv.id, bundle, equipmentRows[i])));
      }

      if (needsPiezometerWizardStep && createdRows.length && piezometerRows.length) {
        for (let pi = 0; pi < piezometerRows.length; pi += 1) {
          const inv = createdRows[Math.min(pi, createdRows.length - 1)];
          if (!inv?.id) continue;
          const pb = piezometerFiles[pi] || {};
          uploadFailures.push(...(await uploadPiezometerFlowBundle(inv.id, pb)));
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

      if (createdRows.length && (addNocFile || editingItem?.noc_document_url || hasNocMeta)) {
        let nocFileToAttach = addNocFile;
        if (!nocFileToAttach && editingItem?.noc_document_url) {
          try {
            const full = nocDocHref(editingItem.noc_document_url);
            const res = isNocStreamableRemoteUrl(full)
              ? await axios.get(`${API}/files/stream`, {
                  params: { file_url: full },
                  headers: authHeaders(),
                  responseType: 'blob',
                })
              : await axios.get(full, { headers: authHeaders(), responseType: 'blob' });
            nocFileToAttach = new File([res.data], 'noc.pdf', { type: 'application/pdf' });
          } catch (_copyErr) {
            nocFileToAttach = null;
          }
        }
        for (const row of createdRows) {
          if (nocFileToAttach) {
            const fd = new FormData();
            fd.append('file', nocFileToAttach);
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
            try {
              await withNetworkRetry(() =>
                axios.post(`${API}/cgw-flow-metres/${row.id}/noc`, fd, {
                  headers: authHeaders(),
                  timeout: 120000,
                  maxBodyLength: Infinity,
                  maxContentLength: Infinity,
                }),
              );
            } catch (nocErr) {
              uploadFailures.push({
                category: 'noc',
                fileName: nocFileToAttach.name || 'NOC PDF',
                network: isTransientNetworkError(nocErr),
                reason: getApiErrorMessage(nocErr, 'upload failed'),
              });
              try {
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
              } catch (_metaErr) {
                /* record already saved; user can edit NOC after opening it */
              }
            }
          } else {
            try {
            await withNetworkRetry(() => axios.put(`${API}/cgw-flow-metres/${row.id}`, {
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
            }, { headers: authHeaders() }));
            } catch (metaErr) {
              uploadFailures.push({
                category: 'noc',
                fileName: 'NOC details',
                network: isTransientNetworkError(metaErr),
                reason: getApiErrorMessage(metaErr, 'save failed'),
              });
            }
          }
        }
      }

      if (draftIdToRemove) {
        try {
          await axios.delete(`${API}/cgw-flow-metres/${draftIdToRemove}`, {
            headers: authHeaders(),
          });
        } catch (_delErr) {
          /* rows created; draft row may remain — user can delete manually */
        }
      }

      notifyCgwSaveWithUploads(
        submittingDraft ? 'Draft submitted successfully' : 'Inventory items added successfully',
        uploadFailures,
      );
      resetForm();
      navigate(VIEW_CGWA_PATH);
    } catch (error) {
      if (recordsAlreadySaved) {
        // The records exist already. Staying on the form would make a retry create duplicates.
        toast.warning(
          `Your data was saved, but a follow-up step failed (${getApiErrorMessage(error, 'network error')}). Open the record to check its files and NOC details.`,
          { duration: 14000 },
        );
        resetForm();
        navigate(VIEW_CGWA_PATH);
      } else if (
        isTransientNetworkError(error) &&
        !(editingItemId && editingItem && !isDraftRecord(editingItem))
      ) {
        // The final save never reached the server. Keep everything the employee typed by saving it as a
        // draft (a small JSON request, no files) instead of leaving it only in the browser.
        try {
          await persistCreateDraftQuietly();
          toast.warning(
            'The network dropped while saving, so your entries were saved as a draft. Open My Drafts to finish and submit; re-select any files.',
            { duration: 16000 },
          );
          resetForm();
          navigate(DRAFTS_CGWA_PATH);
        } catch (_draftErr) {
          toast.error(
            'Network problem: your entries could not be saved yet. They are still on this screen; check your connection and press Save again.',
            { duration: 12000 },
          );
        }
      } else {
        toast.error(getApiErrorMessage(error, 'Operation failed'));
      }
    } finally {
      setAddWizardSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const row = items.find((it) => it.id === id);
    const isDraft = String(row?.status || '').toLowerCase() === 'draft';
    const canDeleteThis = userCanDeleteCgw(user) || (isDraftsScreen && isDraft && hasCgwAccess);
    if (!canDeleteThis) return;
    if (!window.confirm(isDraft ? 'Delete this draft? You cannot continue it after this.' : 'Are you sure you want to delete this item?')) return;
    try {
      await axios.delete(`${API}/cgw-flow-metres/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success(isDraft ? 'Draft deleted' : 'Inventory item deleted successfully');
      fetchItems();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to delete item'));
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
    if (!item?.id) return;
    if (!userCanEditCgwRecord(user, item)) {
      toast.error('You do not have permission to edit this CGWA record');
      return;
    }
    navigate(`${CREATE_CGWA_PATH}/${item.id}`);
  };

  useEffect(() => {
    if (!isCreateScreen) return undefined;
    if (!routeEditId) {
      resetForm();
      setEditHydrating(false);
      return undefined;
    }
    if (skipCreateHydrateRef.current === routeEditId) {
      skipCreateHydrateRef.current = null;
      setEditHydrating(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setEditHydrating(true);
      try {
        const res = await axios.get(`${API}/cgw-flow-metres/${routeEditId}`, { headers: authHeaders() });
        if (cancelled) return;
        const full = res.data;
        if (!userCanEditCgwRecord(user, full)) {
          toast.error('You do not have permission to edit this CGWA record');
          navigate(VIEW_CGWA_PATH);
          return;
        }
        setEditMode(true);
        setEditingItemId(full.id);
        setEditingItem(full);
        let snapshot = null;
        if (full.wizard_draft_json) {
          try {
            snapshot = JSON.parse(full.wizard_draft_json);
          } catch (_e) {
            snapshot = null;
          }
        }
        populateWizardFromItem(full, snapshot);
      } catch (err) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(err, 'Failed to load CGWA record'));
          navigate(VIEW_CGWA_PATH);
        }
      } finally {
        if (!cancelled) setEditHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCreateScreen, routeEditId]);

  const handleInlineChange = (field, value) => {
    setInlineEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleInlineSave = async (id) => {
    if (!userCanEditSubmittedCgw(user)) {
      toast.error('You do not have permission to edit this CGWA record');
      return;
    }
    try {
      await axios.put(`${API}/cgw-flow-metres/${id}`, inlineEditData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory item updated successfully');
      setInlineEditId(null);
      setInlineEditData(EMPTY_FORM);
      fetchItems();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Update failed'));
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
    revokeAddNocLocalPdfUrl();
    revokeWizardSavedNocPreview();
    setAddNocUploading(false);
    setAddNocPdfPreviewVisible(true);
    setPiezometerRows([]);
    setPiezometerFiles([]);
    setAddStep(1);
    setAddWizardSubmitting(false);
    setEditMode(false);
    setEditingItemId(null);
    setEditingItem(null);
  };

  const persistCreateDraftQuietly = async () => {
    if (editingItemId && editingItem && !isDraftRecord(editingItem)) {
      return editingItem;
    }
    const wizard = buildWizardSnapshot({
      addStep,
      formData,
      equipmentRows,
      addNocForm,
      piezometerRows,
    });
    const body = {
      wizard,
      customer_id: formData.customer_id,
      customer_name: formData.customer_name || '',
    };
    if (editingItemId) {
      const res = await withNetworkRetry(() =>
        axios.put(`${API}/cgw-flow-metres/${editingItemId}/draft`, body, {
          headers: authHeaders(),
        }),
      );
      setEditingItem(res.data);
      setEditMode(true);
      return res.data;
    }
    const res = await axios.post(`${API}/cgw-flow-metres/draft`, body, { headers: authHeaders() });
    const saved = res.data;
    setEditingItemId(saved.id);
    setEditMode(true);
    setEditingItem(saved);
    skipCreateHydrateRef.current = saved.id;
    navigate(`${CREATE_CGWA_PATH}/${saved.id}`, { replace: true });
    return saved;
  };

  const handleAddNocWizardFilePicked = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    revokeAddNocLocalPdfUrl();
    if (!f) {
      setAddNocFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }
    if (!(formData.customer_id || '').trim()) {
      toast.error('Select a customer on the previous step before uploading the NOC PDF.');
      return;
    }
    const u = URL.createObjectURL(f);
    addNocPdfUrlRef.current = u;
    setAddNocPdfObjectUrl(u);
    setAddNocFile(f);
    setAddNocPdfPreviewVisible(true);
    setAddNocUploading(true);
    try {
      const saved = await persistCreateDraftQuietly();
      if (!saved?.id) throw new Error('Draft was not saved');
      const fd = new FormData();
      fd.append('file', f);
      appendCgwNocFormData(fd, addNocForm, piezometerWizardCount);
      const nocRes = await withNetworkRetry(() =>
        axios.post(`${API}/cgw-flow-metres/${saved.id}/noc`, fd, {
          headers: authHeaders(),
          timeout: 120000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );
      setEditingItem(nocRes.data);
      toast.success('NOC saved to draft');
    } catch (err) {
      toast.error(
        isTransientNetworkError(err)
          ? 'Network problem while saving the NOC to the draft. Your entries are still on screen; the NOC will be uploaded again when you save.'
          : getApiErrorMessage(err, 'Could not save NOC to draft'),
      );
    } finally {
      setAddNocUploading(false);
    }
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

  const canCreateCgw = hasCgwAccess;
  const canManage = userCanEditSubmittedCgw(user);
  const canDeleteCgw = userCanDeleteCgw(user);
  const nocReadOnly = !canManage;
  const nocPeriodRecords = useMemo(() => nocRecordsFromItem(nocTargetItem), [nocTargetItem]);
  const selectedNocRecord = useMemo(() => {
    if (nocSaveMode === 'add' || nocSaveMode === 'renew') return null;
    return nocPeriodRecords.find((r) => r.id === nocSelectedRecordId) || pickCurrentNocRecord(nocPeriodRecords);
  }, [nocPeriodRecords, nocSelectedRecordId, nocSaveMode]);
  const selectedNocDocumentUrl = selectedNocRecord?.document_url || '';

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

  const openCustomerPreview = (group) => {
    if (!group?.rows?.length) return;
    const anchor = group.rows[0];
    const code = customerCodeById.get(anchor.customer_id) || anchor.customer_id || '';
    setCustomerPreviewGroup(group);
    setCustomerPreviewCode(code);
    setCustomerPreviewOpen(true);
  };

  const openMediaDialog = (item, category = 'bw_geo_flowmeter', selectedFileId = null) => {
    setMediaDialogItem(item);
    setMediaActiveCategory(CGW_MEDIA_KEYS.includes(category) ? category : 'bw_geo_flowmeter');
    setMediaSelectedFileId(selectedFileId);
    setMediaDialogOpen(true);
  };

  const handlePreviewSavedAttachment = (att, apiCategory) => {
    if (!editingItem || !att) return;
    openMediaDialog(editingItem, apiCategory || cgwFirstAttachmentCategory(editingItem), att.id);
  };

  const handleRemoveSavedAttachment = async (att, apiCategory) => {
    if (!editingItem?.id || !att?.id || !apiCategory || !canManage) return;
    if (!window.confirm(`Delete "${att.file_name || 'this file'}"? You can upload a replacement after.`)) return;
    try {
      const res = await axios.delete(
        `${API}/cgw-flow-metres/${editingItem.id}/media-attachments/${apiCategory}/${encodeURIComponent(att.id)}`,
        { headers: authHeaders() },
      );
      setEditingItem(res.data);
      toast.success('File deleted. Use Add to upload again.');
      fetchItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete file'));
    }
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
      const failures = await uploadCgwRowAttachments(mediaDialogItem.id, cat, list);
      const res = await axios.get(`${API}/cgw-flow-metres/${mediaDialogItem.id}`, { headers: authHeaders() });
      setMediaDialogItem(res.data);
      fetchItems();
      if (failures.length === list.length) {
        toast.error(
          `File upload failed — ${cgwUploadCategoryLabel(cat)}: ${failures.map((f) => `"${f.fileName || 'file'}"`).join(', ')}`,
        );
      } else if (failures.length) {
        toast.success(`${list.length - failures.length} file(s) uploaded. Open the record to retry failed uploads.`);
        toast.error(
          `File upload failed — ${failures.map((f) => `"${f.fileName || 'file'}"`).join(', ')}`,
          { duration: 14000 },
        );
      } else {
        toast.success(list.length > 1 ? `${list.length} files uploaded` : 'File uploaded');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed'));
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
      toast.error(getApiErrorMessage(err, 'Delete failed'));
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
          setMediaPreviewError(getApiErrorMessage(err, 'Could not load file preview'));
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

  /** Resets the search box and every filter so the empty state can offer a one-click way out. */
  const handleClearAllFilters = () => {
    setSearchTerm('');
    setNocValidUptoFilter('');
    setTelemValidToFilter('');
    handleClearColumnFilter();
  };

  /** Bring the top of the form into view when moving between wizard steps (long forms on small screens). */
  useEffect(() => {
    if (!isCreateScreen) return;
    if (typeof window === 'undefined') return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [addStep, isCreateScreen]);

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
      toast.error(getApiErrorMessage(error, 'Failed to save digest settings'));
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
      toast.error(getApiErrorMessage(error, 'Failed to run digest job'));
    }
  };

  const pageHeaderSubtitle = useMemo(() => {
    if (isCreateScreen) {
      return editMode && isDraftRecord(editingItem)
        ? 'Continue a saved draft'
        : editMode
          ? 'Update the CGWA record'
          : 'Create a new CGWA record';
    }
    if (isDraftsScreen) {
      const n = filteredItems.length;
      return `${n} saved ${n === 1 ? 'draft' : 'drafts'}`;
    }
    const base = `${items.length} total ${items.length === 1 ? 'row' : 'rows'}`;
    if (filteredItems.length !== items.length) {
      return `${base} · ${filteredItems.length} ${filteredItems.length === 1 ? 'match' : 'matches'}`;
    }
    return base;
  }, [isCreateScreen, isDraftsScreen, editMode, editingItem, items.length, filteredItems.length]);

  const pageHeaderActions = useMemo(() => {
    if (!isViewScreen || !hasCgwAccess) return null;
    return (
      <>
        <select
          value={nocValidUptoFilter}
          onChange={(e) => setNocValidUptoFilter(e.target.value)}
          className={cn(
            'hidden md:block h-10 rounded-lg border px-3 text-sm bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            nocValidUptoFilter
              ? 'border-amber-400 ring-1 ring-amber-200 font-medium'
              : 'border-input',
          )}
          title="Filter by NOC valid upto date"
          aria-label="Filter by NOC valid upto date"
        >
          {NOC_VALID_UPTO_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={telemValidToFilter}
          onChange={(e) => setTelemValidToFilter(e.target.value)}
          className={cn(
            'hidden md:block h-10 rounded-lg border px-3 text-sm bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            telemValidToFilter
              ? 'border-amber-400 ring-1 ring-amber-200 font-medium'
              : 'border-input',
          )}
          title="Filter by telemetry valid to date"
          aria-label="Filter by telemetry valid to date"
        >
          {TELEM_VALID_TO_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || 'all-telem'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-input text-foreground hover:bg-muted h-9 sm:h-10 text-xs sm:text-sm"
            onClick={() => setShowColumnFilter((prev) => !prev)}
            title="Filter specific column"
            aria-label="Filter specific column"
            aria-haspopup="dialog"
            aria-expanded={showColumnFilter}
          >
            <Filter className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
            <span className="hidden sm:inline">Filter</span>
          </Button>
          {showColumnFilter && (
            <Card
              role="dialog"
              aria-label="Filter specific column"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowColumnFilter(false);
              }}
              className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] p-3 border border-border shadow-lg bg-popover rounded-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">Filter specific column</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  aria-label="Close column filter"
                  onClick={() => setShowColumnFilter(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <select
                  value={selectedFilterField}
                  onChange={(e) => setSelectedFilterField(e.target.value)}
                  aria-label="Column to filter"
                  className="w-full h-10 rounded-lg border border-input px-2 text-sm bg-card text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                  aria-label="Filter value"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyColumnFilter();
                    }
                  }}
                  className="h-10 text-sm rounded-lg"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" className="h-9 text-xs border-input text-foreground hover:bg-muted" onClick={handleClearColumnFilter}>
                    Clear
                  </Button>
                  <Button type="button" size="sm" className="h-9 text-xs" onClick={handleApplyColumnFilter}>
                    Apply
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </>
    );
  }, [
    isViewScreen,
    hasCgwAccess,
    nocValidUptoFilter,
    telemValidToFilter,
    showColumnFilter,
    selectedFilterField,
    selectedFilterValue,
    handleClearColumnFilter,
    handleApplyColumnFilter,
  ]);

  useRegisterPageHeader({
    subtitle: pageHeaderSubtitle,
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading || (isCreateScreen && editHydrating)) {
    const isFormSkeleton = isCreateScreen;
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading CGWA data…</span>
        {isFormSkeleton ? (
          <Card className="space-y-6 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 flex-1 motion-reduce:animate-none" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
                  <Skeleton className="h-11 w-full motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-4 sm:p-5">
              <Skeleton className="h-10 w-full motion-reduce:animate-none" />
            </Card>
            <Card className="overflow-hidden">
              <div className="space-y-px">
                <Skeleton className="h-12 w-full rounded-none motion-reduce:animate-none" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
                    <Skeleton className="h-4 w-48 motion-reduce:animate-none" />
                    <Skeleton className="hidden h-4 w-32 sm:block motion-reduce:animate-none" />
                    <Skeleton className="hidden h-4 w-24 md:block motion-reduce:animate-none" />
                    <Skeleton className="ml-auto h-4 w-16 motion-reduce:animate-none" />
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid={isCreateScreen ? 'create-cgwa-page' : isDraftsScreen ? 'my-cgwa-drafts-page' : 'view-cgwa-page'}>
      {isCreateScreen && canCreateCgw && (
        <Card className="overflow-clip">
              <form
                onSubmit={(e) => e.preventDefault()}
                className="space-y-7 p-5 sm:p-8"
              >
                <nav aria-label="CGWA form progress" className="space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                        Step {addStep} of {addWizardStepDefs.length}
                      </p>
                      <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                        {addWizardStepDefs.find((s) => s.n === addStep)?.title || 'Details'}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {CGW_STEP_HINTS[addWizardStepDefs.find((s) => s.n === addStep)?.title] || 'Fill in the details for this step.'}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground tabular-nums">
                      {Math.round(((addStep - 1) / Math.max(1, addWizardStepDefs.length - 1)) * 100)}% complete
                    </p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500"
                      style={{ width: `${((addStep - 1) / Math.max(1, addWizardStepDefs.length - 1)) * 100}%` }}
                    />
                  </div>
                  <ol className="flex items-center justify-between gap-2">
                    {addWizardStepDefs.map((step, si) => {
                      const isCurrent = addStep === step.n;
                      const isDone = addStep > step.n;
                      return (
                        <li
                          key={step.n}
                          className={`flex items-center gap-2.5 ${si < addWizardStepDefs.length - 1 ? 'flex-1' : ''}`}
                          aria-current={isCurrent ? 'step' : undefined}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${
                              isCurrent
                                ? 'bg-primary text-primary-foreground shadow-glow ring-4 ring-primary/15'
                                : isDone
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : step.n}
                          </div>
                          <span
                            className={`hidden text-sm font-semibold sm:inline ${
                              isCurrent ? 'text-foreground' : isDone ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            <span className="sr-only">
                              {isDone ? 'Completed: ' : isCurrent ? 'Current step: ' : 'Upcoming: '}
                            </span>
                            {step.title}
                          </span>
                          {si < addWizardStepDefs.length - 1 ? (
                            <div
                              aria-hidden="true"
                              className={`h-0.5 min-w-3 flex-1 rounded-full transition-colors ${isDone ? 'bg-emerald-500' : 'bg-border'}`}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </nav>

                {addStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_id" className="text-sm font-medium text-foreground">
                        Select Customer <span className="text-destructive" aria-hidden="true">*</span>
                        <span className="sr-only">(required)</span>
                      </Label>
                      <select
                        id="customer_id"
                        value={formData.customer_id}
                        onChange={handleCustomerChange}
                        required
                        aria-describedby="customer_id_hint"
                        className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        <option value="">Choose a customer...</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.company_name}
                          </option>
                        ))}
                      </select>
                      <p id="customer_id_hint" className="text-xs text-muted-foreground">
                        Choosing a customer pre-fills the contact details below. You can still edit them.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="cgw_location" className="text-sm font-medium text-foreground">Location</Label>
                        <Input id="cgw_location" autoComplete="off" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgw_contact_person" className="text-sm font-medium text-foreground">Contact Person</Label>
                        <Input id="cgw_contact_person" autoComplete="off" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgw_system_mobile" className="text-sm font-medium text-foreground">System Mobile</Label>
                        <Input id="cgw_system_mobile" type="tel" inputMode="tel" autoComplete="off" value={formData.system_mobile_number} onChange={(e) => setFormData({ ...formData, system_mobile_number: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgw_person_mobile" className="text-sm font-medium text-foreground">Person Mobile</Label>
                        <Input id="cgw_person_mobile" type="tel" inputMode="tel" autoComplete="off" value={formData.person_mobile_number} onChange={(e) => setFormData({ ...formData, person_mobile_number: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cgw_email" className="text-sm font-medium text-foreground">Email</Label>
                        <Input id="cgw_email" type="email" inputMode="email" autoComplete="off" value={formData.email_id} onChange={(e) => setFormData({ ...formData, email_id: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgw_status" className="text-sm font-medium text-foreground">Status</Label>
                        <select
                          id="cgw_status"
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                          className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Draft">Draft</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgw_renewal_date" className="text-sm font-medium text-foreground">NOC Renewal date</Label>
                        <Input id="cgw_renewal_date" type="date" value={formData.renewal_date} onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cgw_url_link" className="text-sm font-medium text-foreground">Portal URL</Label>
                        <Input id="cgw_url_link" type="url" inputMode="url" autoComplete="off" placeholder="https://" value={formData.url_link} onChange={(e) => setFormData({ ...formData, url_link: e.target.value })} className="h-11" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cgw_remarks" className="text-sm font-medium text-foreground">Remarks</Label>
                        <Input id="cgw_remarks" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} className="h-11" />
                      </div>
                    </div>
                  </div>
                )}

                {addStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5">
                      <div className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
                        {(() => {
                          const savedNocUrl = editingItem?.noc_document_url;
                          const previewSrc = addNocPdfObjectUrl || wizardSavedNocPreviewUrl;
                          const hasSavedNoc = !!savedNocUrl;
                          const showPicker = !addNocFile && !hasSavedNoc;
                          return (
                            <>
                        {showPicker ? (
                          <>
                            <Label className="text-sm font-medium text-foreground">NOC PDF (optional)</Label>
                            <Input
                              type="file"
                              accept=".pdf,application/pdf"
                              onChange={handleAddNocWizardFilePicked}
                              className="h-11"
                            />
                            <p className="text-xs text-muted-foreground">
                              This is the first validity period. Additional or renewed NOC periods can be added later from View CGWA.
                            </p>
                          </>
                        ) : null}
                        {addNocUploading ? (
                          <p className="text-xs text-primary">Saving NOC to draft…</p>
                        ) : null}
                        {previewSrc ? (
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
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => window.open(previewSrc, '_blank', 'noopener,noreferrer')}
                              >
                                Preview PDF
                              </Button>
                              <label className="text-xs font-medium text-accent-foreground hover:text-accent-foreground cursor-pointer shrink-0 underline-offset-2 hover:underline">
                                Replace PDF
                                <input
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  onChange={handleAddNocWizardFilePicked}
                                  className="sr-only"
                                />
                              </label>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={addNocFile?.name || 'NOC PDF'}>
                                {addNocFile?.name || 'Saved NOC PDF'}
                              </span>
                            </div>
                            {addNocPdfPreviewVisible ? (
                              <div className="rounded-md border border-border overflow-hidden bg-neutral-900">
                                <iframe
                                  title="NOC PDF preview"
                                  src={previewSrc}
                                  className="h-[min(72vh,720px)] min-h-[320px] w-full border-0 bg-white"
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : addNocFile || wizardSavedNocPreviewLoading ? (
                          <p className="text-xs text-amber-700 pt-1">
                            {wizardSavedNocPreviewLoading ? 'Loading saved NOC preview…' : 'Preparing preview…'}
                          </p>
                        ) : null}
                            </>
                          );
                        })()}
                      </div>
                      <div className="min-w-0 w-full shrink-0 space-y-4 lg:w-[280px]">
                    <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-3">
                      <p className="text-sm font-semibold text-foreground">BHUNEER / no-cap portal</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-1" className="text-sm font-medium text-foreground">BHUNEER user ID</Label>
                          <Input id="cgwflowmetre-field-1"
                            value={addNocForm.bhuneer_user_id}
                            onChange={(e) => setAddNocForm((p) => ({ ...p, bhuneer_user_id: e.target.value }))}
                            autoComplete="off"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-2" className="text-sm font-medium text-foreground">Password</Label>
                          <Input id="cgwflowmetre-field-2"
                            type="password"
                            value={addNocForm.bhuneer_password}
                            onChange={(e) => setAddNocForm((p) => ({ ...p, bhuneer_password: e.target.value }))}
                            autoComplete="new-password"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-3" className="text-sm font-medium text-foreground">No cap user ID</Label>
                          <Input id="cgwflowmetre-field-3"
                            value={addNocForm.nocap_user_id}
                            onChange={(e) =>
                              setAddNocForm((p) => ({ ...p, nocap_user_id: e.target.value.toLowerCase() }))
                            }
                            autoComplete="off"
                            placeholder="stored lowercase"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-4" className="text-sm font-medium text-foreground">Password</Label>
                          <Input id="cgwflowmetre-field-4"
                            type="password"
                            value={addNocForm.nocap_password}
                            onChange={(e) => setAddNocForm((p) => ({ ...p, nocap_password: e.target.value }))}
                            autoComplete="new-password"
                            className="h-11"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-5" className="text-sm font-medium text-foreground">Project name</Label>
                        <Input id="cgwflowmetre-field-5" value={addNocForm.project_name} onChange={(e) => setAddNocForm((p) => ({ ...p, project_name: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-6" className="text-sm font-medium text-foreground">Project address</Label>
                        <Input id="cgwflowmetre-field-6" value={addNocForm.project_address} onChange={(e) => setAddNocForm((p) => ({ ...p, project_address: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-7" className="text-sm font-medium text-foreground">Communication address</Label>
                        <Input id="cgwflowmetre-field-7" value={addNocForm.communication_address} onChange={(e) => setAddNocForm((p) => ({ ...p, communication_address: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-8" className="text-sm font-medium text-foreground">NOC number</Label>
                        <Input id="cgwflowmetre-field-8" value={addNocForm.noc_no} onChange={(e) => setAddNocForm((p) => ({ ...p, noc_no: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-9" className="text-sm font-medium text-foreground">Application number</Label>
                        <Input id="cgwflowmetre-field-9" value={addNocForm.application_no} onChange={(e) => setAddNocForm((p) => ({ ...p, application_no: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-10" className="text-sm font-medium text-foreground">Project status</Label>
                        <select id="cgwflowmetre-field-10"
                          value={addNocForm.project_status}
                          onChange={(e) => setAddNocForm((p) => ({ ...p, project_status: e.target.value }))}
                          className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                        >
                          <option value="">Select status</option>
                          <option value="existing_ground_water">Existing ground water</option>
                          <option value="new_ground_water">New ground water</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-11" className="text-sm font-medium text-foreground">NOC type</Label>
                        <select id="cgwflowmetre-field-11"
                          value={addNocForm.noc_type}
                          onChange={(e) => setAddNocForm((p) => ({ ...p, noc_type: e.target.value }))}
                          className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                        >
                          <option value="">Select type</option>
                          <option value="new">New</option>
                          <option value="renewal">Renewal</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-12" className="text-sm font-medium text-foreground">Valid from</Label>
                        <Input id="cgwflowmetre-field-12" type="date" value={addNocForm.valid_from} onChange={(e) => setAddNocForm((p) => ({ ...p, valid_from: e.target.value }))} className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cgwflowmetre-field-13" className="text-sm font-medium text-foreground">Valid up to</Label>
                        <Input id="cgwflowmetre-field-13" type="date" value={addNocForm.valid_upto} onChange={(e) => setAddNocForm((p) => ({ ...p, valid_upto: e.target.value }))} className="h-11" />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold text-foreground mb-3">Ground water abstraction permitted</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-14" className="text-sm font-medium text-foreground">M3 per day</Label>
                          <Input id="cgwflowmetre-field-14" value={addNocForm.permitted_m3_per_day} onChange={(e) => setAddNocForm((p) => ({ ...p, permitted_m3_per_day: e.target.value }))} className="h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-15" className="text-sm font-medium text-foreground">M3 per year</Label>
                          <Input id="cgwflowmetre-field-15" value={addNocForm.permitted_m3_per_year} onChange={(e) => setAddNocForm((p) => ({ ...p, permitted_m3_per_year: e.target.value }))} className="h-11" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold text-foreground mb-3">Detail of ground water abstraction / dewatering structure</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-16" className="text-sm font-medium text-foreground">Existing BW count</Label>
                          <Input id="cgwflowmetre-field-16" value={addNocForm.existing_bw_count} onChange={(e) => setAddNocForm((p) => ({ ...p, existing_bw_count: e.target.value }))} className="h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-17" className="text-sm font-medium text-foreground">Total proposed BW count</Label>
                          <Input id="cgwflowmetre-field-17" value={addNocForm.total_proposed_bw_count} onChange={(e) => setAddNocForm((p) => ({ ...p, total_proposed_bw_count: e.target.value }))} className="h-11" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-18" className="text-sm font-medium text-foreground">Flowmeter applicable or not</Label>
                          <select id="cgwflowmetre-field-18"
                            value={addNocForm.flowmeter_applicable}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAddNocForm((p) => ({
                                ...p,
                                flowmeter_applicable: v,
                                flowmeter_count: v === 'yes' ? p.flowmeter_count : '',
                              }));
                            }}
                            className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                          >
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        {addNocForm.flowmeter_applicable === 'yes' && (
                          <div className="space-y-2">
                            <Label htmlFor="cgwflowmetre-field-19" className="text-sm font-medium text-foreground">Flowmeter count</Label>
                            <Input id="cgwflowmetre-field-19" value={addNocForm.flowmeter_count} onChange={(e) => setAddNocForm((p) => ({ ...p, flowmeter_count: e.target.value }))} className="h-11" />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="cgwflowmetre-field-20" className="text-sm font-medium text-foreground">Piezometer applicable or not</Label>
                          <select id="cgwflowmetre-field-20"
                            value={addNocForm.piezometer_applicable}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAddNocForm((p) => ({
                                ...p,
                                piezometer_applicable: v,
                                piezometer_count: v === 'yes' ? p.piezometer_count : '',
                              }));
                            }}
                            className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                          >
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        {addNocForm.piezometer_applicable === 'yes' && (
                          <div className="space-y-2">
                            <Label htmlFor="cgwflowmetre-field-21" className="text-sm font-medium text-foreground">Piezometer count</Label>
                            <Input id="cgwflowmetre-field-21" value={addNocForm.piezometer_count} onChange={(e) => setAddNocForm((p) => ({ ...p, piezometer_count: e.target.value }))} className="h-11" />
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
                    <div className="rounded-lg border border-border bg-white p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-foreground">Flow metre lines</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">One card per flow metre; add rows for multiple units.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-input text-foreground hover:bg-muted bg-white"
                          onClick={() => {
                            setEquipmentRows((prev) => [...prev, { ...EMPTY_EQUIPMENT_ROW }]);
                            setEquipmentFlowFiles((prev) => [...prev, EMPTY_EQUIPMENT_FLOW_FILES()]);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Row
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {equipmentRows.map((row, idx) => {
                          const patchRow = (patch) =>
                            setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                          const flowFiles = equipmentFlowFiles[idx] || {};
                          const patchFlowFiles = (patch) =>
                            setEquipmentFlowFiles((prev) =>
                              prev.map((b, i) =>
                                i === idx
                                  ? { ...EMPTY_EQUIPMENT_FLOW_FILES(), ...b, ...patch }
                                  : b,
                              ),
                            );
                          const rowSaved = (apiCategory) => ({
                            existingAttachments: editMode && idx === 0 ? getSavedAttachments(apiCategory) : [],
                            onPreviewExisting: (att) => handlePreviewSavedAttachment(att, apiCategory),
                            onRemoveExisting: canCreateCgw
                              ? (att) => handleRemoveSavedAttachment(att, apiCategory)
                              : null,
                          });
                          return (
                            <Card key={idx} className="p-4 border border-border bg-white shadow-none rounded-lg">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0 space-y-4">
                                  <div className="rounded-lg border border-border bg-white p-3 space-y-3">
                                    <p className="text-sm font-semibold text-foreground">Flow metre details</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Make</Label>
                                        <Input aria-label="UPC"
                                          value={row.flow_meter_make}
                                          onChange={(e) => patchRow({ flow_meter_make: e.target.value })}
                                          placeholder="UPC"
                                          className="h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Size of flow metre</Label>
                                        <Input
                                          value={row.flow_meter_size}
                                          onChange={(e) => patchRow({ flow_meter_size: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Serial number</Label>
                                        <Input
                                          value={row.flow_meter_serial}
                                          onChange={(e) => patchRow({ flow_meter_serial: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Commissioning date</Label>
                                        <Input
                                          type="date"
                                          value={row.flow_meter_commissioning_date}
                                          onChange={(e) => patchRow({ flow_meter_commissioning_date: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                    </div>
                                    <CgwMultiFilePicker
                                      label="BW with flowmeter GEO tagging photos"
                                      accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                                      imageOnly
                                      files={flowFiles.bwGeoPhotos}
                                      onChange={(bwGeoPhotos) => patchFlowFiles({ bwGeoPhotos })}
                                      hint="Click + to add GEO photos. Uploads after save (S3)."
                                      className="border-t border-border pt-3"
                                      {...rowSaved('bw_geo_flowmeter')}
                                    />
                                  </div>

                                  <div className="rounded-lg border border-border bg-white p-3 space-y-3">
                                    <p className="text-sm font-semibold text-foreground">Calibration certificate</p>
                                    <CgwMultiFilePicker
                                      label="Certificate (file)"
                                      accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                      files={flowFiles.calibration_cert}
                                      onChange={(calibration_cert) => patchFlowFiles({ calibration_cert })}
                                      hint="Uploads after the row is saved (S3)."
                                      {...rowSaved('calibration_certificate')}
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Valid from</Label>
                                        <Input
                                          type="date"
                                          value={row.calibration_valid_from}
                                          onChange={(e) => patchRow({ calibration_valid_from: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Valid to</Label>
                                        <Input
                                          type="date"
                                          value={row.calibration_valid_to}
                                          onChange={(e) => patchRow({ calibration_valid_to: e.target.value })}
                                          className="h-11"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-border bg-white p-3 space-y-2">
                                    <p className="text-sm font-semibold text-foreground">Service report</p>
                                    <CgwMultiFilePicker
                                      label="Upload service report"
                                      accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                      files={flowFiles.service_report}
                                      onChange={(service_report) => patchFlowFiles({ service_report })}
                                      hint="Optional; uploads after save (S3)."
                                      {...rowSaved('service_report')}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-foreground">Applicable telemetry system?</Label>
                                    <select
                                      value={row.telemetry_applicable}
                                      onChange={(e) => patchRow({ telemetry_applicable: e.target.value })}
                                      className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                                    >
                                      <option value="">Select</option>
                                      <option value="yes">Yes</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>

                                  {row.telemetry_applicable === 'yes' ? (
                                    <div className="rounded-lg border border-border bg-white p-3 space-y-4">
                                      <p className="text-sm font-semibold text-foreground">Telemetry system</p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry company</Label>
                                          <select
                                            value={row.telemetry_company}
                                            onChange={(e) => patchRow({ telemetry_company: e.target.value })}
                                            className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                                          >
                                            <option value="">Select</option>
                                            <option value="frinso">FRINSO</option>
                                            <option value="ubiqedge">UBIQEDGE</option>
                                            <option value="other">Other</option>
                                          </select>
                                        </div>
                                        {row.telemetry_company === 'other' ? (
                                          <div className="space-y-2">
                                            <Label className="text-sm font-medium text-foreground">Company name (manual)</Label>
                                            <Input
                                              value={row.telemetry_company_other}
                                              onChange={(e) => patchRow({ telemetry_company_other: e.target.value })}
                                              className="h-11"
                                            />
                                          </div>
                                        ) : null}
                                        <div className="space-y-2 sm:col-span-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry communication via</Label>
                                          <select
                                            value={row.telemetry_communication_via}
                                            onChange={(e) => patchRow({ telemetry_communication_via: e.target.value })}
                                            className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 max-w-md"
                                          >
                                            <option value="">Select</option>
                                            <option value="sim">SIM</option>
                                            <option value="wifi">Wi-Fi</option>
                                            <option value="ethernet">Ethernet</option>
                                          </select>
                                        </div>
                                      </div>

                                      {row.telemetry_communication_via === 'sim' ? (
                                        <div className="rounded-md border border-border bg-white p-3 space-y-3">
                                          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Telemetry SIM</p>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-foreground">SIM provider</Label>
                                              <select
                                                value={row.telemetry_sim_provider}
                                                onChange={(e) => patchRow({ telemetry_sim_provider: e.target.value })}
                                                className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                                                <Label className="text-sm font-medium text-foreground">Provider (manual)</Label>
                                                <Input
                                                  value={row.telemetry_sim_provider_other}
                                                  onChange={(e) => patchRow({ telemetry_sim_provider_other: e.target.value })}
                                                  className="h-11"
                                                />
                                              </div>
                                            ) : null}
                                            <div className="space-y-2 sm:col-span-2">
                                              <Label className="text-sm font-medium text-foreground">SIM number</Label>
                                              <Input
                                                value={row.telemetry_sim_number}
                                                onChange={(e) => patchRow({ telemetry_sim_number: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-foreground">SIM valid from</Label>
                                              <Input
                                                type="date"
                                                value={row.telemetry_sim_valid_from}
                                                onChange={(e) => patchRow({ telemetry_sim_valid_from: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label className="text-sm font-medium text-foreground">SIM valid to</Label>
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
                                          <Label className="text-sm font-medium text-foreground">Telemetry product code</Label>
                                          <Input
                                            value={row.telemetry_product_code}
                                            onChange={(e) => patchRow({ telemetry_product_code: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry serial number</Label>
                                          <Input
                                            value={row.telemetry_serial_number}
                                            onChange={(e) => patchRow({ telemetry_serial_number: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Commissioning date of telemetry</Label>
                                          <Input
                                            type="date"
                                            value={row.telemetry_commissioning_date}
                                            onChange={(e) => patchRow({ telemetry_commissioning_date: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">How many telemetry SIM changed?</Label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={row.telemetry_sim_changed_count}
                                            onChange={(e) => patchRow({ telemetry_sim_changed_count: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">How many times recharge done?</Label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={row.telemetry_recharge_count}
                                            onChange={(e) => patchRow({ telemetry_recharge_count: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                      </div>

                                      <CgwMultiFilePicker
                                        label="Telemetry Service Report"
                                        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                        files={flowFiles.telemetry_service_report}
                                        onChange={(telemetry_service_report) => patchFlowFiles({ telemetry_service_report })}
                                        hint="Optional; uploads after save (S3)."
                                        {...rowSaved('telemetry_service_report')}
                                      />

                                      <CgwMultiFilePicker
                                        label="Telemetry device photos"
                                        accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                                        imageOnly
                                        files={flowFiles.telemetryPhotoFiles}
                                        onChange={(telemetryPhotoFiles) => patchFlowFiles({ telemetryPhotoFiles })}
                                        hint="Click + to add telemetry photos. Uploads after save (S3)."
                                        {...rowSaved('telemetry')}
                                      />

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-2 sm:col-span-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry portal URL</Label>
                                          <Input aria-label="https://…"
                                            type="url"
                                            value={row.telemetry_portal_url}
                                            onChange={(e) => patchRow({ telemetry_portal_url: e.target.value })}
                                            placeholder="https://…"
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry username</Label>
                                          <Input
                                            value={row.telemetry_username}
                                            onChange={(e) => patchRow({ telemetry_username: e.target.value })}
                                            className="h-11"
                                            autoComplete="off"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry password</Label>
                                          <Input
                                            type="password"
                                            value={row.telemetry_password}
                                            onChange={(e) => patchRow({ telemetry_password: e.target.value })}
                                            className="h-11"
                                            autoComplete="new-password"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry valid from</Label>
                                          <Input
                                            type="date"
                                            value={row.telemetry_valid_from}
                                            onChange={(e) => patchRow({ telemetry_valid_from: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-sm font-medium text-foreground">Telemetry valid to</Label>
                                          <Input
                                            type="date"
                                            value={row.telemetry_valid_to}
                                            onChange={(e) => patchRow({ telemetry_valid_to: e.target.value })}
                                            className="h-11"
                                          />
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <Label className="text-sm font-medium text-foreground">Telemetry uploaded in previous year?</Label>
                                        <select
                                          value={row.telemetry_uploaded_previous_year}
                                          onChange={(e) => patchRow({ telemetry_uploaded_previous_year: e.target.value })}
                                          className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 max-w-md"
                                        >
                                          <option value="">Select</option>
                                          <option value="yes">Yes</option>
                                          <option value="no">No</option>
                                        </select>
                                      </div>

                                      {row.telemetry_uploaded_previous_year === 'yes' ? (
                                        <div className="rounded-md border border-border bg-white p-3 space-y-3">
                                          <div className="space-y-2">
                                            <Label className="text-sm font-medium text-foreground">Prior telemetry serial number</Label>
                                            <select
                                              value={row.telemetry_previous_serial_pick}
                                              onChange={(e) => patchRow({ telemetry_previous_serial_pick: e.target.value })}
                                              className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                                              <Label className="text-sm font-medium text-foreground">Serial number (manual)</Label>
                                              <Input
                                                value={row.telemetry_previous_serial_free}
                                                onChange={(e) => patchRow({ telemetry_previous_serial_free: e.target.value })}
                                                className="h-11"
                                              />
                                            </div>
                                          ) : null}

                                          <div className="space-y-2">
                                            <Label className="text-sm font-medium text-foreground">Old telemetry data available?</Label>
                                            <select
                                              value={row.telemetry_previous_data_available}
                                              onChange={(e) => patchRow({ telemetry_previous_data_available: e.target.value })}
                                              className="w-full border border-input bg-card rounded-lg px-3 h-11 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 max-w-md"
                                            >
                                              <option value="">Select</option>
                                              <option value="yes">Yes</option>
                                              <option value="no">No</option>
                                            </select>
                                          </div>

                                          {row.telemetry_previous_data_available === 'yes' ? (
                                            <div className="space-y-3 pt-1 border-t border-border">
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                  <Label className="text-sm font-medium text-foreground">Old data from</Label>
                                                  <Input
                                                    type="date"
                                                    value={row.telemetry_previous_data_from}
                                                    onChange={(e) => patchRow({ telemetry_previous_data_from: e.target.value })}
                                                    className="h-11"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-sm font-medium text-foreground">Old data to</Label>
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
                                                {...rowSaved('telemetry_excel_prior')}
                                              />
                                              <CgwMultiFilePicker
                                                label="Prior-year telemetry service report"
                                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                                files={flowFiles.telemetry_service}
                                                onChange={(telemetry_service) => patchFlowFiles({ telemetry_service })}
                                                hint="Optional; uploads as prior-year telemetry report."
                                                {...rowSaved('telemetry_service_prior')}
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
                                  className="h-9 px-3 border-border text-red-600 hover:bg-red-50 shrink-0"
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
                  <div className="rounded-lg border border-border bg-white p-4">
                    <PiezometerAddWizardStep
                      piezometerRows={piezometerRows}
                      setPiezometerRows={setPiezometerRows}
                      piezometerFiles={piezometerFiles}
                      setPiezometerFiles={setPiezometerFiles}
                      telemetrySerialOptions={telemetrySerialOptions}
                      countLabel={`${piezometerWizardCount} piezometer${piezometerWizardCount !== 1 ? 's' : ''} (NOC count ${String(addNocForm.piezometer_count || '').trim() || '—'})`}
                      editingItem={editingItem}
                      onPreviewSaved={handlePreviewSavedAttachment}
                      onRemoveSaved={canCreateCgw ? handleRemoveSavedAttachment : null}
                    />
                  </div>
                ) : null}

                {addStep === (needsPiezometerWizardStep ? 5 : 4) ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-white p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Additional attachment</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Click + or the dashed area to add files. They upload when you save the item or draft.
                          {needsPiezometerWizardStep ? ' (This is step 5 — after piezometer.)' : ''}
                        </p>
                      </div>
                      {equipmentRows.map((row, idx) => {
                        const flowFiles = { ...EMPTY_EQUIPMENT_FLOW_FILES(), ...(equipmentFlowFiles[idx] || {}) };
                        const patchFlowFiles = (patch) =>
                          setEquipmentFlowFiles((prev) =>
                            prev.map((b, i) =>
                              i === idx
                                ? { ...EMPTY_EQUIPMENT_FLOW_FILES(), ...b, ...patch }
                                : b,
                            ),
                          );
                        const patchRow = (patch) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                        const docAccept =
                          '.pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.csv,application/pdf,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
                        const attachSaved = (cat) => ({
                          existingAttachments: editMode && idx === 0 ? getSavedAttachments(cat) : [],
                          onPreviewExisting: (att) => handlePreviewSavedAttachment(att, cat),
                          onRemoveExisting: canCreateCgw
                            ? (att) => handleRemoveSavedAttachment(att, cat)
                            : null,
                        });
                        return (
                          <div key={`add-attach-${idx}`} className="rounded-md border border-border bg-white p-3 space-y-3">
                            <p className="text-xs font-semibold text-foreground">Flow metre line {idx + 1}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <CgwMultiFilePicker
                                label="Water quality certificate"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.water_quality_certificate}
                                onChange={(water_quality_certificate) => patchFlowFiles({ water_quality_certificate })}
                                {...attachSaved('water_quality_certificate')}
                              />
                              <CgwMultiFilePicker
                                label="CTE"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.cte}
                                onChange={(cte) => patchFlowFiles({ cte })}
                                {...attachSaved('cte')}
                              />
                              <CgwMultiFilePicker
                                label="CTO"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.cto}
                                onChange={(cto) => patchFlowFiles({ cto })}
                                {...attachSaved('cto')}
                              />
                              <CgwMultiFilePicker
                                label="RWSS/WATCO/PHED NOC"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.rwss_watco_phed_noc}
                                onChange={(rwss_watco_phed_noc) => patchFlowFiles({ rwss_watco_phed_noc })}
                                {...attachSaved('rwss_watco_phed_noc')}
                              />
                              <CgwMultiFilePicker
                                label="Approval letter"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.approval_letter}
                                onChange={(approval_letter) => patchFlowFiles({ approval_letter })}
                                {...attachSaved('approval_letter')}
                              />
                              <CgwMultiFilePicker
                                label="Rain water harvesting data"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                                files={flowFiles.rain_water_harvesting_data}
                                onChange={(rain_water_harvesting_data) => patchFlowFiles({ rain_water_harvesting_data })}
                                {...attachSaved('rain_water_harvesting_data')}
                              />
                            </div>
                            <div className="rounded-md border border-border bg-white p-3 space-y-3">
                              <p className="text-sm font-semibold text-foreground">Additional doc</p>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-foreground">Document type</Label>
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
                                {...attachSaved('additional_doc')}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:mx-0 sm:mb-0 sm:flex-row sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2 sm:backdrop-blur-none">
                  <div>
                    {addStep > 1 && (
                      <Button type="button" variant="outline" onClick={goAddPrevStep} className="border-input text-foreground hover:bg-muted">
                        Back
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={draftSaving || addWizardSubmitting}
                      className="border-input text-foreground hover:bg-muted bg-white"
                      onClick={handleSaveDraft}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {draftSaving ? 'Saving draft…' : 'Save draft'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                      resetForm();
                      navigate(editMode && isDraftRecord(editingItem) ? DRAFTS_CGWA_PATH : VIEW_CGWA_PATH);
                    }} className="border-input text-foreground hover:bg-muted">
                      Cancel
                    </Button>
                    {addStep < addWizardFinalStep ? (
                      <Button type="button" onClick={goAddNextStep}>
                        Next
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={addWizardSubmitting}
                        className="disabled:opacity-60"
                        onClick={handleSubmit}
                      >
                        {addWizardSubmitting
                          ? 'Saving…'
                          : editMode && isDraftRecord(editingItem)
                            ? 'Submit'
                            : editMode
                              ? 'Update Item'
                              : 'Create CGWA'}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
        </Card>
      )}

      {isViewScreen && (
        <>
      <Card className="p-4 sm:p-5">
        <div className="relative">
          <Label htmlFor="cgw-search-all" className="sr-only">Search CGWA records</Label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <Input
            id="cgw-search-all"
            type="search"
            autoComplete="off"
            placeholder="Search customer, CGWA ID, NOC, location…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10 h-12 md:h-10 text-base md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Quick filters">
          {[
            { label: 'All', active: !nocValidUptoFilter && !telemValidToFilter, apply: () => { setNocValidUptoFilter(''); setTelemValidToFilter(''); } },
            { label: 'NOC expired', active: nocValidUptoFilter === 'expired' && !telemValidToFilter, apply: () => { setNocValidUptoFilter('expired'); setTelemValidToFilter(''); } },
            { label: 'NOC due in 90 days', active: nocValidUptoFilter === 'expiring_90' && !telemValidToFilter, apply: () => { setNocValidUptoFilter('expiring_90'); setTelemValidToFilter(''); } },
            { label: 'Telemetry due in 90 days', active: telemValidToFilter === 'expiring_90' && !nocValidUptoFilter, apply: () => { setTelemValidToFilter('expiring_90'); setNocValidUptoFilter(''); } },
            { label: 'Telemetry expired', active: telemValidToFilter === 'expired' && !nocValidUptoFilter, apply: () => { setTelemValidToFilter('expired'); setNocValidUptoFilter(''); } },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              aria-pressed={chip.active}
              onClick={chip.apply}
              className={cn(
                'inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                chip.active ? 'border-primary bg-primary text-primary-foreground shadow-soft' : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {filteredItems.length} {filteredItems.length === 1 ? 'record' : 'records'} found
        </p>
      </Card>

      {isAdminUser(user) && SHOW_CGW_DIGEST_EMAIL_SECTION && (
        <Card className="rounded-lg border border-border bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">Daily past-due renewal email</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each morning at <span className="font-medium text-foreground">9:00</span>
                {digestScheduleTz ? (
                  <> ({digestScheduleTz})</>
                ) : null}
                , the server emails a list of all CGW rows whose renewal date is already past, including customer name and contact details for follow-up. Requires SMTP variables in the server environment (
                <span className="font-mono text-xs">SMTP_SERVER</span>,{' '}
                <span className="font-mono text-xs">SMTP_USERNAME</span>,{' '}
                <span className="font-mono text-xs">SMTP_PASSWORD</span>,{' '}
                <span className="font-mono text-xs">SENDER_EMAIL</span>).
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="digest_notification_email" className="text-xs font-medium text-foreground">
                Notification email (digest recipient)
              </Label>
              <Input
                id="digest_notification_email"
                type="email"
                placeholder="team@company.com"
                value={digestNotificationEmail}
                onChange={(e) => setDigestNotificationEmail(e.target.value)}
                className="h-9 text-sm border-input"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none pb-1">
              <input
                type="checkbox"
                checked={digestEnabled}
                onChange={(e) => setDigestEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input text-accent-foreground focus:ring-ring"
              />
              <span className="text-sm text-foreground">Enable daily digest</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-9"
              disabled={digestSaving}
              onClick={saveDigestSettings}
            >
              {digestSaving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button type="button" variant="outline" className="h-9 border-input" onClick={runDigestNow}>
              Send digest now
            </Button>
          </div>
        </Card>
      )}

      {/* Inventory grid */}
      {filteredItems.length > 0 ? (
        <Card className="overflow-hidden">
          <p className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground md:hidden" aria-hidden="true">
            {totalGroups} {totalGroups === 1 ? 'customer' : 'customers'} · {filteredItems.length} {filteredItems.length === 1 ? 'record' : 'records'}
          </p>
          <div className="space-y-3 bg-muted/30 p-3 md:hidden">
            {pagedGroups.map((group) => (
              <CgwMobileGroupCard
                key={group.key}
                group={group}
                canManage={canManage}
                canDeleteCgw={canDeleteCgw}
                onOpenGroup={openCustomerPreview}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenNoc={openNocDialog}
                onOpenMedia={openMediaDialog}
              />
            ))}
          </div>
          <div
            className="table-scroll hidden md:block overflow-x-auto overflow-y-scroll h-[calc(100vh-240px)] min-h-[400px] max-h-[calc(100vh-240px)] scrollbar-thin"
            style={{ scrollbarWidth: 'auto' }}
            tabIndex={0}
            role="region"
            aria-label="CGWA records table, scrollable"
          >
            <table className="w-full text-sm min-w-max border-separate border-spacing-0">
              <caption className="sr-only">
                CGWA records grouped by customer, with NOC, flow metre, piezometer and attachment details
              </caption>
              <thead className="sticky top-0 z-30">
                <tr className="border-b border-border bg-muted">
                  <th
                    colSpan={2}
                    className={`text-center py-2.5 px-2 font-semibold text-sky-900 ${cgwStickyPairHead}`}
                  >
                    <CgwGridSectionHeader title="1 · Customer" isOpen={cgwGridSectionsOpen.customer} onToggle={() => toggleCgwGridSection('customer')} />
                  </th>
                  {cgwGridSectionsOpen.customer ? (
                    <th
                      colSpan={CGW_GRID_SECTION_COLSPANS.customer.open - 2}
                      className="text-center py-2.5 px-2 font-semibold text-sky-900 bg-sky-100/80 border-r border-sky-200"
                    />
                  ) : null}
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
                    <th rowSpan={2} className="text-left py-3 px-4 font-semibold text-foreground whitespace-nowrap border-l border-border align-middle bg-muted">
                      ACTIONS
                    </th>
                  )}
                </tr>
                <tr className="border-b border-border bg-muted/90">
                    <>
                      <th className={`text-left py-3 px-4 font-semibold text-sky-900 whitespace-nowrap ${cgwStickyIdHead}`}>CGWA ID</th>
                      <th className={`text-left py-3 px-4 font-semibold text-sky-900 whitespace-nowrap ${cgwStickyNameHead}`}>CUSTOMER NAME</th>
                      {cgwGridSectionsOpen.customer ? (
                        <>
                          <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">LOCATION</th>
                          <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">CONTACT PERSON</th>
                          <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">SYSTEM MOBILE</th>
                          <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">PERSON MOBILE</th>
                          <th className="text-left py-3 px-4 font-semibold text-sky-900 bg-sky-50 whitespace-nowrap">EMAIL ID</th>
                        </>
                      ) : null}
                    </>
                  {cgwGridSectionsOpen.noc ? (
                    <>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap min-w-[108px] align-top">
                        <span className="block leading-snug">NOC</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground leading-tight">Per equipment row</span>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">PROJECT NAME</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">NOC NUMBER</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">APPLICATION NO</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 whitespace-nowrap">NOC VALID FROM</th>
                      <th className="text-left py-3 px-4 font-semibold text-cyan-900 bg-cyan-50 align-top min-w-[120px] whitespace-normal">
                        <span className="block leading-snug">NOC VALID UPTO</span>
                        <span className="mt-1 block text-[11px] font-normal text-muted-foreground leading-tight">
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
                      <th className="text-left py-2.5 px-4 font-semibold text-indigo-900 bg-indigo-50 align-top min-w-[120px] whitespace-normal">
                        <span className="block leading-snug">TELEM VALID TO</span>
                        <span className="mt-1 block text-[11px] font-normal text-muted-foreground leading-tight">
                          <span className="text-red-600 font-semibold">Red</span> = expired · <span className="text-amber-700 font-semibold">Amber</span> = ≤30 days
                        </span>
                      </th>
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
                        : 'border-b border-border hover:bg-muted/50';

                  return group.rows.map((item, rowIndex) => (
                    <tr key={item.id} className={`${rowRenewalClass} align-top group`}>
                      <>
                          <td className={`py-3 px-4 text-foreground whitespace-nowrap font-mono text-xs align-top ${cgwStickyIdCell}`}>
                            {item.inventory_id ? (
                              <button aria-label="View CGWA details"
                                type="button"
                                className="font-semibold text-left text-primary hover:text-accent-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                title="View CGWA details"
                                onClick={() => openCustomerPreview(group)}
                              >
                                {item.inventory_id}
                              </button>
                            ) : (
                              <span className="font-semibold text-foreground">—</span>
                            )}
                          </td>
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className={`py-3 px-4 font-medium text-foreground ${cgwStickyNameCell}`}>
                              {groupEditActive ? (
                                <Input value={inlineEditData.customer_name} onChange={(e) => handleInlineChange('customer_name', e.target.value)} className="h-7 text-xs px-2" />
                              ) : (
                                <span className="block truncate" title={groupAnchor.customer_name || ''}>
                                  {groupAnchor.customer_name || '—'}
                                </span>
                              )}
                            </td>
                          )}
                          {cgwGridSectionsOpen.customer ? (
                            <>
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? <Input value={inlineEditData.location} onChange={(e) => handleInlineChange('location', e.target.value)} className="h-7 text-xs px-2" /> : (groupAnchor.location || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? <Input value={inlineEditData.contact_person} onChange={(e) => handleInlineChange('contact_person', e.target.value)} className="h-7 text-xs px-2" /> : (groupAnchor.contact_person || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? <Input value={inlineEditData.system_mobile_number} onChange={(e) => handleInlineChange('system_mobile_number', e.target.value)} className="h-7 text-xs px-2" /> : (groupAnchor.system_mobile_number || '—')}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-sky-50/40">
                              {groupEditActive ? (
                                <Input value={inlineEditData.person_mobile_number} onChange={(e) => handleInlineChange('person_mobile_number', e.target.value)} className="h-7 text-xs px-2" />
                              ) : groupAnchor.person_mobile_number ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                  {groupAnchor.person_mobile_number}
                                </span>
                              ) : '—'}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground min-w-[180px] bg-sky-50/40">
                              {groupEditActive ? (
                                <Input value={inlineEditData.email_id} onChange={(e) => handleInlineChange('email_id', e.target.value)} className="h-7 text-xs px-2" />
                              ) : groupAnchor.email_id ? (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span>{groupAnchor.email_id}</span>
                                </span>
                              ) : '—'}
                            </td>
                          )}
                            </>
                          ) : null}
                        </>

                      {cgwGridSectionsOpen.noc ? (
                        <>
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 align-top min-w-[108px] border-r border-cyan-100 bg-cyan-50/35">
                              <div className="space-y-2">
                                {group.rows.map((inv) => {
                                  const cgwaId = inv.inventory_id || '—';
                                  return (
                                  <div key={inv.id} className="rounded border border-border bg-muted/80 p-1.5">
                                    <p className="text-[11px] font-mono font-semibold text-foreground mb-1 truncate" title={cgwaId}>
                                      {cgwaId}
                                    </p>
                                    {canManage ? (
                                      <div className="flex flex-col gap-1">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-1 text-[11px] border-border"
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
                                            className="h-6 px-1 text-[11px] text-primary"
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
                                        className="h-7 px-1 text-[11px]"
                                        onClick={() => openNocDialog(inv, { startInPreviewMode: true })}
                                      >
                                        <Eye className="h-3 w-3 mr-0.5" />
                                        View
                                      </Button>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </div>
                                  );
                                })}
                              </div>
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground text-xs bg-cyan-50/35 max-w-[200px]">
                              <span className="line-clamp-4" title={groupAnchor.noc_project_name || ''}>{groupAnchor.noc_project_name || '—'}</span>
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-cyan-50/35">
                              <p>{groupAnchor.noc_no || '—'}</p>
                              {nocRecordsFromItem(groupAnchor).length > 1 ? (
                                <p className="text-[11px] text-cyan-800 mt-0.5">{nocRecordsFromItem(groupAnchor).length} periods</p>
                              ) : null}
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-cyan-50/35">{groupAnchor.noc_application_no || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground whitespace-nowrap font-mono text-xs bg-cyan-50/35">{groupAnchor.noc_valid_from || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 align-top bg-cyan-50/35">
                              <NocValidUptoColumnCell groupRows={group.rows} />
                            </td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground text-xs bg-cyan-50/35">{groupAnchor.noc_type || '—'}</td>
                          )}
                          {rowIndex === 0 && (
                            <td rowSpan={group.rows.length} className="py-3 px-4 text-muted-foreground text-xs bg-cyan-50/35">{groupAnchor.noc_project_status || '—'}</td>
                          )}
                        </>
                      ) : rowIndex === 0 ? (
                        <td rowSpan={group.rows.length} className="py-3 px-3 text-foreground bg-cyan-50/35 align-top text-xs">
                          <p className="font-mono font-medium">{groupAnchor.noc_no || groupAnchor.noc_application_no || '—'}</p>
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2" title={groupAnchor.noc_project_name || ''}>
                            {groupAnchor.noc_project_name || ''}
                          </p>
                        </td>
                      ) : null}

                      {cgwGridSectionsOpen.flowMetre ? (
                        <>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input value={inlineEditData.flow_meter_make} onChange={(e) => handleInlineChange('flow_meter_make', e.target.value)} className="h-7 text-xs px-2" /> : (item.flow_meter_make || '—')}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input value={inlineEditData.flow_meter_size} onChange={(e) => handleInlineChange('flow_meter_size', e.target.value)} className="h-7 text-xs px-2" /> : (item.flow_meter_size || '—')}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap font-mono bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input value={inlineEditData.flow_meter_serial} onChange={(e) => handleInlineChange('flow_meter_serial', e.target.value)} className="h-7 text-xs px-2" /> : (item.flow_meter_serial || '—')}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input type="date" value={inlineEditData.calibration_valid_from} onChange={(e) => handleInlineChange('calibration_valid_from', e.target.value)} className="h-7 text-xs px-2" /> : (item.calibration_valid_from || '—')}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap bg-indigo-50/35">
                            {inlineEditId === item.id ? <Input type="date" value={inlineEditData.calibration_valid_to} onChange={(e) => handleInlineChange('calibration_valid_to', e.target.value)} className="h-7 text-xs px-2" /> : (item.calibration_valid_to || '—')}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35">{item.telemetry_applicable || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35 max-w-[140px]">
                            <span className="line-clamp-3" title={formatTelemetryCompanyDisplay(item)}>{formatTelemetryCompanyDisplay(item)}</span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35">{item.telemetry_communication_via || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35 max-w-[200px]">
                            <span className="line-clamp-3" title={formatTelemetrySimLine(item)}>{formatTelemetrySimLine(item)}</span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs font-mono bg-indigo-50/35">{item.telemetry_product_code || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs font-mono bg-indigo-50/35">{item.telemetry_serial_number || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35 max-w-[200px]">
                            {item.telemetry_portal_url ? (
                              <a href={item.telemetry_portal_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all line-clamp-2">
                                {item.telemetry_portal_url}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35">{item.telemetry_username || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs bg-indigo-50/35">{item.telemetry_password ? '••••••' : '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap font-mono text-xs bg-indigo-50/35">{item.telemetry_valid_from || '—'}</td>
                          <td className="py-3 px-4 align-top bg-indigo-50/35">
                            <TelemValidToCell value={item.telemetry_valid_to} />
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-[11px] bg-indigo-50/35 max-w-[220px]">
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
                        <td className="py-3 px-3 text-foreground bg-indigo-50/35 text-xs align-top">
                          <p className="font-mono font-medium">
                            {item.flow_meter_serial || item.inventory_id || '—'}
                            {isDraftRecord(item) ? (
                              <span className="ml-2 inline-flex rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-foreground">
                                Draft
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{formatTelemetryCompanyDisplay(item)}</p>
                        </td>
                      )}

                      {cgwGridSectionsOpen.piezometer ? (
                        <>
                          <td className="py-3 px-4 text-muted-foreground min-w-[220px] bg-violet-50/35 text-xs">
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
                        <td className="py-3 px-3 text-foreground bg-violet-50/35 text-xs align-top max-w-[200px]">
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
                        <td className="py-3 px-3 text-foreground bg-amber-50/30 text-xs align-top">
                          {(() => {
                            const cats = ['water_quality_certificate', 'cte', 'cto', 'rwss_watco_phed_noc', 'approval_letter', 'rain_water_harvesting_data', 'additional_doc'];
                            const n = cats.reduce((acc, k) => acc + (item?.cgw_attachments?.[k]?.length || 0), 0);
                            return (
                              <>
                                <p className="font-medium text-foreground">Step 5 files</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{n ? `${n} file(s)` : 'None'}</p>
                              </>
                            );
                          })()}
                        </td>
                      )}

                      {canManage && (
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 border-border text-xs text-foreground hover:bg-muted"
                              title={isDraftRecord(item) ? 'Continue draft' : 'Edit'}
                              aria-label={`${isDraftRecord(item) ? 'Continue draft for' : 'Edit'} ${item.customer_name || item.inventory_id || 'record'}`}
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            {canDeleteCgw && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0 border-border text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Delete"
                                aria-label={`Delete ${item.customer_name || item.inventory_id || 'record'}`}
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
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
          <div className="border-t border-border bg-muted/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
            <div className="text-muted-foreground" aria-live="polite">
              Showing customers <span className="font-medium text-foreground tabular-nums">{totalGroups === 0 ? 0 : pageStartIndex + 1}</span> to{' '}
              <span className="font-medium text-foreground tabular-nums">{Math.min(pageStartIndex + pageSize, totalGroups)}</span> of{' '}
              <span className="font-medium text-foreground tabular-nums">{totalGroups}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:flex-wrap" role="navigation" aria-label="Pagination">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
                className="order-last col-span-3 h-11 sm:order-none sm:col-span-1 sm:h-10 rounded-lg border border-input px-2 text-sm bg-card text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 sm:h-9 px-3 text-sm border-input text-foreground hover:bg-muted"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-foreground min-w-[88px] text-center text-sm tabular-nums" aria-current="page">
                Page {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 sm:h-9 px-3 text-sm border-input text-foreground hover:bg-muted"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        (() => {
          const hasActiveFilters =
            !!searchTerm.trim() ||
            !!nocValidUptoFilter ||
            !!telemValidToFilter ||
            Object.values(columnFilters || {}).some((v) => String(v || '').trim());
          return hasActiveFilters ? (
            <EmptyState
              icon={SearchX}
              title="No records match your filters"
              description="Try a different search term, or clear the filters to see every CGWA record again."
              action={
                <Button type="button" variant="outline" onClick={handleClearAllFilters}>
                  <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Clear search &amp; filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="No CGWA records yet"
              description="Records you create will appear here, with their NOC, flow metre, piezometer and attachment details."
              action={
                canCreateCgw ? (
                  <Button type="button" onClick={() => navigate(CREATE_CGWA_PATH)}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Create CGWA
                  </Button>
                ) : null
              }
            />
          );
        })()
      )}
        </>
      )}

      {isDraftsScreen && (
        <>
          <Card className="p-4 sm:p-5">
            <div className="relative">
              <Label htmlFor="cgw-drafts-search" className="sr-only">Search drafts</Label>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="cgw-drafts-search"
                type="search"
                autoComplete="off"
                placeholder="Search drafts by customer, location, or ID…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 h-10 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </Card>
          {filteredItems.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="app-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>CGWA ID</th>
                      <th>Progress</th>
                      <th>Last saved</th>
                      <th>Saved by</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{item.customer_name || '—'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.location || item.contact_person || '—'}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-foreground">{item.inventory_id || item.id}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                            {cgwDraftProgressLabel(item)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-foreground">{formatHistoryDateTime(item.updated_at || item.created_at)}</td>
                        <td className="py-3 px-4 text-foreground">{item.last_modified_by_name || item.created_by_name || '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 border-border text-xs text-primary hover:bg-accent hover:text-accent-foreground"
                              aria-label={`Continue draft for ${item.customer_name || item.inventory_id || 'record'}`}
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                              Continue
                            </Button>
                            {(canDeleteCgw || (isDraftsScreen && hasCgwAccess)) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0 border-border text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Delete draft"
                                aria-label={`Delete draft for ${item.customer_name || item.inventory_id || 'record'}`}
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            searchTerm.trim() ? (
              <EmptyState
                icon={SearchX}
                title="No drafts match your search"
                description="Check the spelling, or clear the search to see all of your saved drafts."
                action={
                  <Button type="button" variant="outline" onClick={() => setSearchTerm('')}>
                    <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No saved drafts"
                description="Use Create CGWA and click Save draft to leave the form mid-way. You can continue from here later."
                action={
                  <Button type="button" onClick={() => navigate(CREATE_CGWA_PATH)}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Create CGWA
                  </Button>
                }
              />
            )
          )}
        </>
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
                  NOC periods — {nocTargetItem?.inventory_id || ''} · {nocTargetItem?.customer_name || ''}
                </span>
              </DialogTitle>
              <p className="text-slate-300 text-xs mt-1">
                Each NOC covers a validity period. Add another period or renew without replacing earlier PDFs.
              </p>
            </DialogHeader>
          </div>
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-0 overflow-hidden">
            <div className="w-full shrink-0 border-b border-border bg-muted lg:w-[240px] lg:max-w-[240px] lg:border-b-0 lg:border-r overflow-y-auto p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validity periods</p>
                <p className="text-xs text-muted-foreground mt-0.5">{nocPeriodRecords.length} period{nocPeriodRecords.length === 1 ? '' : 's'}</p>
              </div>
              {!nocReadOnly ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={() => startAddNocPeriod('add')}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add NOC period
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!nocPeriodRecords.length}
                    onClick={() => startAddNocPeriod('renew')}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Renew NOC
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                {nocPeriodRecords.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No NOC periods yet. Add the first validity period.</p>
                ) : (
                  nocPeriodRecords.map((rec) => {
                    const status = nocPeriodStatus(rec);
                    const selected = nocSaveMode === 'update' && rec.id === (nocSelectedRecordId || selectedNocRecord?.id);
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => selectNocPeriod(rec)}
                        className={cn(
                          'w-full text-left rounded-md border px-2.5 py-2 transition-colors',
                          selected ? 'border-primary/60 bg-white shadow-sm' : 'border-border bg-white hover:border-input',
                        )}
                      >
                        <p className="text-xs font-semibold text-foreground">{formatNocPeriod(rec)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{rec.noc_no || rec.application_no || rec.file_name || 'NOC'}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={cn(
                            'inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                            status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'expired' ? 'bg-muted text-muted-foreground' : status === 'upcoming' ? 'bg-sky-50 text-sky-700' : 'bg-muted text-muted-foreground',
                          )}>
                            {status === 'active' ? 'Current' : status === 'expired' ? 'Expired' : status === 'upcoming' ? 'Upcoming' : 'Saved'}
                          </span>
                          {rec.noc_type ? (
                            <span className="inline-flex rounded-full bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-cyan-800">
                              {rec.noc_type === 'renewal' ? 'Renewal' : rec.noc_type === 'new' ? 'New' : rec.noc_type}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="relative min-h-[40vh] flex-1 min-w-0 basis-0 bg-neutral-900 border-b lg:min-h-0 lg:border-b-0 lg:border-r lg:border-border">
              {(() => {
                const rawUrl = selectedNocDocumentUrl;
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center text-sm text-muted-foreground">
                      <span>Loading PDF…</span>
                    </div>
                  );
                }
                if (useStream && fullHref && !nocRemotePreviewLoading && !nocRemotePreviewUrl) {
                  return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-sm text-muted-foreground">
                      <p>Preview could not be loaded. You can still open the file in a new tab.</p>
                      <a
                        href={fullHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-foreground font-medium underline hover:text-accent-foreground"
                      >
                        Open NOC PDF
                      </a>
                    </div>
                  );
                }
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
                    {nocReadOnly
                      ? 'No NOC document on file for this row.'
                      : nocSaveMode === 'add' || nocSaveMode === 'renew'
                        ? 'Upload the PDF for this new validity period to preview it here.'
                        : canManage && !nocSideFieldsEditable
                        ? 'Preview only. Use Edit NOC details on the right to change the PDF or metadata.'
                        : 'Select a PDF (right) to preview here, or open an existing NOC from the grid.'}
                  </div>
                );
              })()}
            </div>
            <div className="w-full shrink-0 space-y-2 overflow-y-auto border-t border-border bg-white p-3 lg:w-[min(300px,28vw)] lg:max-w-[300px] lg:border-l lg:border-t-0 lg:border-border">
              {nocSaveMode === 'add' || nocSaveMode === 'renew' ? (
                <div className="rounded-md border border-primary/30 bg-accent px-3 py-2">
                  <p className="text-xs font-semibold text-accent-foreground">
                    {nocSaveMode === 'renew' ? 'Renewing NOC' : 'Adding a new validity period'}
                  </p>
                  <p className="text-xs text-accent-foreground mt-0.5">
                    Set the new valid from / valid up to dates and upload the PDF for this period. Earlier periods stay on file.
                  </p>
                  {nocPeriodRecords.length ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-0 text-xs text-accent-foreground hover:text-accent-foreground"
                      onClick={() => selectNocPeriod(pickCurrentNocRecord(nocPeriodRecords) || nocPeriodRecords[nocPeriodRecords.length - 1])}
                    >
                      Cancel and keep existing periods
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-md border border-border bg-muted/70 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">BHUNEER / no-cap portal</p>
                <div className="space-y-1.5">
                  <Label htmlFor="cgwflowmetre-field-22" className="text-xs font-medium text-foreground">BHUNEER user ID</Label>
                  <Input id="cgwflowmetre-field-22"
                    value={nocForm.bhuneer_user_id}
                    onChange={(e) => setNocForm((p) => ({ ...p, bhuneer_user_id: e.target.value }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="off"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cgwflowmetre-field-23" className="text-xs font-medium text-foreground">Password</Label>
                  <Input id="cgwflowmetre-field-23"
                    type="password"
                    value={nocForm.bhuneer_password}
                    onChange={(e) => setNocForm((p) => ({ ...p, bhuneer_password: e.target.value }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="new-password"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cgwflowmetre-field-24" className="text-xs font-medium text-foreground">No cap user ID</Label>
                  <Input id="cgwflowmetre-field-24"
                    value={nocForm.nocap_user_id}
                    onChange={(e) => setNocForm((p) => ({ ...p, nocap_user_id: e.target.value.toLowerCase() }))}
                    disabled={nocReadOnly || !nocSideFieldsEditable}
                    autoComplete="off"
                    placeholder="stored lowercase"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cgwflowmetre-field-25" className="text-xs font-medium text-foreground">Password</Label>
                  <Input id="cgwflowmetre-field-25"
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
                  <p className="text-xs text-amber-950 mb-2">
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
                  <Label className="text-xs font-medium text-foreground">NOC PDF</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleNocFilePicked}
                      className="h-9 text-xs"
                    />
                    <Upload className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  </div>
                  <p className="text-xs text-muted-foreground">PDF only, max 25 MB. Required for a new or renewed period.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-26" className="text-xs font-medium text-foreground">Project name</Label>
                <Input id="cgwflowmetre-field-26"
                  value={nocForm.project_name}
                  onChange={(e) => setNocForm((p) => ({ ...p, project_name: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-27" className="text-xs font-medium text-foreground">NOC No</Label>
                <Input id="cgwflowmetre-field-27"
                  value={nocForm.noc_no}
                  onChange={(e) => setNocForm((p) => ({ ...p, noc_no: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-28" className="text-xs font-medium text-foreground">Application No</Label>
                <Input id="cgwflowmetre-field-28"
                  value={nocForm.application_no}
                  onChange={(e) => setNocForm((p) => ({ ...p, application_no: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-29" className="text-xs font-medium text-foreground">Project address</Label>
                <Input id="cgwflowmetre-field-29"
                  value={nocForm.project_address}
                  onChange={(e) => setNocForm((p) => ({ ...p, project_address: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-30" className="text-xs font-medium text-foreground">Communication address</Label>
                <Input id="cgwflowmetre-field-30"
                  value={nocForm.communication_address}
                  onChange={(e) => setNocForm((p) => ({ ...p, communication_address: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-31" className="text-xs font-medium text-foreground">Project status</Label>
                <select id="cgwflowmetre-field-31"
                  value={nocForm.project_status}
                  onChange={(e) => setNocForm((p) => ({ ...p, project_status: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="w-full border border-input bg-card rounded-md px-2 h-9 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <option value="">—</option>
                  <option value="existing_ground_water">Existing ground water</option>
                  <option value="new_ground_water">New ground water</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-32" className="text-xs font-medium text-foreground">NOC type</Label>
                <select id="cgwflowmetre-field-32"
                  value={nocForm.noc_type}
                  onChange={(e) => setNocForm((p) => ({ ...p, noc_type: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="w-full border border-input bg-card rounded-md px-2 h-9 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <option value="">—</option>
                  <option value="new">New</option>
                  <option value="renewal">Renewal</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-33" className="text-xs font-medium text-foreground">M3 per day</Label>
                <Input id="cgwflowmetre-field-33"
                  value={nocForm.permitted_m3_per_day}
                  onChange={(e) => setNocForm((p) => ({ ...p, permitted_m3_per_day: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-34" className="text-xs font-medium text-foreground">M3 per year</Label>
                <Input id="cgwflowmetre-field-34"
                  value={nocForm.permitted_m3_per_year}
                  onChange={(e) => setNocForm((p) => ({ ...p, permitted_m3_per_year: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-35" className="text-xs font-medium text-foreground">Existing BW count</Label>
                <Input id="cgwflowmetre-field-35"
                  value={nocForm.existing_bw_count}
                  onChange={(e) => setNocForm((p) => ({ ...p, existing_bw_count: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-36" className="text-xs font-medium text-foreground">Total proposed BW count</Label>
                <Input id="cgwflowmetre-field-36"
                  value={nocForm.total_proposed_bw_count}
                  onChange={(e) => setNocForm((p) => ({ ...p, total_proposed_bw_count: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="rounded-md border border-border p-2 space-y-2">
                <p className="text-xs font-semibold text-foreground">Dewatering / structure</p>
                <div className="space-y-1.5">
                  <Label htmlFor="cgwflowmetre-field-37" className="text-xs font-medium text-foreground">Flowmeter applicable</Label>
                  <select id="cgwflowmetre-field-37"
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
                    className="w-full border border-input bg-card rounded-md px-2 h-9 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {nocForm.flowmeter_applicable === 'yes' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cgwflowmetre-field-38" className="text-xs font-medium text-foreground">Flowmeter count</Label>
                    <Input id="cgwflowmetre-field-38"
                      value={nocForm.flowmeter_count}
                      onChange={(e) => setNocForm((p) => ({ ...p, flowmeter_count: e.target.value }))}
                      disabled={nocReadOnly || !nocSideFieldsEditable}
                      className="h-9 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="cgwflowmetre-field-39" className="text-xs font-medium text-foreground">Piezometer applicable</Label>
                  <select id="cgwflowmetre-field-39"
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
                    className="w-full border border-input bg-card rounded-md px-2 h-9 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {nocForm.piezometer_applicable === 'yes' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cgwflowmetre-field-40" className="text-xs font-medium text-foreground">Piezometer count</Label>
                    <Input id="cgwflowmetre-field-40"
                      value={nocForm.piezometer_count}
                      onChange={(e) => setNocForm((p) => ({ ...p, piezometer_count: e.target.value }))}
                      disabled={nocReadOnly || !nocSideFieldsEditable}
                      className="h-9 text-sm"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-41" className="text-xs font-medium text-foreground">Valid from</Label>
                <Input id="cgwflowmetre-field-41"
                  type="date"
                  value={nocForm.valid_from}
                  onChange={(e) => setNocForm((p) => ({ ...p, valid_from: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cgwflowmetre-field-42" className="text-xs font-medium text-foreground">Valid up to</Label>
                <Input id="cgwflowmetre-field-42"
                  type="date"
                  value={nocForm.valid_upto}
                  onChange={(e) => setNocForm((p) => ({ ...p, valid_upto: e.target.value }))}
                  disabled={nocReadOnly || !nocSideFieldsEditable}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {!nocReadOnly && nocSideFieldsEditable && (
                  <Button
                    type="button"
                    disabled={nocSaving}
                    onClick={handleNocSave}
                  >
                    {nocSaving ? 'Saving…' : nocSaveMode === 'renew' ? 'Save renewed NOC' : nocSaveMode === 'add' ? 'Save new period' : 'Save NOC'}
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
            <div className="rounded-md border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Created by</p>
              <p className="font-medium text-foreground">{historyItem?.created_by_name || '—'}</p>
            </div>
            <div className="rounded-md border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Created date</p>
              <p className="font-medium text-foreground">{formatHistoryDateTime(historyItem?.created_at)}</p>
            </div>
            <div className="rounded-md border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Last modified by</p>
              <p className="font-medium text-foreground">{historyItem?.last_modified_by_name || historyItem?.created_by_name || '—'}</p>
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
          <p className="px-4 py-2 text-xs text-amber-900 bg-amber-50 border-b border-amber-100 shrink-0">
            Uploads require S3 to be configured on the server. Preview opens here — no download needed for images/PDF.
          </p>
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border bg-muted shrink-0">
            {CGW_MEDIA_KEYS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={mediaActiveCategory === k ? 'default' : 'outline'}
                className={`h-8 text-[11px] px-2 ${mediaActiveCategory === k ? 'bg-primary' : ''}`}
                onClick={() => setMediaActiveCategory(k)}
              >
                {CGW_MEDIA_LABELS[k]}
                <span className="ml-1 opacity-80">({getAttachList(mediaDialogItem, k).length})</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col min-h-0 bg-white">
              <div className="p-2 border-b border-border flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">Files in tab</span>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px]"
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
                      className={`flex items-start justify-between gap-1 rounded border px-2 py-1.5 text-xs ${
                        mediaSelectedFileId === att.id ? 'border-primary/60 bg-accent' : 'border-border bg-white'
                      }`}
                    >
                      <button aria-label={att.file_name}
                        type="button"
                        className="text-left flex-1 min-w-0 truncate text-foreground hover:underline"
                        onClick={() => setMediaSelectedFileId(att.id)}
                        title={att.file_name}
                      >
                        {att.file_name}
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          className="text-red-600 shrink-0 text-[11px] hover:underline"
                          onClick={() => handleDeleteMediaFile(mediaActiveCategory, att.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground p-2">No files in this category yet.</p>
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
                    <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground p-6 text-center">
                      Select a file from the list to preview.
                    </div>
                  );
                }
                if (shouldStream && mediaPreviewLoading) {
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground p-6 text-center">
                      Loading file preview...
                    </div>
                  );
                }
                if (shouldStream && mediaPreviewError) {
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground p-6 text-center">
                      {mediaPreviewError}
                    </div>
                  );
                }
                if (effectivePdf && previewSrc) {
                  return <iframe title="Preview" src={previewSrc} className="absolute inset-0 h-full w-full border-0 bg-white" />;
                }
                if (effectiveImage && previewSrc) {
                  return (
                    <div className="absolute inset-0 overflow-auto bg-muted flex items-center justify-center p-2">
                      <img src={previewSrc} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  );
                }
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground p-4 text-center">
                    Inline preview is not available for this file type. URL is stored on the row in S3.
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="px-4 py-2 border-t border-border bg-white shrink-0 flex justify-end">
            <Button type="button" variant="outline" onClick={closeMediaDialog}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CgwCustomerPreviewDialog
        open={customerPreviewOpen}
        onOpenChange={setCustomerPreviewOpen}
        group={customerPreviewGroup}
        customerCode={customerPreviewCode}
        onPreviewNoc={(item) => {
          if (item) openNocDialog(item, { startInPreviewMode: true });
        }}
      />
    </div>
  );
};

export default CGWFlowMetre;

import { EMPTY_PIEZO_ROW } from '@/pages/PiezometerAddWizardStep';

export const PREVIEW_FLOW_ATTACHMENT_KEYS = [
  { key: 'bw_geo_flowmeter', label: 'BW with flowmeter GEO tagging photos' },
  { key: 'calibration_certificate', label: 'Calibration certificate' },
  { key: 'service_report', label: 'Service report' },
  { key: 'telemetry', label: 'Telemetry device photos' },
  { key: 'telemetry_excel_prior', label: 'Telemetry Excel (prior year)' },
  { key: 'telemetry_service_prior', label: 'Telemetry service (prior year)' },
];

export const PREVIEW_LIFECYCLE_ATTACHMENT_KEYS = [
  { key: 'water_quality_certificate', label: 'Water quality certificate' },
  { key: 'cte', label: 'CTE' },
  { key: 'cto', label: 'CTO' },
  { key: 'rwss_watco_phed_noc', label: 'RWSS/WATCO/PHED NOC' },
  { key: 'approval_letter', label: 'Approval letter' },
  { key: 'rain_water_harvesting_data', label: 'Rain water harvesting data' },
  { key: 'additional_doc', label: 'Additional document' },
];

export const PREVIEW_PIEZO_ATTACHMENT_KEYS = [
  { key: 'piezometer_bw', label: 'Piezometer BW photos' },
  { key: 'piezometer_calibration', label: 'Piezometer calibration' },
  { key: 'piezometer_telemetry', label: 'Piezometer telemetry photos' },
  { key: 'piezometer_excel_prior', label: 'Piezometer Excel (prior year)' },
  { key: 'piezometer_service_report', label: 'Piezometer service report' },
];

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

export function formDataFromItem(item) {
  return {
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

export function nocFormFromItem(item) {
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

export function equipmentRowFromItem(item) {
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

function parseWizardSnapshot(rows) {
  for (const row of rows) {
    if (!row?.wizard_draft_json) continue;
    try {
      const snap = JSON.parse(row.wizard_draft_json);
      if (snap && typeof snap === 'object') return snap;
    } catch (_e) {
      /* ignore */
    }
  }
  return null;
}

function piezometersFromRows(rows) {
  const merged = [];
  rows.forEach((row) => {
    try {
      const parsed = typeof row.piezometer_details_json === 'string'
        ? JSON.parse(row.piezometer_details_json)
        : row.piezometer_details_json;
      const list = Array.isArray(parsed?.piezometers) ? parsed.piezometers : [];
      list.forEach((pz, idx) => {
        merged.push({
          row,
          label: row.inventory_id || `Row ${idx + 1}`,
          data: { ...EMPTY_PIEZO_ROW, ...pz },
        });
      });
    } catch (_e) {
      /* ignore */
    }
  });
  return merged;
}

export function buildCustomerPreviewModel(rows, customerCode = '') {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return null;

  const anchor = list[0];
  const snapshot = parseWizardSnapshot(list);

  const formData = snapshot?.formData
    ? { ...formDataFromItem(anchor), ...snapshot.formData }
    : formDataFromItem(anchor);

  const nocForm = snapshot?.addNocForm
    ? { ...nocFormFromItem(anchor), ...snapshot.addNocForm }
    : nocFormFromItem(anchor);

  const equipmentLines = snapshot?.equipmentRows?.length
    ? snapshot.equipmentRows.map((r, i) => ({
        inventoryRow: list[i] || anchor,
        equipment: { ...EMPTY_EQUIPMENT_ROW, ...r },
      }))
    : list.map((row) => ({
        inventoryRow: row,
        equipment: equipmentRowFromItem(row),
      }));

  let piezometerLines = [];
  if (snapshot?.piezometerRows?.length) {
    piezometerLines = snapshot.piezometerRows.map((pz, i) => ({
      inventoryRow: list[i] || anchor,
      label: list[i]?.inventory_id || `Piezometer ${i + 1}`,
      data: { ...EMPTY_PIEZO_ROW, ...pz },
    }));
  } else {
    piezometerLines = piezometersFromRows(list);
  }

  const needsPiezometer = String(nocForm.piezometer_applicable || '').toLowerCase() === 'yes';

  return {
    customerCode: customerCode || anchor.customer_id || '',
    formData,
    nocForm,
    equipmentLines,
    piezometerLines,
    needsPiezometer,
    nocDocumentUrl: anchor.noc_document_url || list.find((r) => r.noc_document_url)?.noc_document_url || '',
    inventoryIds: list.map((r) => r.inventory_id).filter(Boolean),
  };
}

export function previewDisplay(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function previewYesNo(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  return previewDisplay(value);
}

export function previewPassword(value) {
  return value ? '••••••••' : '—';
}

export function previewProjectStatus(value) {
  if (value === 'existing_ground_water') return 'Existing ground water';
  if (value === 'new_ground_water') return 'New ground water';
  return previewDisplay(value);
}

export function previewNocType(value) {
  if (value === 'new') return 'New';
  if (value === 'renewal') return 'Renewal';
  return previewDisplay(value);
}

export function previewTelemetryCompany(row) {
  const c = (row?.telemetry_company || '').toLowerCase();
  if (c === 'frinso') return 'FRINSO';
  if (c === 'ubiqedge') return 'UBIQEDGE';
  if (c === 'other') return row?.telemetry_company_other || 'Other';
  return previewDisplay(row?.telemetry_company);
}

export function previewCommunicationVia(value) {
  const v = (value || '').toLowerCase();
  if (v === 'sim') return 'SIM';
  if (v === 'wifi') return 'Wi-Fi';
  if (v === 'ethernet') return 'Ethernet';
  return previewDisplay(value);
}

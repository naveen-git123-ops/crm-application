"""Pure business rules for the Service & Maintenance module.

Nothing in this file touches the database, FastAPI or server.py, so the rules
can be unit-tested on their own (see test_service_maintenance.py).
"""
from __future__ import annotations

import copy
import os
import re
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional

# ---------------------------------------------------------------------------
# Customer type / service type routing
# ---------------------------------------------------------------------------

CUSTOMER_NEW = 'New'
CUSTOMER_EXISTING = 'Existing'
CUSTOMER_TYPES = (CUSTOMER_NEW, CUSTOMER_EXISTING)

ST_INSTALL = 'Installation & Commissioning'
ST_COMMISSION = 'On-site Commissioning'
ST_TROUBLE = 'Troubleshooting / Breakdown'
ST_REPAIR = 'Repair'
ST_GENERAL = 'General Service'
ST_PM = 'Preventive Maintenance'
ST_AMC = 'AMC Visit'

SERVICE_TYPES_BY_CUSTOMER = {
    CUSTOMER_NEW: [ST_INSTALL, ST_COMMISSION],
    CUSTOMER_EXISTING: [ST_TROUBLE, ST_REPAIR, ST_GENERAL, ST_PM, ST_AMC],
}

WF_INSTALL = 'installation'
WF_REPAIR = 'repair'
WF_AMC = 'amc'

WORKFLOW_BY_SERVICE_TYPE = {
    ST_INSTALL: WF_INSTALL,
    ST_COMMISSION: WF_INSTALL,
    ST_TROUBLE: WF_REPAIR,
    ST_REPAIR: WF_REPAIR,
    ST_GENERAL: WF_REPAIR,
    ST_PM: WF_REPAIR,
    ST_AMC: WF_AMC,
}

# Sections of the per-request JSON document each workflow may write to.
SECTIONS_BY_WORKFLOW = {
    WF_INSTALL: ('inspection', 'execution', 'commissioning'),
    WF_REPAIR: ('troubleshooting', 'work', 'final_test'),
    WF_AMC: ('amc',),
}

# Detail-screen tabs that apply to each workflow (the rest are hidden).
TABS_BY_WORKFLOW = {
    WF_INSTALL: ['overview', 'customer', 'inspection', 'worklog', 'visits', 'files', 'report', 'history'],
    WF_REPAIR: ['overview', 'customer', 'inspection', 'worklog', 'visits', 'files', 'vendor', 'report', 'history'],
    WF_AMC: ['overview', 'customer', 'inspection', 'worklog', 'visits', 'files', 'report', 'history'],
}

PRIORITIES = ('Low', 'Medium', 'High', 'Critical')
PRIORITY_RANK = {name: idx for idx, name in enumerate(PRIORITIES)}

DEFAULT_PROBLEM_CATEGORIES = [
    'Electrical Problem',
    'Mechanical Problem',
    'Product Not Working',
    'Performance Issue',
    'Installation-Related Issue',
    'Software/Configuration Issue',
    'Physical Damage',
    'Spare Part Failure',
    'Preventive Maintenance',
    'Other',
]

SITE_READINESS = ('Ready', 'Partially Ready', 'Not Ready')
INSTALL_STATUSES = ('Not Started', 'Scheduled', 'In Progress', 'On Hold', 'Completed')
COMMISSION_STATUSES = ('Pending', 'In Progress', 'Successful', 'Failed', 'Pending Revisit')
TEST_OUTCOMES = ('Passed', 'Failed', 'Partially Passed', 'Pending Further Work')
REPAIR_FEASIBILITY = ('Repairable on-site', 'Repairable in workshop', 'Vendor repair required', 'Not repairable')
REPAIR_LOCATIONS = ('On-site', 'Workshop', 'Vendor')
WORK_STATUSES = ('Completed', 'Incomplete')
NEXT_STEPS = (
    'Additional Troubleshooting',
    'Spare Parts Required',
    'Vendor Repair Required',
    'Customer Approval Required',
    'Customer-Site Work Pending',
    'Revisit Required',
    'Other',
)
VISIT_OUTCOMES = ('Completed', 'Partially Completed', 'Revisit Required', 'Customer Unavailable', 'Cancelled')
VISIT_STATUSES = ('Planned', 'Completed', 'Cancelled')
YES_NO = ('Yes', 'No')

ENUM_FIELDS: Dict[str, Dict[str, Iterable[str]]] = {
    'inspection': {'site_readiness': SITE_READINESS},
    'execution': {'status': INSTALL_STATUSES},
    'commissioning': {'status': COMMISSION_STATUSES},
    'work': {'repair_status': WORK_STATUSES, 'next_step': NEXT_STEPS},
    'final_test': {'outcome': TEST_OUTCOMES},
    'troubleshooting': {
        'problem_verified': YES_NO,
        'feasibility': REPAIR_FEASIBILITY,
        'repair_location': REPAIR_LOCATIONS,
    },
}

# ---------------------------------------------------------------------------
# Status model
# ---------------------------------------------------------------------------

STATUSES = (
    'Draft', 'New', 'Scheduled', 'Assigned', 'In Progress', 'On Hold',
    'Awaiting Customer', 'Awaiting Parts', 'Waiting for Vendor',
    'Inspection Pending', 'Report Pending', 'Completed', 'Closed', 'Cancelled',
)

_OPEN_WORK = [
    'On Hold', 'Awaiting Customer', 'Awaiting Parts', 'Waiting for Vendor',
    'Inspection Pending', 'Report Pending', 'Scheduled',
]

TRANSITIONS: Dict[str, List[str]] = {
    'Draft': ['New', 'Cancelled'],
    'New': ['Assigned', 'Scheduled', 'On Hold', 'Cancelled'],
    'Assigned': ['Scheduled', 'In Progress', 'On Hold', 'Cancelled'],
    'Scheduled': ['Assigned', 'In Progress', 'On Hold', 'Cancelled'],
    'In Progress': _OPEN_WORK + ['Completed', 'Cancelled'],
    'On Hold': ['In Progress', 'Assigned', 'Scheduled', 'Cancelled'],
    'Awaiting Customer': ['In Progress', 'On Hold', 'Cancelled'],
    'Awaiting Parts': ['In Progress', 'On Hold', 'Cancelled'],
    'Waiting for Vendor': ['In Progress', 'Inspection Pending', 'On Hold', 'Cancelled'],
    'Inspection Pending': ['In Progress', 'Report Pending', 'Waiting for Vendor', 'Completed', 'On Hold', 'Cancelled'],
    'Report Pending': ['In Progress', 'Inspection Pending', 'Completed', 'On Hold', 'Cancelled'],
    'Completed': ['Closed', 'In Progress', 'Report Pending'],
    'Closed': ['In Progress'],
    'Cancelled': [],
}

TERMINAL_STATUSES = ('Closed', 'Cancelled')
LOCKED_STATUSES = ('Completed', 'Closed', 'Cancelled')
ACTIVE_EXECUTION_STATUSES = (
    'In Progress', 'Inspection Pending', 'Report Pending', 'Waiting for Vendor',
)
REASON_REQUIRED_STATUSES = ('On Hold', 'Awaiting Customer', 'Awaiting Parts', 'Cancelled')
NOT_OVERDUE_STATUSES = ('Draft', 'Completed', 'Closed', 'Cancelled')

# Summary cards: card key -> statuses it covers.
CARD_STATUSES = {
    'new': ['New'],
    'assigned': ['Assigned', 'Scheduled'],
    'in_progress': ['In Progress', 'Inspection Pending', 'Report Pending', 'Awaiting Parts', 'On Hold'],
    'waiting_vendor': ['Waiting for Vendor'],
    'waiting_customer': ['Awaiting Customer'],
    'completed': ['Completed', 'Closed'],
}

# ---------------------------------------------------------------------------
# Configuration (company policy) defaults. Stored overrides are merged on top.
# ---------------------------------------------------------------------------

VENDOR_STAGE_RECOMMENDED = 'Repair Recommended'
VENDOR_STAGE_APPROVAL = 'Awaiting Approval, if required'
VENDOR_STAGE_READY = 'Ready for Dispatch'
VENDOR_STAGE_DISPATCHED = 'Dispatched to Vendor'
VENDOR_STAGE_RECEIVED = 'Received by Vendor'
VENDOR_STAGE_UNDER_REPAIR = 'Under Vendor Repair'
VENDOR_STAGE_VENDOR_DONE = 'Repair Completed by Vendor'
VENDOR_STAGE_RETURNED = 'Returned from Vendor'
VENDOR_STAGE_POST_INSPECTION = 'Post-Repair Inspection'
VENDOR_STAGE_CLOSED = 'Returned to Customer / Service Closed'

DEFAULT_VENDOR_STAGES = [
    VENDOR_STAGE_RECOMMENDED,
    VENDOR_STAGE_APPROVAL,
    VENDOR_STAGE_READY,
    VENDOR_STAGE_DISPATCHED,
    VENDOR_STAGE_RECEIVED,
    VENDOR_STAGE_UNDER_REPAIR,
    VENDOR_STAGE_VENDOR_DONE,
    VENDOR_STAGE_RETURNED,
    VENDOR_STAGE_POST_INSPECTION,
    VENDOR_STAGE_CLOSED,
]

DEFAULT_CONFIG: Dict[str, Any] = {
    'problem_categories': DEFAULT_PROBLEM_CATEGORIES,
    'vendor_stages': DEFAULT_VENDOR_STAGES,
    'checklists': {
        'installation_inspection': [
            'Site access confirmed',
            'Power supply available at site',
            'Foundation / mounting space ready',
            'Safety requirements reviewed',
        ],
        'installation_execution': [
            'Unit positioned and fixed',
            'Mechanical connections completed',
            'Electrical connections completed',
            'Installation cleaned up',
        ],
        'commissioning': [
            'Pre-start checks completed',
            'Initial start-up completed',
            'Functional test completed',
            'Safety checks completed',
            'Customer demonstration given',
        ],
        'repair_inspection': [
            'Reported problem verified',
            'Visual inspection completed',
            'Power and connections checked',
            'Nameplate and serial number recorded',
        ],
        'amc': [
            'Visual inspection completed',
            'Cleaning and lubrication done',
            'Electrical connections checked',
            'Performance readings recorded',
            'Safety devices checked',
        ],
    },
    # {product category: {checklist key: [items]}} — overrides the defaults above.
    'checklists_by_category': {},
    'mandatory_evidence': {
        WF_INSTALL: ['Site Before Installation', 'Installed Product'],
        WF_REPAIR: ['Before-Service Photos/Videos', 'After-Service Photos/Videos'],
        WF_AMC: [],
    },
    'ack_required_types': [],
    'amc_required': True,
    'allow_unassigned': False,
    'require_lead_for_existing': True,
    'vendor_approval_required': False,
    'service_types_by_customer': None,
    'company_profile': {},
}

# Vendor stages that carry business rules - they may not be removed or renamed in settings.
REQUIRED_VENDOR_STAGES = (
    VENDOR_STAGE_DISPATCHED,
    VENDOR_STAGE_VENDOR_DONE,
    VENDOR_STAGE_RETURNED,
    VENDOR_STAGE_POST_INSPECTION,
    VENDOR_STAGE_CLOSED,
)


def merge_config(stored: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    if not isinstance(stored, dict):
        return cfg
    for key, value in stored.items():
        if key not in cfg:
            continue
        if key in ('checklists', 'mandatory_evidence') and isinstance(value, dict):
            cfg[key].update(value)
        elif value is not None:
            cfg[key] = value
    return cfg


def checklist_items(config: Dict[str, Any], key: str, product_category: Optional[str] = None) -> List[str]:
    by_cat = (config.get('checklists_by_category') or {}).get(product_category or '') or {}
    items = by_cat.get(key) or (config.get('checklists') or {}).get(key) or []
    return [str(i).strip() for i in items if str(i).strip()]


def allowed_service_types(customer_type: str, config: Optional[Dict[str, Any]] = None) -> List[str]:
    override = (config or {}).get('service_types_by_customer')
    table = override if isinstance(override, dict) else SERVICE_TYPES_BY_CUSTOMER
    return list(table.get(customer_type) or SERVICE_TYPES_BY_CUSTOMER.get(customer_type) or [])


def default_service_type(customer_type: str) -> Optional[str]:
    types = SERVICE_TYPES_BY_CUSTOMER.get(customer_type) or []
    return types[0] if types else None


def workflow_for(service_type: str) -> Optional[str]:
    return WORKFLOW_BY_SERVICE_TYPE.get(service_type)


def tabs_for(service_type: str) -> List[str]:
    return list(TABS_BY_WORKFLOW.get(workflow_for(service_type) or '', TABS_BY_WORKFLOW[WF_REPAIR]))


def selected_labels(payload: Dict[str, Any], list_key: str, single_key: str) -> List[str]:
    """Unique labels from a multi-select list, or the legacy single field."""
    raw = payload.get(list_key)
    out: List[str] = []
    if isinstance(raw, list):
        for item in raw:
            text = str(item or '').strip()
            if text and text not in out:
                out.append(text)
        return out
    single = str(payload.get(single_key) or '').strip()
    return [single] if single else []


def selected_service_types(payload: Dict[str, Any]) -> List[str]:
    return selected_labels(payload, 'service_types', 'service_type')


def selected_product_types(payload: Dict[str, Any]) -> List[str]:
    return selected_labels(payload, 'product_types', 'product_category')


def workflows_for_types(service_types: Iterable[str]) -> List[str]:
    out: List[str] = []
    for service_type in service_types:
        workflow = workflow_for(service_type)
        if workflow and workflow not in out:
            out.append(workflow)
    return out


def tabs_for_types(service_types: Iterable[str]) -> List[str]:
    types = [str(item or '').strip() for item in service_types if str(item or '').strip()]
    if not types:
        return tabs_for('')
    out: List[str] = []
    for service_type in types:
        for tab in tabs_for(service_type):
            if tab not in out:
                out.append(tab)
    return out


# ---------------------------------------------------------------------------
# Small parsers / validators
# ---------------------------------------------------------------------------

def parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip()[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def parse_datetime(value: Any) -> Optional[datetime]:
    text = str(value or '').strip()
    if not text:
        return None
    for fmt in ('%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(text[:19] if 'T' in text or ' ' in text else text[:10], fmt)
        except ValueError:
            continue
    return None


def _blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip()) or value == []


def validate_mobile(value: Any) -> bool:
    digits = re.sub(r'\D', '', str(value or ''))
    return 7 <= len(digits) <= 15


def validate_email(value: Any) -> bool:
    return bool(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', str(value or '').strip()))


def validate_pincode(value: Any) -> bool:
    return bool(re.fullmatch(r'\d{6}', str(value or '').strip()))


def normalize_serial(value: Any) -> str:
    return re.sub(r'\s+', '', str(value or '')).upper()


def validate_serial(value: Any) -> bool:
    serial = normalize_serial(value)
    return bool(re.fullmatch(r'[A-Z0-9][A-Z0-9\-_/\.]{2,59}', serial))


def site_visit_answer(value: Any) -> Optional[bool]:
    """Yes/No for 'does this call need a site visit?'. None means it was not answered."""
    if isinstance(value, bool):
        return value
    text = str(value if value is not None else '').strip().lower()
    if text in ('yes', 'true', '1'):
        return True
    if text in ('no', 'false', '0'):
        return False
    return None


def validate_call_intake(payload: Dict[str, Any]) -> List[str]:
    """What the representative can collect on the phone, before anyone knows the service or product."""
    errors: List[str] = []
    if str(payload.get('priority') or 'Medium') not in PRIORITIES:
        errors.append('Priority must be Low, Medium, High or Critical')
    if _blank(payload.get('contact_person')):
        errors.append('Name is required')
    if _blank(payload.get('mobile')) or not validate_mobile(payload.get('mobile')):
        errors.append('A valid phone number is required')
    if not _blank(payload.get('email')) and not validate_email(payload.get('email')):
        errors.append('Email address is not valid')
    if _blank(payload.get('site_address')):
        errors.append('Address is required')
    if not _blank(payload.get('pincode')) and not validate_pincode(payload.get('pincode')):
        errors.append('PIN code must be 6 digits')
    if len(str(payload.get('problem_description') or '').strip()) < 5:
        errors.append('Describe the problem the customer reported')
    visit = site_visit_answer(payload.get('site_visit_required'))
    if visit is None:
        errors.append('Say whether a site visit is required')
    elif visit:
        ack = payload.get('site_visit_acknowledgement')
        ack = ack if isinstance(ack, dict) else {}
        if not ack.get('acknowledged'):
            errors.append('Record the customer acknowledgement for the site visit')
        if _blank(ack.get('name')):
            errors.append('Enter the name of the person who acknowledged the site visit')
        if _blank(ack.get('notes')):
            errors.append('Acknowledgement notes are required')
    return errors


def validate_create(payload: Dict[str, Any], config: Optional[Dict[str, Any]] = None, *, draft: bool = False) -> List[str]:
    """Server-side validation for a new (or newly submitted) service request."""
    cfg = merge_config(config)
    errors: List[str] = []
    ctype = str(payload.get('customer_type') or '').strip()
    service_types = selected_service_types(payload)
    product_types = selected_product_types(payload)

    if ctype not in CUSTOMER_TYPES:
        errors.append('Select whether this is a New or Existing customer')
        return errors
    if _blank(payload.get('customer_id')):
        errors.append('A valid customer is required')
    if draft:
        return errors

    # The call only captures who called and what they said. Service type and product come after the visit,
    # unless no visit is needed and the executive classifies the job now.
    if not service_types:
        if isinstance(payload.get('service_types'), list):
            errors.append('Select at least one service type')
        errors.extend(validate_call_intake(payload))
        return errors

    if isinstance(payload.get('product_types'), list) and not product_types:
        errors.append('Select at least one product type')
    if product_types and _blank(payload.get('product_category')):
        payload = {**payload, 'product_category': product_types[0]}
    if 'site_visit_required' in payload:
        errors.extend(validate_call_intake(payload))

    allowed = allowed_service_types(ctype, cfg)
    for stype in service_types:
        if stype not in allowed:
            errors.append(f'"{stype}" is not available for {ctype.lower()} customers')
    if any(stype not in allowed for stype in service_types):
        return errors
    stype = service_types[0]
    workflows = workflows_for_types(service_types)
    workflow = workflows[0] if workflows else None

    if str(payload.get('priority') or 'Medium') not in PRIORITIES:
        errors.append('Priority must be Low, Medium, High or Critical')
    if _blank(payload.get('contact_person')):
        errors.append('Contact person is required')
    if _blank(payload.get('mobile')) or not validate_mobile(payload.get('mobile')):
        errors.append('A valid mobile number is required')
    if not _blank(payload.get('email')) and not validate_email(payload.get('email')):
        errors.append('Email address is not valid')
    if _blank(payload.get('site_address')):
        errors.append('Installation / site address is required')
    if not _blank(payload.get('pincode')) and not validate_pincode(payload.get('pincode')):
        errors.append('PIN code must be 6 digits')
    if not _blank(payload.get('serial_number')) and not validate_serial(payload.get('serial_number')):
        errors.append('Serial number may only use letters, numbers, - _ / . (3 to 60 characters)')

    for field, label in (
        ('planned_date', 'Planned date'),
        ('expected_visit_date', 'Expected visit date'),
        ('expected_completion', 'Expected completion date'),
        ('reported_date', 'Reported date'),
    ):
        if not _blank(payload.get(field)) and parse_date(payload.get(field)) is None:
            errors.append(f'{label} is not a valid date')
    start = parse_date(payload.get('planned_date')) or parse_date(payload.get('expected_visit_date'))
    end = parse_date(payload.get('expected_completion'))
    if start and end and end < start:
        errors.append('Expected completion cannot be before the planned / visit date')

    if ctype == CUSTOMER_EXISTING:
        if cfg.get('require_lead_for_existing') and _blank(payload.get('lead_id')):
            errors.append('Select the existing lead this service belongs to')
        if _blank(payload.get('product_id')) and not product_types:
            errors.append('Select the affected product, or register it first')

    if WF_INSTALL in workflows:
        for field, label in (
            ('product_category', 'Product category'),
            ('product_name', 'Product name'),
            ('product_model', 'Product model'),
        ):
            if _blank(payload.get(field)):
                errors.append(f'{label} is required for installation')
        try:
            if float(payload.get('quantity') or 0) <= 0:
                errors.append('Quantity must be greater than zero')
        except (TypeError, ValueError):
            errors.append('Quantity must be a number')
        if _blank(payload.get('planned_date')):
            errors.append('Installation / planned date is required')
    if WF_REPAIR in workflows:
        if _blank(payload.get('problem_category')):
            errors.append('Problem category is required')
        if len(str(payload.get('problem_description') or '').strip()) < 5:
            errors.append('Describe the problem (at least 5 characters)')
    if WF_AMC in workflows:
        if cfg.get('amc_required') and _blank(payload.get('amc_id')):
            errors.append('Select an active AMC contract for this visit')
    return errors


def validate_section(section: str, data: Any) -> List[str]:
    """Light validation of one section of the per-request JSON document."""
    errors: List[str] = []
    rows = data if isinstance(data, list) else [data]
    if section == 'troubleshooting' and not isinstance(data, list):
        return ['Troubleshooting entries must be a list']
    for row in rows:
        if not isinstance(row, dict):
            errors.append(f'{section}: invalid data')
            continue
        for field, allowed in (ENUM_FIELDS.get(section) or {}).items():
            value = row.get(field)
            if not _blank(value) and value not in allowed:
                errors.append(f'{section}: "{value}" is not a valid {field.replace("_", " ")}')
        for key, value in row.items():
            if key.endswith('_date') and not _blank(value) and parse_date(value) is None:
                errors.append(f'{section}: {key.replace("_", " ")} is not a valid date')
            if key.endswith('_at') and not _blank(value) and parse_datetime(value) is None:
                errors.append(f'{section}: {key.replace("_", " ")} is not a valid date/time')
        start, end = parse_datetime(row.get('start_at')), parse_datetime(row.get('end_at'))
        if start and end and end < start:
            errors.append(f'{section}: end time cannot be before the start time')
    return errors


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

ATTACHMENT_CATEGORIES = (
    'Customer Documents',
    'Site Visit Acknowledgement',
    'Drawing',
    'Program/Configuration File',
    'Technical Document',
    'Product Image',
    'Site Inspection Photos',
    'Site Before Installation',
    'Installation in Progress',
    'Installed Product',
    'Commissioning Evidence',
    'Final Site Condition',
    'Before-Service Photos/Videos',
    'During-Service Photos/Videos',
    'After-Service Photos/Videos',
    'Vendor Dispatch Photos/Documents',
    'Vendor Repair Report',
    'Post-Repair Inspection Photos/Videos',
    'Final Service Report',
    'Other Supporting Document',
)

IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'}
VIDEO_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'}
DOCUMENT_EXTENSIONS = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'ppt', 'pptx', 'dwg', 'dxf',
}
PROGRAM_EXTENSIONS = {
    'json', 'xml', 'zip', 'step', 'stp', 'iges', 'igs', 'cfg', 'ini',
    'acd', 'ap', 'zap', 'rss', 'mwp', 'gxw', 'gx2', 'pro',
}
BLOCKED_EXTENSIONS = {
    'exe', 'bat', 'cmd', 'com', 'msi', 'sh', 'ps1', 'vbs', 'js', 'jar', 'dll', 'scr',
    'apk', 'app', 'php', 'py', 'html', 'htm', 'svg',
}
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_VIDEO_BYTES = 100 * 1024 * 1024
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024


def file_extension(filename: str) -> str:
    return os.path.splitext(os.path.basename(str(filename or '')))[1].lstrip('.').lower()


def safe_file_name(filename: str) -> str:
    base = os.path.basename(str(filename or '').replace('\\', '/')).strip()
    base = re.sub(r'[^\w\-. ()]', '_', base)
    return base[:200] or 'attachment'


def validate_attachment(filename: str, size_bytes: int, category: str) -> Optional[str]:
    """Returns an error message, or None when the upload is acceptable."""
    if category not in ATTACHMENT_CATEGORIES:
        return 'Choose a valid attachment category'
    name = safe_file_name(filename)
    ext = file_extension(name)
    if not ext:
        return 'The file needs an extension'
    if ext in BLOCKED_EXTENSIONS:
        return f'.{ext} files are not allowed'
    allowed = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | DOCUMENT_EXTENSIONS
    if category == 'Program/Configuration File':
        allowed = allowed | PROGRAM_EXTENSIONS
    if ext not in allowed:
        return f'.{ext} files are not supported for this category'
    if not size_bytes or size_bytes <= 0:
        return 'The file is empty'
    if ext in VIDEO_EXTENSIONS:
        limit, label = MAX_VIDEO_BYTES, 'videos'
    elif ext in IMAGE_EXTENSIONS:
        limit, label = MAX_IMAGE_BYTES, 'photos'
    else:
        limit, label = MAX_DOCUMENT_BYTES, 'documents'
    if size_bytes > limit:
        return f'{label.capitalize()} can be at most {limit // (1024 * 1024)} MB'
    return None


# ---------------------------------------------------------------------------
# Checklists, evidence, work gates
# ---------------------------------------------------------------------------

def checklist_complete(items: Any) -> bool:
    """Every required checklist row must be ticked. An empty checklist is complete."""
    rows = [r for r in (items or []) if isinstance(r, dict)]
    return all(bool(r.get('done')) for r in rows if r.get('required', True))


def checklist_pending(items: Any) -> List[str]:
    return [
        str(r.get('label') or 'Checklist item')
        for r in (items or [])
        if isinstance(r, dict) and r.get('required', True) and not r.get('done')
    ]


def missing_evidence(workflow: str, attachments: Iterable[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> List[str]:
    cfg = merge_config(config)
    required = (cfg.get('mandatory_evidence') or {}).get(workflow) or []
    present = {str(a.get('category') or '') for a in attachments or []}
    return [c for c in required if c not in present]


def final_test_failed(data: Dict[str, Any]) -> bool:
    outcome = ((data or {}).get('final_test') or {}).get('outcome')
    return bool(outcome) and outcome != 'Passed'


def _text(row: Dict[str, Any], key: str) -> str:
    return str((row or {}).get(key) or '').strip()


def _has_technician(service: Dict[str, Any]) -> bool:
    return bool(_text(service, 'assigned_employee_id') or _text(service, 'assigned_name'))


def _vendor_blockers(ctx: Dict[str, Any]) -> List[str]:
    service = ctx.get('service') or {}
    if service.get('workflow') != WF_REPAIR:
        return []
    repairs = [r for r in ctx.get('vendor_repairs') or [] if r.get('status') != 'Cancelled']
    out: List[str] = []
    entries = ((ctx.get('data') or {}).get('troubleshooting')) or []
    wants_vendor = bool(entries) and _text(entries[-1], 'repair_location') == 'Vendor'
    if wants_vendor and not repairs:
        out.append('Vendor repair was selected - record the vendor repair before completing')
    for repair in repairs:
        if repair.get('status') != 'Closed':
            out.append(
                f"Vendor repair {repair.get('repair_code') or ''} is still open "
                f"(stage: {repair.get('stage') or 'not started'})".replace('  ', ' ')
            )
        elif repair.get('post_repair_result') != 'Passed':
            out.append(f"Vendor repair {repair.get('repair_code') or ''} has no passed post-repair inspection")
    return out


def work_blockers(ctx: Dict[str, Any]) -> List[str]:
    """Everything that must be done in the field before the report can be submitted."""
    service = ctx.get('service') or {}
    data = ctx.get('data') or {}
    cfg = merge_config(ctx.get('config'))
    attachments = ctx.get('attachments') or []
    workflow = service.get('workflow')
    workflows = service.get('workflows') or ([workflow] if workflow else [])
    out: List[str] = []

    if not _text(service, 'service_type') and not service.get('service_types'):
        out.append('Record the service type and product details')
    if not _has_technician(service) and not cfg.get('allow_unassigned'):
        out.append('Assign a technician')

    if WF_INSTALL in workflows:
        for field, label in (
            ('product_name', 'Product name'),
            ('product_model', 'Product model'),
            ('product_category', 'Product category'),
        ):
            if not _text(service, field):
                out.append(f'{label} is missing')
        if float(service.get('quantity') or 0) <= 0:
            out.append('Quantity must be greater than zero')
        insp = data.get('inspection') or {}
        if not _text(insp, 'inspection_date') or not _text(insp, 'inspector'):
            out.append('Record the site inspection (date and inspector)')
        if not _text(insp, 'site_readiness'):
            out.append('Record the site readiness')
        elif insp.get('site_readiness') == 'Not Ready':
            out.append('Site is marked Not Ready - installation cannot be completed')
        pending = checklist_pending(insp.get('checklist'))
        if pending:
            out.append(f'Complete the site inspection checklist ({len(pending)} item(s) pending)')
        ex = data.get('execution') or {}
        if ex.get('status') != 'Completed':
            out.append('Installation status must be Completed')
        if not _text(ex, 'start_at') or not _text(ex, 'end_at'):
            out.append('Record the installation start and completion date/time')
        pending = checklist_pending(ex.get('checklist'))
        if pending:
            out.append(f'Complete the installation checklist ({len(pending)} item(s) pending)')
        com = data.get('commissioning') or {}
        if not _text(com, 'commissioning_date') or not _text(com, 'engineer'):
            out.append('Record the commissioning date and engineer')
        if com.get('status') != 'Successful':
            out.append(f"Commissioning must be Successful (currently {com.get('status') or 'Pending'})")
        pending = checklist_pending(com.get('checklist'))
        if pending:
            out.append(f'Complete the mandatory commissioning checks ({len(pending)} item(s) pending)')

    if WF_REPAIR in workflows:
        entries = data.get('troubleshooting') or []
        if not entries:
            out.append('Record at least one troubleshooting / inspection entry')
        else:
            last = entries[-1]
            if not _text(last, 'inspection_date'):
                out.append('Set the inspection date on the troubleshooting entry')
            if not _text(last, 'fault_identified'):
                out.append('Record the fault identified')
            pending = checklist_pending(last.get('checklist'))
            if pending:
                out.append(f'Complete the inspection checklist ({len(pending)} item(s) pending)')
        work = data.get('work') or {}
        if work.get('repair_status') == 'Incomplete':
            reason = _text(work, 'incomplete_reason') or _text(work, 'next_step') or 'no reason recorded'
            out.append(f'Repair is marked incomplete ({reason})')
        elif not (_text(work, 'repair_actions') or _text(work, 'troubleshooting_performed')):
            out.append('Record the work performed')
        if not _text(work, 'start_at') or not _text(work, 'end_at'):
            out.append('Record the work start and end date/time')
        final = data.get('final_test') or {}
        outcome = final.get('outcome')
        if not outcome:
            out.append('Record the final test result')
        elif outcome != 'Passed':
            out.append(
                f'Final test result is "{outcome}" - reopen troubleshooting, record another visit '
                'or send for vendor repair before completing'
            )
        else:
            if not _text(final, 'final_inspection_date') or not _text(final, 'inspector'):
                out.append('Record the final inspection date and inspector')
            if not _text(final, 'operational_status'):
                out.append('Record the product operational status')

    if WF_AMC in workflows:
        amc = data.get('amc') or {}
        if not _text(amc, 'actual_visit_date'):
            out.append('Record the actual visit date')
        pending = checklist_pending(amc.get('checklist'))
        if pending:
            out.append(f'Complete the maintenance checklist ({len(pending)} item(s) pending)')
        if not _text(amc, 'product_condition'):
            out.append('Record the product condition')
        if not _text(amc, 'work_performed'):
            out.append('Record the work performed')

    missing: List[str] = []
    for item_workflow in workflows or [workflow or '']:
        for item in missing_evidence(item_workflow, attachments, cfg):
            if item not in missing:
                missing.append(item)
    if missing:
        out.append('Upload the mandatory photos/videos: ' + ', '.join(missing))
    out.extend(_vendor_blockers(ctx))
    return out


def report_blockers(ctx: Dict[str, Any]) -> List[str]:
    report = ctx.get('report') or {}
    service = ctx.get('service') or {}
    cfg = merge_config(ctx.get('config'))
    if report.get('status') != 'Submitted':
        return ['Submit the final service report']
    if service.get('service_type') in (cfg.get('ack_required_types') or []):
        ack = (report.get('snapshot') or {}).get('customer_acknowledgement') or {}
        if not ack.get('acknowledged'):
            return ['Customer acknowledgement is required for this service type']
    return []


def report_submit_blockers(ctx: Dict[str, Any]) -> List[str]:
    out = work_blockers(ctx)
    service = ctx.get('service') or {}
    cfg = merge_config(ctx.get('config'))
    if service.get('service_type') in (cfg.get('ack_required_types') or []):
        ack = ((ctx.get('report') or {}).get('draft') or {}).get('customer_acknowledgement') or {}
        if not ack.get('acknowledged'):
            out.append('Record the customer acknowledgement')
    return out


def completion_blockers(ctx: Dict[str, Any]) -> List[str]:
    return work_blockers(ctx) + report_blockers(ctx)


def closure_blockers(ctx: Dict[str, Any]) -> List[str]:
    service = ctx.get('service') or {}
    if service.get('status') != 'Completed':
        return ['Only a Completed request can be closed']
    blockers = completion_blockers(ctx)
    return blockers


def allowed_next(status: str) -> List[str]:
    return list(TRANSITIONS.get(status, []))


def can_transition(old: str, new: str) -> bool:
    return new in TRANSITIONS.get(old, [])


def transition_blockers(old: str, new: str, ctx: Dict[str, Any], reason: str = '') -> List[str]:
    """Why a status change is not allowed (empty list = allowed)."""
    service = ctx.get('service') or {}
    cfg = merge_config(ctx.get('config'))
    if new not in STATUSES:
        return [f'"{new}" is not a valid status']
    if not can_transition(old, new):
        return [f'A request cannot move from {old} to {new}']
    out: List[str] = []
    if new in REASON_REQUIRED_STATUSES and not str(reason or '').strip():
        out.append(f'Enter a reason for moving to {new}')
    needs_tech = new in ('Assigned', 'In Progress', 'Inspection Pending', 'Report Pending', 'Waiting for Vendor')
    if needs_tech and not _has_technician(service) and not cfg.get('allow_unassigned'):
        out.append('Assign a technician before the work starts')
    if new == 'Scheduled' and not (_text(service, 'planned_date') or _text(service, 'expected_visit_date')):
        out.append('Set a planned date before scheduling')
    if not _text(service, 'service_type') and new in (
        'Assigned', 'Scheduled', 'In Progress', 'Inspection Pending', 'Report Pending', 'Waiting for Vendor',
    ):
        out.append('Record the service type and product details before moving this request on')
    if old == 'Draft' and new == 'New':
        merged = {**service, 'customer_type': service.get('customer_type')}
        if not _text(service, 'service_type'):
            intake = ((ctx.get('data') or {}).get('intake') or {})
            if isinstance(intake, dict):
                merged['site_visit_required'] = intake.get('site_visit_required')
                merged['site_visit_acknowledgement'] = intake.get('acknowledgement') or {}
        out.extend(validate_create(merged, cfg))
    if new == 'Waiting for Vendor':
        if service.get('workflow') != WF_REPAIR:
            out.append('Vendor repair only applies to repair requests')
        elif not [r for r in ctx.get('vendor_repairs') or [] if r.get('status') == 'Open']:
            out.append('Record the vendor repair before waiting for the vendor')
    if new == 'Completed':
        out.extend(completion_blockers(ctx))
    if new == 'Closed':
        out.extend(closure_blockers(ctx))
    return out


# ---------------------------------------------------------------------------
# Vendor repair
# ---------------------------------------------------------------------------

POST_REPAIR_RESULTS = ('Passed', 'Failed')


def vendor_next_stages(stages: List[str], current: Optional[str], approval_required: bool) -> List[str]:
    """Stages a vendor repair may move to from `current` (forward only)."""
    if not stages:
        return []
    if not current or current not in stages:
        return [stages[0]]
    idx = stages.index(current)
    out: List[str] = []
    if idx + 1 < len(stages):
        nxt = stages[idx + 1]
        out.append(nxt)
        if nxt == VENDOR_STAGE_APPROVAL and not approval_required and idx + 2 < len(stages):
            out.append(stages[idx + 2])
    return out


def vendor_stage_blockers(
    repair: Dict[str, Any],
    new_stage: str,
    stages: List[str],
    attachments: Iterable[Dict[str, Any]],
    approval_required: bool = False,
) -> List[str]:
    """Rules that must hold before a vendor repair enters `new_stage`."""
    current = repair.get('stage')
    if new_stage not in vendor_next_stages(stages, current, approval_required):
        return [f'The repair cannot move from "{current or "not started"}" to "{new_stage}"']
    out: List[str] = []
    if new_stage in (VENDOR_STAGE_READY, VENDOR_STAGE_DISPATCHED):
        if not (_text(repair, 'vendor_id') or _text(repair, 'vendor_name')):
            out.append('Select the vendor')
        if not _text(repair, 'reason'):
            out.append('Record the reason for vendor repair')
    if new_stage == VENDOR_STAGE_DISPATCHED:
        if parse_date(repair.get('dispatch_date')) is None:
            out.append('Record the dispatch date')
        if not _text(repair, 'dispatch_reference'):
            out.append('Record the dispatch reference / tracking number')
    if new_stage == VENDOR_STAGE_VENDOR_DONE:
        if parse_date(repair.get('vendor_completion_date')) is None:
            out.append('Record the vendor repair completion date')
        if not _text(repair, 'work_performed_by_vendor'):
            out.append('Record the work performed by the vendor')
    if new_stage == VENDOR_STAGE_RETURNED and parse_date(repair.get('actual_return_date')) is None:
        out.append('Record the actual return date')
    if new_stage == VENDOR_STAGE_CLOSED or (stages and new_stage == stages[-1]):
        if repair.get('post_repair_result') != 'Passed':
            out.append('Post-repair inspection must be recorded as Passed')
        if parse_date(repair.get('post_repair_date')) is None:
            out.append('Record the post-repair inspection date')
        if repair.get('problem_resolved') is not True:
            out.append('Confirm the original problem has been resolved')
        if repair.get('ready_for_use') is not True:
            out.append('Confirm the product is ready for customer use')
        if not any(a.get('category') == 'Post-Repair Inspection Photos/Videos' for a in attachments or []):
            out.append('Upload the post-repair inspection photos/videos')
    return out


def post_repair_blockers(repair: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    if repair.get('stage') not in (VENDOR_STAGE_RETURNED, VENDOR_STAGE_POST_INSPECTION):
        out.append('Record the return from the vendor before the post-repair inspection')
    if repair.get('post_repair_result') not in POST_REPAIR_RESULTS:
        out.append('Select the post-repair test result (Passed or Failed)')
    if parse_date(repair.get('post_repair_date')) is None:
        out.append('Record the post-repair inspection date')
    return out


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

PERM_VIEW = 'service-maintenance'
PERM_EDIT = 'service-maintenance-edit'
PERM_COORDINATE = 'service-maintenance-coordinate'
PERM_MANAGE = 'service-maintenance-manage'
SERVICE_PERMISSION_KEYS = (PERM_VIEW, PERM_EDIT, PERM_COORDINATE, PERM_MANAGE)


def caps_from_permissions(permissions: Iterable[str], is_admin: bool = False) -> Dict[str, bool]:
    perms = set(permissions or [])
    manage = is_admin or PERM_MANAGE in perms
    coordinate = manage or PERM_COORDINATE in perms
    edit = coordinate or PERM_EDIT in perms
    view = is_admin or PERM_VIEW in perms
    return {
        'view': view,
        'edit': view and edit,
        'coordinate': view and coordinate,
        'manage': view and manage,
        'technician_only': view and edit and not coordinate,
    }


def can_edit_service(caps: Dict[str, bool], service: Dict[str, Any], employee_id: Optional[str]) -> bool:
    if caps.get('coordinate') or caps.get('manage'):
        return True
    if not caps.get('edit'):
        return False
    emp = str(employee_id or '').strip()
    return bool(emp) and emp in (
        _text(service, 'assigned_employee_id'),
        _text(service, 'engineer_employee_id'),
    )

"""Service & Maintenance module - persistence and workflow services.

Models are created through setup(Base) (same approach as inventory.py) so the
module can be unit-tested on SQLite without importing server.py. The FastAPI
routes live in service_routes.py.
"""
from __future__ import annotations

import io
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import service_rules as rules

logger = logging.getLogger(__name__)

ServiceRequestModel = None
ServiceProductModel = None
ServiceAmcModel = None
ServiceVisitModel = None
ServiceAttachmentModel = None
ServiceVendorRepairModel = None
ServiceReportModel = None
ServiceHistoryModel = None
ServiceNotificationModel = None
ServiceConfigModel = None


class ServiceError(Exception):
    """Business-rule failure. `detail` is a string or a list of strings."""

    def __init__(self, detail, status_code: int = 400):
        super().__init__(detail if isinstance(detail, str) else '; '.join(detail))
        self.detail = detail
        self.status_code = status_code


class Actor:
    def __init__(self, user_id: Optional[str] = None, name: str = 'System', employee_id: Optional[str] = None):
        self.id = user_id
        self.name = name
        self.employee_id = employee_id


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now()


def _today() -> date:
    return date.today()


def _loads(raw, fallback):
    if raw in (None, ''):
        return fallback
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return fallback
    return value if isinstance(value, type(fallback)) else fallback


def _dumps(value) -> str:
    return json.dumps(value, default=str)


def _s(value) -> str:
    return str(value or '').strip()


def _fmt(value) -> str:
    if value is None or value == '':
        return '-'
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    return str(value)


def _tri(value):
    """Integer column (None/0/1) -> None/False/True."""
    return None if value is None else bool(value)


def _int_tri(value):
    if value is None or value == '':
        return None
    if isinstance(value, str):
        return 1 if value.strip().lower() in ('1', 'true', 'yes') else 0
    return 1 if value else 0


_LIST_JSON = {'stage_log', 'revisions', 'covered_product_ids', 'covered_service_types', 'read_by'}


def row_dict(obj) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for col in obj.__table__.columns:
        value = getattr(obj, col.name)
        name = col.name
        if name.endswith('_json'):
            key = name[:-5]
            out[key] = _loads(value, [] if key in _LIST_JSON else {})
            continue
        if isinstance(value, datetime):
            value = value.isoformat(timespec='seconds')
        elif isinstance(value, date):
            value = value.isoformat()
        out[name] = value
    return out


def classification_of(svc) -> Dict[str, List[str]]:
    """Every service type and product type on the request. Older rows have just the single columns."""
    doc = _loads(getattr(svc, 'data_json', None), {})
    raw = doc.get('classification') if isinstance(doc.get('classification'), dict) else {}

    def labels(key: str, single: Optional[str]) -> List[str]:
        out: List[str] = []
        for item in raw.get(key) or []:
            text = str(item or '').strip()
            if text and text not in out:
                out.append(text)
        if not out and _s(single):
            out.append(_s(single))
        return out

    return {
        'service_types': labels('service_types', getattr(svc, 'service_type', None)),
        'product_types': labels('product_types', getattr(svc, 'product_category', None)),
    }


def service_dict(svc) -> Dict[str, Any]:
    out = row_dict(svc)
    chosen = classification_of(svc)
    out['service_types'] = chosen['service_types']
    out['product_types'] = chosen['product_types']
    workflows = rules.workflows_for_types(chosen['service_types'])
    out['workflows'] = workflows
    out['workflow'] = (workflows[0] if workflows else None) or svc.workflow or rules.workflow_for(svc.service_type)
    return out


def vendor_dict(rep) -> Dict[str, Any]:
    out = row_dict(rep)
    out['problem_resolved'] = _tri(rep.problem_resolved)
    out['ready_for_use'] = _tri(rep.ready_for_use)
    return out


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

def setup(Base):
    global ServiceRequestModel, ServiceProductModel, ServiceAmcModel, ServiceVisitModel
    global ServiceAttachmentModel, ServiceVendorRepairModel, ServiceReportModel
    global ServiceHistoryModel, ServiceNotificationModel, ServiceConfigModel
    if ServiceRequestModel is not None:
        return

    class _ServiceRequest(Base):
        __tablename__ = 'svc_requests'
        id = Column(String(36), primary_key=True, default=_uid)
        service_code = Column(String(30), unique=True, index=True)
        client_request_id = Column(String(64), unique=True, nullable=True)
        customer_id = Column(String(36), index=True)
        customer_code = Column(String(50))
        customer_name = Column(String(255), index=True)
        company_name = Column(String(255))
        contact_person = Column(String(255))
        mobile = Column(String(30), index=True)
        email = Column(String(255))
        billing_address = Column(String(500))
        site_address = Column(String(500))
        city = Column(String(100))
        state = Column(String(100))
        pincode = Column(String(20))
        customer_notes = Column(String(1000))
        customer_type = Column(String(20), index=True)
        lead_id = Column(String(36), index=True)
        lead_label = Column(String(300))
        product_id = Column(String(36), index=True)
        product_category = Column(String(150))
        product_name = Column(String(255), index=True)
        product_model = Column(String(255))
        serial_number = Column(String(80), index=True)
        quantity = Column(Float, default=1)
        service_type = Column(String(80), index=True)
        workflow = Column(String(20), index=True)
        problem_category = Column(String(150))
        problem_description = Column(Text)
        reported_by = Column(String(255))
        reported_date = Column(String(10))
        priority = Column(String(20), default='Medium', index=True)
        assigned_employee_id = Column(String(50), index=True)
        assigned_name = Column(String(255))
        engineer_employee_id = Column(String(50))
        engineer_name = Column(String(255))
        assigned_at = Column(DateTime)
        request_date = Column(String(10), index=True)
        planned_date = Column(String(10))
        planned_start_time = Column(String(10))
        expected_duration = Column(String(40))
        expected_visit_date = Column(String(10))
        expected_completion = Column(String(10), index=True)
        installation_type = Column(String(150))
        installation_requirements = Column(String(2000))
        site_readiness_status = Column(String(40))
        warranty_ref = Column(String(255))
        amc_id = Column(String(36), index=True)
        remarks = Column(String(2000))
        status = Column(String(30), default='New', index=True)
        completed_at = Column(DateTime)
        closure_date = Column(String(10))
        cancel_reason = Column(String(500))
        data_json = Column(Text)
        created_by_id = Column(String(50))
        created_by_name = Column(String(255))
        created_at = Column(DateTime, default=_now)
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    class _ServiceProduct(Base):
        __tablename__ = 'svc_products'
        id = Column(String(36), primary_key=True, default=_uid)
        customer_id = Column(String(36), index=True)
        lead_id = Column(String(36), index=True)
        category = Column(String(150))
        name = Column(String(255), index=True)
        model = Column(String(255))
        serial_number = Column(String(80), index=True)
        installation_date = Column(String(10))
        warranty_start = Column(String(10))
        warranty_end = Column(String(10))
        warranty_notes = Column(String(500))
        source_service_id = Column(String(36))
        status = Column(String(20), default='Active')
        notes = Column(String(1000))
        created_by_name = Column(String(255))
        created_at = Column(DateTime, default=_now)
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    class _ServiceAmc(Base):
        __tablename__ = 'svc_amc'
        id = Column(String(36), primary_key=True, default=_uid)
        amc_number = Column(String(40), unique=True, index=True)
        customer_id = Column(String(36), index=True)
        covered_product_ids_json = Column(Text)
        covered_service_types_json = Column(Text)
        start_date = Column(String(10))
        end_date = Column(String(10))
        status = Column(String(20), default='Active')
        planned_visits = Column(Integer)
        next_planned_date = Column(String(10))
        last_visit_date = Column(String(10))
        notes = Column(String(1000))
        created_by_name = Column(String(255))
        created_at = Column(DateTime, default=_now)
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    class _ServiceVisit(Base):
        __tablename__ = 'svc_visits'
        id = Column(String(36), primary_key=True, default=_uid)
        service_id = Column(String(36), index=True)
        visit_no = Column(Integer)
        technician_id = Column(String(50))
        technician_name = Column(String(255))
        planned_date = Column(String(10))
        planned_start = Column(String(10))
        expected_duration = Column(String(40))
        actual_date = Column(String(10))
        actual_start = Column(String(10))
        actual_end = Column(String(10))
        status = Column(String(20), default='Planned')
        outcome = Column(String(40))
        next_visit_date = Column(String(10))
        remarks = Column(String(1000))
        inspection_notes = Column(Text)
        work_log = Column(Text)
        parts_used = Column(String(1000))
        test_results = Column(String(1000))
        created_by_name = Column(String(255))
        created_at = Column(DateTime, default=_now)
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    class _ServiceAttachment(Base):
        __tablename__ = 'svc_attachments'
        id = Column(String(36), primary_key=True, default=_uid)
        service_id = Column(String(36), index=True)
        visit_id = Column(String(36), index=True)
        vendor_repair_id = Column(String(36), index=True)
        product_id = Column(String(36))
        category = Column(String(80), index=True)
        description = Column(String(500))
        file_name = Column(String(255))
        file_type = Column(String(20))
        file_size = Column(Integer)
        file_url = Column(String(600))
        uploaded_by_id = Column(String(50))
        uploaded_by_name = Column(String(255))
        uploaded_at = Column(DateTime, default=_now)

    class _ServiceVendorRepair(Base):
        __tablename__ = 'svc_vendor_repairs'
        id = Column(String(36), primary_key=True, default=_uid)
        service_id = Column(String(36), index=True)
        repair_code = Column(String(50), index=True)
        cycle = Column(Integer, default=1)
        vendor_id = Column(String(36))
        vendor_name = Column(String(255))
        vendor_contact_person = Column(String(255))
        vendor_contact_details = Column(String(500))
        reason = Column(String(1000))
        fault_description = Column(String(1000))
        internal_findings = Column(String(1000))
        warranty_amc_info = Column(String(500))
        dispatch_date = Column(String(10))
        dispatch_reference = Column(String(120))
        expected_return_date = Column(String(10))
        dispatch_remarks = Column(String(1000))
        vendor_ack = Column(String(255))
        stage = Column(String(80))
        stage_log_json = Column(Text)
        vendor_completion_date = Column(String(10))
        work_performed_by_vendor = Column(String(1500))
        parts_replaced_by_vendor = Column(String(1000))
        vendor_charges = Column(Float)
        vendor_warranty = Column(String(255))
        return_dispatch_date = Column(String(10))
        actual_return_date = Column(String(10))
        vendor_remarks = Column(String(1000))
        post_repair_date = Column(String(10))
        post_repair_inspector = Column(String(255))
        post_repair_result = Column(String(20))
        post_repair_tests = Column(String(1000))
        problem_resolved = Column(Integer)
        new_issues = Column(String(1000))
        ready_for_use = Column(Integer)
        status = Column(String(20), default='Open', index=True)
        created_by_name = Column(String(255))
        created_at = Column(DateTime, default=_now)
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    class _ServiceReport(Base):
        __tablename__ = 'svc_reports'
        id = Column(String(36), primary_key=True, default=_uid)
        service_id = Column(String(36), unique=True, index=True)
        report_no = Column(String(60), index=True)
        status = Column(String(20), default='Draft', index=True)
        draft_json = Column(Text)
        snapshot_json = Column(Text)
        revision = Column(Integer, default=0)
        revisions_json = Column(Text)
        submitted_by_id = Column(String(50))
        submitted_by_name = Column(String(255))
        submitted_at = Column(DateTime)
        created_at = Column(DateTime, default=_now)
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    class _ServiceHistory(Base):
        __tablename__ = 'svc_history'
        id = Column(String(36), primary_key=True, default=_uid)
        service_id = Column(String(36), index=True)
        event_type = Column(String(40), index=True)
        from_status = Column(String(30))
        to_status = Column(String(30))
        reason = Column(String(1000))
        detail = Column(Text)
        user_id = Column(String(50))
        user_name = Column(String(255))
        created_at = Column(DateTime, default=_now, index=True)

    class _ServiceNotification(Base):
        __tablename__ = 'svc_notifications'
        id = Column(String(36), primary_key=True, default=_uid)
        event_key = Column(String(160), unique=True, index=True)
        service_id = Column(String(36), index=True)
        service_code = Column(String(30))
        event = Column(String(40))
        message = Column(String(500))
        recipient_key = Column(String(60), index=True)
        read_by_json = Column(Text)
        created_at = Column(DateTime, default=_now, index=True)

    class _ServiceConfig(Base):
        __tablename__ = 'svc_config'
        key = Column(String(60), primary_key=True)
        value = Column(Text)
        updated_by_name = Column(String(255))
        updated_at = Column(DateTime, default=_now, onupdate=_now)

    ServiceRequestModel = _ServiceRequest
    ServiceProductModel = _ServiceProduct
    ServiceAmcModel = _ServiceAmc
    ServiceVisitModel = _ServiceVisit
    ServiceAttachmentModel = _ServiceAttachment
    ServiceVendorRepairModel = _ServiceVendorRepair
    ServiceReportModel = _ServiceReport
    ServiceHistoryModel = _ServiceHistory
    ServiceNotificationModel = _ServiceNotification
    ServiceConfigModel = _ServiceConfig


# ---------------------------------------------------------------------------
# History, notifications, configuration
# ---------------------------------------------------------------------------

def add_history(db: Session, service_id: str, event_type: str, actor: Optional[Actor], *,
                from_status: Optional[str] = None, to_status: Optional[str] = None,
                reason: Optional[str] = None, detail: Optional[str] = None) -> None:
    db.add(ServiceHistoryModel(
        service_id=service_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        reason=(reason or None) and str(reason)[:1000],
        detail=detail,
        user_id=getattr(actor, 'id', None),
        user_name=getattr(actor, 'name', None) or 'System',
    ))


def notify(db: Session, svc, event: str, message: str, *, employee_id: Optional[str] = None,
           coordinators: bool = False, key_suffix: str = '') -> None:
    """In-app notification. The event key de-duplicates repeats (retries, refreshes)."""
    targets = []
    if employee_id:
        targets.append(str(employee_id))
    if coordinators:
        targets.append('coordinators')
    for target in targets:
        key = f'{svc.id}:{event}:{key_suffix}:{target}'[:160]
        if db.query(ServiceNotificationModel).filter(ServiceNotificationModel.event_key == key).first():
            continue
        db.add(ServiceNotificationModel(
            event_key=key, service_id=svc.id, service_code=svc.service_code, event=event,
            message=message[:500], recipient_key=target, read_by_json='[]',
        ))


def list_notifications(db: Session, user_id: str, employee_id: Optional[str], caps: Dict[str, bool],
                       limit: int = 50) -> Dict[str, Any]:
    keys = []
    if employee_id:
        keys.append(str(employee_id))
    if caps.get('coordinate') or caps.get('manage'):
        keys.append('coordinators')
    if not keys:
        return {'items': [], 'unread': 0}
    rows = (
        db.query(ServiceNotificationModel)
        .filter(ServiceNotificationModel.recipient_key.in_(keys))
        .order_by(ServiceNotificationModel.created_at.desc())
        .limit(limit)
        .all()
    )
    items, unread = [], 0
    for row in rows:
        read = user_id in _loads(row.read_by_json, [])
        unread += 0 if read else 1
        items.append({
            'id': row.id, 'service_id': row.service_id, 'service_code': row.service_code,
            'event': row.event, 'message': row.message, 'read': read,
            'created_at': row.created_at.isoformat(timespec='seconds') if row.created_at else None,
        })
    return {'items': items, 'unread': unread}


def mark_notifications_read(db: Session, user_id: str, ids: Optional[List[str]] = None) -> None:
    q = db.query(ServiceNotificationModel)
    if ids:
        q = q.filter(ServiceNotificationModel.id.in_(ids))
    for row in q.limit(500).all():
        readers = _loads(row.read_by_json, [])
        if user_id not in readers:
            readers.append(user_id)
            row.read_by_json = _dumps(readers)
    db.commit()


def get_config(db: Session) -> Dict[str, Any]:
    row = db.query(ServiceConfigModel).filter(ServiceConfigModel.key == 'config').first()
    return rules.merge_config(_loads(row.value, {}) if row else None)


def _clean_list(values) -> List[str]:
    seen, out = set(), []
    for item in values or []:
        text = _s(item)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
    return out


def save_config(db: Session, patch: Dict[str, Any], actor: Actor) -> Dict[str, Any]:
    current = get_config(db)
    errors: List[str] = []
    new = dict(current)
    for key in ('problem_categories', 'vendor_stages', 'ack_required_types'):
        if key in patch:
            if not isinstance(patch[key], list):
                errors.append(f'{key} must be a list')
                continue
            cleaned = _clean_list(patch[key])
            if key in ('problem_categories', 'vendor_stages') and not cleaned:
                errors.append(f'{key.replace("_", " ")} cannot be empty')
                continue
            if key == 'vendor_stages':
                missing = [s for s in rules.REQUIRED_VENDOR_STAGES if s not in cleaned]
                if missing:
                    errors.append('Vendor stages must keep: ' + ', '.join(missing))
                    continue
                if cleaned[-1] != rules.VENDOR_STAGE_CLOSED:
                    errors.append(f'The last vendor stage must be "{rules.VENDOR_STAGE_CLOSED}"')
                    continue
            if key == 'ack_required_types':
                every = {t for types in rules.SERVICE_TYPES_BY_CUSTOMER.values() for t in types}
                bad = [t for t in cleaned if t not in every]
                if bad:
                    errors.append('Unknown service type: ' + ', '.join(bad))
                    continue
            new[key] = cleaned
    for key in ('amc_required', 'allow_unassigned', 'require_lead_for_existing', 'vendor_approval_required'):
        if key in patch:
            new[key] = bool(patch[key])
    if isinstance(patch.get('company_profile'), dict):
        new['company_profile'] = {k: _s(patch['company_profile'].get(k))
                                  for k in ('name', 'address', 'phone', 'email') if _s(patch['company_profile'].get(k))}
    if 'checklists' in patch:
        if not isinstance(patch['checklists'], dict):
            errors.append('checklists must be an object')
        else:
            merged = dict(current['checklists'])
            for name, items in patch['checklists'].items():
                if name not in rules.DEFAULT_CONFIG['checklists']:
                    errors.append(f'Unknown checklist "{name}"')
                elif isinstance(items, list):
                    merged[name] = _clean_list(items)
            new['checklists'] = merged
    if 'mandatory_evidence' in patch:
        merged = dict(current['mandatory_evidence'])
        for wf, cats in (patch['mandatory_evidence'] or {}).items():
            if wf not in rules.SECTIONS_BY_WORKFLOW:
                errors.append(f'Unknown workflow "{wf}"')
                continue
            cats = _clean_list(cats)
            bad = [c for c in cats if c not in rules.ATTACHMENT_CATEGORIES]
            if bad:
                errors.append('Unknown attachment category: ' + ', '.join(bad))
            else:
                merged[wf] = cats
        new['mandatory_evidence'] = merged
    if errors:
        raise ServiceError(errors, 422)
    row = db.query(ServiceConfigModel).filter(ServiceConfigModel.key == 'config').first()
    if row:
        row.value = _dumps(new)
        row.updated_by_name = actor.name
    else:
        db.add(ServiceConfigModel(key='config', value=_dumps(new), updated_by_name=actor.name))
    db.commit()
    return get_config(db)


# ---------------------------------------------------------------------------
# Products and AMC contracts
# ---------------------------------------------------------------------------

def _assert_serial_free(db: Session, serial: str, exclude_product_id: Optional[str] = None) -> None:
    key = rules.normalize_serial(serial)
    if not key:
        return
    for row in db.query(ServiceProductModel).filter(ServiceProductModel.serial_number.isnot(None)).all():
        if rules.normalize_serial(row.serial_number) == key and row.id != exclude_product_id:
            raise ServiceError(f'Serial number {key} is already registered to another product', 409)


def register_product(db: Session, payload: Dict[str, Any], actor: Actor, *, product=None):
    if product is not None:
        payload = {'name': product.name, 'category': product.category, **payload}
    errors = []
    name = _s(payload.get('name'))
    if not name:
        errors.append('Product name is required')
    if not _s(payload.get('category')):
        errors.append('Product category is required')
    if not _s(payload.get('customer_id')) and product is None:
        errors.append('Customer is required')
    serial = rules.normalize_serial(payload.get('serial_number'))
    if serial and not rules.validate_serial(serial):
        errors.append('Serial number may only use letters, numbers, - _ / . (3 to 60 characters)')
    for field in ('installation_date', 'warranty_start', 'warranty_end'):
        if _s(payload.get(field)) and rules.parse_date(payload.get(field)) is None:
            errors.append(f'{field.replace("_", " ").capitalize()} is not a valid date')
    ws, we = rules.parse_date(payload.get('warranty_start')), rules.parse_date(payload.get('warranty_end'))
    if ws and we and we < ws:
        errors.append('Warranty end cannot be before warranty start')
    if errors:
        raise ServiceError(errors, 422)
    if serial:
        _assert_serial_free(db, serial, product.id if product else None)
    if product is None:
        product = ServiceProductModel(customer_id=_s(payload.get('customer_id')), created_by_name=actor.name)
        db.add(product)
    for field in ('category', 'name', 'model', 'installation_date', 'warranty_start',
                  'warranty_end', 'warranty_notes', 'notes', 'lead_id'):
        if field in payload:
            setattr(product, field, _s(payload.get(field)) or None)
    product.serial_number = serial or None
    db.commit()
    db.refresh(product)
    return product


def product_summary(db: Session, product) -> Dict[str, Any]:
    out = row_dict(product)
    today = _today()
    we = rules.parse_date(product.warranty_end)
    out['warranty_status'] = 'Unknown' if not we else ('In warranty' if we >= today else 'Warranty expired')
    amc = active_amc_for(db, product.customer_id, product.id)
    out['amc_status'] = 'Active' if amc else 'None'
    out['amc_number'] = amc.amc_number if amc else None
    out['amc_id'] = amc.id if amc else None
    last = (
        db.query(ServiceRequestModel)
        .filter(ServiceRequestModel.product_id == product.id,
                ServiceRequestModel.status.in_(['Completed', 'Closed']))
        .order_by(ServiceRequestModel.completed_at.desc()).first()
    )
    out['last_service_date'] = (last.completed_at or last.updated_at).date().isoformat() if last else None
    out['repair_count'] = (
        db.query(ServiceRequestModel)
        .filter(ServiceRequestModel.product_id == product.id, ServiceRequestModel.workflow == rules.WF_REPAIR)
        .count()
    )
    return out


def _next_amc_number(db: Session) -> str:
    prefix = f'AMC-{_today().year}-'
    last = (
        db.query(ServiceAmcModel.amc_number)
        .filter(ServiceAmcModel.amc_number.like(prefix + '%'))
        .order_by(func.length(ServiceAmcModel.amc_number).desc(), ServiceAmcModel.amc_number.desc())
        .first()
    )
    n = int(last[0].rsplit('-', 1)[1]) + 1 if last else 1
    return f'{prefix}{n:04d}'


def save_amc(db: Session, payload: Dict[str, Any], actor: Actor, *, amc=None):
    errors = []
    if amc is None and not _s(payload.get('customer_id')):
        errors.append('Customer is required')
    start, end = rules.parse_date(payload.get('start_date')), rules.parse_date(payload.get('end_date'))
    if not start or not end:
        errors.append('Contract start and end dates are required')
    elif end < start:
        errors.append('Contract end date cannot be before the start date')
    status = _s(payload.get('status')) or 'Active'
    if status not in ('Draft', 'Active', 'Expired', 'Cancelled'):
        errors.append('Contract status is not valid')
    products = payload.get('covered_product_ids') or []
    if not isinstance(products, list):
        errors.append('Covered products must be a list')
    if errors:
        raise ServiceError(errors, 422)
    if amc is None:
        amc = ServiceAmcModel(amc_number=_next_amc_number(db), customer_id=_s(payload.get('customer_id')),
                              created_by_name=actor.name)
        db.add(amc)
    amc.start_date = start.isoformat()
    amc.end_date = end.isoformat()
    amc.status = status
    amc.covered_product_ids_json = _dumps(_clean_list(products))
    covered_types = _clean_list(payload.get('covered_service_types') or [])
    amc.covered_service_types_json = _dumps(covered_types)
    amc.planned_visits = int(payload['planned_visits']) if _s(payload.get('planned_visits')).isdigit() else None
    amc.next_planned_date = _s(payload.get('next_planned_date')) or amc.next_planned_date
    amc.notes = _s(payload.get('notes')) or None
    db.commit()
    db.refresh(amc)
    return amc


def amc_effective_status(amc) -> str:
    end = rules.parse_date(amc.end_date)
    if amc.status == 'Active' and end and end < _today():
        return 'Expired'
    return amc.status


def active_amc_for(db: Session, customer_id: str, product_id: Optional[str] = None):
    for amc in db.query(ServiceAmcModel).filter(ServiceAmcModel.customer_id == customer_id).all():
        if amc_effective_status(amc) != 'Active':
            continue
        covered = _loads(amc.covered_product_ids_json, [])
        if product_id is None or not covered or product_id in covered:
            return amc
    return None


def amc_summary(db: Session, amc) -> Dict[str, Any]:
    out = row_dict(amc)
    out['effective_status'] = amc_effective_status(amc)
    visits = (
        db.query(ServiceRequestModel)
        .filter(ServiceRequestModel.amc_id == amc.id, ServiceRequestModel.status != 'Cancelled')
        .order_by(ServiceRequestModel.created_at.desc()).all()
    )
    out['visits'] = [
        {'id': v.id, 'service_code': v.service_code, 'status': v.status, 'product_name': v.product_name,
         'planned_date': v.planned_date, 'completed_at': v.completed_at.date().isoformat() if v.completed_at else None}
        for v in visits
    ]
    out['visits_used'] = len([v for v in visits if v.status in ('Completed', 'Closed')])
    return out


# ---------------------------------------------------------------------------
# Service requests
# ---------------------------------------------------------------------------

CUSTOMER_COPY = (
    ('customer_name', 'company_name'), ('company_name', 'company_name'),
    ('contact_person', 'contact_person_name'), ('mobile', 'phone'), ('email', 'email'),
    ('site_address', 'address_line'), ('billing_address', 'address_line'),
    ('city', 'city'), ('state', 'state'), ('pincode', 'pincode'),
)
EDITABLE_FIELDS = (
    'contact_person', 'mobile', 'email', 'billing_address', 'site_address', 'city', 'state', 'pincode',
    'customer_notes', 'priority', 'problem_category', 'problem_description', 'reported_by', 'reported_date',
    'planned_date', 'planned_start_time', 'expected_duration', 'expected_visit_date', 'expected_completion',
    'installation_type', 'installation_requirements', 'site_readiness_status', 'warranty_ref', 'remarks',
)
INSTALL_ONLY_FIELDS = ('product_category', 'product_name', 'product_model', 'serial_number', 'quantity')
DRAFT_CLASSIFY_FIELDS = (
    'service_type', 'product_category', 'product_name', 'product_model', 'serial_number', 'quantity',
    'lead_id', 'product_id', 'amc_id', 'problem_category',
)


def _checklist_rows(labels: List[str]) -> List[Dict[str, Any]]:
    return [{'id': _uid(), 'label': label, 'done': False, 'remark': '', 'required': True} for label in labels]


def checklist_templates(cfg: Dict[str, Any], product_category: Optional[str]) -> Dict[str, List[str]]:
    return {key: rules.checklist_items(cfg, key, product_category) for key in cfg['checklists']}


def _intake_doc(data: Dict[str, Any]) -> Dict[str, Any]:
    """Call outcome stored on the request until a technician classifies the job."""
    required = rules.site_visit_answer(data.get('site_visit_required'))
    ack_in = data.get('site_visit_acknowledgement') if isinstance(data.get('site_visit_acknowledgement'), dict) else {}
    doc: Dict[str, Any] = {
        'site_visit_required': required,
        'site_visit_done': False,
        'site_visit_done_at': None,
        'site_visit_done_by': None,
        'site_visit_findings': None,
        'acknowledgement': None,
    }
    if required:
        doc['acknowledgement'] = {
            'acknowledged': bool(ack_in.get('acknowledged')),
            'name': _s(ack_in.get('name')) or None,
            'notes': _s(ack_in.get('notes')) or None,
        }
    return doc


def _seed_data(workflow: Optional[str], product_category: Optional[str], cfg: Dict[str, Any]) -> Dict[str, Any]:
    def rows(key):
        return _checklist_rows(rules.checklist_items(cfg, key, product_category))
    if workflow == rules.WF_INSTALL:
        return {
            'inspection': {'checklist': rows('installation_inspection')},
            'execution': {'status': 'Not Started', 'checklist': rows('installation_execution')},
            'commissioning': {'status': 'Pending', 'checklist': rows('commissioning')},
            'procurement': {
                'product_available': None, 'product_received': False, 'vendor_id': '', 'vendor_name': '',
                'quote_amount': '', 'currency': 'INR', 'delivery_date': '', 'items': [], 'notes': '',
            },
            'comments': {'entries': []},
        }
    if workflow == rules.WF_AMC:
        return {'amc': {'checklist': rows('amc')}, 'comments': {'entries': []}}
    return {'troubleshooting': [], 'work': {}, 'final_test': {}, 'comments': {'entries': []}}


def next_service_code(db: Session) -> str:
    prefix = f'SVC-{_today().year}-'
    last = (
        db.query(ServiceRequestModel.service_code)
        .filter(ServiceRequestModel.service_code.like(prefix + '%'))
        .order_by(func.length(ServiceRequestModel.service_code).desc(), ServiceRequestModel.service_code.desc())
        .first()
    )
    n = int(last[0].rsplit('-', 1)[1]) + 1 if last else 1
    return f'{prefix}{n:04d}'


def _qty(value) -> float:
    try:
        qty = float(value)
    except (TypeError, ValueError):
        return 1.0
    return qty if qty > 0 else 1.0


def _check_amc(amc, customer_id: str, product_id: Optional[str], service_type: str) -> None:
    if amc is None:
        raise ServiceError('The selected AMC contract was not found', 404)
    if amc.customer_id != customer_id:
        raise ServiceError('The AMC contract belongs to a different customer', 422)
    if amc_effective_status(amc) != 'Active':
        raise ServiceError(f'AMC {amc.amc_number} is not active', 422)
    covered = _loads(amc.covered_product_ids_json, [])
    if covered and product_id and product_id not in covered:
        raise ServiceError(f'AMC {amc.amc_number} does not cover the selected product', 422)
    types = _loads(amc.covered_service_types_json, [])
    if types and service_type not in types:
        raise ServiceError(f'AMC {amc.amc_number} does not cover {service_type}', 422)


_CREATE_COLUMNS = (
    'customer_name', 'company_name', 'contact_person', 'mobile', 'email', 'billing_address',
    'site_address', 'city', 'state', 'pincode', 'customer_notes', 'product_category',
    'product_name', 'product_model', 'serial_number', 'problem_category', 'problem_description',
    'reported_by', 'reported_date', 'planned_date', 'planned_start_time', 'expected_duration',
    'expected_visit_date', 'expected_completion', 'installation_type',
    'installation_requirements', 'site_readiness_status', 'warranty_ref', 'remarks',
)


def update_draft(db: Session, svc, data: Dict[str, Any], actor: Actor, *, customer: Dict[str, Any],
                 lead: Optional[Dict[str, Any]] = None, product=None, amc=None,
                 config: Optional[Dict[str, Any]] = None, draft: bool = True):
    """Write the create-form fields back onto a draft. Submit it when draft is False."""
    if svc.status != 'Draft':
        raise ServiceError('This request has already been submitted', 409)
    cfg = rules.merge_config(config)
    service_types = rules.selected_service_types(data)
    product_types = rules.selected_product_types(data)
    stype = _s(data.get('service_type')) or (service_types[0] if service_types else '')
    workflows = rules.workflows_for_types(service_types or ([stype] if stype else []))
    workflow = workflows[0] if workflows else None
    if not draft:
        if rules.WF_AMC in workflows:
            _check_amc(amc, customer['id'], data.get('product_id'), stype)
        if rules.WF_INSTALL in workflows and _s(data.get('serial_number')):
            _assert_serial_free(db, data['serial_number'])
    previous_workflows = rules.workflows_for_types(classification_of(svc)['service_types'])
    svc.customer_id = customer['id']
    svc.customer_code = customer.get('customer_id')
    svc.customer_type = data.get('customer_type')
    svc.service_type = stype or None
    svc.workflow = workflow
    svc.lead_id = _s(data.get('lead_id')) or None
    svc.lead_label = (f"{lead.get('company') or ''} - {lead.get('status') or ''}".strip(' -') if lead else None)
    svc.product_id = _s(data.get('product_id')) or None
    svc.amc_id = (amc.id if amc is not None and rules.WF_AMC in workflows else None)
    svc.quantity = _qty(data.get('quantity'))
    for field in _CREATE_COLUMNS:
        setattr(svc, field, _s(data.get(field)) or None)
    svc.serial_number = rules.normalize_serial(svc.serial_number) or None
    svc.priority = _s(data.get('priority')) or 'Medium'
    if rules.WF_REPAIR in workflows and not svc.reported_date:
        svc.reported_date = svc.request_date
    doc = _loads(svc.data_json, {})
    if workflows != previous_workflows:
        seeded: Dict[str, Any] = {}
        if workflows:
            for item_workflow in workflows:
                seeded.update(_seed_data(item_workflow, data.get('product_category'), cfg))
        else:
            seeded = _seed_data(None, data.get('product_category'), cfg)
        if isinstance(doc.get('intake'), dict):
            seeded['intake'] = doc['intake']
        doc = seeded
    if 'site_visit_required' in data:
        current = doc.get('intake') if isinstance(doc.get('intake'), dict) else {}
        next_intake = _intake_doc(data)
        if current.get('site_visit_done') and next_intake.get('site_visit_required'):
            next_intake['site_visit_done'] = True
            next_intake['site_visit_done_at'] = current.get('site_visit_done_at')
            next_intake['site_visit_done_by'] = current.get('site_visit_done_by')
            next_intake['site_visit_findings'] = current.get('site_visit_findings')
        doc['intake'] = next_intake
    if service_types or product_types:
        doc['classification'] = {
            'service_types': service_types or ([stype] if stype else []),
            'product_types': product_types,
        }
    svc.data_json = _dumps(doc)
    if draft:
        add_history(db, svc.id, 'updated', actor, detail='Draft updated from the create form')
    else:
        svc.status = 'New'
        add_history(db, svc.id, 'status_change', actor, from_status='Draft', to_status='New',
                    detail=f'{svc.customer_type} customer - {svc.service_type or "call logged"}')
        notify(db, svc, 'created', f'New service request {svc.service_code} for {svc.customer_name}',
               coordinators=True)
    db.commit()
    db.refresh(svc)
    return svc


def create_service(db: Session, payload: Dict[str, Any], actor: Actor, *, customer: Optional[Dict[str, Any]],
                   lead: Optional[Dict[str, Any]] = None, product=None, amc=None,
                   config: Optional[Dict[str, Any]] = None):
    """Create a service request. Returns (service, created); created=False for a repeated client_request_id."""
    cfg = rules.merge_config(config)
    client_id = _s(payload.get('client_request_id')) or None
    existing = None
    draft_id = _s(payload.get('draft_id'))
    if draft_id:
        existing = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == draft_id).first()
        if existing is None:
            raise ServiceError('The draft was not found', 404)
        if existing.status != 'Draft':
            raise ServiceError('This request has already been submitted', 409)
    elif client_id:
        existing = db.query(ServiceRequestModel).filter(ServiceRequestModel.client_request_id == client_id).first()
        if existing is not None and existing.status != 'Draft':
            return existing, False
    if not customer:
        raise ServiceError('A valid customer is required', 422)

    data = {k: v for k, v in payload.items()}
    data['customer_id'] = customer['id']
    for target, source in CUSTOMER_COPY:
        if not _s(data.get(target)):
            data[target] = customer.get(source) or ''
    if _s(payload.get('company_name')) == '' and customer.get('company_name'):
        data['company_name'] = customer['company_name']
    data['customer_name'] = customer.get('company_name') or data.get('customer_name')
    draft = bool(payload.get('save_as_draft'))

    if product is not None:
        if product.customer_id != customer['id']:
            raise ServiceError('The selected product belongs to a different customer', 422)
        data['product_id'] = product.id
        for field, source in (('product_category', 'category'), ('product_name', 'name'),
                              ('product_model', 'model'), ('serial_number', 'serial_number')):
            if not _s(data.get(field)):
                data[field] = getattr(product, source) or ''
    if lead is not None:
        if lead.get('customer_id') and lead['customer_id'] != customer['id']:
            raise ServiceError('The selected lead belongs to a different customer', 422)
        data['lead_id'] = lead['id']

    service_types = rules.selected_service_types(data)
    product_types = rules.selected_product_types(data)
    if service_types and not _s(data.get('service_type')):
        data['service_type'] = service_types[0]
    if product_types and not _s(data.get('product_category')):
        data['product_category'] = product_types[0]
    errors = rules.validate_create(data, cfg, draft=draft)
    if errors:
        raise ServiceError(errors, 422)
    if existing is not None and existing.status == 'Draft':
        return update_draft(db, existing, data, actor, customer=customer, lead=lead, product=product,
                            amc=amc, config=cfg, draft=draft), False
    stype = _s(data.get('service_type'))
    workflows = rules.workflows_for_types(service_types or ([stype] if stype else []))
    workflow = workflows[0] if workflows else None
    if rules.WF_AMC in workflows and not draft:
        _check_amc(amc, customer['id'], data.get('product_id'), stype)
    if rules.WF_INSTALL in workflows and _s(data.get('serial_number')) and not draft:
        _assert_serial_free(db, data['serial_number'])

    svc_status = 'Draft' if draft else 'New'
    seed: Dict[str, Any] = {}
    if workflows:
        for item_workflow in workflows:
            seed.update(_seed_data(item_workflow, data.get('product_category'), cfg))
    else:
        seed = _seed_data(None, data.get('product_category'), cfg)
    if not stype or 'site_visit_required' in data:
        seed['intake'] = _intake_doc(data)
    if service_types or product_types:
        seed['classification'] = {
            'service_types': service_types or ([stype] if stype else []),
            'product_types': product_types,
        }
    for attempt in range(5):
        svc = ServiceRequestModel(
            service_code=next_service_code(db), client_request_id=client_id,
            customer_id=customer['id'], customer_code=customer.get('customer_id'),
            customer_type=data.get('customer_type'), service_type=stype or None, workflow=workflow,
            lead_id=_s(data.get('lead_id')) or None,
            lead_label=(f"{lead.get('company') or ''} - {lead.get('status') or ''}".strip(' -') if lead else None),
            product_id=_s(data.get('product_id')) or None,
            amc_id=(amc.id if amc is not None and workflow == rules.WF_AMC else None),
            quantity=_qty(data.get('quantity')),
            request_date=_today().isoformat(), status=svc_status,
            created_by_id=actor.id, created_by_name=actor.name,
            data_json=_dumps(seed),
        )
        for field in ('customer_name', 'company_name', 'contact_person', 'mobile', 'email', 'billing_address',
                      'site_address', 'city', 'state', 'pincode', 'customer_notes', 'product_category',
                      'product_name', 'product_model', 'serial_number', 'problem_category', 'problem_description',
                      'reported_by', 'reported_date', 'planned_date', 'planned_start_time', 'expected_duration',
                      'expected_visit_date', 'expected_completion', 'installation_type',
                      'installation_requirements', 'site_readiness_status', 'warranty_ref', 'remarks'):
            setattr(svc, field, _s(data.get(field)) or None)
        svc.serial_number = rules.normalize_serial(svc.serial_number) or None
        svc.priority = _s(data.get('priority')) or 'Medium'
        if workflow == rules.WF_REPAIR and not svc.reported_date:
            svc.reported_date = svc.request_date
        db.add(svc)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            if client_id:
                existing = db.query(ServiceRequestModel).filter(
                    ServiceRequestModel.client_request_id == client_id).first()
                if existing:
                    return existing, False
            if attempt == 4:
                raise ServiceError('Could not allocate a service ID, please retry', 409)
    add_history(db, svc.id, 'created', actor, to_status=svc_status,
                detail=f'{svc.customer_type} customer - {svc.service_type or ("draft" if draft else "call logged")}')
    if not draft:
        notify(db, svc, 'created', f'New service request {svc.service_code} for {svc.customer_name}',
               coordinators=True)
    db.commit()
    db.refresh(svc)
    return svc, True


def update_service(db: Session, svc, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool],
                   reason: str = '') -> Any:
    locked = guard_edit(svc, actor, caps, reason)
    changes: Dict[str, Any] = {}
    fields = list(EDITABLE_FIELDS)
    if svc.workflow == rules.WF_INSTALL:
        fields += list(INSTALL_ONLY_FIELDS)
    if svc.status == 'Draft':
        fields += [field for field in DRAFT_CLASSIFY_FIELDS if field not in fields]
    for field in fields:
        if field in payload:
            value = payload.get(field)
            if field == 'quantity':
                try:
                    qty = float(value)
                except (TypeError, ValueError):
                    raise ServiceError('Quantity must be a number', 422)
                if qty <= 0:
                    raise ServiceError('Quantity must be greater than zero', 422)
                value = qty
            elif field == 'serial_number':
                value = rules.normalize_serial(value) or None
            else:
                value = _s(value) or None
            if getattr(svc, field) != value:
                changes[field] = (getattr(svc, field), value)
    errors = []
    new = {k: v[1] for k, v in changes.items()}
    if 'mobile' in new and not rules.validate_mobile(new['mobile']):
        errors.append('A valid mobile number is required')
    if new.get('email') and not rules.validate_email(new['email']):
        errors.append('Email address is not valid')
    if new.get('pincode') and not rules.validate_pincode(new['pincode']):
        errors.append('PIN code must be 6 digits')
    if 'site_address' in new and not new['site_address']:
        errors.append('Installation / site address is required')
    if 'contact_person' in new and not new['contact_person']:
        errors.append('Contact person is required')
    if 'priority' in new and new['priority'] not in rules.PRIORITIES:
        errors.append('Priority must be Low, Medium, High or Critical')
    if new.get('serial_number') and not rules.validate_serial(new['serial_number']):
        errors.append('Serial number may only use letters, numbers, - _ / . (3 to 60 characters)')
    for field in ('reported_date', 'planned_date', 'expected_visit_date', 'expected_completion'):
        if new.get(field) and rules.parse_date(new[field]) is None:
            errors.append(f'{field.replace("_", " ").capitalize()} is not a valid date')
    if svc.workflow == rules.WF_REPAIR and 'problem_description' in new and len(new['problem_description'] or '') < 5:
        errors.append('Describe the problem (at least 5 characters)')
    start = rules.parse_date(new.get('planned_date', svc.planned_date)) or \
        rules.parse_date(new.get('expected_visit_date', svc.expected_visit_date))
    end = rules.parse_date(new.get('expected_completion', svc.expected_completion))
    if start and end and end < start:
        errors.append('Expected completion cannot be before the planned / visit date')
    if errors:
        raise ServiceError(errors, 422)
    if 'serial_number' in changes and changes['serial_number'][1]:
        _assert_serial_free(db, changes['serial_number'][1], svc.product_id)
    for field, (_, new) in changes.items():
        setattr(svc, field, new)
    if svc.status == 'Draft' and ('service_type' in changes or 'product_category' in changes):
        svc.workflow = rules.workflow_for(svc.service_type)
        doc = _loads(svc.data_json, {})
        chosen = classification_of(svc)
        types = rules.selected_labels(payload, 'service_types', 'service_type') or chosen['service_types']
        products = rules.selected_labels(payload, 'product_types', 'product_category') or chosen['product_types']
        doc['classification'] = {
            'service_types': types or ([svc.service_type] if svc.service_type else []),
            'product_types': products,
        }
        svc.data_json = _dumps(doc)
    if changes:
        add_history(db, svc.id, 'locked_edit' if locked else 'updated', actor, reason=reason or None,
                    detail=', '.join(sorted(changes)))
    db.commit()
    db.refresh(svc)
    return svc


def guard_edit(svc, actor: Actor, caps: Dict[str, bool], reason: str = '') -> bool:
    """Raises when the actor may not edit. Returns True when this is an edit of a locked record."""
    if not rules.can_edit_service(caps, service_dict(svc), actor.employee_id):
        raise ServiceError('You can only update requests assigned to you', 403)
    if svc.status in rules.LOCKED_STATUSES:
        if not caps.get('manage'):
            raise ServiceError(f'This request is {svc.status}; only a service manager can change it', 403)
        if not _s(reason):
            raise ServiceError('Enter a reason for changing a locked record', 422)
        return True
    return False


def build_ctx(db: Session, svc, cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = cfg or get_config(db)
    report = db.query(ServiceReportModel).filter(ServiceReportModel.service_id == svc.id).first()
    return {
        'service': service_dict(svc),
        'data': _loads(svc.data_json, {}),
        'attachments': [row_dict(a) for a in db.query(ServiceAttachmentModel)
                        .filter(ServiceAttachmentModel.service_id == svc.id).all()],
        'vendor_repairs': [vendor_dict(r) for r in db.query(ServiceVendorRepairModel)
                           .filter(ServiceVendorRepairModel.service_id == svc.id)
                           .order_by(ServiceVendorRepairModel.created_at).all()],
        'report': ({'status': report.status, 'draft': _loads(report.draft_json, {}),
                    'snapshot': _loads(report.snapshot_json, {})} if report else None),
        'config': cfg,
    }


# --- status ----------------------------------------------------------------

def status_allowed_for(caps: Dict[str, bool], old: str, new: str, is_assignee: bool) -> bool:
    """Who may request which transition (rules.transition_blockers checks the workflow itself)."""
    if caps.get('manage'):
        return True
    if new == 'Closed' or old == 'Closed':
        return bool(caps.get('coordinate')) and new != 'In Progress'
    if new in ('Cancelled', 'Assigned', 'Scheduled', 'New') or old == 'Completed':
        return bool(caps.get('coordinate'))
    if caps.get('coordinate'):
        return True
    return bool(caps.get('edit') and is_assignee)


def change_status(db: Session, svc, new_status: str, actor: Actor, caps: Dict[str, bool],
                  reason: str = '', *, system: bool = False) -> Any:
    old = svc.status
    if new_status == old:
        return svc
    cfg = get_config(db)
    ctx = build_ctx(db, svc, cfg)
    is_assignee = actor.employee_id in (svc.assigned_employee_id, svc.engineer_employee_id) and bool(actor.employee_id)
    if not system and not status_allowed_for(caps, old, new_status, is_assignee):
        raise ServiceError('You are not allowed to make this status change', 403)
    if old == 'Closed' and not _s(reason):
        raise ServiceError('Enter a reason for reopening a closed request', 422)
    if old == 'Completed' and new_status == 'In Progress' and not _s(reason):
        raise ServiceError('Enter a reason for reopening a completed request', 422)
    if new_status in rules.REASON_REQUIRED_STATUSES and rules.can_transition(old, new_status) and not _s(reason):
        raise ServiceError(f'Enter a reason for moving the request to {new_status}', 422)
    blockers = rules.transition_blockers(old, new_status, ctx, reason)
    if blockers:
        raise ServiceError(blockers, 409 if rules.can_transition(old, new_status) else 400)
    svc.status = new_status
    if new_status == 'Completed':
        svc.completed_at = _now()
        _after_completion(db, svc, ctx)
    elif old == 'Completed':
        svc.completed_at = None
    if new_status == 'Closed':
        svc.closure_date = _today().isoformat()
    elif old == 'Closed':
        svc.closure_date = None
    if new_status == 'Cancelled':
        svc.cancel_reason = _s(reason)[:500]
    add_history(db, svc.id, 'status_change', actor, from_status=old, to_status=new_status, reason=reason or None)
    _status_notifications(db, svc, new_status)
    db.commit()
    db.refresh(svc)
    return svc


def _status_notifications(db: Session, svc, new_status: str) -> None:
    tech = svc.assigned_employee_id
    code = svc.service_code
    if new_status == 'Awaiting Parts':
        notify(db, svc, 'parts_required', f'{code}: spare parts required', coordinators=True)
    elif new_status == 'Awaiting Customer':
        notify(db, svc, 'customer_approval', f'{code}: customer action or approval required', coordinators=True)
    elif new_status == 'Inspection Pending':
        notify(db, svc, 'inspection_pending', f'{code}: inspection or testing pending',
               employee_id=tech, coordinators=True)
    elif new_status == 'Report Pending':
        notify(db, svc, 'report_pending', f'{code}: final service report pending', employee_id=tech)
    elif new_status == 'Completed':
        notify(db, svc, 'completed', f'{code} completed', coordinators=True)
    elif new_status == 'Scheduled':
        notify(db, svc, 'scheduled', f'{code}: visit scheduled for {svc.planned_date or svc.expected_visit_date}',
               employee_id=tech)


def _after_completion(db: Session, svc, ctx: Dict[str, Any]) -> None:
    data = ctx['data']
    if svc.workflow == rules.WF_INSTALL and not svc.product_id:
        com = data.get('commissioning') or {}
        ex = data.get('execution') or {}
        install_date = (_s(ex.get('end_at')) or _s(com.get('commissioning_date')))[:10] or _today().isoformat()
        serial = rules.normalize_serial(svc.serial_number)
        if serial:
            _assert_serial_free(db, serial)
        product = ServiceProductModel(
            customer_id=svc.customer_id, lead_id=svc.lead_id, category=svc.product_category, name=svc.product_name,
            model=svc.product_model, serial_number=serial or None, installation_date=install_date,
            source_service_id=svc.id, created_by_name='Installation completion',
        )
        db.add(product)
        db.flush()
        svc.product_id = product.id
    if svc.workflow == rules.WF_AMC and svc.amc_id:
        amc = db.query(ServiceAmcModel).filter(ServiceAmcModel.id == svc.amc_id).first()
        if amc:
            block = data.get('amc') or {}
            amc.last_visit_date = _s(block.get('actual_visit_date')) or _today().isoformat()
            if rules.parse_date(block.get('next_service_date')):
                amc.next_planned_date = _s(block.get('next_service_date'))[:10]


def update_intake(db: Session, svc, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool]) -> Any:
    """Record or change the site-visit answer on a request that was saved before that step was finished."""
    if not caps.get('coordinate'):
        raise ServiceError('Only a service coordinator can update the call details', 403)
    guard_edit(svc, actor, caps, _s(payload.get('reason')))
    if svc.status in ('Closed', 'Cancelled'):
        raise ServiceError('This request is closed', 409)
    doc = _loads(svc.data_json, {})
    current = doc.get('intake') if isinstance(doc.get('intake'), dict) else {}
    data = {
        'priority': svc.priority,
        'contact_person': svc.contact_person,
        'mobile': svc.mobile,
        'email': svc.email,
        'site_address': svc.site_address,
        'pincode': svc.pincode,
        'problem_description': svc.problem_description,
        'site_visit_required': payload.get('site_visit_required', current.get('site_visit_required')),
        'site_visit_acknowledgement': (
            payload.get('site_visit_acknowledgement')
            if isinstance(payload.get('site_visit_acknowledgement'), dict)
            else (current.get('acknowledgement') or {})
        ),
    }
    errors = rules.validate_call_intake(data)
    if errors:
        raise ServiceError(errors, 422)
    next_intake = _intake_doc(data)
    if current.get('site_visit_done') and next_intake.get('site_visit_required'):
        next_intake['site_visit_done'] = True
        next_intake['site_visit_done_at'] = current.get('site_visit_done_at')
        next_intake['site_visit_done_by'] = current.get('site_visit_done_by')
        next_intake['site_visit_findings'] = current.get('site_visit_findings')
    doc['intake'] = next_intake
    svc.data_json = _dumps(doc)
    add_history(db, svc.id, 'intake', actor,
                detail='Site visit required' if next_intake.get('site_visit_required') else 'No site visit')
    db.commit()
    db.refresh(svc)
    return svc


def submit_draft(db: Session, svc, actor: Actor, caps: Dict[str, bool], reason: str = '') -> Any:
    """Turn a draft into an open request after the remaining call or job details are on it."""
    if svc.status != 'Draft':
        raise ServiceError('This request has already been submitted', 409)
    return change_status(db, svc, 'New', actor, caps, reason)


def complete_site_visit(db: Session, svc, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool]) -> Any:
    """Record that the site visit happened, so the job can be classified."""
    if not caps.get('coordinate'):
        raise ServiceError('Only a service coordinator can record the site visit', 403)
    guard_edit(svc, actor, caps, _s(payload.get('reason')))
    if svc.status in ('Closed', 'Cancelled'):
        raise ServiceError('This request is closed', 409)
    doc = _loads(svc.data_json, {})
    intake = doc.get('intake') if isinstance(doc.get('intake'), dict) else {}
    if intake.get('site_visit_required') is not True:
        raise ServiceError('This request does not need a site visit', 409)
    ack_files = db.query(ServiceAttachmentModel).filter(
        ServiceAttachmentModel.service_id == svc.id,
        ServiceAttachmentModel.category == 'Site Visit Acknowledgement',
    ).count()
    if ack_files < 1:
        raise ServiceError('Upload the site visit acknowledgement before recording the visit', 409)
    intake['site_visit_done'] = True
    intake['site_visit_done_at'] = _now().isoformat(timespec='seconds')
    intake['site_visit_done_by'] = actor.name
    findings = _s(payload.get('findings')) or None
    intake['site_visit_findings'] = findings
    doc['intake'] = intake
    svc.data_json = _dumps(doc)
    add_history(db, svc.id, 'site_visit', actor, detail=findings or 'Site visit completed')
    db.commit()
    db.refresh(svc)
    return svc


_FIELD_COLUMNS = (
    'product_category', 'product_name', 'product_model', 'serial_number', 'problem_category',
    'problem_description', 'planned_date', 'installation_requirements', 'expected_visit_date',
    'expected_completion', 'reported_by', 'reported_date', 'priority',
)


def record_field_details(db: Session, svc, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool], *,
                         product=None, lead: Optional[Dict[str, Any]] = None, amc=None,
                         config: Optional[Dict[str, Any]] = None) -> Any:
    """Service type, product and the rest of the job, filled once the visit (if any) is done."""
    if not caps.get('coordinate'):
        raise ServiceError('Only a service coordinator can record service and product details', 403)
    guard_edit(svc, actor, caps, _s(payload.get('reason')))
    if svc.status in ('Closed', 'Cancelled'):
        raise ServiceError('This request is closed', 409)
    cfg = rules.merge_config(config if config is not None else get_config(db))
    doc = _loads(svc.data_json, {})
    intake = doc.get('intake') if isinstance(doc.get('intake'), dict) else None
    if isinstance(intake, dict) and svc.status != 'Draft':
        if intake.get('site_visit_required') is None:
            raise ServiceError('Say whether a site visit is required before recording service and product details', 409)
        if intake.get('site_visit_required') and not intake.get('site_visit_done'):
            raise ServiceError('Complete the site visit before recording service and product details', 409)

    data: Dict[str, Any] = {
        'customer_type': svc.customer_type,
        'customer_id': svc.customer_id,
        'contact_person': svc.contact_person,
        'mobile': svc.mobile,
        'email': svc.email,
        'site_address': svc.site_address,
        'city': svc.city,
        'state': svc.state,
        'pincode': svc.pincode,
        'priority': svc.priority,
        'problem_description': svc.problem_description,
        'problem_category': svc.problem_category,
        'product_category': svc.product_category,
        'product_name': svc.product_name,
        'product_model': svc.product_model,
        'serial_number': svc.serial_number,
        'quantity': svc.quantity,
        'planned_date': svc.planned_date,
        'expected_visit_date': svc.expected_visit_date,
        'expected_completion': svc.expected_completion,
        'lead_id': svc.lead_id,
        'product_id': svc.product_id,
        'amc_id': svc.amc_id,
        'installation_requirements': svc.installation_requirements,
        'reported_by': svc.reported_by,
        'reported_date': svc.reported_date,
        'customer_notes': svc.customer_notes,
    }
    for key, value in payload.items():
        if key != 'reason':
            data[key] = value
    if product is not None:
        if product.customer_id != svc.customer_id:
            raise ServiceError('The selected product belongs to a different customer', 422)
        data['product_id'] = product.id
        for field, source in (('product_category', 'category'), ('product_name', 'name'),
                              ('product_model', 'model'), ('serial_number', 'serial_number')):
            if not _s(data.get(field)):
                data[field] = getattr(product, source) or ''
    if lead is not None:
        if lead.get('customer_id') and lead['customer_id'] != svc.customer_id:
            raise ServiceError('The selected lead belongs to a different customer', 422)
        data['lead_id'] = lead['id']
    service_types = rules.selected_service_types(data)
    product_types = rules.selected_product_types(data)
    if service_types:
        data['service_type'] = service_types[0]
    if isinstance(data.get('product_types'), list) and product_types:
        data['product_category'] = product_types[0]

    errors = rules.validate_create(data, cfg, draft=False)
    if errors:
        raise ServiceError(errors, 422)
    stype = _s(data.get('service_type'))
    workflows = rules.workflows_for_types(service_types or ([stype] if stype else []))
    workflow = workflows[0] if workflows else None
    if rules.WF_AMC in workflows:
        _check_amc(amc, svc.customer_id, data.get('product_id'), stype)
    if rules.WF_INSTALL in workflows and _s(data.get('serial_number')):
        _assert_serial_free(db, data['serial_number'], product.id if product is not None else svc.product_id)

    previous_type = svc.service_type
    previous_workflows = rules.workflows_for_types(classification_of(svc)['service_types'])
    svc.service_type = stype
    svc.workflow = workflow
    svc.lead_id = _s(data.get('lead_id')) or None
    if lead is not None:
        svc.lead_label = (f"{lead.get('company') or ''} - {lead.get('status') or ''}".strip(' -') or None)
    svc.product_id = _s(data.get('product_id')) or None
    svc.amc_id = amc.id if amc is not None and rules.WF_AMC in workflows else None
    svc.quantity = _qty(data.get('quantity'))
    for field in _FIELD_COLUMNS:
        value = data.get(field)
        if field == 'serial_number':
            value = rules.normalize_serial(value) or None
        elif field == 'priority':
            value = _s(value) or 'Medium'
        else:
            value = _s(value) or None
        setattr(svc, field, value)
    if rules.WF_REPAIR in workflows and not svc.reported_date:
        svc.reported_date = svc.request_date
    classification = {
        'service_types': service_types or ([stype] if stype else []),
        'product_types': product_types,
    }
    if not previous_type or workflows != previous_workflows:
        seeded: Dict[str, Any] = {}
        for item_workflow in workflows:
            seeded.update(_seed_data(item_workflow, _s(data.get('product_category')) or None, cfg))
        if isinstance(intake, dict):
            seeded['intake'] = intake
        seeded['classification'] = classification
        svc.data_json = _dumps(seeded)
    else:
        kept = _loads(svc.data_json, {})
        kept['classification'] = classification
        svc.data_json = _dumps(kept)
    add_history(db, svc.id, 'field_details', actor,
                detail=f'{", ".join(classification["service_types"])} - {", ".join(classification["product_types"]) or svc.product_name or "product not named"}')
    db.commit()
    db.refresh(svc)
    return svc


def assign_technician(db: Session, svc, actor: Actor, caps: Dict[str, bool], *, employee: Dict[str, Any],
                      engineer: Optional[Dict[str, Any]] = None, schedule: Optional[Dict[str, Any]] = None) -> Any:
    if not caps.get('coordinate'):
        raise ServiceError('Only a service coordinator can assign technicians', 403)
    if not _s(svc.service_type):
        raise ServiceError('Record the service type and product details before assigning a technician', 409)
    if svc.status in rules.TERMINAL_STATUSES:
        raise ServiceError(f'A {svc.status.lower()} request cannot be reassigned', 409)
    if not employee or not employee.get('employee_id'):
        raise ServiceError('Select a technician', 422)
    previous = svc.assigned_name or svc.assigned_employee_id
    svc.assigned_employee_id = employee['employee_id']
    svc.assigned_name = employee.get('name')
    svc.assigned_at = _now()
    if engineer is not None:
        svc.engineer_employee_id = engineer.get('employee_id') or None
        svc.engineer_name = engineer.get('name') or None
    for field in ('planned_date', 'planned_start_time', 'expected_duration', 'expected_visit_date'):
        value = _s((schedule or {}).get(field))
        if value:
            if field.endswith('_date') and rules.parse_date(value) is None:
                raise ServiceError(f'{field.replace("_", " ").capitalize()} is not a valid date', 422)
            setattr(svc, field, value)
    add_history(db, svc.id, 'assignment', actor,
                detail=f'{previous or "Unassigned"} -> {svc.assigned_name or svc.assigned_employee_id}')
    notify(db, svc, 'assigned', f'{svc.service_code} assigned to you ({svc.customer_name})',
           employee_id=svc.assigned_employee_id, key_suffix=str(_now().timestamp()))
    if svc.status in ('New',):
        old = svc.status
        svc.status = 'Assigned'
        add_history(db, svc.id, 'status_change', actor, from_status=old, to_status='Assigned', reason='Technician assigned')
    db.commit()
    db.refresh(svc)
    return svc


# --- sections --------------------------------------------------------------

def update_section(db: Session, svc, section: str, value: Any, actor: Actor, caps: Dict[str, bool],
                   reason: str = '') -> Dict[str, Any]:
    chosen = classification_of(svc)
    allowed: List[str] = []
    for item_workflow in rules.workflows_for_types(chosen['service_types']) or [svc.workflow or '']:
        for name in rules.SECTIONS_BY_WORKFLOW.get(item_workflow, ()):
            if name not in allowed:
                allowed.append(name)
    if section not in allowed:
        raise ServiceError(f'"{section}" does not apply to {svc.service_type or "this request"}', 400)
    locked = guard_edit(svc, actor, caps, reason)
    if svc.status == 'Draft':
        raise ServiceError('Submit the request before recording work', 409)
    errors = rules.validate_section(section, value)
    if errors:
        raise ServiceError(errors, 422)
    doc = _loads(svc.data_json, {})
    if section == 'troubleshooting':
        rows = []
        for row in value:
            row = dict(row)
            row.setdefault('id', _uid())
            rows.append(row)
        doc[section] = rows
    else:
        current = doc.get(section) if isinstance(doc.get(section), dict) else {}
        doc[section] = {**current, **value}
    svc.data_json = _dumps(doc)
    add_history(db, svc.id, 'locked_edit' if locked else 'section_updated', actor, reason=reason or None, detail=section)
    if section == 'procurement':
        proc = doc.get('procurement') if isinstance(doc.get('procurement'), dict) else {}
        if proc.get('product_available') is False and not proc.get('product_received'):
            if svc.status in ('Assigned', 'Scheduled', 'In Progress', 'New'):
                old = svc.status
                svc.status = 'Waiting for Vendor'
                add_history(db, svc.id, 'status_change', actor, from_status=old, to_status='Waiting for Vendor',
                            reason='Product not available — vendor sourcing')
        elif (proc.get('product_available') is True or proc.get('product_received')) and svc.status == 'Waiting for Vendor':
            old = svc.status
            svc.status = 'In Progress'
            add_history(db, svc.id, 'status_change', actor, from_status=old, to_status='In Progress',
                        reason='Product is available for the site visit')
    if svc.status in ('Assigned', 'Scheduled') and section in ('execution', 'work', 'amc', 'troubleshooting', 'inspection'):
        if svc.assigned_employee_id or get_config(db).get('allow_unassigned'):
            old = svc.status
            svc.status = 'In Progress'
            add_history(db, svc.id, 'status_change', actor, from_status=old, to_status='In Progress',
                        reason='Work recorded')
    if section == 'final_test' and rules.final_test_failed(doc) and svc.status in ('Inspection Pending', 'Report Pending'):
        old = svc.status
        svc.status = 'In Progress'
        add_history(db, svc.id, 'status_change', actor, from_status=old, to_status='In Progress',
                    reason='Final test did not pass - troubleshooting reopened')
    db.commit()
    return doc


# --- visits ----------------------------------------------------------------

VISIT_FIELDS = (
    'technician_id', 'technician_name', 'planned_date', 'planned_start', 'expected_duration', 'actual_date',
    'actual_start', 'actual_end', 'status', 'outcome', 'next_visit_date', 'remarks', 'inspection_notes',
    'work_log', 'parts_used', 'test_results',
)


def save_visit(db: Session, svc, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool], *,
               visit=None, reason: str = '') -> Any:
    locked = guard_edit(svc, actor, caps, reason)
    errors = []
    status = _s(payload.get('status')) or (visit.status if visit else 'Planned')
    if status not in rules.VISIT_STATUSES:
        errors.append('Visit status is not valid')
    outcome = _s(payload.get('outcome'))
    if outcome and outcome not in rules.VISIT_OUTCOMES:
        errors.append('Visit outcome is not valid')
    for field in ('planned_date', 'actual_date', 'next_visit_date'):
        if _s(payload.get(field)) and rules.parse_date(payload.get(field)) is None:
            errors.append(f'{field.replace("_", " ").capitalize()} is not a valid date')
    start, end = _s(payload.get('actual_start')), _s(payload.get('actual_end'))
    if start and end and end < start:
        errors.append('Visit end time cannot be before the start time')
    if status == 'Completed':
        if not _s(payload.get('actual_date')) and not (visit and visit.actual_date):
            errors.append('Enter the actual visit date to complete a visit')
        if not outcome and not (visit and visit.outcome):
            errors.append('Select the visit outcome to complete a visit')
    if errors:
        raise ServiceError(errors, 422)
    if visit is None:
        count = db.query(ServiceVisitModel).filter(ServiceVisitModel.service_id == svc.id).count()
        visit = ServiceVisitModel(service_id=svc.id, visit_no=count + 1, created_by_name=actor.name,
                                  technician_id=svc.assigned_employee_id, technician_name=svc.assigned_name)
        db.add(visit)
    for field in VISIT_FIELDS:
        if field in payload:
            setattr(visit, field, _s(payload.get(field)) or None)
    visit.status = status
    db.flush()
    add_history(db, svc.id, 'locked_edit' if locked else 'visit', actor, reason=reason or None,
                detail=f'Visit {visit.visit_no}: {visit.status}')
    db.commit()
    db.refresh(visit)
    return visit


# --- attachments -----------------------------------------------------------

def add_attachment(db: Session, svc, *, file_name: str, content: bytes, category: str, description: str,
                   actor: Actor, caps: Dict[str, bool], upload_fn, visit_id: Optional[str] = None,
                   vendor_repair_id: Optional[str] = None, reason: str = '') -> Any:
    locked = guard_edit(svc, actor, caps, reason)
    error = rules.validate_attachment(file_name, len(content or b''), category)
    if error:
        raise ServiceError(error, 422)
    if visit_id and not db.query(ServiceVisitModel).filter(
            ServiceVisitModel.id == visit_id, ServiceVisitModel.service_id == svc.id).first():
        raise ServiceError('The selected visit does not belong to this request', 422)
    if vendor_repair_id and not db.query(ServiceVendorRepairModel).filter(
            ServiceVendorRepairModel.id == vendor_repair_id, ServiceVendorRepairModel.service_id == svc.id).first():
        raise ServiceError('The selected vendor repair does not belong to this request', 422)
    safe = rules.safe_file_name(file_name)
    url = upload_fn(content, f'{uuid.uuid4().hex[:10]}_{safe}', f'service_attachments/{svc.service_code}')
    if not url:
        raise ServiceError('File storage is unavailable, nothing was saved. Please retry.', 503)
    att = ServiceAttachmentModel(
        service_id=svc.id, visit_id=visit_id or None, vendor_repair_id=vendor_repair_id or None,
        product_id=svc.product_id, category=category, description=_s(description)[:500] or None,
        file_name=safe, file_type=rules.file_extension(safe), file_size=len(content), file_url=url,
        uploaded_by_id=actor.id, uploaded_by_name=actor.name,
    )
    db.add(att)
    db.flush()
    add_history(db, svc.id, 'locked_edit' if locked else 'attachment', actor, reason=reason or None,
                detail=f'{category}: {safe}')
    db.commit()
    db.refresh(att)
    return att


def delete_attachment(db: Session, svc, att, actor: Actor, caps: Dict[str, bool], delete_fn=None,
                      reason: str = '') -> None:
    locked = guard_edit(svc, actor, caps, reason)
    report = db.query(ServiceReportModel).filter(ServiceReportModel.service_id == svc.id).first()
    if report and report.status == 'Submitted' and not caps.get('manage'):
        raise ServiceError('Evidence attached to a submitted report can only be removed by a service manager', 403)
    if not (caps.get('coordinate') or caps.get('manage') or att.uploaded_by_id == actor.id):
        raise ServiceError('You can only remove files you uploaded', 403)
    url = att.file_url
    add_history(db, svc.id, 'locked_edit' if locked else 'attachment_removed', actor, reason=reason or None,
                detail=f'{att.category}: {att.file_name}')
    db.delete(att)
    db.commit()
    if delete_fn and url:
        try:
            delete_fn(url)
        except Exception:  # best effort, metadata is already gone
            logger.warning('Could not delete stored file %s', url)


# --- vendor repair ---------------------------------------------------------

VENDOR_FIELDS = (
    'vendor_id', 'vendor_name', 'vendor_contact_person', 'vendor_contact_details', 'reason', 'fault_description',
    'internal_findings', 'warranty_amc_info', 'dispatch_date', 'dispatch_reference', 'expected_return_date',
    'dispatch_remarks', 'vendor_ack', 'vendor_completion_date', 'work_performed_by_vendor',
    'parts_replaced_by_vendor', 'vendor_warranty', 'return_dispatch_date', 'actual_return_date', 'vendor_remarks',
)


def _log_stage(rep, stage: str, actor: Actor, note: str = '') -> None:
    log = _loads(rep.stage_log_json, [])
    log.append({'stage': stage, 'at': _now().isoformat(timespec='seconds'), 'by': actor.name, 'note': note or ''})
    rep.stage_log_json = _dumps(log)


def _apply_vendor_fields(rep, payload: Dict[str, Any]) -> None:
    for field in VENDOR_FIELDS:
        if field in payload:
            setattr(rep, field, _s(payload.get(field)) or None)
    if 'vendor_charges' in payload:
        raw = payload.get('vendor_charges')
        try:
            rep.vendor_charges = float(raw) if _s(raw) else None
        except (TypeError, ValueError):
            raise ServiceError('Vendor charges must be a number', 422)
        if rep.vendor_charges is not None and rep.vendor_charges < 0:
            raise ServiceError('Vendor charges cannot be negative', 422)
    for field in ('dispatch_date', 'expected_return_date', 'vendor_completion_date', 'return_dispatch_date',
                  'actual_return_date'):
        if _s(getattr(rep, field)) and rules.parse_date(getattr(rep, field)) is None:
            raise ServiceError(f'{field.replace("_", " ").capitalize()} is not a valid date', 422)
    disp, back = rules.parse_date(rep.dispatch_date), rules.parse_date(rep.expected_return_date)
    if disp and back and back < disp:
        raise ServiceError('Expected return date cannot be before the dispatch date', 422)
    actual = rules.parse_date(rep.actual_return_date)
    if disp and actual and actual < disp:
        raise ServiceError('Actual return date cannot be before the dispatch date', 422)


def create_vendor_repair(db: Session, svc, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool],
                         vendor: Optional[Dict[str, Any]] = None) -> Any:
    if not (caps.get('coordinate') or caps.get('edit')):
        raise ServiceError('You are not allowed to start a vendor repair', 403)
    guard_edit(svc, actor, caps)
    if svc.workflow != rules.WF_REPAIR:
        raise ServiceError('Vendor repair is only available on repair requests', 400)
    if svc.status == 'Draft':
        raise ServiceError('Submit the request before sending it for vendor repair', 409)
    open_repair = db.query(ServiceVendorRepairModel).filter(
        ServiceVendorRepairModel.service_id == svc.id, ServiceVendorRepairModel.status == 'Open').first()
    if open_repair:
        raise ServiceError(f'Vendor repair {open_repair.repair_code} is already open for this request', 409)
    cfg = get_config(db)
    data = _loads(svc.data_json, {})
    entries = data.get('troubleshooting') or []
    last = entries[-1] if entries else {}
    count = db.query(ServiceVendorRepairModel).filter(ServiceVendorRepairModel.service_id == svc.id).count()
    rep = ServiceVendorRepairModel(
        service_id=svc.id, repair_code=f'VR-{svc.service_code}-{count + 1}', cycle=1,
        fault_description=_s(payload.get('fault_description')) or _s(last.get('fault_identified'))
        or _s(svc.problem_description)[:1000] or None,
        internal_findings=_s(payload.get('internal_findings')) or _s(last.get('technician_remarks')) or None,
        created_by_name=actor.name, stage=cfg['vendor_stages'][0],
    )
    if vendor:
        rep.vendor_id = vendor.get('id')
        rep.vendor_name = vendor.get('company_name')
        rep.vendor_contact_person = vendor.get('contact_person_name')
        rep.vendor_contact_details = ', '.join(x for x in (vendor.get('phone'), vendor.get('email')) if x) or None
    _apply_vendor_fields(rep, {k: v for k, v in payload.items() if not (vendor and k == 'vendor_id')})
    db.add(rep)
    db.flush()
    _log_stage(rep, rep.stage, actor, 'Repair recommended')
    add_history(db, svc.id, 'vendor_repair', actor, detail=f'{rep.repair_code} created')
    db.commit()
    db.refresh(rep)
    return rep


def update_vendor_repair(db: Session, svc, rep, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool],
                         vendor: Optional[Dict[str, Any]] = None) -> Any:
    guard_edit(svc, actor, caps)
    if rep.status != 'Open':
        raise ServiceError(f'Vendor repair {rep.repair_code} is {rep.status.lower()} and cannot be edited', 409)
    if vendor:
        rep.vendor_id = vendor.get('id')
        rep.vendor_name = vendor.get('company_name')
        rep.vendor_contact_person = vendor.get('contact_person_name') or rep.vendor_contact_person
        rep.vendor_contact_details = ', '.join(x for x in (vendor.get('phone'), vendor.get('email')) if x) \
            or rep.vendor_contact_details
    _apply_vendor_fields(rep, {k: v for k, v in payload.items() if not (vendor and k == 'vendor_id')})
    add_history(db, svc.id, 'vendor_repair', actor, detail=f'{rep.repair_code} updated')
    db.commit()
    db.refresh(rep)
    return rep


def advance_vendor_stage(db: Session, svc, rep, new_stage: str, actor: Actor, caps: Dict[str, bool],
                         note: str = '') -> Any:
    guard_edit(svc, actor, caps)
    if rep.status != 'Open':
        raise ServiceError(f'Vendor repair {rep.repair_code} is {rep.status.lower()}', 409)
    cfg = get_config(db)
    if rep.stage == new_stage:
        return rep
    attachments = [row_dict(a) for a in db.query(ServiceAttachmentModel)
                   .filter(ServiceAttachmentModel.vendor_repair_id == rep.id).all()]
    attachments += [row_dict(a) for a in db.query(ServiceAttachmentModel).filter(
        ServiceAttachmentModel.service_id == svc.id,
        ServiceAttachmentModel.category == 'Post-Repair Inspection Photos/Videos',
        ServiceAttachmentModel.vendor_repair_id.is_(None)).all()]
    blockers = rules.vendor_stage_blockers(vendor_dict(rep), new_stage, cfg['vendor_stages'], attachments,
                                           bool(cfg.get('vendor_approval_required')))
    if blockers:
        raise ServiceError(blockers, 409)
    rep.stage = new_stage
    _log_stage(rep, new_stage, actor, note)
    system = Actor(actor.id, actor.name, actor.employee_id)
    if new_stage == rules.VENDOR_STAGE_DISPATCHED:
        _system_status(db, svc, 'Waiting for Vendor', system, 'Product dispatched to vendor')
        notify(db, svc, 'vendor_dispatched', f'{svc.service_code}: product dispatched to {rep.vendor_name}',
               coordinators=True, key_suffix=rep.id)
    elif new_stage == rules.VENDOR_STAGE_RETURNED:
        _system_status(db, svc, 'Inspection Pending', system, 'Product returned from vendor')
        notify(db, svc, 'post_repair_pending', f'{svc.service_code}: post-repair inspection pending',
               employee_id=svc.assigned_employee_id, coordinators=True, key_suffix=rep.id)
    elif new_stage == cfg['vendor_stages'][-1]:
        rep.status = 'Closed'
    add_history(db, svc.id, 'vendor_repair', actor, detail=f'{rep.repair_code}: {new_stage}', reason=note or None)
    db.commit()
    db.refresh(rep)
    return rep


def _system_status(db: Session, svc, new_status: str, actor: Actor, reason: str) -> None:
    if svc.status == new_status or not rules.can_transition(svc.status, new_status):
        return
    old = svc.status
    svc.status = new_status
    add_history(db, svc.id, 'status_change', actor, from_status=old, to_status=new_status, reason=reason)
    _status_notifications(db, svc, new_status)


def record_post_repair(db: Session, svc, rep, payload: Dict[str, Any], actor: Actor, caps: Dict[str, bool]) -> Any:
    guard_edit(svc, actor, caps)
    if rep.status != 'Open':
        raise ServiceError(f'Vendor repair {rep.repair_code} is {rep.status.lower()}', 409)
    cfg = get_config(db)
    stages = cfg['vendor_stages']
    for field in ('post_repair_date', 'post_repair_inspector', 'post_repair_result', 'post_repair_tests', 'new_issues'):
        if field in payload:
            setattr(rep, field, _s(payload.get(field)) or None)
    if 'problem_resolved' in payload:
        rep.problem_resolved = _int_tri(payload.get('problem_resolved'))
    if 'ready_for_use' in payload:
        rep.ready_for_use = _int_tri(payload.get('ready_for_use'))
    if rep.stage == rules.VENDOR_STAGE_RETURNED and rules.VENDOR_STAGE_POST_INSPECTION in stages:
        rep.stage = rules.VENDOR_STAGE_POST_INSPECTION
        _log_stage(rep, rep.stage, actor, 'Post-repair inspection started')
    blockers = rules.post_repair_blockers(vendor_dict(rep))
    if blockers:
        raise ServiceError(blockers, 409)
    system = Actor(actor.id, actor.name, actor.employee_id)
    if rep.post_repair_result == 'Failed':
        _log_stage(rep, 'Post-repair inspection failed', actor, rep.new_issues or '')
        _system_status(db, svc, 'In Progress', system, 'Post-repair inspection failed - troubleshooting reopened')
    else:
        _log_stage(rep, 'Post-repair inspection passed', actor, '')
    add_history(db, svc.id, 'vendor_repair', actor, detail=f'{rep.repair_code}: post-repair {rep.post_repair_result}')
    db.commit()
    db.refresh(rep)
    return rep


def send_back_to_vendor(db: Session, svc, rep, reason: str, actor: Actor, caps: Dict[str, bool]) -> Any:
    guard_edit(svc, actor, caps)
    if rep.status != 'Open' or rep.post_repair_result != 'Failed':
        raise ServiceError('Only a repair that failed post-repair inspection can be sent back', 409)
    if not _s(reason):
        raise ServiceError('Enter the reason for sending the product back', 422)
    cfg = get_config(db)
    _log_stage(rep, 'Sent back to vendor', actor, reason)
    rep.cycle = (rep.cycle or 1) + 1
    rep.stage = rules.VENDOR_STAGE_READY if rules.VENDOR_STAGE_READY in cfg['vendor_stages'] else cfg['vendor_stages'][0]
    for field in ('dispatch_date', 'dispatch_reference', 'vendor_ack', 'vendor_completion_date',
                  'work_performed_by_vendor', 'parts_replaced_by_vendor', 'return_dispatch_date',
                  'actual_return_date', 'post_repair_date', 'post_repair_inspector', 'post_repair_result',
                  'post_repair_tests', 'new_issues'):
        setattr(rep, field, None)
    rep.problem_resolved = None
    rep.ready_for_use = None
    rep.reason = _s(reason)[:1000]
    _log_stage(rep, rep.stage, actor, f'Cycle {rep.cycle}')
    add_history(db, svc.id, 'vendor_repair', actor, reason=reason, detail=f'{rep.repair_code}: sent back (cycle {rep.cycle})')
    db.commit()
    db.refresh(rep)
    return rep


def cancel_vendor_repair(db: Session, svc, rep, reason: str, actor: Actor, caps: Dict[str, bool]) -> Any:
    if not caps.get('coordinate'):
        raise ServiceError('Only a coordinator can cancel a vendor repair', 403)
    guard_edit(svc, actor, caps)
    if rep.status != 'Open':
        raise ServiceError(f'Vendor repair {rep.repair_code} is already {rep.status.lower()}', 409)
    if not _s(reason):
        raise ServiceError('Enter the reason for cancelling the vendor repair', 422)
    rep.status = 'Cancelled'
    _log_stage(rep, 'Cancelled', actor, reason)
    add_history(db, svc.id, 'vendor_repair', actor, reason=reason, detail=f'{rep.repair_code} cancelled')
    db.commit()
    db.refresh(rep)
    return rep


def vendor_repair_view(db: Session, rep, cfg: Dict[str, Any]) -> Dict[str, Any]:
    out = vendor_dict(rep)
    out['next_stages'] = [] if rep.status != 'Open' else rules.vendor_next_stages(
        cfg['vendor_stages'], rep.stage, bool(cfg.get('vendor_approval_required')))
    out['stages'] = cfg['vendor_stages']
    return out


# ---------------------------------------------------------------------------
# Final service report
# ---------------------------------------------------------------------------

def _rows(pairs):
    return [[label, _fmt(value)] for label, value in pairs]


def _checklist_table(items):
    return {
        'columns': ['Checklist item', 'Done', 'Remark'],
        'rows': [[_fmt(r.get('label')), 'Yes' if r.get('done') else 'No', _fmt(r.get('remark'))]
                 for r in (items or []) if isinstance(r, dict)],
    }


def _report_sections(core: Dict[str, Any]) -> List[Dict[str, Any]]:
    c, site, prod = core['customer'], core['site'], core['product']
    data = core['details']
    wf = core['workflow']
    sections: List[Dict[str, Any]] = []
    provider = core['provider']
    sections.append({'title': 'Service provider', 'rows': _rows([
        ('Company', provider.get('name')), ('Address', provider.get('address')),
        ('Phone', provider.get('phone')), ('Email', provider.get('email'))])})
    sections.append({'title': 'Service details', 'rows': _rows([
        ('Service ID', core['service_id']), ('Report no.', core['report_no']),
        ('Service type', core['service_type']), ('Customer type', core['customer_type']),
        ('Lead', core['lead'].get('label')), ('Priority', core['priority']),
        ('Request date', core['dates'].get('request_date')), ('Status', core['status'])])})
    sections.append({'title': 'Customer', 'rows': _rows([
        ('Customer ID', c.get('customer_code')), ('Customer', c.get('name')), ('Organization', c.get('company')),
        ('Contact person', c.get('contact_person')), ('Mobile', c.get('mobile')), ('Email', c.get('email'))])})
    sections.append({'title': 'Site', 'rows': _rows([
        ('Address', site.get('address')), ('City', site.get('city')), ('State', site.get('state')),
        ('PIN code', site.get('pincode'))])})
    sections.append({'title': 'Product', 'rows': _rows([
        ('Category', prod.get('category')), ('Product', prod.get('name')), ('Model', prod.get('model')),
        ('Serial number', prod.get('serial_number')), ('Quantity', prod.get('quantity')),
        ('Warranty / AMC ref.', prod.get('warranty_ref'))])})
    tech = core['technician']
    sections.append({'title': 'Technician / engineer', 'rows': _rows([
        ('Technician', tech.get('name')), ('Engineer', tech.get('engineer'))])})

    if wf == rules.WF_REPAIR:
        comp = core['complaint']
        sections.append({'title': 'Complaint / problem', 'rows': _rows([
            ('Problem category', comp.get('category')), ('Description', comp.get('description')),
            ('Reported by', comp.get('reported_by')), ('Reported date', comp.get('reported_date'))])})
        for idx, entry in enumerate(data.get('troubleshooting') or [], start=1):
            sections.append({'title': f'Inspection and diagnosis - entry {idx}', 'rows': _rows([
                ('Inspection date', entry.get('inspection_date')), ('Technician', entry.get('technician')),
                ('Initial condition', entry.get('initial_condition')),
                ('Problem verified', entry.get('problem_verified')), ('Troubleshooting steps', entry.get('steps')),
                ('Fault identified', entry.get('fault_identified')), ('Root cause', entry.get('root_cause')),
                ('Required repair', entry.get('required_repair')), ('Parts required', entry.get('parts_required')),
                ('Repair feasibility', entry.get('feasibility')), ('Repair location', entry.get('repair_location')),
                ('Remarks', entry.get('technician_remarks'))]),
                'table': _checklist_table(entry.get('checklist'))})
        work = data.get('work') or {}
        sections.append({'title': 'Work performed', 'rows': _rows([
            ('Start', work.get('start_at')), ('End', work.get('end_at')), ('Technician', work.get('technician')),
            ('Troubleshooting performed', work.get('troubleshooting_performed')),
            ('Repair actions', work.get('repair_actions')), ('Parts replaced', work.get('parts_replaced')),
            ('Spare parts used', work.get('spares_used')), ('Configuration changes', work.get('config_changes')),
            ('Tests conducted', work.get('tests')), ('Results', work.get('results')),
            ('Repair status', work.get('repair_status')), ('Work pending', work.get('pending')),
            ('Additional visit required', work.get('additional_visit')), ('Remarks', work.get('remarks'))])})
        final = data.get('final_test') or {}
        sections.append({'title': 'Testing and inspection results', 'rows': _rows([
            ('Final inspection date', final.get('final_inspection_date')), ('Inspector', final.get('inspector')),
            ('Functional test', final.get('functional')), ('Operational status', final.get('operational_status')),
            ('Performance test', final.get('performance')), ('Safety check', final.get('safety')),
            ('Customer demonstration', final.get('demo')), ('Remaining issues', final.get('remaining')),
            ('Test outcome', final.get('outcome')), ('Final remarks', final.get('remarks'))])})
    elif wf == rules.WF_INSTALL:
        insp = data.get('inspection') or {}
        sections.append({'title': 'Site inspection', 'rows': _rows([
            ('Inspection date', insp.get('inspection_date')), ('Inspector', insp.get('inspector')),
            ('Site readiness', insp.get('site_readiness')), ('Electrical readiness', insp.get('electrical')),
            ('Mechanical readiness', insp.get('mechanical')), ('Space / location', insp.get('space')),
            ('Tools and materials', insp.get('tools')), ('Pending customer work', insp.get('pending_customer')),
            ('Remarks', insp.get('remarks'))]), 'table': _checklist_table(insp.get('checklist'))})
        ex = data.get('execution') or {}
        sections.append({'title': 'Installation', 'rows': _rows([
            ('Status', ex.get('status')), ('Start', ex.get('start_at')), ('Completion', ex.get('end_at')),
            ('Technician', ex.get('technician')), ('Materials / parts used', ex.get('materials')),
            ('Notes', ex.get('notes')), ('Issues identified', ex.get('issues')), ('Pending work', ex.get('pending')),
            ('Customer-side dependencies', ex.get('dependencies')), ('Result', ex.get('result'))]),
            'table': _checklist_table(ex.get('checklist'))})
        com = data.get('commissioning') or {}
        sections.append({'title': 'Commissioning', 'rows': _rows([
            ('Status', com.get('status')), ('Date', com.get('commissioning_date')), ('Engineer', com.get('engineer')),
            ('Initial start-up', com.get('startup_result')), ('Functional tests', com.get('functional')),
            ('Parameters / configuration', com.get('parameters')), ('Test run', com.get('test_run')),
            ('Safety checks', com.get('safety')), ('Issues found', com.get('issues')),
            ('Corrective actions', com.get('corrective')), ('Remarks', com.get('remarks'))]),
            'table': _checklist_table(com.get('checklist'))})
    else:
        amc = data.get('amc') or {}
        sections.append({'title': 'AMC visit', 'rows': _rows([
            ('AMC reference', core.get('amc_number')), ('Planned visit', amc.get('planned_visit_date')),
            ('Actual visit', amc.get('actual_visit_date')), ('Technician', amc.get('technician')),
            ('Product condition', amc.get('product_condition')), ('Findings', amc.get('findings')),
            ('Work performed', amc.get('work_performed')), ('Parts used', amc.get('parts_used')),
            ('Test results', amc.get('test_results')), ('Pending issues', amc.get('pending')),
            ('Next recommended service', amc.get('next_service_date'))]),
            'table': _checklist_table(amc.get('checklist'))})

    if core['vendor_repairs']:
        sections.append({'title': 'Vendor repair', 'table': {
            'columns': ['Repair', 'Vendor', 'Dispatched', 'Returned', 'Post-repair result', 'Stage'],
            'rows': [[_fmt(v.get('repair_code')), _fmt(v.get('vendor_name')), _fmt(v.get('dispatch_date')),
                      _fmt(v.get('actual_return_date')), _fmt(v.get('post_repair_result')), _fmt(v.get('stage'))]
                     for v in core['vendor_repairs']]}})
    if core['visits']:
        sections.append({'title': 'Visits', 'table': {
            'columns': ['Visit', 'Date', 'Technician', 'Outcome', 'Remarks'],
            'rows': [[f"#{v.get('visit_no')}", _fmt(v.get('actual_date') or v.get('planned_date')),
                      _fmt(v.get('technician_name')), _fmt(v.get('outcome') or v.get('status')),
                      _fmt(v.get('remarks'))] for v in core['visits']]}})
    sections.append({'title': 'Photos, videos and documents', 'table': {
        'columns': ['Category', 'File', 'Description', 'Uploaded by', 'Uploaded'],
        'rows': [[_fmt(e.get('category')), _fmt(e.get('file_name')), _fmt(e.get('description')),
                  _fmt(e.get('uploaded_by_name')), _fmt((e.get('uploaded_at') or '')[:10])]
                 for e in core['evidence']]}})
    sections.append({'title': 'Outstanding issues and remarks', 'rows': _rows([
        ('Outstanding issues', core['outstanding_issues']), ('Technician remarks', core['technician_remarks']),
        ('Final remarks', core['final_remarks'])])})
    ack = core['customer_acknowledgement']
    sections.append({'title': 'Customer acknowledgement', 'rows': _rows([
        ('Acknowledged', bool(ack.get('acknowledged'))), ('Name', ack.get('name')), ('Date', ack.get('date')),
        ('Method', ack.get('method')), ('Notes', ack.get('notes'))])})
    return sections


def report_row(db: Session, svc):
    return db.query(ServiceReportModel).filter(ServiceReportModel.service_id == svc.id).first()


def build_report(db: Session, svc, cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = cfg or get_config(db)
    s = service_dict(svc)
    data = _loads(svc.data_json, {})
    rep = report_row(db, svc)
    draft = _loads(rep.draft_json, {}) if rep else {}
    revision = (rep.revision or 0) if rep else 0
    visits = [row_dict(v) for v in db.query(ServiceVisitModel).filter(ServiceVisitModel.service_id == svc.id)
              .order_by(ServiceVisitModel.visit_no).all()]
    atts = [row_dict(a) for a in db.query(ServiceAttachmentModel).filter(ServiceAttachmentModel.service_id == svc.id)
            .order_by(ServiceAttachmentModel.uploaded_at).all()]
    repairs = [vendor_dict(r) for r in db.query(ServiceVendorRepairModel)
               .filter(ServiceVendorRepairModel.service_id == svc.id).order_by(ServiceVendorRepairModel.created_at).all()]
    amc = db.query(ServiceAmcModel).filter(ServiceAmcModel.id == svc.amc_id).first() if svc.amc_id else None
    ex, com, work = data.get('execution') or {}, data.get('commissioning') or {}, data.get('work') or {}
    report_no = (rep.report_no if rep and rep.report_no else f'SR-{svc.service_code}')
    core = {
        'service_id': svc.service_code, 'report_no': report_no, 'revision': revision,
        'service_type': svc.service_type, 'customer_type': svc.customer_type, 'workflow': svc.workflow,
        'status': svc.status, 'priority': svc.priority,
        'provider': {'name': 'Resoline', **(cfg.get('company_profile') or {})},
        'customer': {'customer_code': svc.customer_code, 'name': svc.customer_name, 'company': svc.company_name,
                     'contact_person': svc.contact_person, 'mobile': svc.mobile, 'email': svc.email},
        'site': {'address': svc.site_address, 'city': svc.city, 'state': svc.state, 'pincode': svc.pincode},
        'lead': {'id': svc.lead_id, 'label': svc.lead_label},
        'product': {'category': svc.product_category, 'name': svc.product_name, 'model': svc.product_model,
                    'serial_number': svc.serial_number, 'quantity': svc.quantity, 'warranty_ref': svc.warranty_ref},
        'complaint': {'category': svc.problem_category, 'description': svc.problem_description,
                      'reported_by': svc.reported_by, 'reported_date': svc.reported_date},
        'technician': {'name': svc.assigned_name, 'engineer': svc.engineer_name},
        'dates': {'request_date': svc.request_date, 'planned_date': svc.planned_date,
                  'installation_date': _s(ex.get('end_at'))[:10] or None,
                  'commissioning_date': com.get('commissioning_date'),
                  'work_end': _s(work.get('end_at'))[:10] or None},
        'amc_number': amc.amc_number if amc else None,
        'details': data, 'visits': visits, 'vendor_repairs': repairs,
        'evidence': atts,
        'outstanding_issues': draft.get('outstanding_issues') or work.get('pending') or ex.get('pending') or '',
        'technician_remarks': draft.get('technician_remarks') or '',
        'final_remarks': draft.get('final_remarks') or '',
        'customer_acknowledgement': draft.get('customer_acknowledgement') or {},
        'generated_at': _now().isoformat(timespec='seconds'),
    }
    core['sections'] = _report_sections(core)
    return core


def report_view(db: Session, svc) -> Dict[str, Any]:
    rep = report_row(db, svc)
    cfg = get_config(db)
    submitted = bool(rep and rep.status == 'Submitted')
    body = _loads(rep.snapshot_json, {}) if submitted else build_report(db, svc, cfg)
    return {
        'status': rep.status if rep else 'Not started',
        'report_no': (rep.report_no if rep and rep.report_no else f'SR-{svc.service_code}'),
        'revision': (rep.revision if rep else 0) or 0,
        'submitted_by': rep.submitted_by_name if rep else None,
        'submitted_at': rep.submitted_at.isoformat(timespec='seconds') if rep and rep.submitted_at else None,
        'draft': _loads(rep.draft_json, {}) if rep else {},
        'revisions': [{k: v for k, v in r.items() if k != 'snapshot'}
                      for r in _loads(rep.revisions_json, [])] if rep else [],
        'ack_required': svc.service_type in (cfg.get('ack_required_types') or []),
        'report': body,
    }


def save_report_draft(db: Session, svc, draft: Dict[str, Any], actor: Actor, caps: Dict[str, bool]) -> Any:
    if svc.status in rules.LOCKED_STATUSES:
        raise ServiceError('This request is locked. Ask a service manager to amend the report.', 403)
    guard_edit(svc, actor, caps)
    rep = report_row(db, svc)
    if rep and rep.status == 'Submitted':
        raise ServiceError('The report is already submitted. Use the amendment process to change it.', 409)
    clean = {}
    for key in ('outstanding_issues', 'technician_remarks', 'final_remarks'):
        if key in draft:
            clean[key] = _s(draft.get(key))
    if isinstance(draft.get('customer_acknowledgement'), dict):
        ack = draft['customer_acknowledgement']
        clean['customer_acknowledgement'] = {
            'acknowledged': bool(ack.get('acknowledged')), 'name': _s(ack.get('name')),
            'date': _s(ack.get('date')), 'method': _s(ack.get('method')), 'notes': _s(ack.get('notes')),
        }
        if clean['customer_acknowledgement']['acknowledged'] and not clean['customer_acknowledgement']['name']:
            raise ServiceError('Enter the name of the person acknowledging the report', 422)
    if rep is None:
        rep = ServiceReportModel(service_id=svc.id, status='Draft', revision=0, revisions_json='[]',
                                 report_no=f'SR-{svc.service_code}')
        db.add(rep)
    rep.draft_json = _dumps({**_loads(rep.draft_json, {}), **clean})
    add_history(db, svc.id, 'report', actor, detail='Draft saved')
    db.commit()
    return rep


def submit_report(db: Session, svc, actor: Actor, caps: Dict[str, bool]) -> Any:
    if svc.status in rules.LOCKED_STATUSES:
        raise ServiceError('This request is locked. Ask a service manager to amend the report.', 403)
    guard_edit(svc, actor, caps)
    rep = report_row(db, svc)
    if rep and rep.status == 'Submitted':
        raise ServiceError('The report has already been submitted', 409)
    if svc.status == 'Draft':
        raise ServiceError('Submit the request before the service report', 409)
    cfg = get_config(db)
    ctx = build_ctx(db, svc, cfg)
    blockers = rules.report_submit_blockers(ctx)
    if blockers:
        raise ServiceError(blockers, 409)
    if rep is None:
        rep = ServiceReportModel(service_id=svc.id, revision=0, revisions_json='[]', report_no=f'SR-{svc.service_code}')
        db.add(rep)
        db.flush()
    rep.revision = (rep.revision or 0) + 1
    rep.report_no = f'SR-{svc.service_code}' + (f'-R{rep.revision}' if rep.revision > 1 else '')
    snapshot = build_report(db, svc, cfg)
    snapshot['report_no'], snapshot['revision'] = rep.report_no, rep.revision
    snapshot['submitted_by'], snapshot['submitted_at'] = actor.name, _now().isoformat(timespec='seconds')
    rep.snapshot_json = _dumps(snapshot)
    rep.status = 'Submitted'
    rep.submitted_by_id, rep.submitted_by_name, rep.submitted_at = actor.id, actor.name, _now()
    add_history(db, svc.id, 'report', actor, detail=f'Report {rep.report_no} submitted')
    db.commit()
    db.refresh(rep)
    return rep


def amend_report(db: Session, svc, reason: str, actor: Actor, caps: Dict[str, bool]) -> Any:
    if not caps.get('manage'):
        raise ServiceError('Only a service manager can amend a submitted report', 403)
    if not _s(reason):
        raise ServiceError('Enter the reason for the amendment', 422)
    rep = report_row(db, svc)
    if not rep or rep.status != 'Submitted':
        raise ServiceError('There is no submitted report to amend', 409)
    if svc.status == 'Closed':
        raise ServiceError('Reopen the closed request before amending its report', 409)
    history = _loads(rep.revisions_json, [])
    history.append({
        'revision': rep.revision, 'report_no': rep.report_no, 'submitted_by': rep.submitted_by_name,
        'submitted_at': rep.submitted_at.isoformat(timespec='seconds') if rep.submitted_at else None,
        'amended_by': actor.name, 'amended_at': _now().isoformat(timespec='seconds'), 'reason': _s(reason),
        'snapshot': _loads(rep.snapshot_json, {}),
    })
    rep.revisions_json = _dumps(history)
    rep.status = 'Draft'
    add_history(db, svc.id, 'report', actor, reason=reason, detail=f'Report {rep.report_no} reopened for amendment')
    if svc.status == 'Completed':
        old = svc.status
        svc.status = 'Report Pending'
        svc.completed_at = None
        add_history(db, svc.id, 'status_change', actor, from_status=old, to_status='Report Pending',
                    reason='Report amendment')
    db.commit()
    db.refresh(rep)
    return rep


def render_report_pdf(report: Dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"Service report {report.get('report_no')}")
    styles = getSampleStyleSheet()
    small = ParagraphStyle('small', parent=styles['BodyText'], fontSize=8, leading=10)
    head = ParagraphStyle('head', parent=styles['Heading3'], fontSize=11, spacing=4, textColor=colors.HexColor('#1e1b4b'))

    def para(text):
        return Paragraph(escape(str(text if text is not None else '-')).replace('\n', '<br/>'), small)

    story = [Paragraph(escape(f"Service Report - {report.get('report_no')}"), styles['Title']),
             Paragraph(escape(f"{report.get('service_type') or ''} | Service ID {report.get('service_id')}"), small),
             Spacer(1, 6)]
    width = A4[0] - 28 * mm
    for section in report.get('sections') or []:
        story.append(Paragraph(escape(section['title']), head))
        if section.get('rows'):
            tbl = Table([[para(a), para(b)] for a, b in section['rows']], colWidths=[width * 0.3, width * 0.7])
            tbl.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#cbd5e1')),
                                     ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
                                     ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
            story.append(tbl)
        table = section.get('table')
        if table and table.get('rows'):
            cols = table['columns']
            data = [[para(c) for c in cols]] + [[para(c) for c in row] for row in table['rows']]
            tbl = Table(data, colWidths=[width / len(cols)] * len(cols), repeatRows=1)
            tbl.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#cbd5e1')),
                                     ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0e7ff')),
                                     ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
            story.append(Spacer(1, 3))
            story.append(tbl)
        story.append(Spacer(1, 6))
    if report.get('submitted_by'):
        story.append(para(f"Submitted by {report.get('submitted_by')} on {report.get('submitted_at')}"))
    doc.build(story)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Listing, statistics, alerts, export
# ---------------------------------------------------------------------------

def _visible(db: Session, caps: Dict[str, bool], employee_id: Optional[str]):
    q = db.query(ServiceRequestModel)
    if caps.get('technician_only'):
        emp = _s(employee_id) or '__none__'
        q = q.filter((ServiceRequestModel.assigned_employee_id == emp) | (ServiceRequestModel.engineer_employee_id == emp))
    return q


def _overdue_filter():
    from sqlalchemy import and_
    today = _today().isoformat()
    return and_(
        ServiceRequestModel.expected_completion.isnot(None),
        ServiceRequestModel.expected_completion != '',
        ServiceRequestModel.expected_completion < today,
        ~ServiceRequestModel.status.in_(rules.NOT_OVERDUE_STATUSES),
    )


def is_overdue(svc) -> bool:
    return bool(svc.expected_completion and svc.expected_completion < _today().isoformat()
                and svc.status not in rules.NOT_OVERDUE_STATUSES)


def service_stats(db: Session, caps: Dict[str, bool], employee_id: Optional[str]) -> Dict[str, int]:
    base = _visible(db, caps, employee_id)
    out = {'total': base.count()}
    for key, statuses in rules.CARD_STATUSES.items():
        out[key] = base.filter(ServiceRequestModel.status.in_(statuses)).count()
    out['overdue'] = base.filter(_overdue_filter()).count()
    return out


def list_services(db: Session, caps: Dict[str, bool], employee_id: Optional[str], *, q: str = '', card: str = '',
                  status: str = '', customer_type: str = '', service_type: str = '', priority: str = '',
                  technician: str = '', date_from: str = '', date_to: str = '', lead_id: str = '',
                  customer_id: str = '', product_id: str = '', sort_by: str = 'request_date',
                  sort_dir: str = 'desc', page: int = 1, page_size: int = 25) -> Dict[str, Any]:
    from sqlalchemy import case, or_
    M = ServiceRequestModel
    query = _visible(db, caps, employee_id)
    term = _s(q)
    if term:
        like = f'%{term}%'
        query = query.filter(or_(M.service_code.ilike(like), M.customer_name.ilike(like), M.company_name.ilike(like),
                                 M.product_name.ilike(like), M.serial_number.ilike(like), M.mobile.ilike(like),
                                 M.lead_label.ilike(like)))
    if card == 'overdue':
        query = query.filter(_overdue_filter())
    elif card in rules.CARD_STATUSES:
        query = query.filter(M.status.in_(rules.CARD_STATUSES[card]))
    if status:
        query = query.filter(M.status == status)
    for column, value in ((M.customer_type, customer_type), (M.priority, priority),
                          (M.assigned_employee_id, technician), (M.lead_id, lead_id),
                          (M.customer_id, customer_id), (M.product_id, product_id)):
        if value:
            query = query.filter(column == value)
    if service_type:
        query = query.filter(or_(M.service_type == service_type, M.data_json.ilike(f'%"{service_type}"%')))
    if date_from:
        query = query.filter(M.request_date >= date_from)
    if date_to:
        query = query.filter(M.request_date <= date_to)
    total = query.count()
    desc = _s(sort_dir).lower() != 'asc'
    if sort_by == 'priority':
        rank = case(*[(M.priority == name, idx) for name, idx in rules.PRIORITY_RANK.items()], else_=-1)
        order = rank.desc() if desc else rank.asc()
    elif sort_by == 'expected_completion':
        order = M.expected_completion.desc() if desc else M.expected_completion.asc()
    else:
        order = M.request_date.desc() if desc else M.request_date.asc()
    page = max(1, int(page or 1))
    page_size = min(max(1, int(page_size or 25)), 200)
    rows = query.order_by(order, M.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for svc in rows:
        item = {k: getattr(svc, k) for k in (
            'id', 'service_code', 'request_date', 'customer_name', 'customer_type', 'product_category',
            'product_name', 'serial_number', 'service_type', 'priority', 'assigned_employee_id', 'assigned_name',
            'status', 'expected_completion', 'lead_id', 'lead_label', 'mobile', 'workflow')}
        chosen = classification_of(svc)
        if chosen['service_types']:
            item['service_type'] = ', '.join(chosen['service_types'])
        if chosen['product_types']:
            item['product_category'] = ', '.join(chosen['product_types'])
        item['overdue'] = is_overdue(svc)
        items.append(item)
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def export_csv(items: List[Dict[str, Any]]) -> str:
    import csv
    buf = io.StringIO()
    columns = ['service_code', 'request_date', 'customer_name', 'customer_type', 'lead_label', 'product_category',
               'product_name', 'serial_number', 'service_type', 'priority', 'assigned_name', 'status',
               'expected_completion']
    writer = csv.writer(buf)
    writer.writerow([c.replace('_', ' ').title() for c in columns])
    for item in items:
        writer.writerow([('\'' + str(item.get(c)) if str(item.get(c) or '')[:1] in ('=', '+', '-', '@') else (item.get(c) or ''))
                         for c in columns])
    return buf.getvalue()


def generate_due_alerts(db: Session) -> int:
    """In-app reminders for overdue services and vendor returns. Safe to call repeatedly."""
    before = db.query(ServiceNotificationModel).count()
    today = _today()
    for svc in db.query(ServiceRequestModel).filter(_overdue_filter()).all():
        notify(db, svc, 'overdue', f'{svc.service_code} is overdue (expected {svc.expected_completion})',
               employee_id=svc.assigned_employee_id, coordinators=True)
    for visit in db.query(ServiceVisitModel).filter(ServiceVisitModel.status == 'Planned').all():
        planned = rules.parse_date(visit.planned_date)
        svc = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == visit.service_id).first()
        if planned and planned < today and svc and svc.status not in rules.NOT_OVERDUE_STATUSES:
            notify(db, svc, 'visit_overdue', f'{svc.service_code}: visit #{visit.visit_no} is overdue',
                   employee_id=visit.technician_id, coordinators=True, key_suffix=visit.id)
    for rep in db.query(ServiceVendorRepairModel).filter(ServiceVendorRepairModel.status == 'Open').all():
        expected = rules.parse_date(rep.expected_return_date)
        if not expected or rep.actual_return_date:
            continue
        svc = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == rep.service_id).first()
        if not svc:
            continue
        if expected < today:
            notify(db, svc, 'vendor_overdue', f'{svc.service_code}: vendor repair {rep.repair_code} is overdue',
                   coordinators=True, key_suffix=rep.id)
        elif (expected - today).days <= 2:
            notify(db, svc, 'vendor_return_soon', f'{svc.service_code}: vendor return due {expected.isoformat()}',
                   coordinators=True, key_suffix=rep.id)
    db.commit()
    return db.query(ServiceNotificationModel).count() - before


def service_history_for(db: Session, *, customer_id: Optional[str] = None, product_id: Optional[str] = None,
                        lead_id: Optional[str] = None) -> List[Dict[str, Any]]:
    q = db.query(ServiceRequestModel)
    if customer_id:
        q = q.filter(ServiceRequestModel.customer_id == customer_id)
    if product_id:
        q = q.filter(ServiceRequestModel.product_id == product_id)
    if lead_id:
        q = q.filter(ServiceRequestModel.lead_id == lead_id)
    out = []
    for svc in q.order_by(ServiceRequestModel.created_at.desc()).limit(200).all():
        rep = report_row(db, svc)
        out.append({
            'id': svc.id, 'service_code': svc.service_code, 'request_date': svc.request_date,
            'service_type': svc.service_type, 'status': svc.status, 'product_id': svc.product_id,
            'product_name': svc.product_name, 'serial_number': svc.serial_number, 'lead_id': svc.lead_id,
            'lead_label': svc.lead_label, 'problem_category': svc.problem_category,
            'assigned_name': svc.assigned_name,
            'visit_count': db.query(ServiceVisitModel).filter(ServiceVisitModel.service_id == svc.id).count(),
            'vendor_repair_count': db.query(ServiceVendorRepairModel)
            .filter(ServiceVendorRepairModel.service_id == svc.id).count(),
            'attachment_count': db.query(ServiceAttachmentModel).filter(ServiceAttachmentModel.service_id == svc.id).count(),
            'report_status': rep.status if rep else None, 'report_no': rep.report_no if rep else None,
        })
    return out


def submitted_reports(db: Session, caps: Dict[str, bool], employee_id: Optional[str], limit: int = 200) -> List[Dict[str, Any]]:
    visible = {s.id for s in _visible(db, caps, employee_id).all()}
    rows = (db.query(ServiceReportModel).filter(ServiceReportModel.status == 'Submitted')
            .order_by(ServiceReportModel.submitted_at.desc()).limit(limit).all())
    out = []
    for rep in rows:
        if rep.service_id not in visible:
            continue
        svc = db.query(ServiceRequestModel).filter(ServiceRequestModel.id == rep.service_id).first()
        out.append({'service_id': rep.service_id, 'service_code': svc.service_code if svc else None,
                    'customer_name': svc.customer_name if svc else None,
                    'service_type': svc.service_type if svc else None, 'report_no': rep.report_no,
                    'revision': rep.revision, 'submitted_by': rep.submitted_by_name,
                    'submitted_at': rep.submitted_at.isoformat(timespec='seconds') if rep.submitted_at else None})
    return out

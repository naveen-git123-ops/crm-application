"""Operation Management module — post-won execution workspace."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Session

from server import Base

logger = logging.getLogger(__name__)

PERM = 'operations'


def _now() -> datetime:
    return datetime.now()


def _today() -> date:
    return date.today()


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    text = str(value).strip()[:10]
    try:
        return datetime.strptime(text, '%Y-%m-%d').date()
    except Exception:
        return None


def _json_load(raw: Optional[str], fallback):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def _json_dump(value) -> str:
    return json.dumps(value if value is not None else {}, default=str)


# ---------------------------------------------------------------------------
# Types / stages / blockers
# ---------------------------------------------------------------------------

OPERATION_TYPES = (
    'Stock & Sell',
    'Carry & Sell',
    'Engineering Project',
    'Service & Maintenance',
    'Consultancy',
)

STAGES_BY_TYPE = {
    'Stock & Sell': [
        'PO Received', 'Stock Check', 'Packing', 'Dispatch', 'Delivery', 'Invoice', 'Payment',
    ],
    'Carry & Sell': [
        'PO Received', 'Vendor PO', 'Procurement', 'Vendor Confirmation', 'Material Ready',
        'Dispatch', 'Delivery', 'Invoice', 'Payment',
    ],
    'Engineering Project': [
        'PO Received', 'Planning', 'Technical', 'Procurement', 'Fabrication', 'Inspection',
        'Dispatch', 'Site Delivery', 'Installation', 'Testing', 'Commissioning', 'Handover',
        'Invoice', 'Payment',
    ],
    'Service & Maintenance': [
        'Service Order', 'Engineer Assignment', 'Site Visit', 'Diagnosis', 'Repair/Service',
        'Testing', 'Service Report', 'Customer Acceptance', 'Invoice', 'Payment',
    ],
    'Consultancy': [
        'Confirmation', 'Planning', 'Data Collection', 'Technical Work', 'Report/Deliverable',
        'Customer Approval', 'Invoice', 'Payment',
    ],
}

TABS_BY_TYPE = {
    'Stock & Sell': [
        'overview', 'tasks', 'material', 'dispatch', 'expenses', 'documents',
        'invoice', 'followups', 'timeline', 'closure',
    ],
    'Carry & Sell': [
        'overview', 'tasks', 'procurement', 'vendor', 'material', 'dispatch',
        'expenses', 'documents', 'invoice', 'followups', 'timeline', 'closure',
    ],
    'Engineering Project': [
        'overview', 'tasks', 'procurement', 'vendor', 'material', 'site', 'dispatch',
        'installation', 'expenses', 'documents', 'invoice', 'followups', 'timeline', 'closure',
    ],
    'Service & Maintenance': [
        'overview', 'tasks', 'site', 'installation', 'expenses', 'documents',
        'invoice', 'followups', 'timeline', 'closure',
    ],
    'Consultancy': [
        'overview', 'tasks', 'documents', 'expenses', 'invoice', 'followups', 'timeline', 'closure',
    ],
}

BLOCKER_CATEGORIES = [
    'Customer response', 'Customer technical data', 'Customer approval', 'Site visit pending',
    'Internal technical work', 'Drawing pending', 'Vendor quotation', 'Vendor technical data',
    'Vendor production', 'Vendor dispatch', 'Material procurement', 'Transportation',
    'Installation', 'Commissioning', 'Invoice', 'Payment', 'Employee/task delay',
    'Management approval', 'Other',
]

ACTION_TYPES = [
    'Customer Call', 'Vendor Call', 'Email', 'WhatsApp', 'Site Visit', 'Meeting',
    'Material Received', 'Document Received', 'Document Sent', 'Inspection', 'Other',
]

MATERIAL_STATUSES = [
    'Required', 'RFQ Sent', 'Vendor Selected', 'PO Issued', 'Confirmed', 'In Production',
    'Ready', 'Dispatched', 'In Transit', 'Received', 'Inspected', 'Rejected',
    'Short Received', 'Completed',
]

DOCUMENT_FOLDERS = [
    '01 Customer PO', '02 Quotation', '03 Technical Documents', '04 Approved Drawings',
    '05 Vendor Quotations', '06 Vendor Datasheets', '07 Vendor PO', '08 Inspection',
    '09 Dispatch', '10 Delivery', '11 E-Way Bill', '12 Invoice', '13 Installation Report',
    '14 Commissioning Report', '15 Service Report', '16 Customer Acceptance',
    '17 Payment Documents', '18 Other',
]

EXPENSE_CATEGORIES = [
    'Employee Travel', 'Food', 'Hotel', 'Local Conveyance', 'Vehicle Fuel',
    'Vehicle Cost Allocation', 'Freight', 'Courier', 'Labour', 'Material',
    'Vendor Cost', 'Site Expense', 'Installation', 'Testing', 'Miscellaneous',
]

CLOSURE_ITEMS = [
    'customer_po_completed',
    'quantity_verified',
    'material_delivered',
    'installation_completed',
    'testing_completed',
    'commissioning_completed',
    'customer_acceptance',
    'delivery_documents',
    'service_report',
    'invoice_raised',
    'payment_status_recorded',
    'outstanding_recorded',
    'warranty_recorded',
    'amc_evaluated',
    'final_expenses_recorded',
    'final_cost_calculated',
]

CLOSURE_STATUSES = [
    'Completed',
    'Completed with Pending Payment',
    'Completed with Warranty',
    'Completed with AMC',
    'Partially Completed',
    'Cancelled',
    'Closed – Other',
]


def infer_operation_type(lead) -> str:
    sub = (getattr(lead, 'sub_category', None) or '').strip().lower()
    category = (getattr(lead, 'category', None) or '').strip().lower()
    if sub in ('carry and order', 'carry & sell', 'back-to-back'):
        return 'Carry & Sell'
    if sub in ('stock and sell', 'stock & sell'):
        return 'Stock & Sell'
    if 'consult' in sub or 'consult' in category:
        return 'Consultancy'
    if 'service' in sub or 'maintenance' in sub:
        return 'Service & Maintenance'
    if category == 'project':
        return 'Engineering Project'
    return 'Stock & Sell'


def stages_for(operation_type: str) -> List[str]:
    return list(STAGES_BY_TYPE.get(operation_type) or STAGES_BY_TYPE['Stock & Sell'])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class OperationModel(Base):
    __tablename__ = 'crm_operations'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_code = Column(String(40), unique=True, index=True)
    lead_id = Column(String(36), index=True, nullable=True)
    enquiry_id = Column(String(80), nullable=True)
    quotation_id = Column(String(80), nullable=True)
    customer_id = Column(String(36), nullable=True, index=True)
    customer_name = Column(String(255), index=True)
    project_name = Column(String(500), nullable=True)
    po_number = Column(String(120), nullable=True)
    po_value = Column(Float, nullable=True)
    estimated_cost = Column(Float, nullable=True)
    actual_cost = Column(Float, default=0.0)
    operation_type = Column(String(80), default='Stock & Sell', index=True)
    business_category = Column(String(120), nullable=True)
    start_date = Column(String(10), nullable=True)
    target_date = Column(String(10), nullable=True, index=True)
    responsible_employee_id = Column(String(50), nullable=True, index=True)
    responsible_name = Column(String(255), nullable=True)
    current_stage = Column(String(80), nullable=True, index=True)
    health_status = Column(String(20), default='green', index=True)
    priority = Column(String(20), default='Medium')
    status = Column(String(40), default='Active', index=True)
    blocker_category = Column(String(80), nullable=True)
    blocker_description = Column(String(1000), nullable=True)
    blocker_responsible = Column(String(255), nullable=True)
    next_action = Column(String(500), nullable=True)
    next_action_date = Column(String(10), nullable=True, index=True)
    expected_resolution_date = Column(String(10), nullable=True)
    completion_date = Column(String(10), nullable=True)
    closure_status = Column(String(80), nullable=True)
    closure_checklist = Column(Text, nullable=True)
    payment_status = Column(String(40), default='Pending')
    outstanding_amount = Column(Float, default=0.0)
    warranty_notes = Column(String(1000), nullable=True)
    amc_notes = Column(String(1000), nullable=True)
    created_by_employee_id = Column(String(50), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class OperationTaskModel(Base):
    __tablename__ = 'operation_tasks'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_code = Column(String(40), index=True)
    operation_id = Column(String(36), index=True)
    task_name = Column(String(255))
    task_type = Column(String(80), nullable=True)
    assigned_to_employee_id = Column(String(50), nullable=True, index=True)
    assigned_to_name = Column(String(255), nullable=True)
    start_date = Column(String(10), nullable=True)
    due_date = Column(String(10), nullable=True, index=True)
    priority = Column(String(20), default='Medium')
    status = Column(String(40), default='Pending', index=True)
    auto_state = Column(String(40), default='normal')
    dependency = Column(String(255), nullable=True)
    next_action = Column(String(500), nullable=True)
    next_action_date = Column(String(10), nullable=True)
    remarks = Column(String(1000), nullable=True)
    completion_proof = Column(String(500), nullable=True)
    completion_date = Column(String(10), nullable=True)
    delay_reason = Column(String(500), nullable=True)
    last_update = Column(DateTime, default=datetime.now)
    created_at = Column(DateTime, default=datetime.now)


class OperationUpdateModel(Base):
    __tablename__ = 'operation_updates'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    task_id = Column(String(36), nullable=True, index=True)
    employee_id = Column(String(50), nullable=True)
    employee_name = Column(String(255), nullable=True)
    action_type = Column(String(80))
    action_result = Column(String(2000))
    next_action = Column(String(500), nullable=True)
    next_action_date = Column(String(10), nullable=True)
    attachment = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class OperationVendorModel(Base):
    __tablename__ = 'operation_vendors'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    vendor_id = Column(String(36), nullable=True)
    vendor_name = Column(String(255))
    contact_person = Column(String(255), nullable=True)
    phone = Column(String(40), nullable=True)
    email = Column(String(255), nullable=True)
    quotation = Column(String(500), nullable=True)
    datasheet = Column(String(500), nullable=True)
    price = Column(Float, nullable=True)
    lead_time = Column(String(80), nullable=True)
    confirmed_delivery = Column(String(10), nullable=True)
    actual_delivery = Column(String(10), nullable=True)
    payment_terms = Column(String(255), nullable=True)
    warranty = Column(String(255), nullable=True)
    vendor_po = Column(String(120), nullable=True)
    last_contact = Column(String(10), nullable=True)
    vendor_response = Column(String(1000), nullable=True)
    next_followup = Column(String(10), nullable=True)
    responsible_name = Column(String(255), nullable=True)
    status = Column(String(40), default='Pending')
    broken_commitment = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)


class OperationMaterialModel(Base):
    __tablename__ = 'operation_materials'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    description = Column(String(255))
    specification = Column(String(500), nullable=True)
    make = Column(String(120), nullable=True)
    required_qty = Column(Float, default=0)
    ordered_qty = Column(Float, default=0)
    received_qty = Column(Float, default=0)
    vendor_name = Column(String(255), nullable=True)
    vendor_po = Column(String(120), nullable=True)
    unit_cost = Column(Float, nullable=True)
    total_cost = Column(Float, nullable=True)
    expected_dispatch = Column(String(10), nullable=True)
    expected_delivery = Column(String(10), nullable=True)
    actual_dispatch = Column(String(10), nullable=True)
    actual_delivery = Column(String(10), nullable=True)
    inspection_status = Column(String(40), nullable=True)
    delivery_status = Column(String(40), nullable=True)
    followup_owner = Column(String(255), nullable=True)
    status = Column(String(40), default='Required')
    created_at = Column(DateTime, default=datetime.now)


class OperationDispatchModel(Base):
    __tablename__ = 'operation_dispatches'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dispatch_code = Column(String(40), index=True)
    operation_id = Column(String(36), index=True)
    dispatch_date = Column(String(10), nullable=True)
    material = Column(String(255), nullable=True)
    quantity = Column(Float, nullable=True)
    packing = Column(String(255), nullable=True)
    transporter = Column(String(255), nullable=True)
    vehicle = Column(String(120), nullable=True)
    driver = Column(String(120), nullable=True)
    lr_number = Column(String(80), nullable=True)
    eway_bill = Column(String(80), nullable=True)
    delivery_challan = Column(String(80), nullable=True)
    invoice_ref = Column(String(80), nullable=True)
    expected_delivery = Column(String(10), nullable=True)
    actual_delivery = Column(String(10), nullable=True)
    promised_delivery = Column(String(10), nullable=True)
    pod = Column(String(500), nullable=True)
    customer_ack = Column(String(255), nullable=True)
    delay_days = Column(Integer, default=0)
    delay_source = Column(String(40), nullable=True)
    delay_reason = Column(String(500), nullable=True)
    status = Column(String(40), default='Material Ready')
    created_at = Column(DateTime, default=datetime.now)


class OperationSiteVisitModel(Base):
    __tablename__ = 'operation_site_visits'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    site_address = Column(String(500), nullable=True)
    gps = Column(String(80), nullable=True)
    site_contact = Column(String(255), nullable=True)
    engineer_id = Column(String(50), nullable=True)
    engineer_name = Column(String(255), nullable=True)
    planned_date = Column(String(10), nullable=True)
    actual_date = Column(String(10), nullable=True)
    check_in = Column(String(40), nullable=True)
    check_out = Column(String(40), nullable=True)
    duration = Column(String(40), nullable=True)
    problem_reported = Column(String(1000), nullable=True)
    inspection = Column(String(1000), nullable=True)
    work_performed = Column(String(2000), nullable=True)
    materials_used = Column(String(1000), nullable=True)
    pending_work = Column(String(1000), nullable=True)
    customer_remarks = Column(String(1000), nullable=True)
    customer_acceptance = Column(String(40), nullable=True)
    report = Column(String(2000), nullable=True)
    photos = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class OperationInstallationModel(Base):
    __tablename__ = 'operation_installations'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    engineer_name = Column(String(255), nullable=True)
    site = Column(String(500), nullable=True)
    planned_date = Column(String(10), nullable=True)
    actual_date = Column(String(10), nullable=True)
    equipment = Column(String(500), nullable=True)
    installation_status = Column(String(40), default='Planned')
    testing_result = Column(String(255), nullable=True)
    trial_result = Column(String(255), nullable=True)
    commissioning_result = Column(String(255), nullable=True)
    reports = Column(String(500), nullable=True)
    certificates = Column(String(500), nullable=True)
    customer_signature = Column(String(255), nullable=True)
    handover_date = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class OperationExpenseModel(Base):
    __tablename__ = 'operation_expenses'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    expense_code = Column(String(40), index=True)
    operation_id = Column(String(36), index=True)
    task_id = Column(String(36), nullable=True)
    employee_id = Column(String(50), nullable=True)
    employee_name = Column(String(255), nullable=True)
    vehicle_id = Column(String(50), nullable=True)
    category = Column(String(80))
    amount = Column(Float, default=0)
    purpose = Column(String(500), nullable=True)
    receipt = Column(String(500), nullable=True)
    gps = Column(String(80), nullable=True)
    approval_status = Column(String(40), default='Pending')
    created_at = Column(DateTime, default=datetime.now)


class OperationInvoiceModel(Base):
    __tablename__ = 'operation_invoices'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_no = Column(String(80), index=True)
    operation_id = Column(String(36), index=True)
    invoice_amount = Column(Float, default=0)
    invoice_date = Column(String(10), nullable=True)
    due_date = Column(String(10), nullable=True)
    status = Column(String(40), default='Invoice Raised')
    contact_person = Column(String(255), nullable=True)
    contact_method = Column(String(80), nullable=True)
    customer_response = Column(String(1000), nullable=True)
    promised_payment_date = Column(String(10), nullable=True)
    next_followup_date = Column(String(10), nullable=True)
    remarks = Column(String(1000), nullable=True)
    commitment_missed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)


class OperationPaymentModel(Base):
    __tablename__ = 'operation_payments'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String(36), index=True)
    operation_id = Column(String(36), index=True)
    amount = Column(Float, default=0)
    received_date = Column(String(10), nullable=True)
    mode = Column(String(40), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class OperationFollowupModel(Base):
    __tablename__ = 'operation_followups'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    followup_type = Column(String(40))
    responsible_name = Column(String(255), nullable=True)
    last_action = Column(String(500), nullable=True)
    next_action = Column(String(500), nullable=True)
    due_date = Column(String(10), nullable=True, index=True)
    status = Column(String(40), default='Open')
    created_at = Column(DateTime, default=datetime.now)


class OperationDocumentModel(Base):
    __tablename__ = 'operation_documents'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    folder = Column(String(80), default='18 Other')
    file_name = Column(String(255))
    file_url = Column(String(800), nullable=True)
    version = Column(String(20), default='1')
    related_task_id = Column(String(36), nullable=True)
    approval_status = Column(String(40), default='Uploaded')
    uploaded_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class OperationAuditModel(Base):
    __tablename__ = 'operation_audit_logs'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_id = Column(String(36), index=True)
    entity_type = Column(String(80))
    entity_id = Column(String(36), nullable=True)
    user_id = Column(String(50), nullable=True)
    user_name = Column(String(255), nullable=True)
    field_name = Column(String(80), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def next_operation_code(db: Session) -> str:
    year = _now().year
    prefix = f'OPR-{year}-'
    last = (
        db.query(OperationModel)
        .filter(OperationModel.operation_code.like(f'{prefix}%'))
        .order_by(OperationModel.operation_code.desc())
        .first()
    )
    seq = 1
    if last and last.operation_code:
        try:
            seq = int(str(last.operation_code).split('-')[-1]) + 1
        except Exception:
            seq = db.query(OperationModel).count() + 1
    return f'{prefix}{seq:06d}'


def next_child_code(prefix: str) -> str:
    return f"{prefix}-{_now().strftime('%Y')}-{uuid.uuid4().hex[:6].upper()}"


def add_audit(db: Session, operation_id: str, user, entity_type: str, entity_id: Optional[str],
              field_name: Optional[str], old_value, new_value, reason: Optional[str] = None):
    db.add(OperationAuditModel(
        operation_id=operation_id,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=getattr(user, 'id', None),
        user_name=getattr(user, 'name', None),
        field_name=field_name,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        reason=reason,
    ))


def add_timeline(db: Session, operation_id: str, user, action_type: str, result: str,
                 next_action: Optional[str] = None, next_action_date: Optional[str] = None,
                 task_id: Optional[str] = None):
    db.add(OperationUpdateModel(
        operation_id=operation_id,
        task_id=task_id,
        employee_id=getattr(user, 'employee_id', None),
        employee_name=getattr(user, 'name', None),
        action_type=action_type,
        action_result=result,
        next_action=next_action,
        next_action_date=next_action_date,
    ))


def compute_task_auto_state(task: OperationTaskModel) -> str:
    if (task.status or '').lower() in ('completed', 'cancelled'):
        return 'completed' if (task.status or '').lower() == 'completed' else 'cancelled'
    due = _parse_date(task.due_date)
    if not due:
        return 'normal'
    today = _today()
    if due < today:
        return 'escalated' if (today - due).days >= 2 else 'overdue'
    if due == today:
        return 'due_today'
    if due <= today + timedelta(days=2):
        return 'due_soon'
    return 'normal'


def refresh_task_states(db: Session, operation_id: str):
    tasks = db.query(OperationTaskModel).filter(OperationTaskModel.operation_id == operation_id).all()
    for task in tasks:
        task.auto_state = compute_task_auto_state(task)


def compute_health(op: OperationModel, tasks: List[OperationTaskModel], followups: List[OperationFollowupModel],
                   invoices: List[OperationInvoiceModel]) -> str:
    if (op.status or '') in ('Completed', 'Cancelled') or (op.closure_status or '').startswith('Completed'):
        return 'green'
    today = _today()
    red = False
    yellow = False
    target = _parse_date(op.target_date)
    if target and target < today and (op.status or 'Active') == 'Active':
        red = True
    if op.blocker_category:
        yellow = True
    next_d = _parse_date(op.next_action_date)
    if next_d and next_d < today:
        red = True
    elif next_d and next_d == today:
        yellow = True
    for task in tasks:
        state = compute_task_auto_state(task)
        if state in ('overdue', 'escalated'):
            red = True
        elif state in ('due_today', 'due_soon'):
            yellow = True
    for item in followups:
        due = _parse_date(item.due_date)
        if due and due < today and (item.status or 'Open') != 'Done':
            red = True
    for inv in invoices:
        if inv.commitment_missed:
            red = True
        due = _parse_date(inv.due_date or inv.promised_payment_date)
        if due and due < today and (inv.status or '') not in ('Payment Received', 'Fully Recovered'):
            red = True
    if red:
        return 'red'
    if yellow:
        return 'yellow'
    return 'green'


def refresh_operation_rollups(db: Session, op: OperationModel):
    tasks = db.query(OperationTaskModel).filter(OperationTaskModel.operation_id == op.id).all()
    followups = db.query(OperationFollowupModel).filter(OperationFollowupModel.operation_id == op.id).all()
    invoices = db.query(OperationInvoiceModel).filter(OperationInvoiceModel.operation_id == op.id).all()
    expenses = db.query(OperationExpenseModel).filter(OperationExpenseModel.operation_id == op.id).all()
    payments = db.query(OperationPaymentModel).filter(OperationPaymentModel.operation_id == op.id).all()
    for task in tasks:
        task.auto_state = compute_task_auto_state(task)
    op.actual_cost = float(sum((e.amount or 0) for e in expenses))
    invoiced = float(sum((i.invoice_amount or 0) for i in invoices))
    received = float(sum((p.amount or 0) for p in payments))
    op.outstanding_amount = max(0.0, invoiced - received)
    if invoiced <= 0:
        op.payment_status = 'Pending'
    elif received <= 0:
        op.payment_status = 'Invoice Raised'
    elif received < invoiced:
        op.payment_status = 'Partial'
    else:
        op.payment_status = 'Fully Recovered'
    op.health_status = compute_health(op, tasks, followups, invoices)
    op.updated_at = _now()


def seed_default_tasks(db: Session, op: OperationModel, user):
    existing = db.query(OperationTaskModel).filter(OperationTaskModel.operation_id == op.id).count()
    if existing:
        return
    start = op.start_date or _today().isoformat()
    for index, stage in enumerate(stages_for(op.operation_type)):
        due = (_parse_date(start) or _today()) + timedelta(days=index + 1)
        db.add(OperationTaskModel(
            task_code=next_child_code('TSK'),
            operation_id=op.id,
            task_name=stage,
            task_type=stage,
            assigned_to_employee_id=op.responsible_employee_id,
            assigned_to_name=op.responsible_name,
            start_date=start,
            due_date=due.isoformat(),
            status='Completed' if index == 0 else 'Pending',
            completion_date=start if index == 0 else None,
            auto_state='completed' if index == 0 else 'normal',
        ))
    op.current_stage = stages_for(op.operation_type)[1] if len(stages_for(op.operation_type)) > 1 else stages_for(op.operation_type)[0]


def _lead_win_fields(lead) -> Dict[str, Any]:
    payload = _json_load(getattr(lead, 'workflow_payload', None), {})
    closed = payload.get('closed_won') if isinstance(payload, dict) else {}
    if not isinstance(closed, dict):
        closed = {}
    return {
        'po_value': closed.get('order_value') if closed.get('order_value') is not None else getattr(lead, 'value', None),
        'po_number': closed.get('po_number') or closed.get('customer_po') or '',
        'quotation_id': closed.get('quotation_id') or closed.get('offer_no') or '',
        'terms': closed.get('terms') or closed.get('payment_terms') or '',
    }


def ensure_operation_for_won_lead(db: Session, lead, user) -> Optional['OperationModel']:
    if not lead or (getattr(lead, 'status', None) or '') != 'Won':
        return None
    existing = db.query(OperationModel).filter(OperationModel.lead_id == lead.id).first()
    if existing:
        return existing
    win = _lead_win_fields(lead)
    op_type = infer_operation_type(lead)
    stages = stages_for(op_type)
    op = OperationModel(
        operation_code=next_operation_code(db),
        lead_id=lead.id,
        enquiry_id=lead.id,
        quotation_id=win.get('quotation_id') or None,
        customer_id=getattr(lead, 'customer_id', None),
        customer_name=lead.company or lead.contact_name,
        project_name=getattr(lead, 'brief_of_enquiry', None) or lead.company,
        po_number=win.get('po_number') or None,
        po_value=float(win['po_value']) if win.get('po_value') not in (None, '') else None,
        operation_type=op_type,
        business_category=getattr(lead, 'sub_category', None) or getattr(lead, 'category', None),
        start_date=_today().isoformat(),
        responsible_employee_id=lead.assigned_to_employee_id or getattr(user, 'employee_id', None),
        responsible_name=lead.assigned_to_name or getattr(user, 'name', None),
        current_stage=stages[0],
        priority='High',
        status='Active',
        next_action='Plan execution and assign first tasks',
        next_action_date=(_today() + timedelta(days=1)).isoformat(),
        created_by_employee_id=getattr(user, 'employee_id', None),
        created_by_name=getattr(user, 'name', None),
    )
    db.add(op)
    db.flush()
    seed_default_tasks(db, op, user)
    add_timeline(db, op.id, user, 'Other', f'Operation {op.operation_code} created from won enquiry')
    add_audit(db, op.id, user, 'operation', op.id, 'status', None, 'Active', 'Created from won lead')
    if getattr(lead, 'vendor_name', None):
        db.add(OperationVendorModel(
            operation_id=op.id,
            vendor_id=getattr(lead, 'vendor_id', None),
            vendor_name=lead.vendor_name,
            status='Pending',
            responsible_name=op.responsible_name,
        ))
    refresh_operation_rollups(db, op)
    db.commit()
    db.refresh(op)
    return op


# ---------------------------------------------------------------------------
# Pydantic
# ---------------------------------------------------------------------------

class OperationCreate(BaseModel):
    lead_id: Optional[str] = None
    enquiry_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_id: Optional[str] = None
    project_name: Optional[str] = None
    po_number: Optional[str] = None
    po_value: Optional[float] = None
    estimated_cost: Optional[float] = None
    operation_type: Optional[str] = None
    business_category: Optional[str] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    responsible_employee_id: Optional[str] = None
    responsible_name: Optional[str] = None
    priority: Optional[str] = 'Medium'
    quotation_id: Optional[str] = None


class OperationUpdate(BaseModel):
    model_config = ConfigDict(extra='ignore')
    customer_name: Optional[str] = None
    project_name: Optional[str] = None
    po_number: Optional[str] = None
    po_value: Optional[float] = None
    estimated_cost: Optional[float] = None
    operation_type: Optional[str] = None
    business_category: Optional[str] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    responsible_employee_id: Optional[str] = None
    responsible_name: Optional[str] = None
    current_stage: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    blocker_category: Optional[str] = None
    blocker_description: Optional[str] = None
    blocker_responsible: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    expected_resolution_date: Optional[str] = None
    warranty_notes: Optional[str] = None
    amc_notes: Optional[str] = None
    change_reason: Optional[str] = None


class TaskIn(BaseModel):
    task_name: str
    task_type: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = 'Medium'
    status: Optional[str] = 'Pending'
    dependency: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    remarks: Optional[str] = None
    completion_proof: Optional[str] = None
    delay_reason: Optional[str] = None


class UpdateIn(BaseModel):
    task_id: Optional[str] = None
    action_type: str
    action_result: str
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    mark_task_complete: bool = False
    completion_proof: Optional[str] = None


class VendorIn(BaseModel):
    vendor_id: Optional[str] = None
    vendor_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    quotation: Optional[str] = None
    datasheet: Optional[str] = None
    price: Optional[float] = None
    lead_time: Optional[str] = None
    confirmed_delivery: Optional[str] = None
    actual_delivery: Optional[str] = None
    payment_terms: Optional[str] = None
    warranty: Optional[str] = None
    vendor_po: Optional[str] = None
    last_contact: Optional[str] = None
    vendor_response: Optional[str] = None
    next_followup: Optional[str] = None
    responsible_name: Optional[str] = None
    status: Optional[str] = 'Pending'


class MaterialIn(BaseModel):
    description: str
    specification: Optional[str] = None
    make: Optional[str] = None
    required_qty: float = 0
    ordered_qty: float = 0
    received_qty: float = 0
    vendor_name: Optional[str] = None
    vendor_po: Optional[str] = None
    unit_cost: Optional[float] = None
    expected_dispatch: Optional[str] = None
    expected_delivery: Optional[str] = None
    actual_dispatch: Optional[str] = None
    actual_delivery: Optional[str] = None
    inspection_status: Optional[str] = None
    delivery_status: Optional[str] = None
    followup_owner: Optional[str] = None
    status: Optional[str] = 'Required'


class DispatchIn(BaseModel):
    dispatch_date: Optional[str] = None
    material: Optional[str] = None
    quantity: Optional[float] = None
    packing: Optional[str] = None
    transporter: Optional[str] = None
    vehicle: Optional[str] = None
    driver: Optional[str] = None
    lr_number: Optional[str] = None
    eway_bill: Optional[str] = None
    delivery_challan: Optional[str] = None
    invoice_ref: Optional[str] = None
    expected_delivery: Optional[str] = None
    actual_delivery: Optional[str] = None
    promised_delivery: Optional[str] = None
    pod: Optional[str] = None
    customer_ack: Optional[str] = None
    delay_source: Optional[str] = None
    delay_reason: Optional[str] = None
    status: Optional[str] = 'Material Ready'


class SiteVisitIn(BaseModel):
    site_address: Optional[str] = None
    gps: Optional[str] = None
    site_contact: Optional[str] = None
    engineer_id: Optional[str] = None
    engineer_name: Optional[str] = None
    planned_date: Optional[str] = None
    actual_date: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    problem_reported: Optional[str] = None
    inspection: Optional[str] = None
    work_performed: Optional[str] = None
    materials_used: Optional[str] = None
    pending_work: Optional[str] = None
    customer_remarks: Optional[str] = None
    customer_acceptance: Optional[str] = None
    report: Optional[str] = None


class InstallationIn(BaseModel):
    engineer_name: Optional[str] = None
    site: Optional[str] = None
    planned_date: Optional[str] = None
    actual_date: Optional[str] = None
    equipment: Optional[str] = None
    installation_status: Optional[str] = 'Planned'
    testing_result: Optional[str] = None
    trial_result: Optional[str] = None
    commissioning_result: Optional[str] = None
    reports: Optional[str] = None
    certificates: Optional[str] = None
    customer_signature: Optional[str] = None
    handover_date: Optional[str] = None


class ExpenseIn(BaseModel):
    task_id: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    vehicle_id: Optional[str] = None
    category: str
    amount: float
    purpose: Optional[str] = None
    receipt: Optional[str] = None
    gps: Optional[str] = None
    approval_status: Optional[str] = 'Pending'


class InvoiceIn(BaseModel):
    invoice_no: Optional[str] = None
    invoice_amount: float
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = 'Invoice Raised'
    contact_person: Optional[str] = None
    contact_method: Optional[str] = None
    customer_response: Optional[str] = None
    promised_payment_date: Optional[str] = None
    next_followup_date: Optional[str] = None
    remarks: Optional[str] = None


class PaymentIn(BaseModel):
    invoice_id: str
    amount: float
    received_date: Optional[str] = None
    mode: Optional[str] = None


class FollowupIn(BaseModel):
    followup_type: str
    responsible_name: Optional[str] = None
    last_action: Optional[str] = None
    next_action: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = 'Open'


class DocumentIn(BaseModel):
    folder: Optional[str] = '18 Other'
    file_name: str
    file_url: Optional[str] = None
    version: Optional[str] = '1'
    related_task_id: Optional[str] = None


class CloseIn(BaseModel):
    closure_status: str
    checklist: Dict[str, bool] = Field(default_factory=dict)
    warranty_notes: Optional[str] = None
    amc_notes: Optional[str] = None


def _get_op(db: Session, operation_id: str) -> OperationModel:
    op = db.query(OperationModel).filter(
        (OperationModel.id == operation_id) | (OperationModel.operation_code == operation_id)
    ).first()
    if not op:
        raise HTTPException(status_code=404, detail='Operation not found')
    return op


def _row(model) -> Dict[str, Any]:
    data = {}
    for col in model.__table__.columns:
        val = getattr(model, col.name)
        if isinstance(val, datetime):
            data[col.name] = val.isoformat()
        else:
            data[col.name] = val
    return data


def serialize_operation(db: Session, op: OperationModel, include_children: bool = False) -> Dict[str, Any]:
    refresh_operation_rollups(db, op)
    stages = stages_for(op.operation_type)
    data = _row(op)
    data['stages'] = stages
    data['visible_tabs'] = TABS_BY_TYPE.get(op.operation_type) or TABS_BY_TYPE['Stock & Sell']
    data['closure_checklist'] = _json_load(op.closure_checklist, {k: False for k in CLOSURE_ITEMS})
    invoiced = 0.0
    received = 0.0
    if include_children:
        tasks = db.query(OperationTaskModel).filter(OperationTaskModel.operation_id == op.id).order_by(OperationTaskModel.created_at).all()
        vendors = db.query(OperationVendorModel).filter(OperationVendorModel.operation_id == op.id).all()
        materials = db.query(OperationMaterialModel).filter(OperationMaterialModel.operation_id == op.id).all()
        dispatches = db.query(OperationDispatchModel).filter(OperationDispatchModel.operation_id == op.id).all()
        visits = db.query(OperationSiteVisitModel).filter(OperationSiteVisitModel.operation_id == op.id).all()
        installs = db.query(OperationInstallationModel).filter(OperationInstallationModel.operation_id == op.id).all()
        expenses = db.query(OperationExpenseModel).filter(OperationExpenseModel.operation_id == op.id).all()
        invoices = db.query(OperationInvoiceModel).filter(OperationInvoiceModel.operation_id == op.id).all()
        payments = db.query(OperationPaymentModel).filter(OperationPaymentModel.operation_id == op.id).all()
        followups = db.query(OperationFollowupModel).filter(OperationFollowupModel.operation_id == op.id).all()
        documents = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == op.id).all()
        updates = (
            db.query(OperationUpdateModel)
            .filter(OperationUpdateModel.operation_id == op.id)
            .order_by(OperationUpdateModel.created_at.desc())
            .limit(200)
            .all()
        )
        audits = (
            db.query(OperationAuditModel)
            .filter(OperationAuditModel.operation_id == op.id)
            .order_by(OperationAuditModel.created_at.desc())
            .limit(100)
            .all()
        )
        invoiced = float(sum((i.invoice_amount or 0) for i in invoices))
        received = float(sum((p.amount or 0) for p in payments))
        data.update({
            'tasks': [_row(x) for x in tasks],
            'vendors': [_row(x) for x in vendors],
            'materials': [_row(x) for x in materials],
            'dispatches': [_row(x) for x in dispatches],
            'site_visits': [_row(x) for x in visits],
            'installations': [_row(x) for x in installs],
            'expenses': [_row(x) for x in expenses],
            'invoices': [_row(x) for x in invoices],
            'payments': [_row(x) for x in payments],
            'followups': [_row(x) for x in followups],
            'documents': [_row(x) for x in documents],
            'updates': [_row(x) for x in updates],
            'audit_logs': [_row(x) for x in audits],
        })
    else:
        invoices = db.query(OperationInvoiceModel).filter(OperationInvoiceModel.operation_id == op.id).all()
        payments = db.query(OperationPaymentModel).filter(OperationPaymentModel.operation_id == op.id).all()
        invoiced = float(sum((i.invoice_amount or 0) for i in invoices))
        received = float(sum((p.amount or 0) for p in payments))
    po = float(op.po_value or 0)
    actual = float(op.actual_cost or 0)
    estimated = float(op.estimated_cost or 0)
    data['cost_summary'] = {
        'po_value': po,
        'estimated_cost': estimated,
        'actual_cost': actual,
        'cost_variance': (estimated - actual) if estimated else None,
        'invoiced': invoiced,
        'received': received,
        'outstanding': max(0.0, invoiced - received),
        'expected_contribution': (po - estimated) if po and estimated else None,
        'actual_contribution': (po - actual) if po else None,
    }
    return data


def _attention_reason(op: OperationModel, db: Session) -> Optional[Dict[str, Any]]:
    today = _today()
    if op.blocker_category:
        days = 0
        if op.next_action_date and _parse_date(op.next_action_date):
            days = (today - _parse_date(op.next_action_date)).days
        return {
            'operation_id': op.id,
            'operation_code': op.operation_code,
            'customer_name': op.customer_name,
            'reason': op.blocker_description or op.blocker_category,
            'detail': op.next_action,
            'days': max(days, 0),
            'health': op.health_status,
        }
    if op.next_action_date and _parse_date(op.next_action_date) and _parse_date(op.next_action_date) < today:
        days = (today - _parse_date(op.next_action_date)).days
        return {
            'operation_id': op.id,
            'operation_code': op.operation_code,
            'customer_name': op.customer_name,
            'reason': 'Next action overdue',
            'detail': op.next_action,
            'days': days,
            'health': 'red',
        }
    if op.outstanding_amount and op.payment_status in ('Invoice Raised', 'Partial'):
        return {
            'operation_id': op.id,
            'operation_code': op.operation_code,
            'customer_name': op.customer_name,
            'reason': 'Payment pending',
            'detail': f'₹{op.outstanding_amount:,.0f}',
            'days': 0,
            'health': op.health_status,
        }
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def mount_operation_routes(api_router: APIRouter):
    from server import EmployeeModel, LeadModel, UserModel, get_db, require_permission

    def _require_ops_dep(user: UserModel = Depends(require_permission(PERM))):
        return user

    meta = Depends(_require_ops_dep)

    @api_router.get('/operations/meta')
    def operations_meta(current_user: UserModel = meta):
        return {
            'operation_types': list(OPERATION_TYPES),
            'stages_by_type': STAGES_BY_TYPE,
            'tabs_by_type': TABS_BY_TYPE,
            'blocker_categories': BLOCKER_CATEGORIES,
            'action_types': ACTION_TYPES,
            'material_statuses': MATERIAL_STATUSES,
            'document_folders': DOCUMENT_FOLDERS,
            'expense_categories': EXPENSE_CATEGORIES,
            'closure_items': CLOSURE_ITEMS,
            'closure_statuses': CLOSURE_STATUSES,
        }

    @api_router.get('/operations/stats')
    def operations_stats(
        mine: bool = False,
        current_user: UserModel = meta,
        db: Session = Depends(get_db),
    ):
        rows = db.query(OperationModel).all()
        emp = getattr(current_user, 'employee_id', None)
        if mine and emp:
            rows = [r for r in rows if r.responsible_employee_id == emp]
        today = _today().isoformat()
        active = [r for r in rows if (r.status or 'Active') == 'Active']
        for r in active:
            refresh_operation_rollups(db, r)
        db.commit()
        return {
            'active': len(active),
            'due_today': sum(1 for r in active if r.next_action_date == today or r.target_date == today),
            'overdue': sum(1 for r in active if r.health_status == 'red'),
            'at_risk': sum(1 for r in active if r.health_status == 'yellow'),
            'customer_hold': sum(1 for r in active if (r.blocker_category or '').startswith('Customer')),
            'vendor_hold': sum(1 for r in active if (r.blocker_category or '').startswith('Vendor')),
            'payment_pending': sum(1 for r in rows if (r.payment_status or '') in ('Invoice Raised', 'Partial', 'Pending') and (r.outstanding_amount or 0) > 0),
            'completed': sum(1 for r in rows if (r.status or '') != 'Active'),
            'green': sum(1 for r in active if r.health_status == 'green'),
            'yellow': sum(1 for r in active if r.health_status == 'yellow'),
            'red': sum(1 for r in active if r.health_status == 'red'),
        }

    @api_router.get('/operations/attention')
    def operations_attention(current_user: UserModel = meta, db: Session = Depends(get_db)):
        rows = db.query(OperationModel).filter(OperationModel.status == 'Active').all()
        items = []
        for op in rows:
            refresh_operation_rollups(db, op)
            reason = _attention_reason(op, db)
            if reason:
                items.append(reason)
        db.commit()
        items.sort(key=lambda x: (0 if x.get('health') == 'red' else 1, -int(x.get('days') or 0)))
        return items[:20]

    @api_router.get('/operations/my-work')
    def operations_my_work(current_user: UserModel = meta, db: Session = Depends(get_db)):
        emp = getattr(current_user, 'employee_id', None)
        name = getattr(current_user, 'name', None)
        q = db.query(OperationTaskModel)
        if emp:
            q = q.filter(OperationTaskModel.assigned_to_employee_id == emp)
        elif name:
            q = q.filter(OperationTaskModel.assigned_to_name == name)
        tasks = q.all()
        today = _today()
        buckets = {'overdue': [], 'due_today': [], 'upcoming': [], 'completed': []}
        for task in tasks:
            task.auto_state = compute_task_auto_state(task)
            op = db.query(OperationModel).filter(OperationModel.id == task.operation_id).first()
            item = {
                **_row(task),
                'operation_code': getattr(op, 'operation_code', None),
                'customer_name': getattr(op, 'customer_name', None),
            }
            if task.auto_state == 'completed' or (task.status or '').lower() == 'completed':
                buckets['completed'].append(item)
            elif task.auto_state in ('overdue', 'escalated'):
                buckets['overdue'].append(item)
            elif task.auto_state == 'due_today':
                buckets['due_today'].append(item)
            else:
                due = _parse_date(task.due_date)
                if due and due <= today + timedelta(days=7):
                    buckets['upcoming'].append(item)
        return {
            'counts': {k: len(v) for k, v in buckets.items()},
            **buckets,
        }

    @api_router.get('/operations/won-leads')
    def won_leads_without_operation(current_user: UserModel = meta, db: Session = Depends(get_db)):
        used = {r.lead_id for r in db.query(OperationModel.lead_id).filter(OperationModel.lead_id.isnot(None)).all()}
        leads = db.query(LeadModel).filter(LeadModel.status == 'Won').all()
        out = []
        for lead in leads:
            if lead.id in used:
                continue
            out.append({
                'id': lead.id,
                'company': lead.company,
                'contact_name': lead.contact_name,
                'value': lead.value,
                'sub_category': lead.sub_category,
                'category': lead.category,
                'assigned_to_name': lead.assigned_to_name,
                'assigned_to_employee_id': lead.assigned_to_employee_id,
                'suggested_type': infer_operation_type(lead),
            })
        return out

    @api_router.get('/operations')
    def list_operations(
        q: Optional[str] = None,
        status: Optional[str] = None,
        health: Optional[str] = None,
        operation_type: Optional[str] = None,
        responsible: Optional[str] = None,
        view: Optional[str] = 'active',
        current_user: UserModel = meta,
        db: Session = Depends(get_db),
    ):
        rows = db.query(OperationModel).order_by(OperationModel.updated_at.desc()).all()
        if view == 'active':
            rows = [r for r in rows if (r.status or 'Active') == 'Active']
        elif view in ('completed', 'historical'):
            rows = [r for r in rows if (r.status or '') != 'Active']
        if status:
            rows = [r for r in rows if (r.status or '') == status]
        if operation_type:
            rows = [r for r in rows if (r.operation_type or '') == operation_type]
        if responsible:
            rows = [r for r in rows if (r.responsible_employee_id or '') == responsible or (r.responsible_name or '') == responsible]
        if q:
            needle = q.lower()
            rows = [r for r in rows if needle in ' '.join(filter(None, [
                r.operation_code, r.customer_name, r.project_name, r.po_number, r.enquiry_id, r.lead_id,
            ])).lower()]
        out = []
        for op in rows:
            data = serialize_operation(db, op, include_children=False)
            if health and data.get('health_status') != health:
                continue
            out.append(data)
        db.commit()
        return out

    @api_router.post('/operations')
    def create_operation(body: OperationCreate, current_user: UserModel = meta, db: Session = Depends(get_db)):
        if body.lead_id:
            lead = db.query(LeadModel).filter(LeadModel.id == body.lead_id).first()
            if not lead:
                raise HTTPException(status_code=404, detail='Lead not found')
            if lead.status != 'Won':
                raise HTTPException(status_code=400, detail='Operation can only be created from a Won lead')
            existing = db.query(OperationModel).filter(OperationModel.lead_id == lead.id).first()
            if existing:
                return serialize_operation(db, existing, include_children=True)
            op = ensure_operation_for_won_lead(db, lead, current_user)
            if body.target_date or body.estimated_cost or body.po_number or body.operation_type:
                if body.target_date:
                    op.target_date = body.target_date
                if body.estimated_cost is not None:
                    op.estimated_cost = body.estimated_cost
                if body.po_number:
                    op.po_number = body.po_number
                if body.operation_type and body.operation_type in OPERATION_TYPES:
                    op.operation_type = body.operation_type
                    op.current_stage = stages_for(op.operation_type)[0]
                db.commit()
                db.refresh(op)
            return serialize_operation(db, op, include_children=True)
        if not body.customer_name:
            raise HTTPException(status_code=400, detail='Customer name is required')
        op_type = body.operation_type if body.operation_type in OPERATION_TYPES else 'Stock & Sell'
        emp_name = body.responsible_name
        if body.responsible_employee_id and not emp_name:
            emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == body.responsible_employee_id).first()
            emp_name = emp.name if emp else current_user.name
        op = OperationModel(
            operation_code=next_operation_code(db),
            lead_id=None,
            enquiry_id=body.enquiry_id or None,
            customer_id=body.customer_id,
            customer_name=body.customer_name,
            project_name=body.project_name,
            po_number=body.po_number,
            po_value=body.po_value,
            estimated_cost=body.estimated_cost,
            operation_type=op_type,
            business_category=body.business_category,
            start_date=body.start_date or _today().isoformat(),
            target_date=body.target_date,
            responsible_employee_id=body.responsible_employee_id or current_user.employee_id,
            responsible_name=emp_name or current_user.name,
            current_stage=stages_for(op_type)[0],
            priority=body.priority or 'Medium',
            quotation_id=body.quotation_id,
            status='Active',
            next_action='Confirm plan and first task',
            next_action_date=(_today() + timedelta(days=1)).isoformat(),
            created_by_employee_id=current_user.employee_id,
            created_by_name=current_user.name,
        )
        db.add(op)
        db.flush()
        seed_default_tasks(db, op, current_user)
        add_timeline(db, op.id, current_user, 'Other', f'Operation {op.operation_code} created')
        refresh_operation_rollups(db, op)
        db.commit()
        db.refresh(op)
        return serialize_operation(db, op, include_children=True)

    @api_router.post('/operations/from-lead/{lead_id}')
    def create_from_lead(lead_id: str, current_user: UserModel = meta, db: Session = Depends(get_db)):
        lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail='Lead not found')
        if lead.status != 'Won':
            raise HTTPException(status_code=400, detail='Lead must be Won before creating an operation')
        op = ensure_operation_for_won_lead(db, lead, current_user)
        return serialize_operation(db, op, include_children=True)

    @api_router.get('/operations/by-lead/{lead_id}')
    def get_by_lead(lead_id: str, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = db.query(OperationModel).filter(OperationModel.lead_id == lead_id).first()
        if not op:
            return {'exists': False}
        return {'exists': True, 'operation': serialize_operation(db, op, include_children=False)}

    @api_router.get('/operations/{operation_id}')
    def get_operation(operation_id: str, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        data = serialize_operation(db, op, include_children=True)
        db.commit()
        return data

    @api_router.put('/operations/{operation_id}')
    def update_operation(operation_id: str, body: OperationUpdate, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        payload = body.model_dump(exclude_unset=True)
        reason = payload.pop('change_reason', None)
        for key, value in payload.items():
            old = getattr(op, key, None)
            if old != value:
                add_audit(db, op.id, current_user, 'operation', op.id, key, old, value, reason)
                setattr(op, key, value)
        if body.operation_type and body.operation_type in OPERATION_TYPES and not body.current_stage:
            if op.current_stage not in stages_for(body.operation_type):
                op.current_stage = stages_for(body.operation_type)[0]
        refresh_operation_rollups(db, op)
        db.commit()
        db.refresh(op)
        return serialize_operation(db, op, include_children=True)

    @api_router.post('/operations/{operation_id}/tasks')
    def add_task(operation_id: str, body: TaskIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        if not body.due_date:
            raise HTTPException(status_code=400, detail='Every active task must have a due date')
        task = OperationTaskModel(
            task_code=next_child_code('TSK'),
            operation_id=op.id,
            **body.model_dump(),
        )
        task.auto_state = compute_task_auto_state(task)
        db.add(task)
        add_timeline(db, op.id, current_user, 'Other', f'Task added: {task.task_name}', body.next_action, body.next_action_date)
        refresh_operation_rollups(db, op)
        db.commit()
        db.refresh(task)
        return _row(task)

    @api_router.put('/operations/{operation_id}/tasks/{task_id}')
    def update_task(operation_id: str, task_id: str, body: TaskIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        task = db.query(OperationTaskModel).filter(OperationTaskModel.id == task_id, OperationTaskModel.operation_id == op.id).first()
        if not task:
            raise HTTPException(status_code=404, detail='Task not found')
        if (body.status or '').lower() == 'completed':
            if not body.next_action:
                raise HTTPException(status_code=400, detail='NO NEXT ACTION = NO TASK COMPLETION')
            if not task.completion_proof and not body.completion_proof:
                raise HTTPException(status_code=400, detail='Completion proof is required to complete a task')
            task.completion_date = _today().isoformat()
        for key, value in body.model_dump(exclude_unset=True).items():
            setattr(task, key, value)
        task.last_update = _now()
        task.auto_state = compute_task_auto_state(task)
        add_timeline(db, op.id, current_user, 'Other', f'Task updated: {task.task_name}', body.next_action, body.next_action_date, task.id)
        refresh_operation_rollups(db, op)
        db.commit()
        db.refresh(task)
        return _row(task)

    @api_router.post('/operations/{operation_id}/updates')
    def add_update(operation_id: str, body: UpdateIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        if not (body.action_result or '').strip():
            raise HTTPException(status_code=400, detail='Action result is required — “Followed up” is not enough')
        if body.mark_task_complete and not body.next_action:
            raise HTTPException(status_code=400, detail='NO NEXT ACTION = NO TASK COMPLETION')
        add_timeline(db, op.id, current_user, body.action_type, body.action_result, body.next_action, body.next_action_date, body.task_id)
        op.next_action = body.next_action or op.next_action
        op.next_action_date = body.next_action_date or op.next_action_date
        if body.task_id:
            task = db.query(OperationTaskModel).filter(OperationTaskModel.id == body.task_id).first()
            if task:
                task.next_action = body.next_action
                task.next_action_date = body.next_action_date
                task.last_update = _now()
                task.remarks = body.action_result
                if body.mark_task_complete:
                    if not body.completion_proof and not task.completion_proof:
                        raise HTTPException(status_code=400, detail='Completion proof is required')
                    task.status = 'Completed'
                    task.completion_proof = body.completion_proof or task.completion_proof
                    task.completion_date = _today().isoformat()
                task.auto_state = compute_task_auto_state(task)
        refresh_operation_rollups(db, op)
        db.commit()
        return {'ok': True}

    def _upsert_child(model_cls, operation_id, body, extra=None):
        row = model_cls(operation_id=operation_id, **body.model_dump())
        if extra:
            for k, v in extra.items():
                setattr(row, k, v)
        return row

    @api_router.post('/operations/{operation_id}/vendors')
    def add_vendor(operation_id: str, body: VendorIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = _upsert_child(OperationVendorModel, op.id, body)
        db.add(row)
        add_timeline(db, op.id, current_user, 'Vendor Call', f'Vendor added: {body.vendor_name}')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.put('/operations/{operation_id}/vendors/{vendor_row_id}')
    def update_vendor(operation_id: str, vendor_row_id: str, body: VendorIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = db.query(OperationVendorModel).filter(OperationVendorModel.id == vendor_row_id).first()
        if not row:
            raise HTTPException(status_code=404, detail='Vendor row not found')
        old_confirmed = row.confirmed_delivery
        for k, v in body.model_dump().items():
            setattr(row, k, v)
        if old_confirmed and body.actual_delivery and body.actual_delivery > old_confirmed:
            row.broken_commitment = 1
            db.add(OperationFollowupModel(
                operation_id=op.id,
                followup_type='Vendor',
                responsible_name=body.responsible_name or op.responsible_name,
                last_action='Commitment missed',
                next_action='Follow up on missed vendor commitment',
                due_date=_today().isoformat(),
                status='Overdue',
            ))
        add_timeline(db, op.id, current_user, 'Vendor Call', f'Vendor updated: {row.vendor_name}')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/materials')
    def add_material(operation_id: str, body: MaterialIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        data = body.model_dump()
        req = float(data.get('required_qty') or 0)
        rec = float(data.get('received_qty') or 0)
        unit = data.get('unit_cost')
        row = OperationMaterialModel(
            operation_id=op.id,
            **data,
            total_cost=(unit * float(data.get('ordered_qty') or 0)) if unit is not None else None,
        )
        db.add(row)
        add_timeline(db, op.id, current_user, 'Other', f'Material added: {body.description}')
        db.commit()
        db.refresh(row)
        out = _row(row)
        out['balance'] = max(0.0, req - rec)
        return out

    @api_router.put('/operations/{operation_id}/materials/{material_id}')
    def update_material(operation_id: str, material_id: str, body: MaterialIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        _get_op(db, operation_id)
        row = db.query(OperationMaterialModel).filter(OperationMaterialModel.id == material_id).first()
        if not row:
            raise HTTPException(status_code=404, detail='Material not found')
        data = body.model_dump()
        for k, v in data.items():
            setattr(row, k, v)
        if row.unit_cost is not None:
            row.total_cost = float(row.unit_cost) * float(row.ordered_qty or 0)
        db.commit()
        db.refresh(row)
        out = _row(row)
        out['balance'] = max(0.0, float(row.required_qty or 0) - float(row.received_qty or 0))
        return out

    @api_router.post('/operations/{operation_id}/dispatches')
    def add_dispatch(operation_id: str, body: DispatchIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        promised = _parse_date(body.promised_delivery or body.expected_delivery)
        actual = _parse_date(body.actual_delivery)
        delay = (actual - promised).days if promised and actual and actual > promised else 0
        row = OperationDispatchModel(
            dispatch_code=next_child_code('DSP'),
            operation_id=op.id,
            delay_days=delay,
            **body.model_dump(),
        )
        if delay and not body.delay_source:
            raise HTTPException(status_code=400, detail='Delay source is required when delivery is late')
        db.add(row)
        add_timeline(db, op.id, current_user, 'Other', f'Dispatch {row.dispatch_code} recorded')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.put('/operations/{operation_id}/dispatches/{dispatch_id}')
    def update_dispatch(operation_id: str, dispatch_id: str, body: DispatchIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        _get_op(db, operation_id)
        row = db.query(OperationDispatchModel).filter(OperationDispatchModel.id == dispatch_id).first()
        if not row:
            raise HTTPException(status_code=404, detail='Dispatch not found')
        for k, v in body.model_dump().items():
            setattr(row, k, v)
        promised = _parse_date(row.promised_delivery or row.expected_delivery)
        actual = _parse_date(row.actual_delivery)
        row.delay_days = (actual - promised).days if promised and actual and actual > promised else 0
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/site-visits')
    def add_site_visit(operation_id: str, body: SiteVisitIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = OperationSiteVisitModel(operation_id=op.id, **body.model_dump())
        if not row.engineer_name:
            row.engineer_name = current_user.name
            row.engineer_id = current_user.employee_id
        db.add(row)
        add_timeline(db, op.id, current_user, 'Site Visit', body.work_performed or 'Site visit recorded')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/installations')
    def add_installation(operation_id: str, body: InstallationIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = OperationInstallationModel(operation_id=op.id, **body.model_dump())
        db.add(row)
        add_timeline(db, op.id, current_user, 'Other', f'Installation status: {body.installation_status}')
        if body.installation_status and body.installation_status in stages_for(op.operation_type):
            op.current_stage = body.installation_status
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/expenses')
    def add_expense(operation_id: str, body: ExpenseIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        if not body.purpose:
            raise HTTPException(status_code=400, detail='Every expense must have a purpose / cost center')
        row = OperationExpenseModel(
            expense_code=next_child_code('EXP'),
            operation_id=op.id,
            employee_id=body.employee_id or current_user.employee_id,
            employee_name=body.employee_name or current_user.name,
            **{k: v for k, v in body.model_dump().items() if k not in ('employee_id', 'employee_name')},
        )
        db.add(row)
        refresh_operation_rollups(db, op)
        add_timeline(db, op.id, current_user, 'Other', f'Expense {row.expense_code} · ₹{body.amount}')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/invoices')
    def add_invoice(operation_id: str, body: InvoiceIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = OperationInvoiceModel(
            invoice_no=body.invoice_no or next_child_code('INV'),
            operation_id=op.id,
            **{k: v for k, v in body.model_dump().items() if k != 'invoice_no'},
        )
        db.add(row)
        db.add(OperationFollowupModel(
            operation_id=op.id,
            followup_type='Payment',
            responsible_name=op.responsible_name,
            last_action=f'Invoice {row.invoice_no} raised',
            next_action='Payment follow-up',
            due_date=body.due_date or body.next_followup_date,
            status='Open',
        ))
        if 'Invoice' in stages_for(op.operation_type):
            op.current_stage = 'Invoice'
        refresh_operation_rollups(db, op)
        add_timeline(db, op.id, current_user, 'Other', f'Invoice {row.invoice_no} raised')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.put('/operations/{operation_id}/invoices/{invoice_id}')
    def update_invoice(operation_id: str, invoice_id: str, body: InvoiceIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = db.query(OperationInvoiceModel).filter(OperationInvoiceModel.id == invoice_id).first()
        if not row:
            raise HTTPException(status_code=404, detail='Invoice not found')
        for k, v in body.model_dump(exclude_unset=True).items():
            if k == 'invoice_no' and v:
                row.invoice_no = v
            elif k != 'invoice_no':
                setattr(row, k, v)
        promised = _parse_date(row.promised_payment_date)
        if promised and promised < _today() and (row.status or '') not in ('Payment Received', 'Fully Recovered'):
            row.commitment_missed = 1
            db.add(OperationFollowupModel(
                operation_id=op.id,
                followup_type='Payment',
                responsible_name=op.responsible_name,
                last_action='PAYMENT COMMITMENT MISSED',
                next_action='Escalate payment follow-up',
                due_date=_today().isoformat(),
                status='Overdue',
            ))
        refresh_operation_rollups(db, op)
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/payments')
    def add_payment(operation_id: str, body: PaymentIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        inv = db.query(OperationInvoiceModel).filter(OperationInvoiceModel.id == body.invoice_id).first()
        if not inv:
            raise HTTPException(status_code=404, detail='Invoice not found')
        row = OperationPaymentModel(operation_id=op.id, **body.model_dump())
        db.add(row)
        refresh_operation_rollups(db, op)
        if op.payment_status == 'Fully Recovered':
            inv.status = 'Fully Recovered'
            if 'Payment' in stages_for(op.operation_type):
                op.current_stage = 'Payment'
        else:
            inv.status = 'Payment Received'
        add_timeline(db, op.id, current_user, 'Other', f'Payment ₹{body.amount} received')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/followups')
    def add_followup(operation_id: str, body: FollowupIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        if not body.next_action:
            raise HTTPException(status_code=400, detail='Every follow-up must have a next action')
        row = OperationFollowupModel(operation_id=op.id, **body.model_dump())
        db.add(row)
        add_timeline(db, op.id, current_user, 'Other', f'{body.followup_type} follow-up created')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.put('/operations/{operation_id}/followups/{followup_id}')
    def update_followup(operation_id: str, followup_id: str, body: FollowupIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        _get_op(db, operation_id)
        row = db.query(OperationFollowupModel).filter(OperationFollowupModel.id == followup_id).first()
        if not row:
            raise HTTPException(status_code=404, detail='Follow-up not found')
        if not body.next_action:
            raise HTTPException(status_code=400, detail='Every follow-up must have a next action')
        for k, v in body.model_dump().items():
            setattr(row, k, v)
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/documents')
    def add_document(operation_id: str, body: DocumentIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        row = OperationDocumentModel(
            operation_id=op.id,
            uploaded_by=current_user.name,
            **body.model_dump(),
        )
        db.add(row)
        add_timeline(db, op.id, current_user, 'Document Received', f'Document uploaded: {body.file_name}')
        db.commit()
        db.refresh(row)
        return _row(row)

    @api_router.post('/operations/{operation_id}/close')
    def close_operation(operation_id: str, body: CloseIn, current_user: UserModel = meta, db: Session = Depends(get_db)):
        op = _get_op(db, operation_id)
        if body.closure_status not in CLOSURE_STATUSES:
            raise HTTPException(status_code=400, detail='Invalid closure status')
        checklist = {item: bool((body.checklist or {}).get(item)) for item in CLOSURE_ITEMS}
        required = [
            'customer_po_completed', 'quantity_verified', 'invoice_raised',
            'payment_status_recorded', 'final_cost_calculated',
        ]
        missing = [item for item in required if not checklist.get(item)]
        if body.closure_status.startswith('Completed') and missing:
            raise HTTPException(status_code=400, detail=f'Closure checklist incomplete: {", ".join(missing)}')
        op.closure_checklist = _json_dump(checklist)
        op.closure_status = body.closure_status
        op.warranty_notes = body.warranty_notes or op.warranty_notes
        op.amc_notes = body.amc_notes or op.amc_notes
        op.completion_date = _today().isoformat()
        op.status = 'Cancelled' if body.closure_status == 'Cancelled' else 'Completed'
        refresh_operation_rollups(db, op)
        add_timeline(db, op.id, current_user, 'Other', f'Operation closed: {body.closure_status}')
        add_audit(db, op.id, current_user, 'operation', op.id, 'closure_status', None, body.closure_status, 'Closure')
        db.commit()
        db.refresh(op)
        return serialize_operation(db, op, include_children=True)

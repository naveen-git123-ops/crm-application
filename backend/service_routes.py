"""HTTP routes for the Service & Maintenance module.

All business rules live in service_rules.py and all persistence in service_maintenance.py. This file only
resolves the signed-in user, loads the customer / lead / vendor / employee records that already exist in the CRM,
and translates ServiceError into HTTP errors.
"""
from __future__ import annotations

import re
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from fastapi import Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

import service_maintenance as sm
import service_rules as rules
from service_maintenance import Actor, ServiceError


class _Ctx:
    """Signed-in user, database session and capabilities for one request."""

    def __init__(self, user, db: Session, caps: Dict[str, bool], employee_id: Optional[str]):
        self.user = user
        self.db = db
        self.caps = caps
        self.employee_id = employee_id
        self.actor = Actor(user.id, user.name or user.email, employee_id)


@contextmanager
def _guarded(db: Session):
    try:
        yield
    except ServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


def mount_service_routes(api_router) -> None:
    from server import (  # noqa: WPS433 - server.py mounts this module at its very end
        CustomerAddressModel, CustomerContactModel, CustomerModel, EmployeeModel, LeadModel,
        _assert_unique_ledger, _next_ledger_id, _normalize_gst, _normalize_ledger_name,
        delete_from_s3, get_current_user, get_db, get_permissions_for_role, is_admin_user, upload_to_s3,
    )

    def ctx_dep(user=Depends(get_current_user), db: Session = Depends(get_db)) -> _Ctx:
        admin = is_admin_user(user)
        perms = [] if admin else get_permissions_for_role(db, user.role)
        caps = rules.caps_from_permissions(perms, admin)
        if not caps['view']:
            raise HTTPException(status_code=403, detail='You do not have access to Service & Maintenance')
        employee_id = (user.employee_id or '').strip() or None
        if not employee_id and user.email:
            emp = db.query(EmployeeModel).filter(EmployeeModel.email == user.email).first()
            employee_id = emp.employee_id if emp else None
        return _Ctx(user, db, caps, employee_id)

    def need(ctx: _Ctx, cap: str, message: str) -> None:
        if not ctx.caps.get(cap):
            raise HTTPException(status_code=403, detail=message)

    def load_service(ctx: _Ctx, service_id: str):
        svc = ctx.db.query(sm.ServiceRequestModel).filter(sm.ServiceRequestModel.id == service_id).first()
        if not svc:
            raise HTTPException(status_code=404, detail='Service request not found')
        if ctx.caps.get('technician_only') and ctx.employee_id not in (svc.assigned_employee_id, svc.engineer_employee_id):
            raise HTTPException(status_code=403, detail='You can only view requests assigned to you')
        return svc

    def customer_dict(c) -> Dict[str, Any]:
        return {
            'id': c.id, 'customer_id': c.customer_id, 'company_name': c.company_name, 'gst_number': c.gst_number,
            'contact_person_name': c.contact_person_name, 'phone': c.phone, 'email': c.email,
            'address_line': c.address_line, 'city': c.city, 'state': c.state, 'pincode': c.pincode,
            'status': c.status,
        }

    def find_customer(db: Session, customer_id: Optional[str], vendor: bool = False):
        if not customer_id:
            return None
        row = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
        if not row:
            return None
        is_vendor = int(row.entity_type or 0) == 1
        return row if is_vendor == vendor else None

    def lead_dict(lead) -> Dict[str, Any]:
        return {
            'id': lead.id, 'company': lead.company, 'contact_name': lead.contact_name, 'status': lead.status,
            'category': lead.category, 'sub_category': lead.sub_category, 'customer_id': lead.customer_id,
            'enquiry_date': lead.enquiry_date, 'value': lead.value, 'phone': lead.phone, 'email': lead.email,
        }

    def resolve_lead(db: Session, lead_id: Optional[str], customer) -> Optional[Dict[str, Any]]:
        if not lead_id:
            return None
        lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail='The selected lead was not found')
        data = lead_dict(lead)
        if not data['customer_id']:
            same = _normalize_ledger_name(lead.company).casefold() == _normalize_ledger_name(customer.company_name).casefold()
            if not same:
                raise HTTPException(status_code=422, detail='The selected lead does not belong to this customer')
            data['customer_id'] = customer.id  # linked by company name
        return data

    def employee_ref(db: Session, employee_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not employee_id:
            return None
        emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == employee_id).first()
        if not emp or (emp.status or 'Active') != 'Active':
            raise HTTPException(status_code=422, detail='The selected employee was not found or is inactive')
        return {'employee_id': emp.employee_id, 'name': emp.name, 'job_role': emp.job_role}

    def vendor_ref(db: Session, vendor_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not vendor_id:
            return None
        row = find_customer(db, vendor_id, vendor=True)
        if not row:
            raise HTTPException(status_code=422, detail='The selected vendor was not found')
        return customer_dict(row)

    def reason_of(body: Dict[str, Any]) -> str:
        return str(body.get('reason') or '').strip()

    # ----------------------------------------------------------------- meta / lookups

    @api_router.get('/service/meta')
    def service_meta(ctx: _Ctx = Depends(ctx_dep)):
        cfg = sm.get_config(ctx.db)
        return {
            'caps': ctx.caps, 'employee_id': ctx.employee_id, 'config': cfg,
            'customer_types': list(rules.CUSTOMER_TYPES),
            'service_types_by_customer': {t: rules.allowed_service_types(t, cfg) for t in rules.CUSTOMER_TYPES},
            'workflow_by_service_type': rules.WORKFLOW_BY_SERVICE_TYPE,
            'tabs_by_workflow': rules.TABS_BY_WORKFLOW,
            'statuses': list(rules.STATUSES), 'locked_statuses': list(rules.LOCKED_STATUSES),
            'reason_required_statuses': list(rules.REASON_REQUIRED_STATUSES),
            'priorities': list(rules.PRIORITIES), 'enums': {k: {f: list(v) for f, v in d.items()}
                                                           for k, d in rules.ENUM_FIELDS.items()},
            'visit_statuses': list(rules.VISIT_STATUSES), 'visit_outcomes': list(rules.VISIT_OUTCOMES),
            'attachment_categories': list(rules.ATTACHMENT_CATEGORIES),
            'attachment_limits': {
                'image_mb': rules.MAX_IMAGE_BYTES // (1024 * 1024), 'video_mb': rules.MAX_VIDEO_BYTES // (1024 * 1024),
                'document_mb': rules.MAX_DOCUMENT_BYTES // (1024 * 1024),
                'images': sorted(rules.IMAGE_EXTENSIONS), 'videos': sorted(rules.VIDEO_EXTENSIONS),
                'documents': sorted(rules.DOCUMENT_EXTENSIONS), 'program_files': sorted(rules.PROGRAM_EXTENSIONS),
            },
            'post_repair_results': list(rules.POST_REPAIR_RESULTS),
            'required_vendor_stages': list(rules.REQUIRED_VENDOR_STAGES),
        }

    @api_router.get('/service/lookups')
    def service_lookups(ctx: _Ctx = Depends(ctx_dep)):
        employees = (ctx.db.query(EmployeeModel).filter(or_(EmployeeModel.status == 'Active', EmployeeModel.status.is_(None)))
                     .order_by(EmployeeModel.name).all())
        vendors = (ctx.db.query(CustomerModel).filter(CustomerModel.entity_type == 1)
                   .filter(or_(CustomerModel.status == 'Active', CustomerModel.status.is_(None)))
                   .order_by(CustomerModel.company_name).all())
        return {
            'employees': [{'employee_id': e.employee_id, 'name': e.name, 'job_role': e.job_role,
                           'department': e.department} for e in employees],
            'vendors': [customer_dict(v) for v in vendors],
        }

    @api_router.get('/service/customers')
    def service_customers(q: str = '', limit: int = Query(30, le=100), ctx: _Ctx = Depends(ctx_dep)):
        query = ctx.db.query(CustomerModel).filter(or_(CustomerModel.entity_type == 0, CustomerModel.entity_type.is_(None)))
        term = q.strip()
        if term:
            like = f'%{term}%'
            query = query.filter(or_(CustomerModel.company_name.ilike(like), CustomerModel.customer_id.ilike(like),
                                     CustomerModel.phone.ilike(like), CustomerModel.contact_person_name.ilike(like)))
        return [customer_dict(c) for c in query.order_by(CustomerModel.company_name).limit(limit).all()]

    def customer_leads(db: Session, customer, term: str = '', limit: int = 50) -> List[Dict[str, Any]]:
        query = db.query(LeadModel)
        if customer is not None:
            name = _normalize_ledger_name(customer.company_name)
            query = query.filter(or_(LeadModel.customer_id == customer.id,
                                     (LeadModel.customer_id.is_(None)) & (LeadModel.company.ilike(name))))
        if term.strip():
            like = f'%{term.strip()}%'
            query = query.filter(or_(LeadModel.company.ilike(like), LeadModel.contact_name.ilike(like),
                                     LeadModel.sub_category.ilike(like), LeadModel.category.ilike(like)))
        leads = query.order_by(LeadModel.updated_at.desc()).limit(limit * 2).all()
        won_first = sorted(leads, key=lambda l: 0 if 'won' in (l.status or '').lower() else 1)
        return [lead_dict(l) for l in won_first[:limit]]

    @api_router.get('/service/leads')
    def service_leads(q: str = '', customer_id: str = '', ctx: _Ctx = Depends(ctx_dep)):
        customer = find_customer(ctx.db, customer_id) if customer_id else None
        if customer_id and not customer:
            raise HTTPException(status_code=404, detail='Customer not found')
        return customer_leads(ctx.db, customer, q)

    @api_router.get('/service/customers/{customer_id}/profile')
    def service_customer_profile(customer_id: str, ctx: _Ctx = Depends(ctx_dep)):
        customer = find_customer(ctx.db, customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail='Customer not found')
        contacts = ctx.db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).all()
        addresses = ctx.db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).all()
        products = (ctx.db.query(sm.ServiceProductModel).filter(sm.ServiceProductModel.customer_id == customer.id)
                    .order_by(sm.ServiceProductModel.created_at.desc()).all())
        amcs = ctx.db.query(sm.ServiceAmcModel).filter(sm.ServiceAmcModel.customer_id == customer.id).all()
        return {
            'customer': customer_dict(customer),
            'contacts': [{'name': c.contact_person_name, 'designation': c.designation, 'phone': c.phone,
                          'email': c.email, 'is_primary': bool(c.is_primary)} for c in contacts],
            'addresses': [{'address_line': a.address_line, 'city': a.city, 'state': a.state, 'pincode': a.pincode,
                           'is_primary': bool(a.is_primary)} for a in addresses],
            'leads': customer_leads(ctx.db, customer),
            'products': [sm.product_summary(ctx.db, p) for p in products],
            'amcs': [sm.amc_summary(ctx.db, a) for a in amcs],
        }

    @api_router.post('/service/customers')
    def service_create_customer(body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        """Create a customer ledger entry for a new customer (same duplicate rules as the Customers screen)."""
        need(ctx, 'coordinate', 'Only a service coordinator can add customers')
        db = ctx.db
        name = _normalize_ledger_name(body.get('company_name'))
        errors = []
        if not name:
            errors.append('Company name is required')
        phone = str(body.get('phone') or '').strip()
        if phone and not rules.validate_mobile(phone):
            errors.append('A valid mobile number is required')
        email = str(body.get('email') or '').strip()
        if email and not rules.validate_email(email):
            errors.append('Email address is not valid')
        pincode = str(body.get('pincode') or '').strip()
        if pincode and not rules.validate_pincode(pincode):
            errors.append('PIN code must be 6 digits')
        if errors:
            raise HTTPException(status_code=422, detail=errors)
        gst = _normalize_gst(body.get('gst_number'))
        _assert_unique_ledger(db, 0, name, gst)
        row = CustomerModel(
            customer_id=_next_ledger_id(db, 0), company_name=name, gst_number=gst,
            contact_person_name=str(body.get('contact_person_name') or '').strip() or None, phone=phone or None,
            email=email or None, address_line=str(body.get('address_line') or '').strip() or None,
            city=str(body.get('city') or '').strip() or None, state=str(body.get('state') or '').strip() or None,
            pincode=pincode or None, status='Active', entity_type=0,
        )
        db.add(row)
        db.flush()
        if row.contact_person_name or row.phone or row.email:
            db.add(CustomerContactModel(customer_id=row.id, contact_person_name=row.contact_person_name or name,
                                        phone=row.phone, email=row.email, is_primary=1))
        if row.address_line:
            db.add(CustomerAddressModel(customer_id=row.id, address_line=row.address_line, city=row.city,
                                        state=row.state, pincode=row.pincode, country='India', is_primary=1))
        db.commit()
        db.refresh(row)
        return customer_dict(row)

    # ----------------------------------------------------------------- products / AMC / config

    @api_router.get('/service/products')
    def service_products(customer_id: str = '', q: str = '', ctx: _Ctx = Depends(ctx_dep)):
        query = ctx.db.query(sm.ServiceProductModel)
        if customer_id:
            query = query.filter(sm.ServiceProductModel.customer_id == customer_id)
        if q.strip():
            like = f'%{q.strip()}%'
            query = query.filter(or_(sm.ServiceProductModel.name.ilike(like), sm.ServiceProductModel.serial_number.ilike(like),
                                     sm.ServiceProductModel.model.ilike(like)))
        return [sm.product_summary(ctx.db, p) for p in query.order_by(sm.ServiceProductModel.created_at.desc()).limit(200).all()]

    @api_router.post('/service/products')
    def service_register_product(body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        need(ctx, 'coordinate', 'Only a service coordinator can register products')
        customer = find_customer(ctx.db, body.get('customer_id'))
        if not customer:
            raise HTTPException(status_code=422, detail='Select a valid customer for the product')
        with _guarded(ctx.db):
            product = sm.register_product(ctx.db, body, ctx.actor)
        return sm.product_summary(ctx.db, product)

    @api_router.put('/service/products/{product_id}')
    def service_update_product(product_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        need(ctx, 'coordinate', 'Only a service coordinator can edit products')
        product = ctx.db.query(sm.ServiceProductModel).filter(sm.ServiceProductModel.id == product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail='Product not found')
        with _guarded(ctx.db):
            product = sm.register_product(ctx.db, {k: v for k, v in body.items() if k != 'customer_id'}, ctx.actor,
                                          product=product)
        return sm.product_summary(ctx.db, product)

    @api_router.get('/service/products/{product_id}/history')
    def service_product_history(product_id: str, ctx: _Ctx = Depends(ctx_dep)):
        return sm.service_history_for(ctx.db, product_id=product_id)

    @api_router.get('/service/amc')
    def service_amc_list(customer_id: str = '', ctx: _Ctx = Depends(ctx_dep)):
        query = ctx.db.query(sm.ServiceAmcModel)
        if customer_id:
            query = query.filter(sm.ServiceAmcModel.customer_id == customer_id)
        return [sm.amc_summary(ctx.db, a) for a in query.order_by(sm.ServiceAmcModel.end_date.desc()).limit(200).all()]

    @api_router.get('/service/amc/{amc_id}')
    def service_amc_detail(amc_id: str, ctx: _Ctx = Depends(ctx_dep)):
        amc = ctx.db.query(sm.ServiceAmcModel).filter(sm.ServiceAmcModel.id == amc_id).first()
        if not amc:
            raise HTTPException(status_code=404, detail='AMC contract not found')
        return sm.amc_summary(ctx.db, amc)

    @api_router.post('/service/amc')
    def service_amc_create(body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        need(ctx, 'coordinate', 'Only a service coordinator can manage AMC contracts')
        if not find_customer(ctx.db, body.get('customer_id')):
            raise HTTPException(status_code=422, detail='Select a valid customer for the AMC contract')
        with _guarded(ctx.db):
            amc = sm.save_amc(ctx.db, body, ctx.actor)
        return sm.amc_summary(ctx.db, amc)

    @api_router.put('/service/amc/{amc_id}')
    def service_amc_update(amc_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        need(ctx, 'coordinate', 'Only a service coordinator can manage AMC contracts')
        amc = ctx.db.query(sm.ServiceAmcModel).filter(sm.ServiceAmcModel.id == amc_id).first()
        if not amc:
            raise HTTPException(status_code=404, detail='AMC contract not found')
        with _guarded(ctx.db):
            amc = sm.save_amc(ctx.db, body, ctx.actor, amc=amc)
        return sm.amc_summary(ctx.db, amc)

    @api_router.put('/service/config')
    def service_save_config(body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        need(ctx, 'manage', 'Only a service manager can change service settings')
        with _guarded(ctx.db):
            return sm.save_config(ctx.db, body, ctx.actor)

    @api_router.get('/service/notifications')
    def service_notifications(ctx: _Ctx = Depends(ctx_dep)):
        return sm.list_notifications(ctx.db, ctx.user.id, ctx.employee_id, ctx.caps)

    @api_router.post('/service/notifications/read')
    def service_notifications_read(body: Dict[str, Any] = Body(default={}), ctx: _Ctx = Depends(ctx_dep)):
        ids = body.get('ids') if isinstance(body.get('ids'), list) else None
        sm.mark_notifications_read(ctx.db, ctx.user.id, ids)
        return {'ok': True}

    # ----------------------------------------------------------------- list / stats / export / reports

    @api_router.get('/service-requests')
    def list_service_requests(
        q: str = '', card: str = '', status: str = '', customer_type: str = '', service_type: str = '',
        priority: str = '', technician: str = '', date_from: str = '', date_to: str = '', lead_id: str = '',
        customer_id: str = '', product_id: str = '', sort_by: str = 'request_date', sort_dir: str = 'desc',
        page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200), ctx: _Ctx = Depends(ctx_dep),
    ):
        return sm.list_services(ctx.db, ctx.caps, ctx.employee_id, q=q, card=card, status=status,
                                customer_type=customer_type, service_type=service_type, priority=priority,
                                technician=technician, date_from=date_from, date_to=date_to, lead_id=lead_id,
                                customer_id=customer_id, product_id=product_id, sort_by=sort_by,
                                sort_dir=sort_dir, page=page, page_size=page_size)

    @api_router.get('/service-requests/stats')
    def service_request_stats(ctx: _Ctx = Depends(ctx_dep)):
        sm.generate_due_alerts(ctx.db)
        return sm.service_stats(ctx.db, ctx.caps, ctx.employee_id)

    @api_router.get('/service-requests/export')
    def export_service_requests(
        q: str = '', card: str = '', status: str = '', customer_type: str = '', service_type: str = '',
        priority: str = '', technician: str = '', date_from: str = '', date_to: str = '', lead_id: str = '',
        customer_id: str = '', ctx: _Ctx = Depends(ctx_dep),
    ):
        result = sm.list_services(ctx.db, ctx.caps, ctx.employee_id, q=q, card=card, status=status,
                                  customer_type=customer_type, service_type=service_type, priority=priority,
                                  technician=technician, date_from=date_from, date_to=date_to, lead_id=lead_id,
                                  customer_id=customer_id, page=1, page_size=200)
        items = list(result['items'])
        page = 1
        while len(items) < result['total'] and page < 50:
            page += 1
            more = sm.list_services(ctx.db, ctx.caps, ctx.employee_id, q=q, card=card, status=status,
                                    customer_type=customer_type, service_type=service_type, priority=priority,
                                    technician=technician, date_from=date_from, date_to=date_to, lead_id=lead_id,
                                    customer_id=customer_id, page=page, page_size=200)
            if not more['items']:
                break
            items.extend(more['items'])
        return Response(content=sm.export_csv(items), media_type='text/csv; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="service-requests.csv"'})

    @api_router.get('/service-requests/reports')
    def submitted_service_reports(ctx: _Ctx = Depends(ctx_dep)):
        return sm.submitted_reports(ctx.db, ctx.caps, ctx.employee_id)

    @api_router.get('/service-requests/history')
    def service_history(customer_id: str = '', product_id: str = '', lead_id: str = '', ctx: _Ctx = Depends(ctx_dep)):
        if ctx.caps.get('technician_only'):
            mine = {r['id'] for r in sm.list_services(ctx.db, ctx.caps, ctx.employee_id, page_size=200)['items']}
            rows = sm.service_history_for(ctx.db, customer_id=customer_id or None, product_id=product_id or None,
                                          lead_id=lead_id or None)
            return [r for r in rows if r['id'] in mine]
        return sm.service_history_for(ctx.db, customer_id=customer_id or None, product_id=product_id or None,
                                      lead_id=lead_id or None)

    # ----------------------------------------------------------------- create / read / update

    @api_router.post('/service-requests')
    def create_service_request(body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        need(ctx, 'coordinate', 'Only a service coordinator can create service requests')
        db = ctx.db
        cfg = sm.get_config(db)
        customer = find_customer(db, body.get('customer_id'))
        if not customer:
            raise HTTPException(status_code=422, detail=['Select a customer'])
        lead = resolve_lead(db, body.get('lead_id'), customer)
        with _guarded(db):
            product = None
            if body.get('product_id'):
                # Products are registered first (POST /service/products) and then selected here, so a failed
                # request never leaves a half-registered product behind.
                product = db.query(sm.ServiceProductModel).filter(sm.ServiceProductModel.id == body['product_id']).first()
                if not product:
                    raise ServiceError('The selected product was not found', 404)
            amc = None
            if body.get('amc_id'):
                amc = db.query(sm.ServiceAmcModel).filter(sm.ServiceAmcModel.id == body['amc_id']).first()
            elif body.get('service_type') == rules.ST_AMC and product is not None:
                amc = sm.active_amc_for(db, customer.id, product.id)
            payload = dict(body)
            if amc is not None:
                payload['amc_id'] = amc.id
            svc, created = sm.create_service(db, payload, ctx.actor, customer=customer_dict(customer), lead=lead,
                                             product=product, amc=amc, config=cfg)
        detail = build_detail(ctx, svc)
        detail['created'] = created
        return detail

    def build_detail(ctx: _Ctx, svc) -> Dict[str, Any]:
        db = ctx.db
        cfg = sm.get_config(db)
        sctx = sm.build_ctx(db, svc, cfg)
        is_assignee = bool(ctx.employee_id) and ctx.employee_id in (svc.assigned_employee_id, svc.engineer_employee_id)
        next_statuses = []
        for target in rules.allowed_next(svc.status):
            if not sm.status_allowed_for(ctx.caps, svc.status, target, is_assignee):
                continue
            blockers = rules.transition_blockers(svc.status, target, sctx, 'reason')
            next_statuses.append({'status': target, 'blockers': blockers,
                                  'reason_required': target in rules.REASON_REQUIRED_STATUSES
                                  or svc.status in ('Completed', 'Closed')})
        visits = (db.query(sm.ServiceVisitModel).filter(sm.ServiceVisitModel.service_id == svc.id)
                  .order_by(sm.ServiceVisitModel.visit_no).all())
        attachments = (db.query(sm.ServiceAttachmentModel).filter(sm.ServiceAttachmentModel.service_id == svc.id)
                       .order_by(sm.ServiceAttachmentModel.uploaded_at.desc()).all())
        history = (db.query(sm.ServiceHistoryModel).filter(sm.ServiceHistoryModel.service_id == svc.id)
                   .order_by(sm.ServiceHistoryModel.created_at.desc()).limit(500).all())
        product = None
        if svc.product_id:
            row = db.query(sm.ServiceProductModel).filter(sm.ServiceProductModel.id == svc.product_id).first()
            product = sm.product_summary(db, row) if row else None
        amc = None
        if svc.amc_id:
            row = db.query(sm.ServiceAmcModel).filter(sm.ServiceAmcModel.id == svc.amc_id).first()
            amc = sm.amc_summary(db, row) if row else None
        service = sm.service_dict(svc)
        data = service.pop('data', {})
        repairs = (db.query(sm.ServiceVendorRepairModel).filter(sm.ServiceVendorRepairModel.service_id == svc.id)
                   .order_by(sm.ServiceVendorRepairModel.created_at).all())
        report = sm.report_row(db, svc)
        return {
            'service': service,
            'data': data,
            'visits': [sm.row_dict(v) for v in visits],
            'attachments': [sm.row_dict(a) for a in attachments],
            'vendor_repairs': [sm.vendor_repair_view(db, r, cfg) for r in repairs],
            'history': [sm.row_dict(h) for h in history],
            'product': product, 'amc': amc,
            'report_status': report.status if report else 'Not started',
            'tabs': rules.tabs_for_types(service.get('service_types') or []),
            'next_statuses': next_statuses,
            'caps': ctx.caps,
            'can_edit': rules.can_edit_service(ctx.caps, service, ctx.employee_id),
            'locked': svc.status in rules.LOCKED_STATUSES,
            'overdue': sm.is_overdue(svc),
            'checklist_templates': {
                key: rules.checklist_items(cfg, key, svc.product_category)
                for key in ('installation_inspection', 'installation_execution', 'commissioning',
                            'repair_inspection', 'amc')
            },
            'config': {k: cfg[k] for k in ('problem_categories', 'vendor_stages', 'vendor_approval_required',
                                           'ack_required_types', 'mandatory_evidence', 'require_lead_for_existing',
                                           'amc_required')},
        }

    @api_router.get('/service-requests/{service_id}')
    def get_service_request(service_id: str, ctx: _Ctx = Depends(ctx_dep)):
        return build_detail(ctx, load_service(ctx, service_id))

    @api_router.put('/service-requests/{service_id}')
    def update_service_request(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        reason = reason_of(body)
        with _guarded(ctx.db):
            sm.update_service(ctx.db, svc, {k: v for k, v in body.items() if k != 'reason'}, ctx.actor, ctx.caps, reason)
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/assign')
    def assign_service_request(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        need(ctx, 'coordinate', 'Only a service coordinator can assign technicians')
        employee = employee_ref(ctx.db, body.get('employee_id'))
        engineer = employee_ref(ctx.db, body.get('engineer_employee_id')) if 'engineer_employee_id' in body else None
        if 'engineer_employee_id' in body and not body.get('engineer_employee_id'):
            engineer = {}
        with _guarded(ctx.db):
            sm.assign_technician(ctx.db, svc, ctx.actor, ctx.caps, employee=employee, engineer=engineer,
                                 schedule=body.get('schedule') or {})
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/site-visit')
    def complete_service_site_visit(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        need(ctx, 'coordinate', 'Only a service coordinator can record the site visit')
        with _guarded(ctx.db):
            sm.complete_site_visit(ctx.db, svc, body, ctx.actor, ctx.caps)
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/field-details')
    def save_service_field_details(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        need(ctx, 'coordinate', 'Only a service coordinator can record service and product details')
        db = ctx.db
        cfg = sm.get_config(db)
        with _guarded(db):
            product = None
            if body.get('product_id'):
                product = db.query(sm.ServiceProductModel).filter(sm.ServiceProductModel.id == body['product_id']).first()
                if not product:
                    raise ServiceError('The selected product was not found', 404)
            lead = None
            if body.get('lead_id'):
                customer = find_customer(db, svc.customer_id)
                lead = resolve_lead(db, body.get('lead_id'), customer)
            amc = None
            if body.get('amc_id'):
                amc = db.query(sm.ServiceAmcModel).filter(sm.ServiceAmcModel.id == body['amc_id']).first()
            elif body.get('service_type') == rules.ST_AMC and product is not None:
                amc = sm.active_amc_for(db, svc.customer_id, product.id)
            if amc is not None:
                body = {**body, 'amc_id': amc.id}
            sm.record_field_details(db, svc, body, ctx.actor, ctx.caps, product=product, lead=lead, amc=amc, config=cfg)
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/status')
    def change_service_status(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        with _guarded(ctx.db):
            sm.change_status(ctx.db, svc, str(body.get('status') or ''), ctx.actor, ctx.caps, reason_of(body))
        return build_detail(ctx, svc)

    @api_router.put('/service-requests/{service_id}/sections/{section}')
    def update_service_section(service_id: str, section: str, body: Dict[str, Any] = Body(...),
                               ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        if 'value' not in body:
            raise HTTPException(status_code=422, detail='Missing "value"')
        with _guarded(ctx.db):
            sm.update_section(ctx.db, svc, section, body['value'], ctx.actor, ctx.caps, reason_of(body))
        return build_detail(ctx, svc)

    # ----------------------------------------------------------------- visits

    @api_router.post('/service-requests/{service_id}/visits')
    def add_visit(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        with _guarded(ctx.db):
            sm.save_visit(ctx.db, svc, body, ctx.actor, ctx.caps, reason=reason_of(body))
        return build_detail(ctx, svc)

    @api_router.put('/service-requests/{service_id}/visits/{visit_id}')
    def edit_visit(service_id: str, visit_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        visit = ctx.db.query(sm.ServiceVisitModel).filter(sm.ServiceVisitModel.id == visit_id,
                                                          sm.ServiceVisitModel.service_id == svc.id).first()
        if not visit:
            raise HTTPException(status_code=404, detail='Visit not found')
        with _guarded(ctx.db):
            sm.save_visit(ctx.db, svc, body, ctx.actor, ctx.caps, visit=visit, reason=reason_of(body))
        return build_detail(ctx, svc)

    # ----------------------------------------------------------------- attachments

    @api_router.post('/service-requests/{service_id}/attachments')
    async def upload_attachment(
        service_id: str, file: UploadFile = File(...), category: str = Form(...), description: str = Form(''),
        visit_id: str = Form(''), vendor_repair_id: str = Form(''), reason: str = Form(''),
        ctx: _Ctx = Depends(ctx_dep),
    ):
        svc = load_service(ctx, service_id)
        # Reject oversized uploads while reading, before the whole file is held in memory.
        limit = rules.MAX_VIDEO_BYTES + 1
        content = await file.read(limit)
        with _guarded(ctx.db):
            att = sm.add_attachment(ctx.db, svc, file_name=file.filename or '', content=content, category=category,
                                    description=description, actor=ctx.actor, caps=ctx.caps, upload_fn=upload_to_s3,
                                    visit_id=visit_id or None, vendor_repair_id=vendor_repair_id or None,
                                    reason=reason.strip())
        return sm.row_dict(att)

    @api_router.delete('/service-requests/{service_id}/attachments/{attachment_id}')
    def remove_attachment(service_id: str, attachment_id: str, reason: str = '', ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        att = ctx.db.query(sm.ServiceAttachmentModel).filter(sm.ServiceAttachmentModel.id == attachment_id,
                                                             sm.ServiceAttachmentModel.service_id == svc.id).first()
        if not att:
            raise HTTPException(status_code=404, detail='Attachment not found')
        with _guarded(ctx.db):
            sm.delete_attachment(ctx.db, svc, att, ctx.actor, ctx.caps, delete_fn=delete_from_s3, reason=reason.strip())
        return {'ok': True}

    # ----------------------------------------------------------------- vendor repair

    def load_repair(ctx: _Ctx, svc, repair_id: str):
        rep = ctx.db.query(sm.ServiceVendorRepairModel).filter(sm.ServiceVendorRepairModel.id == repair_id,
                                                               sm.ServiceVendorRepairModel.service_id == svc.id).first()
        if not rep:
            raise HTTPException(status_code=404, detail='Vendor repair not found')
        return rep

    @api_router.post('/service-requests/{service_id}/vendor-repairs')
    def start_vendor_repair(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        vendor = vendor_ref(ctx.db, body.get('vendor_id'))
        with _guarded(ctx.db):
            sm.create_vendor_repair(ctx.db, svc, body, ctx.actor, ctx.caps, vendor=vendor)
        return build_detail(ctx, svc)

    @api_router.put('/service-requests/{service_id}/vendor-repairs/{repair_id}')
    def edit_vendor_repair(service_id: str, repair_id: str, body: Dict[str, Any] = Body(...),
                           ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        rep = load_repair(ctx, svc, repair_id)
        vendor = vendor_ref(ctx.db, body.get('vendor_id')) if body.get('vendor_id') else None
        with _guarded(ctx.db):
            sm.update_vendor_repair(ctx.db, svc, rep, body, ctx.actor, ctx.caps, vendor=vendor)
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/vendor-repairs/{repair_id}/stage')
    def move_vendor_stage(service_id: str, repair_id: str, body: Dict[str, Any] = Body(...),
                          ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        rep = load_repair(ctx, svc, repair_id)
        with _guarded(ctx.db):
            sm.advance_vendor_stage(ctx.db, svc, rep, str(body.get('stage') or ''), ctx.actor, ctx.caps,
                                    str(body.get('note') or ''))
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/vendor-repairs/{repair_id}/post-repair')
    def post_repair_inspection(service_id: str, repair_id: str, body: Dict[str, Any] = Body(...),
                               ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        rep = load_repair(ctx, svc, repair_id)
        with _guarded(ctx.db):
            sm.record_post_repair(ctx.db, svc, rep, body, ctx.actor, ctx.caps)
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/vendor-repairs/{repair_id}/send-back')
    def send_back_vendor_repair(service_id: str, repair_id: str, body: Dict[str, Any] = Body(...),
                                ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        rep = load_repair(ctx, svc, repair_id)
        with _guarded(ctx.db):
            sm.send_back_to_vendor(ctx.db, svc, rep, reason_of(body), ctx.actor, ctx.caps)
        return build_detail(ctx, svc)

    @api_router.post('/service-requests/{service_id}/vendor-repairs/{repair_id}/cancel')
    def cancel_vendor_repair_route(service_id: str, repair_id: str, body: Dict[str, Any] = Body(...),
                                   ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        rep = load_repair(ctx, svc, repair_id)
        with _guarded(ctx.db):
            sm.cancel_vendor_repair(ctx.db, svc, rep, reason_of(body), ctx.actor, ctx.caps)
        return build_detail(ctx, svc)

    # ----------------------------------------------------------------- final service report

    @api_router.get('/service-requests/{service_id}/report')
    def get_report(service_id: str, ctx: _Ctx = Depends(ctx_dep)):
        return sm.report_view(ctx.db, load_service(ctx, service_id))

    @api_router.put('/service-requests/{service_id}/report')
    def save_report(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        with _guarded(ctx.db):
            sm.save_report_draft(ctx.db, svc, body.get('draft') if isinstance(body.get('draft'), dict) else body,
                                 ctx.actor, ctx.caps)
        return sm.report_view(ctx.db, svc)

    @api_router.post('/service-requests/{service_id}/report/submit')
    def submit_report(service_id: str, ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        with _guarded(ctx.db):
            sm.submit_report(ctx.db, svc, ctx.actor, ctx.caps)
        return sm.report_view(ctx.db, svc)

    @api_router.post('/service-requests/{service_id}/report/amend')
    def amend_report(service_id: str, body: Dict[str, Any] = Body(...), ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        with _guarded(ctx.db):
            sm.amend_report(ctx.db, svc, reason_of(body), ctx.actor, ctx.caps)
        return sm.report_view(ctx.db, svc)

    @api_router.get('/service-requests/{service_id}/report/pdf')
    def report_pdf(service_id: str, ctx: _Ctx = Depends(ctx_dep)):
        svc = load_service(ctx, service_id)
        view = sm.report_view(ctx.db, svc)
        try:
            pdf = sm.render_report_pdf(view['report'])
        except ImportError:
            raise HTTPException(status_code=503, detail='PDF generation is not available on this server (reportlab missing)')
        name = re.sub(r'[^A-Za-z0-9_.-]', '_', view.get('report_no') or svc.service_code)
        suffix = '' if view['status'] == 'Submitted' else '-DRAFT'
        return Response(content=pdf, media_type='application/pdf',
                        headers={'Content-Disposition': f'inline; filename="{name}{suffix}.pdf"'})

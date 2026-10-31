"""HTTP-level tests for the Service & Maintenance routes.

`server.py` connects to the production database when imported, so these tests mount the real routes against a stand-in
`server` module (SQLite, simple header-based users). Business rules are the real ones.
"""
import sys
import types
from datetime import datetime

import pytest

pytest.importorskip('httpx')

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Column, DateTime, Float, Integer, String  # noqa: E402

import service_maintenance as sm  # noqa: E402
from test_service_maintenance import Base, Session  # noqa: E402  (shared SQLite engine and svc_* tables)
from test_service_maintenance import engine  # noqa: E402

ROLE_PERMISSIONS = {
    'Admin': [],
    'Coordinator': ['service-maintenance', 'service-maintenance-coordinate'],
    'Technician': ['service-maintenance', 'service-maintenance-edit'],
    'Manager': ['service-maintenance', 'service-maintenance-manage'],
    'Sales': ['leads'],
}


def _build_stand_in():
    mod = types.ModuleType('server')
    mod.Base = Base

    class UserModel(Base):
        __tablename__ = 'users'
        id = Column(String(36), primary_key=True)
        email = Column(String(255), unique=True)
        name = Column(String(255))
        role = Column(String(50))
        employee_id = Column(String(50), nullable=True)

    class EmployeeModel(Base):
        __tablename__ = 'employees'
        id = Column(String(36), primary_key=True)
        employee_id = Column(String(50), unique=True)
        name = Column(String(255))
        email = Column(String(255))
        department = Column(String(100))
        job_role = Column(String(100))
        status = Column(String(50), default='Active')

    class CustomerModel(Base):
        __tablename__ = 'customers'
        id = Column(String(36), primary_key=True)
        customer_id = Column(String(50), unique=True)
        company_name = Column(String(255))
        gst_number = Column(String(50), nullable=True)
        contact_person_name = Column(String(255))
        phone = Column(String(20), nullable=True)
        email = Column(String(255), nullable=True)
        address_line = Column(String(500), nullable=True)
        city = Column(String(100), nullable=True)
        state = Column(String(100), nullable=True)
        pincode = Column(String(20), nullable=True)
        status = Column(String(50), default='Active')
        entity_type = Column(Integer, default=0)

        def __init__(self, **kw):
            import uuid
            kw.setdefault('id', str(uuid.uuid4()))
            super().__init__(**kw)

    class CustomerContactModel(Base):
        __tablename__ = 'customer_contacts'
        id = Column(String(36), primary_key=True)
        customer_id = Column(String(36))
        contact_person_name = Column(String(255))
        designation = Column(String(255), nullable=True)
        phone = Column(String(20), nullable=True)
        email = Column(String(255), nullable=True)
        is_primary = Column(Integer, default=0)

        def __init__(self, **kw):
            import uuid
            kw.setdefault('id', str(uuid.uuid4()))
            super().__init__(**kw)

    class CustomerAddressModel(Base):
        __tablename__ = 'customer_addresses'
        id = Column(String(36), primary_key=True)
        customer_id = Column(String(36))
        address_line = Column(String(500))
        city = Column(String(100), nullable=True)
        state = Column(String(100), nullable=True)
        pincode = Column(String(20), nullable=True)
        country = Column(String(100), nullable=True)
        is_primary = Column(Integer, default=0)

        def __init__(self, **kw):
            import uuid
            kw.setdefault('id', str(uuid.uuid4()))
            super().__init__(**kw)

    class LeadModel(Base):
        __tablename__ = 'leads'
        id = Column(String(36), primary_key=True)
        contact_name = Column(String(255))
        company = Column(String(255))
        email = Column(String(255))
        phone = Column(String(20))
        status = Column(String(50))
        category = Column(String(100))
        sub_category = Column(String(100))
        customer_id = Column(String(36), nullable=True)
        enquiry_date = Column(String(10))
        value = Column(Float)
        updated_at = Column(DateTime, default=datetime.now)

    def get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    def get_current_user(x_user: str = Header(None), db=Depends(get_db)):
        if not x_user:
            raise HTTPException(status_code=401, detail='Not authenticated')
        user = db.query(UserModel).filter(UserModel.email == x_user).first()
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user

    def _norm(value):
        return ' '.join((value or '').split())

    def _assert_unique_ledger(db, entity_type, name, gst, exclude_id=None):
        for row in db.query(CustomerModel).filter(CustomerModel.entity_type == entity_type).all():
            if _norm(row.company_name).casefold() == _norm(name).casefold():
                raise HTTPException(status_code=409, detail=f'A customer named "{row.company_name}" already exists')

    def _next_ledger_id(db, entity_type):
        return f'CUST{db.query(CustomerModel).count() + 1:05d}'

    mod.UserModel, mod.EmployeeModel, mod.CustomerModel = UserModel, EmployeeModel, CustomerModel
    mod.CustomerContactModel, mod.CustomerAddressModel, mod.LeadModel = (
        CustomerContactModel, CustomerAddressModel, LeadModel)
    mod.get_db, mod.get_current_user = get_db, get_current_user
    mod.is_admin_user = lambda user: (user.role or '').lower() == 'admin'
    mod.get_permissions_for_role = lambda db, role: list(ROLE_PERMISSIONS.get(role, []))
    mod._normalize_ledger_name = _norm
    mod._normalize_gst = lambda value: (value or '').strip().upper() or None
    mod._assert_unique_ledger, mod._next_ledger_id = _assert_unique_ledger, _next_ledger_id
    mod.upload_to_s3 = lambda content, name, folder='uploads': f'/uploads/{folder}/{name}'
    mod.delete_from_s3 = lambda url: True
    return mod


STAND_IN = _build_stand_in()
Base.metadata.create_all(engine)


@pytest.fixture(scope='module')
def client():
    saved = sys.modules.get('server')
    sys.modules['server'] = STAND_IN
    try:
        from service_routes import mount_service_routes
        router = APIRouter(prefix='/api')
        mount_service_routes(router)
        app = FastAPI()
        app.include_router(router)
        yield TestClient(app)
    finally:
        if saved is None:
            sys.modules.pop('server', None)
        else:
            sys.modules['server'] = saved


@pytest.fixture()
def world(client):
    session = Session()
    for model in (sm.ServiceNotificationModel, sm.ServiceHistoryModel, sm.ServiceReportModel,
                  sm.ServiceAttachmentModel, sm.ServiceVendorRepairModel, sm.ServiceVisitModel,
                  sm.ServiceRequestModel, sm.ServiceProductModel, sm.ServiceAmcModel, sm.ServiceConfigModel,
                  STAND_IN.LeadModel, STAND_IN.CustomerAddressModel, STAND_IN.CustomerContactModel,
                  STAND_IN.CustomerModel, STAND_IN.EmployeeModel, STAND_IN.UserModel):
        session.query(model).delete()
    session.add_all([
        STAND_IN.UserModel(id='u-admin', email='admin@x', name='Admin', role='Admin'),
        STAND_IN.UserModel(id='u-coord', email='coord@x', name='Coord', role='Coordinator', employee_id='EMP-C'),
        STAND_IN.UserModel(id='u-tech', email='tech@x', name='Tech', role='Technician', employee_id='EMP-T'),
        STAND_IN.UserModel(id='u-tech2', email='tech2@x', name='Tech Two', role='Technician', employee_id='EMP-T2'),
        STAND_IN.UserModel(id='u-mgr', email='mgr@x', name='Manager', role='Manager', employee_id='EMP-M'),
        STAND_IN.UserModel(id='u-sales', email='sales@x', name='Sales', role='Sales', employee_id='EMP-S'),
        STAND_IN.EmployeeModel(id='e1', employee_id='EMP-T', name='Tech', email='tech@x', job_role='Technician',
                               status='Active'),
        STAND_IN.EmployeeModel(id='e2', employee_id='EMP-T2', name='Tech Two', email='tech2@x', status='Active'),
        STAND_IN.EmployeeModel(id='e3', employee_id='EMP-OLD', name='Gone', email='old@x', status='Inactive'),
        STAND_IN.CustomerModel(id='cust-1', customer_id='CUST00001', company_name='Acme Water',
                               contact_person_name='Ravi', phone='9876543210', email='r@acme.test',
                               address_line='Plot 1, MIDC', city='Pune', state='MH', pincode='411001',
                               entity_type=0),
        STAND_IN.CustomerModel(id='cust-2', customer_id='CUST00002', company_name='Other Co',
                               contact_person_name='Sita', phone='9876500000', address_line='Road 2',
                               entity_type=0),
        STAND_IN.CustomerModel(id='vend-1', customer_id='VEND00001', company_name='Rewind Works',
                               contact_person_name='Sunil', phone='9000000001', entity_type=1),
        STAND_IN.LeadModel(id='lead-1', company='Acme Water', contact_name='Ravi', status='Won',
                           customer_id='cust-1', category='Product', sub_category='RO Plant'),
        STAND_IN.LeadModel(id='lead-2', company='Acme Water', status='New', customer_id=None),
        STAND_IN.LeadModel(id='lead-3', company='Other Co', status='Won', customer_id='cust-2'),
    ])
    session.commit()
    session.close()
    return client


def H(email):
    return {'X-User': email}


ADMIN, COORD, TECH, TECH2, MGR, SALES = (H('admin@x'), H('coord@x'), H('tech@x'), H('tech2@x'), H('mgr@x'),
                                          H('sales@x'))


def done(label):
    return {'id': label, 'label': label, 'done': True, 'remark': '', 'required': True}


def create_repair(c, **extra):
    product = c.post('/api/service/products', headers=COORD, json={
        'customer_id': 'cust-1', 'category': 'Pumps', 'name': 'Booster', 'model': 'B1',
        'serial_number': extra.pop('serial', 'API-0001')}).json()
    body = {'customer_type': 'Existing', 'service_type': 'Repair', 'customer_id': 'cust-1', 'lead_id': 'lead-1',
            'product_id': product['id'], 'problem_category': 'Product Not Working',
            'problem_description': 'Pump does not start'}
    body.update(extra)
    return c.post('/api/service-requests', headers=COORD, json=body)


def upload(c, headers, sid, category, name='p.jpg', content=b'x' * 30, **data):
    return c.post(f'/api/service-requests/{sid}/attachments', headers=headers,
                  data={'category': category, **data}, files={'file': (name, content, 'application/octet-stream')})


# --- access -------------------------------------------------------------------

def test_requires_login_and_permission(world):
    assert world.get('/api/service-requests').status_code == 401
    denied = world.get('/api/service-requests', headers=SALES)
    assert denied.status_code == 403
    assert world.get('/api/service-requests', headers=TECH).status_code == 200
    assert world.get('/api/service-requests', headers=ADMIN).status_code == 200


def test_meta_reports_capabilities(world):
    meta = world.get('/api/service/meta', headers=COORD).json()
    assert meta['caps']['coordinate'] and not meta['caps']['manage']
    assert meta['service_types_by_customer']['New'] == ['Installation & Commissioning', 'Repair and Troubleshooting']
    assert 'Installation & Commissioning' not in meta['service_types_by_customer']['Existing']
    assert 'Closed' in meta['statuses'] and meta['attachment_limits']['video_mb'] == 100
    assert world.get('/api/service/meta', headers=ADMIN).json()['caps']['manage']


def test_only_coordinators_create_requests(world):
    body = {'customer_type': 'New', 'service_type': 'Installation & Commissioning', 'customer_id': 'cust-1'}
    assert world.post('/api/service-requests', headers=TECH, json=body).status_code == 403
    assert world.post('/api/service-requests', headers=MGR, json=body).status_code == 422  # manager may, validation fails


# --- customers and leads ----------------------------------------------------------

def test_customer_search_and_duplicate_guard(world):
    found = world.get('/api/service/customers', headers=COORD, params={'q': 'acme'}).json()
    assert [c['customer_id'] for c in found] == ['CUST00001']
    created = world.post('/api/service/customers', headers=COORD, json={
        'company_name': 'Fresh  Industries', 'phone': '9123456780', 'contact_person_name': 'Anil',
        'address_line': 'Gate 4', 'pincode': '400001'})
    assert created.status_code == 200 and created.json()['company_name'] == 'Fresh Industries'
    dup = world.post('/api/service/customers', headers=COORD, json={'company_name': 'fresh industries'})
    assert dup.status_code == 409
    assert world.post('/api/service/customers', headers=COORD, json={'company_name': 'X', 'phone': '12'}) \
        .status_code == 422
    assert world.post('/api/service/customers', headers=TECH, json={'company_name': 'Y'}).status_code == 403


def test_leads_are_scoped_to_the_customer_and_won_first(world):
    leads = world.get('/api/service/leads', headers=COORD, params={'customer_id': 'cust-1'}).json()
    assert [l['id'] for l in leads] == ['lead-1', 'lead-2']  # lead-2 matched by company name, Won first
    assert 'lead-3' not in [l['id'] for l in leads]
    profile = world.get('/api/service/customers/cust-1/profile', headers=COORD).json()
    assert profile['customer']['company_name'] == 'Acme Water' and len(profile['leads']) == 2


# --- creation ---------------------------------------------------------------------

def test_new_customer_installation_via_api(world):
    body = {'customer_type': 'New', 'service_type': 'Installation & Commissioning', 'customer_id': 'cust-1',
            'product_category': 'Water', 'product_name': 'RO Plant', 'product_model': 'RO-500', 'quantity': 1,
            'planned_date': '2026-11-05', 'client_request_id': 'abc-1'}
    first = world.post('/api/service-requests', headers=COORD, json=body)
    assert first.status_code == 200, first.text
    detail = first.json()
    assert detail['created'] and detail['service']['status'] == 'New' and detail['service']['workflow'] == 'installation'
    assert 'vendor' not in detail['tabs'] and detail['next_statuses'][0]['status'] in ('Assigned', 'Scheduled', 'Cancelled', 'On Hold')
    again = world.post('/api/service-requests', headers=COORD, json=body).json()
    assert not again['created'] and again['service']['id'] == detail['service']['id']
    assert world.get('/api/service-requests', headers=COORD).json()['total'] == 1


def test_existing_customer_must_pick_a_lead_and_product(world):
    base = {'customer_type': 'Existing', 'service_type': 'Repair', 'customer_id': 'cust-1',
            'problem_category': 'Other', 'problem_description': 'Something broke badly'}
    missing = world.post('/api/service-requests', headers=COORD, json=base)
    assert missing.status_code == 422
    text = ' '.join(missing.json()['detail']).lower()
    assert 'lead' in text and 'product' in text
    wrong = world.post('/api/service-requests', headers=COORD, json={**base, 'lead_id': 'lead-3'})
    assert wrong.status_code == 422 and 'different customer' in str(wrong.json()['detail']) \
        or 'does not belong' in str(wrong.json()['detail'])
    assert world.post('/api/service-requests', headers=COORD, json={**base, 'lead_id': 'nope'}).status_code == 404


def test_existing_flow_links_service_to_the_lead(world):
    res = create_repair(world)
    assert res.status_code == 200, res.text
    svc = res.json()['service']
    assert svc['lead_id'] == 'lead-1' and 'Acme Water' in svc['lead_label'] and svc['product_name'] == 'Booster'
    assert world.get('/api/service-requests', headers=COORD, params={'lead_id': 'lead-1'}).json()['total'] == 1
    assert world.get('/api/service-requests', headers=COORD, params={'lead_id': 'lead-2'}).json()['total'] == 0
    history = world.get('/api/service-requests/history', headers=COORD, params={'lead_id': 'lead-1'}).json()
    assert history[0]['service_code'] == svc['service_code']
    # lead matched only by company name is accepted too
    other = create_repair(world, lead_id='lead-2', serial='API-0002')
    assert other.status_code == 200 and other.json()['service']['lead_id'] == 'lead-2'


def test_duplicate_serial_cannot_be_registered(world):
    body = {'customer_id': 'cust-1', 'category': 'Pumps', 'name': 'P', 'serial_number': 'SER-0001'}
    assert world.post('/api/service/products', headers=COORD, json=body).status_code == 200
    assert world.post('/api/service/products', headers=COORD, json=body).status_code == 409


# --- workflow ----------------------------------------------------------------------

def test_repair_workflow_end_to_end(world):
    detail = create_repair(world).json()
    sid = detail['service']['id']

    # Technicians cannot see or touch requests that are not theirs.
    assert world.get(f'/api/service-requests/{sid}', headers=TECH).status_code == 403
    assert world.get('/api/service-requests', headers=TECH).json()['total'] == 0

    assert world.post(f'/api/service-requests/{sid}/assign', headers=TECH, json={'employee_id': 'EMP-T'}).status_code == 403
    assert world.post(f'/api/service-requests/{sid}/assign', headers=COORD, json={'employee_id': 'EMP-OLD'}).status_code == 422
    assigned = world.post(f'/api/service-requests/{sid}/assign', headers=COORD, json={'employee_id': 'EMP-T'})
    assert assigned.status_code == 200 and assigned.json()['service']['status'] == 'Assigned'
    assert world.get('/api/service-requests', headers=TECH).json()['total'] == 1
    assert world.get('/api/service-requests', headers=TECH2).json()['total'] == 0

    # Completion is blocked until the work, evidence and report exist.
    blocked = world.post(f'/api/service-requests/{sid}/status', headers=TECH, json={'status': 'Completed'})
    assert blocked.status_code in (400, 409)
    assert world.post(f'/api/service-requests/{sid}/status', headers=COORD, json={'status': 'Closed'}).status_code in (400, 409)

    section = f'/api/service-requests/{sid}/sections'
    assert world.put(f'{section}/troubleshooting', headers=TECH2, json={'value': []}).status_code == 403
    ok = world.put(f'{section}/troubleshooting', headers=TECH, json={'value': [{
        'inspection_date': '2026-11-02', 'fault_identified': 'Bearing', 'repair_location': 'On-site',
        'checklist': [done('Visual')]}]})
    assert ok.status_code == 200 and ok.json()['service']['status'] == 'In Progress'
    assert world.put(f'{section}/work', headers=TECH, json={'value': {
        'repair_status': 'Completed', 'repair_actions': 'Replaced bearing',
        'start_at': '2026-11-02T09:00', 'end_at': '2026-11-02T11:00'}}).status_code == 200
    bad = world.put(f'{section}/final_test', headers=TECH, json={'value': {'outcome': 'Maybe'}})
    assert bad.status_code == 422
    assert world.put(f'{section}/final_test', headers=TECH, json={'value': {
        'outcome': 'Passed', 'final_inspection_date': '2026-11-02', 'inspector': 'Tech',
        'operational_status': 'Running'}}).status_code == 200

    assert upload(world, TECH, sid, 'Before-Service Photos/Videos', name='run.exe').status_code == 422
    assert upload(world, TECH, sid, 'Before-Service Photos/Videos', name='empty.jpg', content=b'').status_code == 422
    assert upload(world, TECH, sid, 'Not a category').status_code == 422
    assert upload(world, TECH2, sid, 'Before-Service Photos/Videos').status_code == 403
    first = upload(world, TECH, sid, 'Before-Service Photos/Videos')
    assert first.status_code == 200 and first.json()['file_url'].startswith('/uploads/service_attachments/SVC-')
    assert upload(world, TECH, sid, 'After-Service Photos/Videos').status_code == 200

    report = world.get(f'/api/service-requests/{sid}/report', headers=TECH).json()
    assert report['status'] == 'Not started' and report['report']['sections']
    assert world.put(f'/api/service-requests/{sid}/report', headers=TECH,
                     json={'draft': {'final_remarks': 'All good'}}).json()['status'] == 'Draft'
    pdf = world.get(f'/api/service-requests/{sid}/report/pdf', headers=TECH)
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF') and 'DRAFT' in pdf.headers['content-disposition']

    submitted = world.post(f'/api/service-requests/{sid}/report/submit', headers=TECH)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()['status'] == 'Submitted'
    again = world.post(f'/api/service-requests/{sid}/report/submit', headers=TECH)
    assert again.status_code == 409

    final = world.post(f'/api/service-requests/{sid}/status', headers=TECH, json={'status': 'Completed'})
    assert final.status_code == 200 and final.json()['service']['status'] == 'Completed' and final.json()['locked']
    locked = world.put(f'{section}/work', headers=TECH, json={'value': {'repair_actions': 'Edit'}})
    assert locked.status_code == 403

    # Only managers amend a submitted report, with a reason.
    assert world.post(f'/api/service-requests/{sid}/report/amend', headers=COORD, json={'reason': 'x'}).status_code == 403
    assert world.post(f'/api/service-requests/{sid}/report/amend', headers=MGR, json={}).status_code == 422
    amended = world.post(f'/api/service-requests/{sid}/report/amend', headers=MGR, json={'reason': 'Typo'})
    assert amended.status_code == 200 and amended.json()['status'] == 'Draft'

    history = world.get(f'/api/service-requests/{sid}', headers=COORD).json()['history']
    statuses = [(h['from_status'], h['to_status']) for h in history if h['event_type'] == 'status_change']
    assert ('New', 'Assigned') in statuses and ('Assigned', 'In Progress') in statuses
    assert any(h['event_type'] == 'report' and 'amend' in (h['detail'] or '').lower() for h in history)


def test_detail_shows_why_a_status_is_blocked(world):
    sid = create_repair(world).json()['service']['id']
    world.post(f'/api/service-requests/{sid}/assign', headers=COORD, json={'employee_id': 'EMP-T'})
    world.post(f'/api/service-requests/{sid}/status', headers=COORD, json={'status': 'In Progress'})
    detail = world.get(f'/api/service-requests/{sid}', headers=COORD).json()
    done_option = next(o for o in detail['next_statuses'] if o['status'] == 'Completed')
    assert done_option['blockers']
    hold = next(o for o in detail['next_statuses'] if o['status'] == 'On Hold')
    assert hold['reason_required'] and not hold['blockers']
    assert world.post(f'/api/service-requests/{sid}/status', headers=COORD, json={'status': 'On Hold'}).status_code == 422
    nonsense = world.post(f'/api/service-requests/{sid}/status', headers=COORD, json={'status': 'Flying'})
    assert nonsense.status_code == 400


def test_vendor_repair_via_api(world):
    sid = create_repair(world).json()['service']['id']
    world.post(f'/api/service-requests/{sid}/assign', headers=COORD, json={'employee_id': 'EMP-T'})
    world.post(f'/api/service-requests/{sid}/status', headers=COORD, json={'status': 'In Progress'})
    started = world.post(f'/api/service-requests/{sid}/vendor-repairs', headers=COORD,
                         json={'reason': 'Rewind needed', 'vendor_id': 'vend-1'})
    assert started.status_code == 200, started.text
    repair = started.json()['vendor_repairs'][0]
    assert repair['vendor_name'] == 'Rewind Works' and 'Ready for Dispatch' in repair['next_stages']
    rid = repair['id']
    assert world.post(f'/api/service-requests/{sid}/vendor-repairs', headers=COORD, json={}).status_code == 409
    assert world.post(f'/api/service-requests/{sid}/vendor-repairs/{rid}/stage', headers=COORD,
                      json={'stage': 'Returned from Vendor'}).status_code in (400, 409)
    assert world.put(f'/api/service-requests/{sid}/vendor-repairs/{rid}', headers=COORD,
                     json={'vendor_id': 'cust-1'}).status_code == 422  # a customer is not a vendor
    ok = world.post(f'/api/service-requests/{sid}/vendor-repairs/{rid}/stage', headers=COORD,
                    json={'stage': 'Ready for Dispatch'})
    assert ok.status_code == 200
    assert world.post(f'/api/service-requests/{sid}/vendor-repairs/{rid}/cancel', headers=COORD, json={}).status_code == 422
    cancelled = world.post(f'/api/service-requests/{sid}/vendor-repairs/{rid}/cancel', headers=COORD,
                           json={'reason': 'Repaired on site instead'})
    assert cancelled.status_code == 200 and cancelled.json()['vendor_repairs'][0]['status'] == 'Cancelled'


def test_visits_via_api(world):
    sid = create_repair(world).json()['service']['id']
    world.post(f'/api/service-requests/{sid}/assign', headers=COORD, json={'employee_id': 'EMP-T'})
    one = world.post(f'/api/service-requests/{sid}/visits', headers=COORD, json={'planned_date': '2026-11-02'})
    two = world.post(f'/api/service-requests/{sid}/visits', headers=COORD, json={'planned_date': '2026-11-04'})
    assert [v['visit_no'] for v in two.json()['visits']] == [1, 2]
    vid = one.json()['visits'][0]['id']
    updated = world.put(f'/api/service-requests/{sid}/visits/{vid}', headers=TECH, json={
        'status': 'Completed', 'actual_date': '2026-11-02', 'outcome': 'Completed'})
    assert updated.status_code == 200 and updated.json()['visits'][0]['status'] == 'Completed'
    assert world.put(f'/api/service-requests/{sid}/visits/nope', headers=TECH, json={}).status_code == 404


def test_amc_contract_via_api(world):
    product = world.post('/api/service/products', headers=COORD, json={
        'customer_id': 'cust-1', 'category': 'Pumps', 'name': 'P', 'serial_number': 'AMC-0001'}).json()
    amc = world.post('/api/service/amc', headers=COORD, json={
        'customer_id': 'cust-1', 'start_date': '2026-01-01', 'end_date': '2099-12-31', 'status': 'Active',
        'covered_product_ids': [product['id']], 'covered_service_types': ['AMC Visit'], 'planned_visits': 4})
    assert amc.status_code == 200, amc.text
    assert world.post('/api/service/amc', headers=TECH, json={}).status_code == 403
    visit = world.post('/api/service-requests', headers=COORD, json={
        'customer_type': 'Existing', 'service_type': 'AMC Visit', 'customer_id': 'cust-1', 'lead_id': 'lead-1',
        'product_id': product['id']})
    assert visit.status_code == 200, visit.text
    assert visit.json()['service']['amc_id'] == amc.json()['id']  # active contract was found automatically
    assert world.get(f"/api/service/amc/{amc.json()['id']}", headers=COORD).json()['visits_used'] == 0  # counted only once the visit is completed


# --- config, notifications, export ----------------------------------------------------

def test_settings_are_manager_only_and_validated(world):
    assert world.put('/api/service/config', headers=COORD, json={'amc_required': False}).status_code == 403
    assert world.put('/api/service/config', headers=MGR, json={'problem_categories': []}).status_code == 422
    ok = world.put('/api/service/config', headers=MGR, json={'problem_categories': ['Leak'], 'amc_required': False})
    assert ok.status_code == 200 and ok.json()['problem_categories'] == ['Leak']
    assert world.get('/api/service/meta', headers=TECH).json()['config']['problem_categories'] == ['Leak']


def test_notifications_and_stats(world):
    sid = create_repair(world).json()['service']['id']
    world.post(f'/api/service-requests/{sid}/assign', headers=COORD, json={'employee_id': 'EMP-T'})
    tech_feed = world.get('/api/service/notifications', headers=TECH).json()
    assert tech_feed['unread'] >= 1 and tech_feed['items'][0]['event'] == 'assigned'
    world.post('/api/service/notifications/read', headers=TECH, json={})
    assert world.get('/api/service/notifications', headers=TECH).json()['unread'] == 0
    assert world.get('/api/service/notifications', headers=COORD).json()['unread'] >= 1
    stats = world.get('/api/service-requests/stats', headers=COORD).json()
    assert stats['total'] == 1 and stats['assigned'] == 1
    assert world.get('/api/service-requests/stats', headers=TECH2).json()['total'] == 0


def test_export_and_reports_listing(world):
    create_repair(world)
    csv_res = world.get('/api/service-requests/export', headers=COORD)
    assert csv_res.status_code == 200 and csv_res.headers['content-type'].startswith('text/csv')
    assert 'Service Code' in csv_res.text and 'Acme Water' in csv_res.text
    assert world.get('/api/service-requests/reports', headers=COORD).json() == []
    # static routes must win over /{service_id}
    assert world.get('/api/service-requests/stats', headers=COORD).status_code == 200
    assert world.get('/api/service-requests/missing', headers=COORD).status_code == 404


def test_list_sorting_filtering_and_paging(world):
    create_repair(world, priority='Critical')
    create_repair(world, priority='Low', serial='API-0002')
    res = world.get('/api/service-requests', headers=COORD, params={'sort_by': 'priority', 'sort_dir': 'desc',
                                                                     'page_size': 1}).json()
    assert res['total'] == 2 and len(res['items']) == 1 and res['items'][0]['priority'] == 'Critical'
    assert world.get('/api/service-requests', headers=COORD, params={'priority': 'Low'}).json()['total'] == 1
    assert world.get('/api/service-requests', headers=COORD, params={'q': 'API-0002'}).json()['total'] == 1
    assert world.get('/api/service-requests', headers=COORD, params={'page_size': 500}).status_code == 422

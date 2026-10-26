"""Service & Maintenance tests. They use SQLite and never touch the CRM database."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

import service_maintenance as sm
import service_rules as rules
from service_maintenance import Actor, ServiceError

Base = declarative_base()
sm.setup(Base)
engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

COORD = rules.caps_from_permissions(['service-maintenance', 'service-maintenance-coordinate'])
TECH = rules.caps_from_permissions(['service-maintenance', 'service-maintenance-edit'])
MANAGER = rules.caps_from_permissions(['service-maintenance', 'service-maintenance-manage'])
READ_ONLY = rules.caps_from_permissions(['service-maintenance'])

COORD_USER = Actor('u-coord', 'Coordinator', 'EMP-C')
TECH_USER = Actor('u-tech', 'Technician', 'EMP-T')
MANAGER_USER = Actor('u-mgr', 'Manager', 'EMP-M')
TECHNICIAN = {'employee_id': 'EMP-T', 'name': 'Technician'}

CUSTOMER = {
    'id': 'cust-1', 'customer_id': 'CUST00001', 'company_name': 'Acme Water', 'contact_person_name': 'Ravi',
    'phone': '9876543210', 'email': 'ravi@acme.test', 'address_line': 'Plot 1, MIDC', 'city': 'Pune',
    'state': 'Maharashtra', 'pincode': '411001',
}
LEAD = {'id': 'lead-1', 'company': 'Acme Water', 'status': 'Won', 'customer_id': 'cust-1'}


@pytest.fixture()
def db():
    session = Session()
    for model in (sm.ServiceNotificationModel, sm.ServiceHistoryModel, sm.ServiceReportModel,
                  sm.ServiceAttachmentModel, sm.ServiceVendorRepairModel, sm.ServiceVisitModel,
                  sm.ServiceRequestModel, sm.ServiceProductModel, sm.ServiceAmcModel, sm.ServiceConfigModel):
        session.query(model).delete()
    session.commit()
    yield session
    session.rollback()
    session.close()


def upload_ok(content, name, folder):
    return f'/uploads/{folder}/{name}'


def upload_fail(content, name, folder):
    return None


def make_product(db, serial='PUMP-0001'):
    return sm.register_product(db, {
        'customer_id': 'cust-1', 'category': 'Pumps', 'name': 'Booster Pump', 'model': 'BP-200',
        'serial_number': serial, 'installation_date': '2025-01-10',
    }, COORD_USER)


def install_payload(**extra):
    base = {
        'customer_type': 'New', 'service_type': rules.ST_INSTALL, 'priority': 'High',
        'product_category': 'Water Treatment', 'product_name': 'RO Plant', 'product_model': 'RO-500',
        'quantity': 1, 'planned_date': '2026-11-05', 'expected_completion': '2026-11-10',
    }
    base.update(extra)
    return base


def repair_payload(product, **extra):
    base = {
        'customer_type': 'Existing', 'service_type': rules.ST_REPAIR, 'lead_id': 'lead-1',
        'problem_category': 'Product Not Working', 'problem_description': 'Pump does not start',
        'priority': 'Medium', 'product_id': product.id,
    }
    base.update(extra)
    return base


def new_install(db, **extra):
    svc, created = sm.create_service(db, install_payload(**extra), COORD_USER, customer=CUSTOMER)
    assert created
    return svc


def new_repair(db, product=None, **extra):
    product = product or make_product(db)
    svc, _ = sm.create_service(db, repair_payload(product, **extra), COORD_USER, customer=CUSTOMER,
                               lead=LEAD, product=product)
    return svc


def assign(db, svc):
    return sm.assign_technician(db, svc, COORD_USER, COORD, employee=TECHNICIAN)


def done(label):
    return {'id': label, 'label': label, 'done': True, 'remark': '', 'required': True}


def finish_repair_work(db, svc, outcome='Passed'):
    sm.update_section(db, svc, 'troubleshooting', [{
        'inspection_date': '2026-11-02', 'technician': 'Technician', 'fault_identified': 'Seized bearing',
        'repair_location': 'On-site', 'checklist': [done('Visual check')],
    }], TECH_USER, TECH)
    sm.update_section(db, svc, 'work', {
        'repair_status': 'Completed', 'repair_actions': 'Replaced bearing',
        'start_at': '2026-11-02T09:00', 'end_at': '2026-11-02T11:00',
    }, TECH_USER, TECH)
    sm.update_section(db, svc, 'final_test', {
        'outcome': outcome, 'final_inspection_date': '2026-11-02', 'inspector': 'Technician',
        'operational_status': 'Running',
    }, TECH_USER, TECH)


def add_evidence(db, svc, *categories):
    for category in categories:
        sm.add_attachment(db, svc, file_name='photo.jpg', content=b'x' * 20, category=category,
                          description='evidence', actor=TECH_USER, caps=TECH, upload_fn=upload_ok)


def finish_installation_work(db, svc):
    sm.update_section(db, svc, 'inspection', {
        'inspection_date': '2026-11-04', 'inspector': 'Technician', 'site_readiness': 'Ready',
        'checklist': [done('Power available')],
    }, TECH_USER, TECH)
    sm.update_section(db, svc, 'execution', {
        'status': 'Completed', 'start_at': '2026-11-05T09:00', 'end_at': '2026-11-05T15:00',
        'checklist': [done('Unit fixed')],
    }, TECH_USER, TECH)
    sm.update_section(db, svc, 'commissioning', {
        'status': 'Successful', 'commissioning_date': '2026-11-05', 'engineer': 'Technician',
        'checklist': [done('Start-up')],
    }, TECH_USER, TECH)
    add_evidence(db, svc, 'Site Before Installation', 'Installed Product')


# --- customer type routing ---------------------------------------------------

def test_customer_type_decides_service_types():
    assert rules.allowed_service_types('New') == [rules.ST_INSTALL, rules.ST_COMMISSION]
    assert rules.default_service_type('New') == rules.ST_INSTALL
    assert rules.ST_INSTALL not in rules.allowed_service_types('Existing')
    assert rules.ST_AMC in rules.allowed_service_types('Existing')
    assert rules.workflow_for(rules.ST_INSTALL) == 'installation'
    assert rules.workflow_for(rules.ST_REPAIR) == 'repair'
    assert rules.workflow_for(rules.ST_AMC) == 'amc'
    assert 'vendor' in rules.tabs_for(rules.ST_REPAIR)
    assert 'vendor' not in rules.tabs_for(rules.ST_INSTALL)


def test_service_type_not_allowed_for_other_customer_type():
    errors = rules.validate_create({'customer_type': 'Existing', 'service_type': rules.ST_INSTALL,
                                    'customer_id': 'c'})
    assert any('not available for existing' in e for e in errors)
    errors = rules.validate_create({'customer_type': 'New', 'service_type': rules.ST_REPAIR, 'customer_id': 'c'})
    assert any('not available for new' in e for e in errors)


def test_existing_customer_must_pick_lead_and_product(db):
    payload = {'customer_type': 'Existing', 'service_type': rules.ST_REPAIR, 'problem_category': 'Other',
               'problem_description': 'Something broke', 'contact_person': 'R', 'mobile': '9876543210',
               'site_address': 'Plot', 'customer_id': 'c1'}
    errors = rules.validate_create(payload)
    assert any('lead' in e.lower() for e in errors)
    assert any('product' in e.lower() for e in errors)


def test_new_customer_installation_requires_product_details(db):
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, {'customer_type': 'New', 'service_type': rules.ST_INSTALL}, COORD_USER,
                          customer=CUSTOMER)
    detail = ' '.join(exc.value.detail)
    assert 'Product name' in detail and 'Product model' in detail and 'Quantity' in detail
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, install_payload(quantity=0), COORD_USER, customer=CUSTOMER)
    assert any('Quantity' in e for e in exc.value.detail)


def test_customer_reference_is_required(db):
    with pytest.raises(ServiceError):
        sm.create_service(db, install_payload(), COORD_USER, customer=None)


def test_lead_must_belong_to_selected_customer(db):
    product = make_product(db)
    other_lead = {**LEAD, 'customer_id': 'someone-else'}
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, repair_payload(product), COORD_USER, customer=CUSTOMER, lead=other_lead,
                          product=product)
    assert 'different customer' in str(exc.value)


def test_existing_repair_links_to_lead_and_product(db):
    svc = new_repair(db)
    assert svc.workflow == 'repair'
    assert svc.lead_id == 'lead-1' and 'Acme Water' in svc.lead_label
    assert svc.product_name == 'Booster Pump' and svc.serial_number == 'PUMP-0001'
    assert svc.status == 'New'
    assert svc.service_code.startswith('SVC-')


def test_installation_seeds_checklists_and_status(db):
    svc = new_install(db)
    data = sm._loads(svc.data_json, {})
    assert data['inspection']['checklist'] and data['commissioning']['checklist']
    assert data['execution']['status'] == 'Not Started'
    assert svc.customer_name == 'Acme Water' and svc.mobile == '9876543210'


def test_duplicate_submission_returns_same_request(db):
    payload = install_payload(client_request_id='req-123')
    first, created_first = sm.create_service(db, payload, COORD_USER, customer=CUSTOMER)
    second, created_second = sm.create_service(db, payload, COORD_USER, customer=CUSTOMER)
    assert created_first and not created_second
    assert first.id == second.id
    assert db.query(sm.ServiceRequestModel).count() == 1


def test_serial_number_must_be_unique_for_installation(db):
    make_product(db, serial='DUP-1234')
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, install_payload(serial_number='dup-1234'), COORD_USER, customer=CUSTOMER)
    assert 'already registered' in str(exc.value)


def test_draft_is_saved_with_minimal_data(db):
    svc, _ = sm.create_service(db, {'customer_type': 'New', 'save_as_draft': True}, COORD_USER,
                               customer=CUSTOMER)
    assert svc.status == 'Draft'
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'New', COORD_USER, COORD)


# --- status transitions --------------------------------------------------------

def test_invalid_transition_is_rejected(db):
    svc = new_install(db)
    with pytest.raises(ServiceError) as exc:
        sm.change_status(db, svc, 'Completed', COORD_USER, COORD)
    assert 'cannot move from New to Completed' in str(exc.value)


def test_technician_required_before_work_starts(db):
    svc = new_install(db)
    with pytest.raises(ServiceError) as exc:
        sm.change_status(db, svc, 'Assigned', COORD_USER, COORD)
    assert 'technician' in str(exc.value).lower()
    assign(db, svc)
    assert svc.status == 'Assigned'
    sm.change_status(db, svc, 'In Progress', COORD_USER, COORD)
    assert svc.status == 'In Progress'


def test_reasons_are_required_for_hold_and_cancel(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'On Hold', COORD_USER, COORD)
    sm.change_status(db, svc, 'On Hold', COORD_USER, COORD, 'Waiting for site access')
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'Cancelled', COORD_USER, COORD)


def test_every_status_change_is_in_history(db):
    svc = new_install(db)
    assign(db, svc)
    sm.change_status(db, svc, 'In Progress', COORD_USER, COORD)
    sm.change_status(db, svc, 'On Hold', COORD_USER, COORD, 'Parts delay')
    rows = (db.query(sm.ServiceHistoryModel)
            .filter(sm.ServiceHistoryModel.service_id == svc.id,
                    sm.ServiceHistoryModel.event_type == 'status_change').all())
    pairs = [(r.from_status, r.to_status) for r in rows]
    assert ('New', 'Assigned') in pairs and ('Assigned', 'In Progress') in pairs
    assert ('In Progress', 'On Hold') in pairs
    assert [r.reason for r in rows if r.to_status == 'On Hold'] == ['Parts delay']
    assert all(r.user_name for r in rows)


def test_same_status_is_idempotent(db):
    svc = new_install(db)
    assign(db, svc)
    sm.change_status(db, svc, 'In Progress', COORD_USER, COORD)
    count = db.query(sm.ServiceHistoryModel).count()
    sm.change_status(db, svc, 'In Progress', COORD_USER, COORD)
    assert db.query(sm.ServiceHistoryModel).count() == count


def test_technician_cannot_assign_cancel_or_close(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError):
        sm.assign_technician(db, svc, TECH_USER, TECH, employee=TECHNICIAN)
    with pytest.raises(ServiceError) as exc:
        sm.change_status(db, svc, 'Cancelled', TECH_USER, TECH, 'no')
    assert exc.value.status_code == 403


def test_technician_only_updates_assigned_requests(db):
    svc = new_install(db)
    with pytest.raises(ServiceError) as exc:
        sm.update_section(db, svc, 'inspection', {'inspector': 'x'}, TECH_USER, TECH)
    assert exc.value.status_code == 403
    assign(db, svc)
    sm.update_section(db, svc, 'inspection', {'inspector': 'x'}, TECH_USER, TECH)
    stranger = Actor('u-x', 'Other', 'EMP-X')
    with pytest.raises(ServiceError):
        sm.update_section(db, svc, 'inspection', {'inspector': 'y'}, stranger, TECH)
    with pytest.raises(ServiceError):
        sm.update_section(db, svc, 'inspection', {'inspector': 'y'}, stranger, READ_ONLY)


def test_section_must_match_workflow(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError) as exc:
        sm.update_section(db, svc, 'final_test', {'outcome': 'Passed'}, TECH_USER, TECH)
    assert 'does not apply' in str(exc.value)


def test_invalid_enum_and_dates_are_rejected(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError):
        sm.update_section(db, svc, 'commissioning', {'status': 'Maybe'}, TECH_USER, TECH)
    with pytest.raises(ServiceError):
        sm.update_section(db, svc, 'execution', {'start_at': '2026-11-05T15:00', 'end_at': '2026-11-05T09:00'},
                          TECH_USER, TECH)
    with pytest.raises(ServiceError):
        sm.update_section(db, svc, 'inspection', {'inspection_date': '05/11/2026'}, TECH_USER, TECH)


# --- Scenario 1: installation & commissioning ----------------------------------

def test_installation_cannot_complete_with_commissioning_pending(db):
    svc = new_install(db)
    assign(db, svc)
    sm.update_section(db, svc, 'inspection', {'inspection_date': '2026-11-04', 'inspector': 'T',
                                              'site_readiness': 'Ready'}, TECH_USER, TECH)
    sm.change_status(db, svc, 'In Progress', COORD_USER, COORD) if svc.status != 'In Progress' else None
    with pytest.raises(ServiceError) as exc:
        sm.change_status(db, svc, 'Completed', COORD_USER, COORD)
    detail = ' '.join(exc.value.detail)
    assert 'Commissioning must be Successful' in detail
    assert 'mandatory photos/videos' in detail
    assert 'final service report' in detail


def test_installation_full_flow_registers_installed_product(db):
    svc = new_install(db, serial_number='RO-777-01')
    assign(db, svc)
    finish_installation_work(db, svc)
    sm.save_report_draft(db, svc, {'final_remarks': 'Handed over'}, TECH_USER, TECH)
    sm.submit_report(db, svc, TECH_USER, TECH)
    sm.change_status(db, svc, 'Completed', TECH_USER, TECH)
    assert svc.status == 'Completed' and svc.completed_at is not None
    product = db.query(sm.ServiceProductModel).filter_by(id=svc.product_id).one()
    assert product.customer_id == 'cust-1' and product.serial_number == 'RO-777-01'
    assert product.installation_date == '2026-11-05'
    sm.change_status(db, svc, 'Closed', COORD_USER, COORD)
    assert svc.status == 'Closed' and svc.closure_date
    history = sm.service_history_for(db, customer_id='cust-1')
    assert history and history[0]['service_code'] == svc.service_code and history[0]['report_status'] == 'Submitted'


def test_site_marked_not_ready_blocks_completion(db):
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    sm.update_section(db, svc, 'inspection', {'site_readiness': 'Not Ready'}, TECH_USER, TECH)
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'Not Ready' in ' '.join(exc.value.detail)


# --- Scenario 2 and 5: repair and failed inspection -----------------------------

def test_repair_full_flow(db):
    svc = new_repair(db)
    assign(db, svc)
    add_evidence(db, svc, 'Before-Service Photos/Videos')
    finish_repair_work(db, svc)
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'After-Service Photos/Videos' in ' '.join(exc.value.detail)
    add_evidence(db, svc, 'After-Service Photos/Videos')
    sm.submit_report(db, svc, TECH_USER, TECH)
    sm.change_status(db, svc, 'Completed', TECH_USER, TECH)
    assert svc.status == 'Completed'


def test_failed_final_test_blocks_successful_closure(db):
    svc = new_repair(db)
    assign(db, svc)
    add_evidence(db, svc, 'Before-Service Photos/Videos', 'After-Service Photos/Videos')
    finish_repair_work(db, svc, outcome='Failed')
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'Final test result is "Failed"' in ' '.join(exc.value.detail)
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'Completed', TECH_USER, TECH)
    assert svc.status != 'Completed'


def test_failed_test_reopens_troubleshooting_and_keeps_findings(db):
    svc = new_repair(db)
    assign(db, svc)
    finish_repair_work(db, svc)
    sm.change_status(db, svc, 'Inspection Pending', TECH_USER, TECH)
    sm.update_section(db, svc, 'final_test', {'outcome': 'Failed'}, TECH_USER, TECH)
    assert svc.status == 'In Progress'
    data = sm._loads(svc.data_json, {})
    assert data['troubleshooting'][0]['fault_identified'] == 'Seized bearing'
    visit = sm.save_visit(db, svc, {'planned_date': '2026-11-09'}, COORD_USER, COORD)
    assert visit.visit_no == 1
    sm.update_section(db, svc, 'troubleshooting', data['troubleshooting'] + [{
        'inspection_date': '2026-11-09', 'fault_identified': 'Loose coupling'}], TECH_USER, TECH)
    assert len(sm._loads(svc.data_json, {})['troubleshooting']) == 2


def test_incomplete_repair_blocks_completion(db):
    svc = new_repair(db)
    assign(db, svc)
    finish_repair_work(db, svc)
    sm.update_section(db, svc, 'work', {'repair_status': 'Incomplete', 'incomplete_reason': 'Spare parts',
                                        'next_step': 'Spare Parts Required'}, TECH_USER, TECH)
    add_evidence(db, svc, 'Before-Service Photos/Videos', 'After-Service Photos/Videos')
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'marked incomplete' in ' '.join(exc.value.detail)


def test_multiple_visits_are_tracked_and_validated(db):
    svc = new_repair(db)
    assign(db, svc)
    first = sm.save_visit(db, svc, {'planned_date': '2026-11-02', 'status': 'Planned'}, COORD_USER, COORD)
    second = sm.save_visit(db, svc, {'planned_date': '2026-11-03'}, COORD_USER, COORD)
    assert (first.visit_no, second.visit_no) == (1, 2)
    with pytest.raises(ServiceError):
        sm.save_visit(db, svc, {'status': 'Completed'}, COORD_USER, COORD, visit=first)
    sm.save_visit(db, svc, {'status': 'Completed', 'actual_date': '2026-11-02', 'outcome': 'Revisit Required',
                            'inspection_notes': 'Needs spare'}, TECH_USER, TECH, visit=first)
    assert first.status == 'Completed' and first.inspection_notes == 'Needs spare'


# --- attachments -------------------------------------------------------------------

def test_attachment_rules():
    assert rules.validate_attachment('site.jpg', 1000, 'Site Inspection Photos') is None
    assert rules.validate_attachment('clip.mp4', 5_000_000, 'Before-Service Photos/Videos') is None
    assert 'not allowed' in rules.validate_attachment('run.exe', 100, 'Customer Documents')
    assert 'not allowed' in rules.validate_attachment('page.html', 100, 'Customer Documents')
    assert 'at most' in rules.validate_attachment('big.jpg', 20 * 1024 * 1024, 'Site Inspection Photos')
    assert 'at most' in rules.validate_attachment('big.mp4', 150 * 1024 * 1024, 'Site Inspection Photos')
    assert 'empty' in rules.validate_attachment('a.pdf', 0, 'Customer Documents')
    assert 'valid attachment category' in rules.validate_attachment('a.pdf', 10, 'Nonsense')
    assert 'extension' in rules.validate_attachment('noext', 10, 'Customer Documents')
    assert rules.validate_attachment('plc.acd', 10, 'Program/Configuration File') is None
    assert 'not supported' in rules.validate_attachment('plc.acd', 10, 'Customer Documents')
    assert rules.safe_file_name('..\\..\\evil name?.pdf') == 'evil name_.pdf'


def test_attachment_upload_failure_saves_nothing(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError) as exc:
        sm.add_attachment(db, svc, file_name='a.jpg', content=b'abc', category='Site Inspection Photos',
                          description='', actor=TECH_USER, caps=TECH, upload_fn=upload_fail)
    assert exc.value.status_code == 503
    assert db.query(sm.ServiceAttachmentModel).count() == 0


def test_attachment_metadata_and_history(db):
    svc = new_install(db)
    assign(db, svc)
    att = sm.add_attachment(db, svc, file_name='before.jpg', content=b'abc', category='Site Before Installation',
                            description='North wall', actor=TECH_USER, caps=TECH, upload_fn=upload_ok)
    assert att.uploaded_by_name == 'Technician' and att.service_id == svc.id and att.file_type == 'jpg'
    assert att.file_url.startswith('/uploads/service_attachments/SVC-')
    with pytest.raises(ServiceError):
        sm.add_attachment(db, svc, file_name='x.jpg', content=b'abc', category='Site Inspection Photos',
                          description='', actor=TECH_USER, caps=TECH, upload_fn=upload_ok, visit_id='missing')


def test_attachments_of_submitted_report_need_manager_to_remove(db):
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    sm.submit_report(db, svc, TECH_USER, TECH)
    att = db.query(sm.ServiceAttachmentModel).first()
    with pytest.raises(ServiceError) as exc:
        sm.delete_attachment(db, svc, att, TECH_USER, TECH)
    assert exc.value.status_code == 403
    sm.delete_attachment(db, svc, att, MANAGER_USER, MANAGER)


# --- Scenario 3: vendor repair ------------------------------------------------------

def vendor_ready_service(db):
    svc = new_repair(db)
    assign(db, svc)
    sm.change_status(db, svc, 'In Progress', COORD_USER, COORD)
    return svc


def test_vendor_repair_full_flow(db):
    svc = vendor_ready_service(db)
    rep = sm.create_vendor_repair(db, svc, {'reason': 'Needs rewinding', 'expected_return_date': '2026-12-01'},
                                  COORD_USER, COORD)
    assert rep.repair_code.startswith('VR-SVC-') and rep.stage == 'Repair Recommended'
    with pytest.raises(ServiceError) as exc:
        sm.create_vendor_repair(db, svc, {}, COORD_USER, COORD)
    assert 'already open' in str(exc.value)

    with pytest.raises(ServiceError) as exc:
        sm.advance_vendor_stage(db, svc, rep, 'Ready for Dispatch', COORD_USER, COORD)
    assert 'Select the vendor' in ' '.join(exc.value.detail)

    vendor = {'id': 'v-1', 'company_name': 'Rewind Works', 'contact_person_name': 'Sunil', 'phone': '9000000001'}
    sm.update_vendor_repair(db, svc, rep, {'vendor_id': 'v-1'}, COORD_USER, COORD, vendor=vendor)
    sm.advance_vendor_stage(db, svc, rep, 'Ready for Dispatch', COORD_USER, COORD)

    with pytest.raises(ServiceError) as exc:
        sm.advance_vendor_stage(db, svc, rep, 'Dispatched to Vendor', COORD_USER, COORD)
    assert 'dispatch date' in ' '.join(exc.value.detail) and 'tracking' in ' '.join(exc.value.detail)
    with pytest.raises(ServiceError) as exc:
        sm.advance_vendor_stage(db, svc, rep, 'Under Vendor Repair', COORD_USER, COORD)
    assert 'cannot move' in str(exc.value)

    sm.update_vendor_repair(db, svc, rep, {'dispatch_date': '2026-11-10', 'dispatch_reference': 'AWB123'},
                            COORD_USER, COORD)
    sm.advance_vendor_stage(db, svc, rep, 'Dispatched to Vendor', COORD_USER, COORD)
    assert svc.status == 'Waiting for Vendor'
    for stage in ('Received by Vendor', 'Under Vendor Repair'):
        sm.advance_vendor_stage(db, svc, rep, stage, COORD_USER, COORD)

    with pytest.raises(ServiceError):
        sm.advance_vendor_stage(db, svc, rep, 'Repair Completed by Vendor', COORD_USER, COORD)
    sm.update_vendor_repair(db, svc, rep, {'vendor_completion_date': '2026-11-20',
                                           'work_performed_by_vendor': 'Rewound motor', 'vendor_charges': 4500},
                            COORD_USER, COORD)
    sm.advance_vendor_stage(db, svc, rep, 'Repair Completed by Vendor', COORD_USER, COORD)
    # Vendor completion never closes the customer's request.
    assert svc.status == 'Waiting for Vendor' and rep.status == 'Open'

    with pytest.raises(ServiceError):
        sm.advance_vendor_stage(db, svc, rep, 'Returned from Vendor', COORD_USER, COORD)
    sm.update_vendor_repair(db, svc, rep, {'actual_return_date': '2026-11-25'}, COORD_USER, COORD)
    sm.advance_vendor_stage(db, svc, rep, 'Returned from Vendor', COORD_USER, COORD)
    assert svc.status == 'Inspection Pending'

    # Closing the vendor repair needs a passed post-repair inspection, flags and evidence.
    with pytest.raises(ServiceError):
        sm.record_post_repair(db, svc, rep, {'post_repair_date': '2026-11-26'}, TECH_USER, COORD)
    sm.record_post_repair(db, svc, rep, {'post_repair_date': '2026-11-26', 'post_repair_result': 'Passed',
                                         'problem_resolved': True, 'ready_for_use': True}, COORD_USER, COORD)
    assert rep.stage == 'Post-Repair Inspection'
    with pytest.raises(ServiceError) as exc:
        sm.advance_vendor_stage(db, svc, rep, 'Returned to Customer / Service Closed', COORD_USER, COORD)
    assert 'post-repair inspection photos' in ' '.join(exc.value.detail)
    sm.add_attachment(db, svc, file_name='post.jpg', content=b'abc', category='Post-Repair Inspection Photos/Videos',
                      description='Running', actor=COORD_USER, caps=COORD, upload_fn=upload_ok,
                      vendor_repair_id=rep.id)
    sm.advance_vendor_stage(db, svc, rep, 'Returned to Customer / Service Closed', COORD_USER, COORD)
    assert rep.status == 'Closed'
    assert sm.service_history_for(db, product_id=svc.product_id)[0]['vendor_repair_count'] == 1


def test_vendor_repair_blocks_service_completion_until_closed(db):
    svc = vendor_ready_service(db)
    add_evidence(db, svc, 'Before-Service Photos/Videos', 'After-Service Photos/Videos')
    finish_repair_work(db, svc)
    sm.create_vendor_repair(db, svc, {'reason': 'x'}, COORD_USER, COORD)
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'still open' in ' '.join(exc.value.detail)


def test_waiting_for_vendor_needs_a_vendor_repair(db):
    svc = vendor_ready_service(db)
    with pytest.raises(ServiceError) as exc:
        sm.change_status(db, svc, 'Waiting for Vendor', COORD_USER, COORD)
    assert 'vendor repair' in str(exc.value).lower()


def test_failed_post_repair_reopens_service_and_can_send_back(db):
    svc = vendor_ready_service(db)
    rep = sm.create_vendor_repair(db, svc, {'reason': 'Needs rewinding', 'vendor_name': 'Rewind Works',
                                            'dispatch_date': '2026-11-10', 'dispatch_reference': 'AWB1',
                                            'vendor_completion_date': '2026-11-12',
                                            'work_performed_by_vendor': 'Rewound',
                                            'actual_return_date': '2026-11-14'}, COORD_USER, COORD)
    for stage in ('Ready for Dispatch', 'Dispatched to Vendor', 'Received by Vendor', 'Under Vendor Repair',
                  'Repair Completed by Vendor', 'Returned from Vendor'):
        sm.advance_vendor_stage(db, svc, rep, stage, COORD_USER, COORD)
    sm.record_post_repair(db, svc, rep, {'post_repair_date': '2026-11-15', 'post_repair_result': 'Failed',
                                         'new_issues': 'Still vibrating'}, COORD_USER, COORD)
    assert svc.status == 'In Progress' and rep.status == 'Open'
    sm.send_back_to_vendor(db, svc, rep, 'Vibration persists', COORD_USER, COORD)
    assert rep.cycle == 2 and rep.stage == 'Ready for Dispatch' and rep.post_repair_result is None
    log = sm._loads(rep.stage_log_json, [])
    assert any(row['stage'] == 'Sent back to vendor' for row in log)
    with pytest.raises(ServiceError):
        sm.send_back_to_vendor(db, svc, rep, 'again', COORD_USER, COORD)


def test_vendor_stage_config_keeps_rule_bearing_stages(db):
    with pytest.raises(ServiceError):
        sm.save_config(db, {'vendor_stages': ['Repair Recommended', 'Dispatched to Vendor']}, MANAGER_USER)
    stages = [s for s in rules.DEFAULT_VENDOR_STAGES if s != rules.VENDOR_STAGE_APPROVAL]
    cfg = sm.save_config(db, {'vendor_stages': stages}, MANAGER_USER)
    assert rules.VENDOR_STAGE_APPROVAL not in cfg['vendor_stages']
    assert rules.vendor_next_stages(stages, 'Repair Recommended', False) == ['Ready for Dispatch']


def test_vendor_approval_stage_is_skippable_unless_required():
    stages = rules.DEFAULT_VENDOR_STAGES
    assert rules.vendor_next_stages(stages, 'Repair Recommended', False) == [
        'Awaiting Approval, if required', 'Ready for Dispatch']
    assert rules.vendor_next_stages(stages, 'Repair Recommended', True) == ['Awaiting Approval, if required']
    assert rules.vendor_next_stages(stages, stages[-1], False) == []


def test_vendor_repair_only_on_repair_requests(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError):
        sm.create_vendor_repair(db, svc, {}, COORD_USER, COORD)


# --- Scenario 4: AMC ----------------------------------------------------------------

def amc_payload(product, **extra):
    base = {'customer_id': 'cust-1', 'start_date': '2026-01-01', 'end_date': '2026-12-31', 'status': 'Active',
            'covered_product_ids': [product.id], 'covered_service_types': [rules.ST_AMC], 'planned_visits': 4}
    base.update(extra)
    return base


def amc_visit_payload(product, amc=None, **extra):
    base = {'customer_type': 'Existing', 'service_type': rules.ST_AMC, 'lead_id': 'lead-1',
            'product_id': product.id, 'priority': 'Low'}
    if amc is not None:
        base['amc_id'] = amc.id
    base.update(extra)
    return base


def test_amc_visit_needs_an_active_contract(db, monkeypatch):
    product = make_product(db)
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, amc_visit_payload(product), COORD_USER, customer=CUSTOMER, lead=LEAD,
                          product=product)
    assert 'AMC contract' in ' '.join(exc.value.detail)

    expired = sm.save_amc(db, amc_payload(product, start_date='2020-01-01', end_date='2020-12-31'), COORD_USER)
    assert sm.amc_effective_status(expired) == 'Expired'
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, amc_visit_payload(product, expired), COORD_USER, customer=CUSTOMER, lead=LEAD,
                          product=product, amc=expired)
    assert 'not active' in str(exc.value)

    other = make_product(db, serial='PUMP-0002')
    active = sm.save_amc(db, amc_payload(product, end_date='2099-12-31'), COORD_USER)
    with pytest.raises(ServiceError) as exc:
        sm.create_service(db, amc_visit_payload(other, active), COORD_USER, customer=CUSTOMER, lead=LEAD,
                          product=other, amc=active)
    assert 'does not cover' in str(exc.value)


def test_amc_visit_flow_updates_contract_history(db):
    product = make_product(db)
    amc = sm.save_amc(db, amc_payload(product, end_date='2099-12-31'), COORD_USER)
    svc, _ = sm.create_service(db, amc_visit_payload(product, amc), COORD_USER, customer=CUSTOMER, lead=LEAD,
                               product=product, amc=amc)
    assert svc.amc_id == amc.id and svc.workflow == 'amc'
    assign(db, svc)
    sm.update_section(db, svc, 'amc', {
        'actual_visit_date': '2026-11-03', 'product_condition': 'Good', 'work_performed': 'Greased bearings',
        'next_service_date': '2027-02-03',
        'checklist': [done(row['label']) for row in sm._loads(svc.data_json, {})['amc']['checklist']],
    }, TECH_USER, TECH)
    sm.submit_report(db, svc, TECH_USER, TECH)
    sm.change_status(db, svc, 'Completed', TECH_USER, TECH)
    db.refresh(amc)
    assert amc.last_visit_date == '2026-11-03' and amc.next_planned_date == '2027-02-03'
    summary = sm.amc_summary(db, amc)
    assert summary['visits_used'] == 1 and summary['visits'][0]['service_code'] == svc.service_code


def test_amc_dates_are_validated(db):
    product = make_product(db)
    with pytest.raises(ServiceError):
        sm.save_amc(db, amc_payload(product, start_date='2026-12-31', end_date='2026-01-01'), COORD_USER)


# --- Scenario: reports ----------------------------------------------------------------

def test_report_submit_is_blocked_until_work_is_done(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert len(exc.value.detail) >= 3


def test_report_submit_is_not_repeatable(db):
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    first = sm.submit_report(db, svc, TECH_USER, TECH)
    assert first.status == 'Submitted' and first.revision == 1
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert exc.value.status_code == 409
    with pytest.raises(ServiceError):
        sm.save_report_draft(db, svc, {'final_remarks': 'edit'}, TECH_USER, TECH)


def test_report_amendment_preserves_previous_revision(db):
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    sm.submit_report(db, svc, TECH_USER, TECH)
    sm.change_status(db, svc, 'Completed', TECH_USER, TECH)
    with pytest.raises(ServiceError) as exc:
        sm.amend_report(db, svc, 'typo', TECH_USER, TECH)
    assert exc.value.status_code == 403
    with pytest.raises(ServiceError):
        sm.amend_report(db, svc, '', MANAGER_USER, MANAGER)
    sm.amend_report(db, svc, 'Wrong serial number', MANAGER_USER, MANAGER)
    assert svc.status == 'Report Pending'
    sm.save_report_draft(db, svc, {'final_remarks': 'Corrected'}, MANAGER_USER, MANAGER)
    rep = sm.submit_report(db, svc, MANAGER_USER, MANAGER)
    assert rep.revision == 2 and rep.report_no.endswith('-R2')
    view = sm.report_view(db, svc)
    assert view['revisions'][0]['reason'] == 'Wrong serial number' and 'snapshot' not in view['revisions'][0]
    assert view['report']['final_remarks'] == 'Corrected'
    stored = sm._loads(rep.revisions_json, [])
    assert stored[0]['snapshot']['report_no'] == 'SR-' + svc.service_code


def test_report_is_generated_from_captured_data_and_pdf(db):
    svc = new_install(db, serial_number='RO-888-01')
    assign(db, svc)
    finish_installation_work(db, svc)
    report = sm.build_report(db, svc)
    titles = [s['title'] for s in report['sections']]
    for expected in ('Customer', 'Site inspection', 'Installation', 'Commissioning', 'Photos, videos and documents'):
        assert expected in titles
    assert report['product']['serial_number'] == 'RO-888-01'
    assert len(report['evidence']) == 2
    pdf = sm.render_report_pdf(report)
    assert pdf.startswith(b'%PDF') and len(pdf) > 1500


def test_customer_acknowledgement_can_be_made_mandatory(db):
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    sm.save_config(db, {'ack_required_types': [rules.ST_INSTALL]}, MANAGER_USER)
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'acknowledgement' in ' '.join(exc.value.detail)
    with pytest.raises(ServiceError):
        sm.save_report_draft(db, svc, {'customer_acknowledgement': {'acknowledged': True}}, TECH_USER, TECH)
    sm.save_report_draft(db, svc, {'customer_acknowledgement': {'acknowledged': True, 'name': 'Ravi',
                                                                'date': '2026-11-05', 'method': 'Signature'}},
                         TECH_USER, TECH)
    sm.submit_report(db, svc, TECH_USER, TECH)


# --- locked records, permissions -------------------------------------------------------

def test_completed_requests_are_locked_for_non_managers(db):
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    sm.submit_report(db, svc, TECH_USER, TECH)
    sm.change_status(db, svc, 'Completed', TECH_USER, TECH)
    with pytest.raises(ServiceError) as exc:
        sm.update_section(db, svc, 'inspection', {'remarks': 'late edit'}, TECH_USER, TECH)
    assert exc.value.status_code == 403
    with pytest.raises(ServiceError) as exc:
        sm.update_section(db, svc, 'inspection', {'remarks': 'late edit'}, MANAGER_USER, MANAGER)
    assert 'reason' in str(exc.value).lower()
    sm.update_section(db, svc, 'inspection', {'remarks': 'late edit'}, MANAGER_USER, MANAGER, 'Typo fix')
    row = (db.query(sm.ServiceHistoryModel).filter_by(service_id=svc.id, event_type='locked_edit').one())
    assert row.reason == 'Typo fix' and row.user_name == 'Manager'


def test_only_completed_requests_can_close_and_reopen_needs_manager(db):
    svc = new_install(db)
    assign(db, svc)
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'Closed', COORD_USER, COORD)
    finish_installation_work(db, svc)
    sm.submit_report(db, svc, TECH_USER, TECH)
    sm.change_status(db, svc, 'Completed', COORD_USER, COORD)
    sm.change_status(db, svc, 'Closed', COORD_USER, COORD)
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'In Progress', COORD_USER, COORD, 'reopen')
    with pytest.raises(ServiceError):
        sm.change_status(db, svc, 'In Progress', MANAGER_USER, MANAGER)
    sm.change_status(db, svc, 'In Progress', MANAGER_USER, MANAGER, 'Customer complaint')
    assert svc.status == 'In Progress' and svc.closure_date is None


def test_permission_capabilities():
    caps = rules.caps_from_permissions([], is_admin=True)
    assert caps['view'] and caps['manage'] and caps['coordinate'] and caps['edit']
    assert not READ_ONLY['edit'] and READ_ONLY['view']
    assert TECH['technician_only'] and not COORD['technician_only']
    assert MANAGER['coordinate'] and MANAGER['edit']
    assert not rules.caps_from_permissions(['service-maintenance-manage'], False)['view']
    svc = {'assigned_employee_id': 'EMP-T'}
    assert rules.can_edit_service(TECH, svc, 'EMP-T') and not rules.can_edit_service(TECH, svc, 'EMP-Z')
    assert rules.can_edit_service(COORD, svc, 'EMP-Z') and not rules.can_edit_service(READ_ONLY, svc, 'EMP-T')


def test_core_fields_can_be_edited_with_validation(db):
    svc = new_install(db)
    with pytest.raises(ServiceError):
        sm.update_service(db, svc, {'mobile': 'abc'}, COORD_USER, COORD)
    with pytest.raises(ServiceError):
        sm.update_service(db, svc, {'expected_completion': '2026-10-01'}, COORD_USER, COORD)
    updated = sm.update_service(db, svc, {'priority': 'Critical', 'city': 'Mumbai'}, COORD_USER, COORD)
    assert updated.priority == 'Critical' and updated.city == 'Mumbai'
    with pytest.raises(ServiceError):
        sm.update_service(db, svc, {'priority': 'Critical'}, Actor('x', 'x', 'EMP-Q'), READ_ONLY)


# --- listing, stats, history, notifications ----------------------------------------------

def test_list_filters_cards_and_sorting(db):
    first = new_install(db, planned_date='2019-12-01', expected_completion='2020-01-01')
    second = new_repair(db, priority='Critical')
    assign(db, second)
    sm.change_status(db, second, 'In Progress', COORD_USER, COORD)
    stats = sm.service_stats(db, COORD, 'EMP-C')
    assert stats['total'] == 2 and stats['new'] == 1 and stats['in_progress'] == 1 and stats['overdue'] == 1
    listing = sm.list_services(db, COORD, 'EMP-C', card='overdue')
    assert [i['service_code'] for i in listing['items']] == [first.service_code] and listing['items'][0]['overdue']
    assert sm.list_services(db, COORD, 'EMP-C', customer_type='Existing')['total'] == 1
    assert sm.list_services(db, COORD, 'EMP-C', q='ro plant')['total'] == 1
    assert sm.list_services(db, COORD, 'EMP-C', q='PUMP-0001')['total'] == 1
    assert sm.list_services(db, COORD, 'EMP-C', q='9876543210')['total'] == 2
    assert sm.list_services(db, COORD, 'EMP-C', technician='EMP-T')['total'] == 1
    by_priority = sm.list_services(db, COORD, 'EMP-C', sort_by='priority', sort_dir='desc')
    assert by_priority['items'][0]['priority'] == 'Critical'
    assert sm.list_services(db, COORD, 'EMP-C', date_from='2099-01-01')['total'] == 0
    paged = sm.list_services(db, COORD, 'EMP-C', page=2, page_size=1)
    assert paged['total'] == 2 and len(paged['items']) == 1 and paged['page'] == 2
    assert sm.list_services(db, COORD, 'EMP-C', lead_id='lead-1')['total'] == 1


def test_technician_only_sees_their_requests(db):
    mine = new_repair(db)
    assign(db, mine)
    new_install(db)
    listing = sm.list_services(db, TECH, 'EMP-T')
    assert [i['service_code'] for i in listing['items']] == [mine.service_code]
    assert sm.service_stats(db, TECH, 'EMP-T')['total'] == 1
    assert sm.list_services(db, TECH, 'EMP-OTHER')['total'] == 0
    assert sm.list_services(db, READ_ONLY, 'EMP-OTHER')['total'] == 2


def test_csv_export_neutralises_formulas(db):
    svc = new_install(db, customer_name='x')
    svc.customer_name = '=HYPERLINK("http://evil")'
    db.commit()
    csv_text = sm.export_csv(sm.list_services(db, COORD, 'EMP-C')['items'])
    assert "'=HYPERLINK" in csv_text and 'Service Code' in csv_text.splitlines()[0]


def test_history_by_product_and_lead(db):
    product = make_product(db)
    svc = new_repair(db, product=product)
    assert sm.service_history_for(db, product_id=product.id)[0]['id'] == svc.id
    assert sm.service_history_for(db, lead_id='lead-1')[0]['lead_label'].startswith('Acme Water')
    assert sm.service_history_for(db, lead_id='other') == []
    summary = sm.product_summary(db, product)
    assert summary['repair_count'] == 1 and summary['warranty_status'] == 'Unknown'


def test_product_registration_validation(db):
    make_product(db, serial='SER-0001')
    with pytest.raises(ServiceError):
        make_product(db, serial='ser-0001')
    with pytest.raises(ServiceError):
        sm.register_product(db, {'customer_id': 'cust-1', 'name': 'x', 'category': 'y', 'serial_number': '!!'},
                            COORD_USER)
    with pytest.raises(ServiceError):
        sm.register_product(db, {'customer_id': 'cust-1', 'name': 'x', 'category': 'y',
                                 'warranty_start': '2026-05-01', 'warranty_end': '2026-01-01'}, COORD_USER)


def test_notifications_are_deduplicated_and_per_recipient(db):
    svc = new_install(db)
    assign(db, svc)
    sm.change_status(db, svc, 'On Hold', COORD_USER, COORD, 'x')
    assert sm.list_notifications(db, 'u-coord', 'EMP-C', COORD)['unread'] >= 1
    tech_feed = sm.list_notifications(db, 'u-tech', 'EMP-T', TECH)
    assert any(item['event'] == 'assigned' for item in tech_feed['items'])
    assert not any(item['event'] == 'created' for item in tech_feed['items'])
    before = db.query(sm.ServiceNotificationModel).count()
    sm.notify(db, svc, 'created', 'again', coordinators=True)
    db.commit()
    assert db.query(sm.ServiceNotificationModel).count() == before
    sm.mark_notifications_read(db, 'u-tech')
    assert sm.list_notifications(db, 'u-tech', 'EMP-T', TECH)['unread'] == 0
    assert sm.list_notifications(db, 'u-coord', 'EMP-C', COORD)['unread'] >= 1


def test_due_alerts_for_overdue_requests_and_vendor_returns(db):
    svc = new_install(db, planned_date='2020-01-01', expected_completion='2020-01-05')
    assert sm.generate_due_alerts(db) >= 1
    assert sm.generate_due_alerts(db) == 0
    repair = vendor_ready_service(db)
    sm.create_vendor_repair(db, repair, {'expected_return_date': '2020-02-01', 'dispatch_date': '2020-01-10'},
                            COORD_USER, COORD)
    assert sm.generate_due_alerts(db) >= 1
    events = {n.event for n in db.query(sm.ServiceNotificationModel).all()}
    assert {'overdue', 'vendor_overdue'} <= events


def test_config_defaults_and_validation(db):
    cfg = sm.get_config(db)
    assert 'Electrical Problem' in cfg['problem_categories'] and cfg['amc_required']
    updated = sm.save_config(db, {'problem_categories': ['Leak', 'Leak', 'Noise'], 'amc_required': False,
                                  'mandatory_evidence': {'amc': ['Site Inspection Photos']}}, MANAGER_USER)
    assert updated['problem_categories'] == ['Leak', 'Noise'] and updated['amc_required'] is False
    assert updated['mandatory_evidence']['amc'] == ['Site Inspection Photos']
    with pytest.raises(ServiceError):
        sm.save_config(db, {'problem_categories': []}, MANAGER_USER)
    with pytest.raises(ServiceError):
        sm.save_config(db, {'mandatory_evidence': {'amc': ['Not a category']}}, MANAGER_USER)
    with pytest.raises(ServiceError):
        sm.save_config(db, {'ack_required_types': ['Made Up']}, MANAGER_USER)


def test_configured_mandatory_evidence_blocks_completion(db):
    sm.save_config(db, {'mandatory_evidence': {'installation': ['Final Site Condition']}}, MANAGER_USER)
    svc = new_install(db)
    assign(db, svc)
    finish_installation_work(db, svc)
    with pytest.raises(ServiceError) as exc:
        sm.submit_report(db, svc, TECH_USER, TECH)
    assert 'Final Site Condition' in ' '.join(exc.value.detail)
    add_evidence(db, svc, 'Final Site Condition')
    sm.submit_report(db, svc, TECH_USER, TECH)

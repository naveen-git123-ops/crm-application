"""Sanity-check Requirement Analysis completeness + legacy payload migration."""
import importlib.util
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Import server.py functions without booting the app/DB by exec'ing only what we need
# is not practical (module-level DB work), so re-implement the import via a stub check:
src = (ROOT / 'server.py').read_text(encoding='utf-8')

ns = {'List': list, 'Dict': dict}
# Pull out the helper block we care about.
start = src.index("PRODUCT_CATEGORY_OTHER = 'Other'")
end = src.index('# Site-visit Telegram: morning notice')
block = src[start:end]
exec(compile(block, 'oa_helpers', 'exec'), ns)  # noqa: S102 - local test harness

complete = ns['_opportunity_assessment_complete']
assignees = ns['_site_visit_assignees']
others = ns['_site_visit_other_people']

base = {
    'business_category': 'Project',
    'product_categories': ['Pumps'],
    'technical_datas_required': True,
    'expected_enquiry_closing_date': '2026-09-01',
}

# 1. No site visit -> complete
oa = {**base, 'site_visit_required': False}
assert complete({'opportunity_assessment': oa}) is True, 'no-site-visit should pass'

# 2. Other category needs custom text
oa = {**base, 'product_categories': ['Pumps', 'Other'], 'site_visit_required': False}
assert complete({'opportunity_assessment': oa}) is False, 'Other needs text'
oa['product_category_other'] = 'Custom skid'
assert complete({'opportunity_assessment': oa}) is True, 'Other with text passes'

# 3. Site visit yes, missing status -> incomplete
oa = {
    **base,
    'site_visit_required': True,
    'site_visit_date': '2026-08-25',
    'site_visit_assignees': [{'employee_id': 'EMP0018', 'name': 'Pritam'}],
}
assert complete({'opportunity_assessment': oa}) is False, 'status required'

oa['site_visit_status'] = 'pending'
assert complete({'opportunity_assessment': oa}) is True, 'pending passes'

# 4. Done requires the full report
oa['site_visit_status'] = 'done'
assert complete({'opportunity_assessment': oa}) is False, 'done needs report'
oa.update({
    'site_visit_photos': [{'id': 'a1', 'file_url': 'u'}],
    'technical_discussions': 'Discussed pump head',
    'technical_datasheet_drawing': [{'id': 'a2', 'file_url': 'u'}],
    'existing_equipment_details': 'Old KSB pump',
    'process_parameters': '50 m3/h at 4 bar',
    'minutes_of_meeting': 'Agreed on scope',
    'customer_signature': {'id': 's1', 'file_url': 'u'},
    'engineer_signature': {'id': 's2', 'file_url': 'u'},
})
assert complete({'opportunity_assessment': oa}) is True, 'done with report passes'

# 5. Legacy single-assignee payload migrates
legacy = {
    **base,
    'site_visit_required': True,
    'site_visit_date': '2026-08-25',
    'site_visit_assignee_employee_id': 'EMP0005',
    'site_visit_assignee_name': 'Subhashree',
    'site_visit_status': 'pending',
}
assert assignees(legacy) == [{'employee_id': 'EMP0005', 'name': 'Subhashree'}], assignees(legacy)
assert complete({'opportunity_assessment': legacy}) is True, 'legacy employee payload passes'

# 6. Legacy "other" payload migrates into site_visit_others
legacy_other = {
    **base,
    'site_visit_required': True,
    'site_visit_date': '2026-08-25',
    'site_visit_assignee_employee_id': 'other',
    'site_visit_status': 'pending',
    'site_visit_other': {
        'name': 'Ravi',
        'mobile': '9999999999',
        'email': 'ravi@x.com',
        'address': 'Bhubaneswar',
        'id_proof': {'id': 'p1', 'file_url': 'u'},
    },
}
assert assignees(legacy_other) == [], 'other is not an employee assignee'
assert len(others(legacy_other)) == 1, others(legacy_other)
assert complete({'opportunity_assessment': legacy_other}) is True, 'legacy other payload passes'

# 7. Incomplete other person blocks
bad_other = {
    **base,
    'site_visit_required': True,
    'site_visit_date': '2026-08-25',
    'site_visit_status': 'pending',
    'site_visit_others': [{'name': 'Ravi'}],
}
assert complete({'opportunity_assessment': bad_other}) is False, 'incomplete other blocks'

print('All Requirement Analysis backend checks passed')

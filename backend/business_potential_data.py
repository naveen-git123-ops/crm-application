"""Import and normalize Business Potential Excel dumps (Bhuneer / NOCAP)."""
from __future__ import annotations

import math
import re
import uuid
from datetime import datetime, date
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent / 'data' / 'business_potential'

SOURCE_FILES = (
    {
        'key': 'bhuneer_renewal',
        'label': 'Bhuneer one-time renewal',
        'filename': 'bhuneer_one_time_renewal.xlsx',
    },
    {
        'key': 'nocap_new',
        'label': 'NOCAP new',
        'filename': 'nocap_new.xlsx',
    },
    {
        'key': 'nocap_old',
        'label': 'NOCAP old',
        'filename': 'nocap_old.xlsx',
    },
)

HEADER_ALIASES = {
    'application code': 'application_code',
    'application type': 'application_type',
    'applicationnumber': 'application_number',
    'application number': 'application_number',
    'application status': 'application_status',
    'msme': 'msme',
    'relaxation': 'relaxation',
    'project name': 'project_name',
    'geology': 'geology',
    'application category description': 'category_description',
    'ground water utilisation for': 'gw_utilisation_for',
    'proposed state name': 'state_name',
    'proposed district name': 'district_name',
    'proposed sub-district name': 'sub_district_name',
    'proposed sub district name': 'sub_district_name',
    'proposed village name': 'village_name',
    'proposed address': 'proposed_address',
    'communication address': 'communication_address',
    'renewal apply sub district area type categoty desc': 'renewal_apply_area_type',
    'first apply sub district area type categoty desc': 'first_apply_area_type',
    'present sub district area type categoty desc': 'present_area_type',
    'apply sub district area type categoty desc': 'apply_area_type',
    'eligible for exemption letter': 'eligible_exemption',
    'net ground water requirement(m3/day)': 'net_gw_requirement',
    'net ground water requirement(m<sup>3</sup>/day)': 'net_gw_requirement',
    'issued letter type name': 'issued_letter_type',
    'latitude': 'latitude',
    'longitude': 'longitude',
    'validity start date': 'validity_start',
    'validity end date': 'validity_end',
    'noc number': 'noc_number',
    'application created date': 'application_created_date',
    'application submitted date': 'application_submitted_date',
    'application approved date': 'application_approved_date',
    'date of commencement': 'date_of_commencement',
    'date of expansion of project': 'date_of_expansion',
}


def _norm_header(value) -> str:
    text = str(value or '')
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('\n', ' ')
    text = re.sub(r'\s+', ' ', text).strip().lower()
    text = text.replace('appllication', 'application')
    return text


def _clean_text(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value).strip() or None
    text = str(value).replace('\xa0', ' ')
    text = re.sub(r'[\r\n]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if not text or text.lower() in {'nan', 'nat', 'none', 'null'}:
        return None
    return text


_LABELED_COMM_RE = re.compile(r'(Email|Contact|Phone|Mobile)\s*:\s*([^,]*)', re.I)
_EMAIL_FALLBACK_RE = re.compile(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}')


def parse_communication_contacts(address: str | None) -> tuple[str | None, str | None]:
    """Pull Email and Contact out of the Communication Address blob."""
    text = str(address or '').strip()
    if not text:
        return None, None
    email = None
    contact = None
    for label, value in _LABELED_COMM_RE.findall(text):
        value = re.sub(r'\s+', ' ', value).strip()
        if not value:
            continue
        key = label.lower()
        if key == 'email':
            email = value
        elif key in {'contact', 'phone', 'mobile'} and not contact:
            contact = value
    if not email:
        found = _EMAIL_FALLBACK_RE.search(text)
        if found:
            email = found.group(0)
    return email or None, contact or None


def _map_row(raw_row: dict, source: dict, sheet_name: str) -> dict:
    mapped = {
        'id': str(uuid.uuid4()),
        'source_key': source['key'],
        'source_label': source['label'],
        'source_file': source['filename'],
        'source_sheet': sheet_name,
    }
    for raw_key, raw_val in raw_row.items():
        field = HEADER_ALIASES.get(_norm_header(raw_key))
        if not field:
            continue
        mapped[field] = _clean_text(raw_val)
    email, contact = parse_communication_contacts(mapped.get('communication_address'))
    mapped['contact_email'] = email
    mapped['contact_phone'] = contact
    return mapped


def iter_excel_rows(data_dir: Path | None = None):
    root = Path(data_dir or DATA_DIR)
    for source in SOURCE_FILES:
        path = root / source['filename']
        if not path.exists():
            print(f'Business potential file missing: {path}')
            continue
        xl = pd.ExcelFile(path)
        for sheet in xl.sheet_names:
            if str(sheet).strip().lower() in {'sheet1', ''}:
                continue
            df = pd.read_excel(path, sheet_name=sheet)
            if df.empty:
                continue
            for rec in df.to_dict(orient='records'):
                row = _map_row(rec, source, str(sheet))
                if not any([
                    row.get('application_code'),
                    row.get('application_number'),
                    row.get('project_name'),
                    row.get('noc_number'),
                ]):
                    continue
                yield row


def import_business_potential_records(db, model_cls, replace: bool = False, data_dir: Path | None = None) -> dict:
    existing = db.query(model_cls).count()
    if existing and not replace:
        return {'imported': 0, 'skipped': existing, 'replaced': False}

    if replace and existing:
        db.query(model_cls).delete()
        db.commit()

    imported = 0
    batch = []
    for row in iter_excel_rows(data_dir):
        batch.append(model_cls(**row))
        if len(batch) >= 250:
            db.add_all(batch)
            db.commit()
            imported += len(batch)
            batch = []
    if batch:
        db.add_all(batch)
        db.commit()
        imported += len(batch)
    return {'imported': imported, 'skipped': 0, 'replaced': bool(replace and existing)}

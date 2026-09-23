# -*- coding: utf-8 -*-
"""Build data/real_people.json from the live ADMISSIONS DATABASE export.

Nothing is invented. Where the sheet has no value the field stays empty, and the
original wording of a status is kept in `originalStatus` so the mapping is
reversible and visible. Consent is never assumed: the sheet records none, so the
prototype shows none for these people.
"""
import base64, io, json, os, re, sys, unicodedata
from datetime import datetime

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1]
XLSX = os.path.join(HERE, 'data', '_admissions.xlsx')
OUT = os.path.join(HERE, 'data', 'real_people.json')
os.makedirs(os.path.join(HERE, 'data'), exist_ok=True)

blob = json.load(io.open(SRC, encoding='utf-8'))
open(XLSX, 'wb').write(base64.b64decode(blob['content']))
wb = openpyxl.load_workbook(XLSX, data_only=True)


def rows(sheet):
    ws = wb[sheet]
    rr = [r for r in ws.iter_rows(values_only=True)]
    hdr = [str(c).strip() if c else ('_%d' % i) for i, c in enumerate(rr[0])]
    return [dict(zip(hdr, r)) for r in rr[1:] if any(c not in (None, '') for c in r)]


def s(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    t = str(v).strip()
    return t or None


def iso(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return None


def norm_phone(v):
    if v is None:
        return None
    t = re.sub(r'[^\d+]', '', str(v).split('.')[0])
    if not t:
        return None
    if not t.startswith('+'):
        if len(t) == 8:
            t = '+371' + t
        elif t.startswith('371') and len(t) == 11:
            t = '+' + t
        else:
            t = '+' + t
    return t if len(re.sub(r'\D', '', t)) >= 7 else None


def norm_email(v):
    if not v:
        return None
    t = str(v).strip().lower()
    return t if re.match(r'^[^@\s]+@[^@\s]+\.[a-z]{2,}$', t) else None


SOURCE = {'call': 'phone', 'email': 'email', 'on-site': 'klatiene', 'website': 'website',
          'instagram': 'instagram', 'facebook': 'facebook', 'whatsapp': 'whatsapp',
          'campaign': 'campaign', 'vinu': 'other', 'vidusskola': 'school'}


def stage(status, docs):
    """Their words to our provisional stages. The original text is kept."""
    st = (status or '').strip().upper()
    dc = (docs or '').strip().lower()
    if st.startswith('REJECT'):
        return 'Not proceeding'
    if dc == 'done':
        return 'Application'
    if st.startswith('HOT'):
        return 'Application' if dc == 'in process' else 'Follow-up'
    if st.startswith('WARM'):
        return 'Follow-up'
    if st.startswith('COLD'):
        return 'Contacted'
    return 'New'


people = []
seen = {}


def add(rec):
    key = (rec.get('email') or '').lower() or rec.get('phone') or unicodedata.normalize('NFKD', (rec.get('name') or '')).lower()
    if not key:
        return
    if key in seen:            # the same person in two tabs: keep the furthest along
        old = seen[key]
        order = ['New', 'Contacted', 'Follow-up', 'Application', 'Contract', 'Admitted', 'Not proceeding']
        if order.index(rec['status']) > order.index(old['status']):
            old.update({k: v for k, v in rec.items() if v})
        return
    seen[key] = rec
    people.append(rec)


for tab, kind in [('NAVENG ADMISSIONS', 'lead'), ('OSMTM ADMISSIONS', 'lead')]:
    for r in rows(tab):
        name = s(r.get('Lead Name Surname'))
        if not name:
            continue
        add({
            'name': name,
            'email': norm_email(s(r.get('Lead Email'))),
            'phone': norm_phone(r.get('Lead Phone')),
            'programme': s(r.get('Study Program')),
            'education': s(r.get('Education')),
            'status': stage(s(r.get('Status')), s(r.get('Docs'))),
            'originalStatus': s(r.get('Status')),
            'docs': s(r.get('Docs')),
            'source_channel': SOURCE.get((s(r.get('Source')) or '').lower(), (s(r.get('Source')) or 'unknown').lower()),
            'source_campaign': None,
            'source_detail': s(r.get('Source')),
            'created_at': iso(r.get('First contact')),
            'next_action_at': iso(r.get('Next action date')),
            'notes': s(r.get('Notes')),
            'from_tab': tab,
        })

for tab in ['NAVENG ADMITTED STUDENTS', 'OSMTM ADMITTED STUDENTS']:
    for r in rows(tab):
        name = s(r.get('Name, Surname'))
        if not name:
            continue
        add({
            'name': name,
            'email': None,          # the student tabs have no email column at all
            'phone': None,          # and no phone column
            'programme': s(r.get('Study program')),
            'education': s(r.get('Education')),
            'status': 'Admitted',
            'originalStatus': 'ADMITTED STUDENT',
            'docs': None,
            'source_channel': SOURCE.get((s(r.get('Source')) or '').lower(), (s(r.get('Source')) or 'unknown').lower()),
            'source_campaign': None,
            'source_detail': s(r.get('Source')),
            'created_at': iso(r.get('1st contact')) or iso(r.get('1st contract')),
            'admitted_at': iso(r.get('Date')),
            'student_no': s(r.get('Imatrikulācijas Nr.')),
            'study_form': s(r.get('Study form')),
            'notes': None,
            'from_tab': tab,
        })

out = {
    'source': 'ADMISSIONS DATABASE, Google Sheets, exported ' + datetime.now().strftime('%Y-%m-%d %H:%M'),
    'note': 'Real applicant data. Local only: this file is git-ignored and the prototype never sends it anywhere.',
    'count': len(people),
    'people': people,
}
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(out, ensure_ascii=False, indent=1))
os.remove(XLSX)

by_status = {}
for p in people:
    by_status[p['status']] = by_status.get(p['status'], 0) + 1
print('people:', len(people))
print('by stage:', by_status)
print('with email:', sum(1 for p in people if p['email']), '| with phone:', sum(1 for p in people if p['phone']))
print('written to', OUT)

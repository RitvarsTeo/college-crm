// EVERY REPORTS FIGURE COUNTS PEOPLE, EACH IN ONE PLACE (the owner's rule "everyone accounted for", the pick (2) 11.11.2026):
// a person with two records (the Admissions sheet's and the SIS's) is one person in Leads, every breakdown, the maritime
// count, the coverage and Conversion, under the values of their EARLIEST record - a real value beats "(not recorded)" -
// so every breakdown's rows add up exactly to the total, Reports' totals equal Home's, and the page's model counts what
// the server counts. Synthetic people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { report } = await import('../src/reports.js');
const { mergedPeople } = await import('../src/realpeople.js');
const { localDate } = await import('../src/bizday.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const FNX = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const BLOCK = APP.slice(APP.indexOf('// ---------------------------------------------------- FULL REPORT, ONE LEVEL DEEPER (Q35)'),
  APP.indexOf('// apply.novikontas.org, from the SIS'));
const Y = Number(localDate().slice(0, 4));
const at = (m, d = 1) => `${Y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T09:00:00.000Z`;

function model(r, people) {
  const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
  const ctx = {
    CFG, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: {}, C_JP: { col: null },
    esc: (s) => String(s ?? ''), cDay: (iso) => (iso ? riga.format(new Date(iso)) : ''),
    cStage: (id) => id || '', cChannel: (c) => [c || 'Not recorded', ''], cSheetNotice: () => '', cTodayIso: () => localDate(),
    cScopeWord: () => String(Y), cScopeDates: () => [Y + '-01-01', ''], cScopeList: () => [Y], cScopeAllYears: () => [Y], cNowYear: () => Y,
    C_SCOPE_YEARS: [], C_MONTHS_LONG: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), line('const cPersonName ='), FNX('function cOnePerPerson('),
    FNX('function cAdmittedOnce('), BLOCK, 'this.X = { cRepModel, once: cAdmittedOnce };'].join('\n'), ctx);
  return { M: ctx.X.cRepModel(r, people, CFG, localDate()), adm: ctx.X.once(people) };
}

async function seeded() {
  const db = await openDb(':memory:');
  const add = (id, name, status, created, extra = {}) => db.prepare(`INSERT INTO people (id, name, email, phone, status, created_at, admitted_at,
    programme, source_channel, education, nationality, study_form) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, name, extra.email || null, extra.phone || null,
    status, created, extra.adm || null, extra.programme ?? null, extra.source ?? null, extra.education ?? null, extra.nationality ?? null, extra.form ?? null);
  // one student, two records: the sheet's (earliest, NAV, no channel) and the SIS's (MT OS, by the SIS, maritime school, a phone)
  await add('s1', 'Gundega Paraudziņa (atsāk studijas)', 'Admitted', at(1), { adm: at(1, 20), programme: 'NAV' });
  await add('s2', 'Gundega Paraudziņa', 'Admitted', at(2), { adm: at(2, 5), programme: 'MT OS', source: 'sis', education: 'Maritime school', nationality: 'Latvia', phone: '+371 2000 0001' });
  await add('a1', 'Anna Paraudziņa', 'Admitted', at(1, 10), { adm: at(3), programme: 'ENG', source: 'gmail', education: 'Secondary', nationality: 'Latvia' });
  await add('n1', 'Pēteris Paraugs', 'New', at(2, 2), { programme: 'NAV', source: 'phone' });
  await add('f1', 'Laura Paraudziņa', 'Follow-up', at(1, 3), { programme: 'MT OS', source: 'gmail', form: 'Full time' });
  await add('x1', 'Toms Paraugs', 'Not proceeding', at(1, 4), { programme: 'ENG', source: 'website', education: 'Maritime school' });
  return db;
}

test('the server: one person, one place: every breakdown adds up to Leads; maritime, coverage and Conversion in people', async () => {
  const db = await seeded();
  const r = await report(db, { years: [Y] });
  const s = r.summary;
  assert.equal(s.newLeads, 5, '6 records, 5 people');
  for (const [k, rows] of Object.entries(r.breakdowns).filter(([k]) => k !== 'stage'))
    assert.equal(rows.reduce((a, x) => a + x.count, 0), s.newLeads, k + ' adds up to Leads');
  const by = (k) => Object.fromEntries(r.breakdowns[k].map((x) => [x.value, x.count]));
  assert.deepEqual(by('programme'), { NAV: 2, ENG: 2, 'MT OS': 1 }, 'the student under the earliest record: NAV');
  assert.equal(by('source').sis, 1, 'a missing channel takes the real one');
  assert.equal(s.maritimeGraduates, 2);
  assert.equal(r.coverage.education.filled, 3);
  assert.equal(r.coverage.nationality.filled, 2);
  assert.ok(s.conversionB >= s.conversionA && s.conversionB <= 5, 'Conversion counts people');
  assert.equal(r.programmes.find((x) => x.programme === 'NAV').admitted, 1, 'admitted by programme: the student once, NAV');
  assert.equal(r.programmes.find((x) => x.programme === 'MT OS').admitted, 0);
  const m = mergedPeople([{ id: 'a', name: 'X Y', created_at: '2026-01-01', programme: null }, { id: 'b', name: 'X Y', created_at: '2026-02-01', programme: 'NAV' }]);
  assert.equal(m.length, 1); assert.equal(m[0].id, 'a'); assert.equal(m[0].programme, 'NAV');
});

test('the page counts what the server counts, and Reports\' totals equal Home\'s', async () => {
  const db = await seeded();
  const r = await report(db, { years: [Y] });
  const people = await db.prepare('SELECT * FROM people').all();
  const { M, adm } = model(r, people);
  const s = r.summary;
  assert.equal(M.leads.all.n, s.newLeads, 'Leads = Home\'s Leads (the server figure)');
  assert.equal(M.admitted.all.n, Array.from(adm).filter((p) => String(p.admitted_at || '').startsWith(String(Y))).length, 'Admitted = Home\'s list');
  assert.equal(M.conversion.base.n, s.conversionB, 'Conversion b'); assert.equal(M.conversion.won.n, s.conversionA, 'Conversion a');
  assert.equal(M.leads.maritime.n, s.maritimeGraduates);
  assert.equal(M.leads.eduRecorded.n, r.coverage.education.filled);
  const byValue = (rows) => Object.fromEntries(rows.filter((x) => x.n).map((x) => [x.value, x.n]));
  for (const [mine, theirs] of [['byChannel', 'source'], ['byProgramme', 'programme'], ['byStudyForm', 'studyForm'], ['byEducation', 'education'], ['byNationality', 'nationality']]) {
    assert.deepEqual(byValue(M.leads[mine]), Object.fromEntries(r.breakdowns[theirs].map((x) => [x.value, x.count])), mine);
    assert.equal(M.leads[mine].reduce((a, x) => a + x.n, 0), M.leads.all.n, mine + ' adds up to Leads');
    for (const x of M.leads[mine].filter((z) => z.n)) assert.equal(new Set(M.coh[x.k].ids).size, x.n, mine + ' ' + x.value + ': its list holds its count');
  }
});

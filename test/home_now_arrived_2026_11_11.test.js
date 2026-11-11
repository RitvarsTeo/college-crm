// WHERE EVERYONE IS NOW = ARRIVED, IN PEOPLE (the owner's pick A, 11.11.2026, "everyone accounted for"): the people who
// arrived in the period, split Open / Admitted / Not proceeding; the slices add up to Arrived (Home's Leads, the Journey's
// Arrived), each opens exactly its people, and two records of one person count once. Synthetic people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { report } = await import('../src/reports.js');
const { arrivedByPlace, countPeople } = await import('../src/realpeople.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

async function seeded() {
  const db = await openDb(':memory:');
  const add = (id, name, status, created, extra = {}) => db.prepare(`INSERT INTO people (id, name, email, phone, status, created_at, admitted_at)
    VALUES (?,?,?,?,?,?,?)`).run(id, name, extra.email || null, extra.phone || null, status, created, status === 'Admitted' ? (extra.adm || created) : null);
  await add('o1', 'Anna Paraudziņa', 'New', '2026-03-01T09:00:00Z');
  await add('o2', 'Pēteris Paraugs', 'Follow-up', '2026-04-01T09:00:00Z');
  await add('a1', 'Gundega Paraudziņa (atsāk studijas)', 'Admitted', '2026-05-01T09:00:00Z');                     // the sheet's record
  await add('a2', 'Gundega Paraudziņa', 'Admitted', '2026-05-02T09:00:00Z', { email: 'g@example.com' });          // the SIS's: one person
  await add('a3', 'Laura Paraudziņa', 'Admitted', '2026-02-01T09:00:00Z', { adm: '2027-01-10T09:00:00Z' });       // arrived 2026, admitted later
  await add('x1', 'Toms Paraugs', 'Not proceeding', '2026-06-01T09:00:00Z');
  await add('x2', 'Ilze Paraudziņa', 'Not proceeding', '2026-06-02T09:00:00Z', { phone: '+371 2000 0009' });
  await add('x3', 'Ilze Paraudziņa', 'New', '2026-09-02T09:00:00Z');                                               // came back: open
  await add('old', 'Vecs Paraugs', 'Admitted', '2025-06-01T09:00:00Z', { adm: '2026-01-15T09:00:00Z' });          // admitted 2026, arrived 2025
  await add('t1', 'Test Paraugs', 'New', '2026-03-03T09:00:00Z');                                                  // a test record
  return db;
}

test('the server: Arrived counts people, and its split adds up to it; a person is where their furthest record is', async () => {
  const db = await seeded();
  const r = await report(db, { from: '2026-01-01', to: '2026-12-31' });
  const a = r.summary.arrived;
  assert.deepEqual({ open: [...a.open].sort(), admitted: [...a.admitted].sort(), closed: [...a.closed].sort() },
    { open: ['o1', 'o2', 'x3'].sort(), admitted: ['a1', 'a3'], closed: ['x1'] }, 'Ilze came back: open; Gundega once; the 2025 arrival is not here');
  assert.equal(r.summary.newLeads, a.open.length + a.admitted.length + a.closed.length, 'the slices add up to Arrived');
  assert.equal(r.summary.newLeads, 6, '8 records who arrived in 2026, 6 people (the test record is in nothing)');
  const rows = [{ id: 'a', name: 'X Y', status: 'Admitted' }, { id: 'b', name: 'X Y', status: 'New' }];
  assert.deepEqual(arrivedByPlace(rows), { open: [], admitted: ['a'], closed: [] });
  assert.equal(countPeople(rows), 1);
});

test('Home: three slices from the server\'s split, each a list of exactly its people; nothing drawn when the read failed', () => {
  let drawn = null;
  const ctx = { C_REP_COH: {}, cScopeWord: () => '2026', cDonut: (rows, opts) => { drawn = { rows, opts }; return '<donut>'; } };
  vm.runInNewContext(fn('function cHomeNow(D) {') + '\nthis.now = cHomeNow; this.coh = () => C_REP_COH;', ctx);
  const arrived = { open: ['o1', 'o2', 'x2'], admitted: ['a1', 'a3'], closed: ['x1'] };
  assert.equal(ctx.now({ s: { arrived, newLeads: 6 } }), '<donut>');
  const rows = JSON.parse(JSON.stringify(drawn.rows));
  assert.deepEqual(rows, [['Open', 3, 'open', 'now_open'], ['Admitted', 2, 'adm', 'now_adm'], ['Not proceeding', 1, 'np', 'now_np']]);
  assert.equal(rows.reduce((n, r) => n + r[1], 0), 6, 'the slices add up to Arrived');
  assert.equal(drawn.opts.kgo('now_adm'), 'cohort|now_adm', 'a slice opens its own list');
  const coh = JSON.parse(JSON.stringify(ctx.coh()));
  for (const [label, n, , k] of rows) assert.equal(coh[k].ids.length, n, label + ': its list holds exactly its count');
  assert.equal(coh.now_adm.label, 'Arrived 2026 · Admitted');
  assert.equal(ctx.now({ s: {} }), '', 'no split from the server: no donut, never a figure from elsewhere');
  assert.match(APP, /<h2>Where everyone is now<\/h2><span class="ksrc">click a slice<\/span><\/div>\$\{cHomeNow\(D\)\}/);
});

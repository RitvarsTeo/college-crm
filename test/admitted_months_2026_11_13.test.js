// ADMITTED BY MONTH = THE ADMITTED CARD (13.11.2026, "every figure has legs", on the admissions team's question about
// Home's "Admissions by month"): the month column counts exactly the card's people - at the Admitted stage, each once, in
// the month of their first admission - so the months add up to the card minus its clickable "N without a date". Somebody
// with an admission date at another stage is in neither. Synthetic people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { report } = await import('../src/reports.js');
const { localDate } = await import('../src/bizday.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };
const Y = Number(localDate().slice(0, 4));
const at = (m, d = 10) => `${Y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T09:00:00.000Z`;

test('the months count the Admitted card\'s people: each once, first admission, Admitted stage only', async () => {
  const db = await openDb(':memory:');
  const add = (id, name, status, adm, extra = {}) => db.prepare(`INSERT INTO people (id, name, email, phone, status, created_at, admitted_at)
    VALUES (?,?,?,?,?,?,?)`).run(id, name, extra.email || null, null, status, at(1, 2), adm);
  await add('a1', 'Anna Paraudziņa', 'Admitted', at(1));
  await add('a2', 'Pēteris Paraugs', 'Admitted', at(2));
  await add('g1', 'Gundega Paraudziņa (atsāk studijas)', 'Admitted', at(2, 20));     // one student, two records
  await add('g2', 'Gundega Paraudziņa', 'Admitted', at(3), { email: 'g@example.com' });  // admitted again in March: still once, February
  await add('u1', 'Undīne Paraudziņa', 'Admitted', null);                              // no admission date: the card's clickable part
  await add('f1', 'Viktors Paraugs', 'Follow-up', at(3));                             // a date, another stage: in neither
  const r = await report(db, { years: [Y] });
  const months = Object.fromEntries(r.trend.filter((m) => m.month.startsWith(String(Y)) && m.admitted).map((m) => [m.month.slice(5), m.admitted]));
  assert.deepEqual(months, { '01': 1, '02': 2 }, 'Anna in January; Pēteris and the student (first admission) in February');
  assert.equal(r.summary.admitted, 3, 'the server card: the Admitted stage, people');
  // the page's card, from the same rows
  const ctx = {};
  vm.runInNewContext([line('const cPersonName ='), fn('function cOnePerPerson('), fn('function cAdmittedOnce('), 'this.once = cAdmittedOnce;'].join('\n'), ctx);
  const people = await db.prepare('SELECT * FROM people').all();
  const card = Array.from(ctx.once(people));
  const dated = card.filter((p) => p.admitted_at);
  assert.equal(card.length, 4, 'the card: 3 dated + 1 without a date');
  assert.equal(Object.values(months).reduce((a, b) => a + b, 0), dated.length, 'the months add up to the card minus its "without a date"');
  assert.equal(card.find((p) => p.name.startsWith('Gundega')).id, 'g1', 'the student sits at their first admission');
  assert.ok(!card.some((p) => p.id === 'f1'));
});

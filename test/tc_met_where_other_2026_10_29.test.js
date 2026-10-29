// SOMEONE I MET, OTHER (29.10.2026): the owner, "add option to write in manually where when clicked other". Invented data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Other with a written place: the history line says where', async () => {
  const db = await openDb();
  const r = await tc.quickAdd(db, { newCompany: 'Example Shipping', name: 'Anna Example', where: 'Posidonia 2026, Athens' }, 'Ritvars');
  const a = await db.prepare('SELECT body FROM tc_activities WHERE company_id = ?').all(r.companyId);
  assert.ok(a.some((x) => x.body === 'Met Anna Example at Posidonia 2026, Athens.'));
  const r2 = await tc.quickAdd(db, { newCompany: 'Sample Offshore', name: 'Olga Sample' }, 'Ritvars');
  assert.ok((await db.prepare('SELECT body FROM tc_activities WHERE company_id = ?').all(r2.companyId)).some((x) => x.body === 'Met Olga Sample.'));
});

test('the drawer: a box under the chips, shown only on Other, sent only with Other', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /Other<\/button><\/div><input id="tcm_where" autocomplete="off" maxlength="200" placeholder="Write where we met"/);
  assert.match(app, /w\.hidden = id !== null;/);
  assert.match(app, /where: T_MET\.eventId \? '' : v\('where'\)/);
});

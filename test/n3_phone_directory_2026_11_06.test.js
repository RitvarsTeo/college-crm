// THE N3 PHONE DIRECTORY (the owner's yes, 06.11.2026; Marina: seafarers in N3 call about their sons and daughters).
// An admin replaces the whole directory; a caller whose number is in it, and whom Intake does not hold, is "Known in N3:
// <name>" on the call pop-up, the Inbox call card and the person page. Nothing reads the directory out. Synthetic only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './security_helpers.js';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { replaceN3Directory, n3Status, n3Names } = await import('../src/n3dir.js');
const { whoIsCalling, noteFor } = await import('../src/callpop.js');
const { receive, listInbound } = await import('../src/intake.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const ROWS = [
  ['N3-1001', 'Jānis', 'Paraudziņš', '+371 2900 1001', '+371 6700 1001'],
  { id: 'N3-1002', first: 'Inese', last: 'Paraudziņa', phones: ['29001001'] },     // the same family number
  ['N3-1003', 'Pēteris', 'Kalniņš', '29001003'],
  ['N3-1004', 'Bez', 'Numura', ''],                                                  // no number: left out
  ['', 'Bez', 'Id', '29001005'],                                                     // no id: left out
];

test('replace-all: only id, names and the last 8 digits; a row without an id or a number is left out', async () => {
  const db = await openDb(':memory:');
  const r = await replaceN3Directory(db, ROWS, { by: 'Ritvars', now: new Date('2026-11-06T09:00:00Z') });
  assert.deepEqual(r, { people: 3, numbers: 4, skipped: 2 });
  const cols = (await db.prepare('SELECT * FROM n3_phone_directory').all()).map((x) => x.phone_tail);
  assert.deepEqual(cols.sort(), ['29001001', '29001001', '29001003', '67001001']);
  assert.deepEqual(await n3Status(db), { numbers: 4, people: 3, importedAt: '2026-11-06T09:00:00.000Z', importedBy: 'Ritvars' });
  // a second import replaces the first as a whole
  await replaceN3Directory(db, [['N3-2000', 'Anna', 'Ozola', '29002000']], { by: 'Marina' });
  assert.deepEqual(await n3Names(db, '+37129001001'), [], 'the old copy is gone');
  assert.deepEqual(await n3Names(db, '29002000'), ['Anna Ozola']);
  assert.equal((await n3Status(db)).importedBy, 'Marina');
  // an import with nothing usable leaves the directory as it was
  await assert.rejects(replaceN3Directory(db, [['', 'x', 'y', '1']]), /left as it was/);
  assert.deepEqual(await n3Names(db, '29002000'), ['Anna Ozola']);
});

test('the caller: a person or a waiting lead still wins; a new caller in N3 carries the names, two at most', async () => {
  const db = await openDb(':memory:');
  await replaceN3Directory(db, ROWS, { by: 'Ritvars' });
  await db.prepare(`INSERT INTO people (id, name, phone, status) VALUES ('p1', 'Anna Paraugs', '29001003', 'Contacted')`).run();
  const fam = await whoIsCalling(db, '+371 29001001');
  assert.equal(fam.kind, 'unknown');
  assert.deepEqual(fam.n3, ['Inese Paraudziņa', 'Jānis Paraudziņš'], 'a family number: both names');
  assert.equal(fam.last4, '1001');
  assert.equal((await whoIsCalling(db, '29001003')).kind, 'person', 'a person in Intake wins');
  assert.equal((await whoIsCalling(db, '29001003')).n3, undefined);
  assert.equal((await whoIsCalling(db, '29009999')).n3, undefined, 'not in N3: nothing added');
  assert.match(noteFor({ callId: 'c1', who: fam }).body, /Known in N3: Inese Paraudziņa, Jānis Paraudziņš/, 'the desktop notification says it too');
  // the Inbox call card of a caller Intake does not hold
  await receive(db, { channel: 'phone', externalId: 'call-n3', receivedAt: '2026-11-06T08:00:00Z', phone: '+371 6700 1001', body: 'Incoming call' });
  const card = (await listInbound(db, { state: 'new' })).find((x) => x.channel === 'phone');
  assert.deepEqual(card.knownInN3, ['Jānis Paraudziņš']);
  // a database from before the table: nobody is known, nothing breaks
  const old = await openDb(':memory:');
  await old.exec('DROP TABLE n3_phone_directory');
  assert.deepEqual(await n3Names(old, '29001001'), []);
});

test('nothing reads the directory out: one module owns it, no list, search or export', () => {
  const src = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /\.(js|html)$/.test(f));
  const touching = src.filter((f) => read('src', f).includes('n3_phone_directory')).sort();
  assert.deepEqual(touching, ['db.js', 'n3dir.js'], 'only the schema and src/n3dir.js name the table');
  const mod = read('src', 'n3dir.js');
  assert.deepEqual([...mod.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]).sort(),
    ['N3_MAX_ROWS', 'n3Names', 'n3Status', 'replaceN3Directory']);
  assert.doesNotMatch(mod, /SELECT[^`]*phone_tail[^`]*FROM n3_phone_directory(?![^`]*WHERE phone_tail = \?)/, 'a number is only ever looked up, never selected out');
  const server = read('src', 'server.js');
  assert.equal((server.match(/n3-directory/g) || []).length, 1, 'one route');
  const app = read('src', 'app.html');
  for (const where of ['cp-n3', 'ib-n3', "row('Known in N3'"]) assert.ok(app.includes(where), where);
  assert.match(app, /lines\.push\('Known in N3: '/, 'the in-page notification text');
});

let srv = null;
after(() => { if (srv) srv.child.kill(); });
test('a running copy: an admin replaces, the status shows counts only, the person page says Known in N3', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-n3-'));
  const file = path.join(dir, 'n3.db');
  const db = await openDb(file);
  await db.prepare(`INSERT INTO people (id, name, phone, status) VALUES ('kid', 'Kārlis Paraudziņš', '+371 2900 1001', 'New')`).run();
  await db.close();
  srv = await start({ CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '' });
  const call = async (p, who, b) => {
    const r = await fetch(srv.base + p, { method: b ? 'POST' : 'GET', headers: { origin: srv.base, 'content-type': 'application/json', 'x-acting-as': who },
      ...(b ? { body: JSON.stringify(b) } : {}) });
    return [r.status, await r.json()];
  };
  assert.equal((await call('/api/admin/n3-directory', 'Ritvars'))[1].numbers, 0);
  const [st, done] = await call('/api/admin/n3-directory', 'Ritvars', { rows: ROWS });
  assert.equal(st, 200);
  assert.equal(done.numbers, 4);
  const [, status] = await call('/api/admin/n3-directory', 'Ritvars');
  assert.deepEqual(Object.keys(status).sort(), ['importedAt', 'importedBy', 'numbers', 'people'], 'counts, when, who: never a name or a number');
  assert.equal(status.importedBy, 'Ritvars');
  const [, person] = await call('/api/people/kid', 'Ritvars');
  assert.deepEqual(person.knownInN3, ['Inese Paraudziņa', 'Jānis Paraudziņš'], 'the parent who called, on the child\'s record');
  assert.equal((await call('/api/admin/n3-directory', 'Ieva', { rows: ROWS }))[0], 403, 'not an admin');
  assert.equal((await call('/api/admin/n3-directory', 'Ritvars', { rows: 'x' }))[0], 400);
});

// N3'S OWN EXPORT, LOADED AS IT IS (the owner's "Load it as it is", 10.11.2026). The file has no id column and one
// "Name" column: Name, Number, Phone Number, Mobile Number. Every row gets its own key (never a phone), the full name is
// shown as it is, the numbers are Mobile Number + Phone Number + Number, and a family sharing a number keeps both
// names. The page's own code reads the file. Synthetic people only, in the export's exact shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { replaceN3Directory, n3Status, n3Names } = await import('../src/n3dir.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const between = (a, b) => { const i = APP.indexOf(a), j = APP.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return APP.slice(i, j); };

// the export's shape: comma, UTF-8, no BOM; Number = Mobile without the country code
const CSV = [
  'Name,Number,Phone Number,Mobile Number',
  'Jānis Paraudziņš,29001001,,37129001001',
  'Inese Paraudziņa,29001001,67001001,37129001001',        // the same family number, and a second phone
  'Ona Pavyzdytė,61234567,,37061234567',                   // Lithuania
  'Olena Zrazok,501234567,,380501234567',                  // Ukraine: 9 digits after the code
  'Anna Marija Paraudziņa Ozola,29001004,,37129001004',    // four words: shown whole
  'Paraugs,29001005,,37129001005',                         // one word
  'Bez Numura,,,',                                         // no number: left out
  ',29001007,,37129001007',                                // no name: left out
  'Jānis Paraudziņš,29001001,,37129001001',                // the same row twice: two rows, as the file has them
].join('\n');

function page() {
  let sent = null;
  const ctx = {
    N3_IMP: null, sent: () => sent,
    $: () => ({ textContent: '' }), viewN3: async () => {}, confirm: () => true,
    post: async (url, b) => { sent = JSON.parse(JSON.stringify({ url, ...b })); return { ok: true }; },
    tcImpXlsx: async () => { throw new Error('not here'); },
  };
  vm.runInNewContext([fn('function tcImpCsv(text) {'), 'let N3_IMP = null;', between('const N3_FIELDS = ', 'async function viewN3'),
    fn('function n3Rows() {'), APP.match(/^const n3Usable = .*$/m)[0], fn('async function n3File(input) {'), fn('async function n3Replace(btn) {'),
    'this.n3File = n3File; this.n3Replace = n3Replace; this.imp = () => N3_IMP; this.rows = n3Rows; this.usable = n3Usable;'].join('\n'), ctx);
  return ctx;
}
const fileOf = (text, name = 'people_contacts.csv') => ({ files: [{ name, size: text.length, text: async () => text }] });

test('the page reads the export: no id, Name as the full name, Mobile first, then Phone Number and Number', async () => {
  const p = page();
  await p.n3File(fileOf(CSV));
  assert.deepEqual({ ...p.imp().map }, { name: 0, phone: 3, phone2: 2, phone3: 1 }, 'no column is taken for an id');
  const rows = p.rows();
  assert.equal(rows.length, 9);
  assert.equal(rows.filter(p.usable).length, 7, '7 rows have a name and a phone number, 2 are left out');
  await p.n3Replace({ disabled: false });
  const sent = p.sent();
  assert.equal(sent.url, '/api/admin/n3-directory');
  assert.equal(sent.rows.length, 7);
  assert.deepEqual(sent.rows[0], ['', 'Jānis Paraudziņš', '', '29001001'], 'Number repeats Mobile: sent once; no id, no first/last guessing');
  assert.deepEqual(sent.rows[1], ['', 'Inese Paraudziņa', '', '29001001', '67001001']);
  assert.deepEqual(sent.rows[3], ['', 'Olena Zrazok', '', '01234567']);
  assert.ok(sent.rows.every((r) => r[0] === '' && !/\d/.test(r[1])), 'never a number where a name or an id goes');
  // the older shape still maps as before
  const q = page();
  await q.n3File(fileOf('N3 id,First name,Last name,Phone,Phone 2\nN3-1,Anna,Ozola,29001001,67001001'));
  assert.deepEqual({ ...q.imp().map }, { id: 0, first: 1, last: 2, phone: 3, phone2: 4 });
});

test('the directory takes it: one key per row, never a phone; the family keeps both names; Latvia, Lithuania, Ukraine', async () => {
  const p = page();
  await p.n3File(fileOf(CSV));
  await p.n3Replace({ disabled: false });
  const db = await openDb(':memory:');
  const r = await replaceN3Directory(db, p.sent().rows, { by: 'Ritvars', now: new Date('2026-11-10T14:00:00Z') });
  assert.deepEqual(r, { people: 7, numbers: 8, skipped: 0 }, 'people = the rows sent');
  assert.deepEqual(await n3Status(db), { numbers: 8, people: 7, importedAt: '2026-11-10T14:00:00.000Z', importedBy: 'Ritvars' });
  const keys = (await db.prepare('SELECT DISTINCT n3_id FROM n3_phone_directory').all()).map((x) => x.n3_id);
  assert.equal(keys.length, 7);
  assert.ok(keys.every((k) => /^row:\d+$/.test(k)), 'the key is the row\'s place, never its number');
  assert.deepEqual(await n3Names(db, '+371 2900 1001'), ['Inese Paraudziņa', 'Jānis Paraudziņš'], 'a family number: both names, two at most');
  assert.deepEqual(await n3Names(db, '+371 6700 1001'), ['Inese Paraudziņa'], 'the second phone');
  assert.deepEqual(await n3Names(db, '+370 612 34567'), ['Ona Pavyzdytė']);
  assert.deepEqual(await n3Names(db, '+37061234567'), ['Ona Pavyzdytė']);
  assert.deepEqual(await n3Names(db, '+380 50 123 4567'), ['Olena Zrazok']);
  assert.deepEqual(await n3Names(db, '0501234567'), ['Olena Zrazok'], 'a Ukrainian number dialled without the code');
  assert.deepEqual(await n3Names(db, '29001004'), ['Anna Marija Paraudziņa Ozola'], 'the full name, whole');
  assert.deepEqual(await n3Names(db, '37129001005'), ['Paraugs'], 'digits without a plus');
  assert.deepEqual(await n3Names(db, '29001007'), [], 'a row without a name was left out');
});

test('the server on its own: a row without an id and without a name is skipped; an N3 id is still used when there is one', async () => {
  const db = await openDb(':memory:');
  const r = await replaceN3Directory(db, [['', '', '', '29001001'], ['N3-9', 'Anna', 'Ozola', '29001002'], { first: 'Ilze Paraudziņa', phones: ['37129001003'] }]);
  assert.deepEqual(r, { people: 2, numbers: 2, skipped: 1 });
  assert.deepEqual((await db.prepare('SELECT n3_id FROM n3_phone_directory ORDER BY n3_id').all()).map((x) => x.n3_id), ['N3-9', 'row:3']);
  await assert.rejects(replaceN3Directory(db, [['', '', '', '29001001']]), /No row has a name and a phone number/);
  assert.equal((await n3Status(db)).people, 2, 'left as it was');
});

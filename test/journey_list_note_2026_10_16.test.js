// JOURNEY -> LIST SHOWS THE LATEST NOTE (the owner, 16.10.2026, after Admissions: "notes do not show, but I think I
// marked them"). Under each List row, one quiet line: the newest of a note or call somebody wrote (History), the
// person's Notes field (dated by its last edit) and a call's "What was it about?", with who and the day. Picked on
// the server in the List's own query (src/listnote.js), escaped and cut to one line on the page; no note, no line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { LIST_NOTE_COLS, LIST_NOTE_JOINS, pickListNote } from '../src/listnote.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

async function db0() {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, status, created_at) VALUES ('a', 'A', 'Contacted', '2026-10-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO people (id, name, status, created_at) VALUES ('b', 'B', 'Contacted', '2026-10-01T00:00:00Z')`).run();
  return db;
}
const ev = (db, o) => db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, subject, body, actor, origin, field, old_value, new_value)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(o.pid || 'a', o.kind || 'note', 'note', o.at, o.subject || 'Note', o.body ?? null, o.actor || 'Ieva',
  o.origin || 'manual', o.field || null, null, o.newValue || null);
const notesField = async (db, text, at, actor = 'Laura') => {
  await db.prepare("UPDATE people SET notes = ? WHERE id = 'a'").run(text);
  await ev(db, { kind: 'edit', subject: 'Notes changed', body: '(empty) -> ' + text, at, actor, field: 'notes', newValue: text });
};
const callNote = (db, note, at, by = 'Ieva') => db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up, person_id,
  inserted_at, note, note_by, note_at) VALUES (?,?,?,?,1,'a',?,?,?,?)`).run('u-' + at, at, '1', '+37120000000', at, note, by, at);
async function listed(db) {
  const rows = await db.prepare(`SELECT pe.*, ${LIST_NOTE_COLS} FROM people pe ${LIST_NOTE_JOINS} ORDER BY pe.id`).all();
  return Object.fromEntries(rows.map((r) => [r.id, pickListNote(r)]));
}

test('the newest of the three wins: a written note', async () => {
  const db = await db0();
  await notesField(db, 'notes field text', '2026-10-14T09:00:00.000Z');
  await callNote(db, 'call text', '2026-10-15T09:00:00.000Z');
  await ev(db, { body: 'Pajautāts, vai ir pieņemts lēmums', at: '2026-10-16T09:00:00.000Z' });
  const got = (await listed(db)).a;
  assert.deepEqual(got, { text: 'Pajautāts, vai ir pieņemts lēmums', by: 'Ieva', at: '2026-10-16T09:00:00.000Z', from: 'history' });
  await db.close();
});

test('the newest of the three wins: the Notes field, dated and signed by its last edit', async () => {
  const db = await db0();
  await ev(db, { body: 'older note', at: '2026-10-14T09:00:00.000Z' });
  await callNote(db, 'call text', '2026-10-15T09:00:00.000Z');
  await notesField(db, 'notes field text', '2026-10-16T09:00:00.000Z');
  const got = (await listed(db)).a;
  assert.deepEqual(got, { text: 'notes field text', by: 'Laura', at: '2026-10-16T09:00:00.000Z', from: 'notes' });
  await db.close();
});

test('the newest of the three wins: a call\'s "What was it about?"', async () => {
  const db = await db0();
  await ev(db, { body: 'older note', at: '2026-10-14T09:00:00.000Z' });
  await notesField(db, 'notes field text', '2026-10-15T09:00:00.000Z');
  await callNote(db, 'asked about the dormitory', '2026-10-16T09:00:00.000Z', 'Ieva');
  const got = (await listed(db)).a;
  assert.deepEqual(got, { text: 'asked about the dormitory', by: 'Ieva', at: '2026-10-16T09:00:00.000Z', from: 'call' });
  await db.close();
});

test('nothing written = nothing; machine lines and empty notes never count; an undated Notes field only when alone', async () => {
  const db = await db0();
  const rows = await listed(db);
  assert.equal(rows.a, null);
  assert.equal(rows.b, null);
  await ev(db, { subject: 'Merged: X (created by the SIS) is this person', body: 'x@example.com, +37120000000', at: '2026-10-16T10:00:00.000Z' });
  await ev(db, { subject: 'Attended the visit', body: 'marked by hand on the open day list', at: '2026-10-16T10:00:00.000Z' });
  await ev(db, { subject: 'Set aside: Spam', body: '', at: '2026-10-16T10:00:00.000Z' });
  await ev(db, { body: 'a machine wrote this', origin: 'automatic', actor: 'SIS', at: '2026-10-16T10:00:00.000Z' });
  await ev(db, { kind: 'status', body: 'moved', at: '2026-10-16T10:00:00.000Z' });
  await db.prepare(`INSERT INTO inbound (channel, external_id, received_at, surface_at, suggested, state, person_id, suggestion_why)
    VALUES ('phone', 'c1', '2026-10-16T08:00:00Z', '2026-10-16T08:00:00Z', 'raw', 'qualified', 'a', 'mentions programme NAV')`).run();
  await ev(db, { subject: 'Qualified from phone as lead', body: 'mentions programme NAV', at: '2026-10-16T10:00:00.000Z' });
  assert.equal((await listed(db)).a, null, 'none of these is a note somebody wrote');
  await ev(db, { subject: 'Qualified from phone as lead', body: 'wants to start in January', at: '2026-10-16T11:00:00.000Z' });
  assert.equal((await listed(db)).a.text, 'wants to start in January', 'the comment typed when the card was made a lead is');
  // an undated Notes field (the sheet import) shows only when nothing dated exists
  await db.prepare("UPDATE people SET notes = 'from the sheet' WHERE id = 'b'").run();
  assert.deepEqual((await listed(db)).b, { text: 'from the sheet', by: null, at: null, from: 'notes' });
  await db.prepare("UPDATE people SET notes = 'from the sheet' WHERE id = 'a'").run();
  assert.equal((await listed(db)).a.text, 'wants to start in January');
  await db.close();
});

test('the helper columns never reach the page', async () => {
  const db = await db0();
  const [row] = await db.prepare(`SELECT pe.*, ${LIST_NOTE_COLS} FROM people pe ${LIST_NOTE_JOINS} WHERE pe.id = 'a'`).all();
  pickListNote(row);
  assert.ok(!Object.keys(row).some((k) => k.startsWith('ln_')));
  await db.close();
});

test('server: the List\'s own query carries it, one query (joins), no request per row', () => {
  const i = SERVER.indexOf("if (req.method === 'GET' && p === '/api/people') {");
  const route = SERVER.slice(i, SERVER.indexOf("if (req.method === 'GET' && p === '/api/people/fields')", i));
  assert.match(route, /\$\{LIST_NOTE_COLS\}\s+FROM people pe \$\{LIST_NOTE_JOINS\}/);
  assert.match(route, /for \(const r of rows\) r\.list_note = pickListNote\(r\);/);
  assert.equal((route.match(/await db\.prepare/g) || []).length, 1, 'one query');
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('server: GET /api/people gives each row its latest note; a row without one gets null', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const post = (p, b) => fetch(s.base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva', origin: s.base },
    body: JSON.stringify(b) }).then((r) => r.json());
  const a = await post('/api/people', { name: 'Alberts Testa', email: 'alberts@example.com', confirmedNotDuplicate: true });
  const b = await post('/api/people', { name: 'Bez Piezimem', email: 'bez@example.com', confirmedNotDuplicate: true });
  await post(`/api/people/${a.id}/note`, { kind: 'note', body: 'Pajautāts, vai ir pieņemts lēmums <b>' });
  const rows = (await fetch(s.base + '/api/people', { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json())).rows;
  const ra = rows.find((r) => r.id === a.id);
  const rb = rows.find((r) => r.id === b.id);
  assert.equal(ra.list_note.text, 'Pajautāts, vai ir pieņemts lēmums <b>', 'stored as written; the page escapes it');
  assert.equal(ra.list_note.by, 'Ieva');
  assert.ok(ra.list_note.at);
  assert.equal(rb.list_note, null);
  assert.ok(!Object.keys(ra).some((k) => k.startsWith('ln_')));
});

// ------------------------------------------------------------------------------------------- the page --
const fnSrc = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n', i) + 1); };
function page(p, year = '2026') {
  const ctx = { esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    fmtDate: (iso) => (iso ? String(iso).slice(0, 10) : ''), todayStr: () => year + '-10-16',
    actorName: (x) => (x === 'CRM' ? 'Intake' : x), cNotePreview: (s) => String(s ?? '').replace(/^(?:(?:Sheet status|Docs):[^|]*\|\s*)+/, '').trim() };
  vm.runInNewContext(line('const cNoteDay =') + fnSrc('function cListNote(') + '\nthis.out = cListNote(P);', Object.assign(ctx, { P: p }));
  return ctx.out;
}

test('page: one quiet line, who and the day first, escaped; nothing when there is no note', () => {
  const html = page({ list_note: { text: 'Pajautāts, vai ir pieņemts lēmums <script>', by: 'Ieva', at: '2026-10-16T09:00:00.000Z', from: 'history' } });
  assert.equal(html, '<small class="c-lnote" title="Pajautāts, vai ir pieņemts lēmums &lt;script&gt;">Ieva · 16.10: Pajautāts, vai ir pieņemts lēmums &lt;script&gt;</small>');
  assert.equal(page({ list_note: null }), '');
  assert.equal(page({}), '');
  assert.equal(page({ list_note: { text: '   ', by: 'Ieva', at: '2026-10-16T09:00:00.000Z', from: 'history' } }), '');
  assert.match(page({ list_note: { text: 'old one', by: 'Ieva', at: '2025-03-02T09:00:00.000Z', from: 'call' } }), />Ieva · 02\.03\.2025: old one</, 'another year says its year');
  assert.match(page({ list_note: { text: 'Sheet status: COLD | wants a call', by: null, at: null, from: 'notes' } }), />wants a call</, 'the import tags are left out, as on the card');
  assert.match(page({ list_note: { text: 'two\nlines', by: 'Laura', at: '2026-10-16T09:00:00.000Z', from: 'notes' } }), />Laura · 16\.10: two lines</);
});

test('page: every List row carries it, and it is cut to one line with an ellipsis', () => {
  const draw = fnSrc('function cDrawJourneyPool(');
  assert.match(draw, /<div class="c-acts">[^\n]*<\/div>\$\{cListNote\(p\)\}<\/div>/);
  assert.match(APP, /\.p-rows \.c-line > \.c-lnote\{grid-column:1\/-1;[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
});

test('the Help center says it in one sentence', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'notes-on-the-list');
  assert.ok(q, 'the question exists');
  assert.match(q.a, /List/);
  assert.match(q.a, /newest note/);
  assert.match(q.a, /Notes field/);
  assert.equal(q.a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'one sentence');
});

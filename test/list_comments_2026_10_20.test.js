// JOURNEY -> LIST: THE WHOLE COMMENT, AND EDITING ONE (Admissions, 20.10.2026: "I can no longer edit earlier comments -
// when I open it I have to write in a new box", "from this view I can't see the full comment either", "for some people
// earlier comments show in the box, for others not"). The panel's Notes box showed only the Notes field; comments
// written with Add a note, Log a call or Make a lead live in History, a call's "What was it about?" on the call.
//   (a) the List row's note line opens the whole text in place, without leaving the List;
//   (b) the opened row lists every comment (History notes, the Notes field, call notes), newest first, whole text, who
//       and when; whoever wrote one may edit it, an admin any, the Notes field everybody; an edit is logged in History
//       with the old text; a new comment is one box.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { commentsFor, editComment, COMMENT_EDITED } from '../src/comments.js';
import { LIST_NOTE_COLS, LIST_NOTE_JOINS, pickListNote } from '../src/listnote.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

async function db0() {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, status, created_at) VALUES ('a', 'A', 'Contacted', '2026-10-01T00:00:00Z')`).run();
  return db;
}
const ev = async (db, o) => {
  const r = await db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, subject, body, actor, origin, field, old_value, new_value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(o.pid || 'a', o.kind || 'note', 'note', o.at, o.subject || 'Note', o.body ?? null, o.actor || 'Ieva',
    o.origin || 'manual', o.field || null, null, o.newValue || null);
  return Number(r.lastInsertRowid);
};
const callNote = (db, note, at, by = 'Ieva') => db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up, person_id,
  inserted_at, note, note_by, note_at) VALUES (?,?,?,?,1,'a',?,?,?,?)`).run('u-' + at, at, '1', '+37120000000', at, note, by, at);

async function seeded() {
  const db = await db0();
  const long = 'Pajautāts, vai ir pieņemts lēmums. Viņa teica, ka vēl domā par NAV un SME, un ka piezvanīs pēc brīvdienām, kad būs runājusi ar vecākiem.';
  const id = await ev(db, { body: long, at: '2026-10-16T09:00:00.000Z', actor: 'Ieva' });
  await ev(db, { kind: 'call', subject: 'Call: answered', body: 'Laura spoke to her', at: '2026-10-15T09:00:00.000Z', actor: 'Laura' });
  await ev(db, { subject: 'Merged: X is this person', body: 'x@example.com', at: '2026-10-17T09:00:00.000Z' });   // a machine line
  await db.prepare("UPDATE people SET notes = 'from the sheet' WHERE id = 'a'").run();                            // undated
  await callNote(db, 'asked about the dormitory', '2026-10-14T09:00:00.000Z', 'Ieva');
  return { db, id, long };
}

test('comments: all three places, newest first, whole text, who and when; machine lines left out; undated Notes field last', async () => {
  const { db, id, long } = await seeded();
  const rows = await commentsFor(db, 'a', { viewer: 'Ieva' });
  assert.deepEqual(rows.map((r) => [r.ref, r.text, r.by]), [
    [`event:${id}`, long, 'Ieva'],
    [rows[1].ref, 'Laura spoke to her', 'Laura'],
    ['call:u-2026-10-14T09:00:00.000Z', 'asked about the dormitory', 'Ieva'],
    ['notes', 'from the sheet', null]]);
  assert.equal(rows[0].text.length, long.length, 'the whole text, never cut');
  assert.equal(rows[3].at, null, 'the Notes field from before Intake has no date');
  assert.equal(await commentsFor(db, 'nobody', { viewer: 'Ieva' }), null);
  await db.close();
});

test('who may edit: whoever wrote it, an admin any, the Notes field every user', async () => {
  const { db } = await seeded();
  const can = async (viewer, admin = false) => Object.fromEntries((await commentsFor(db, 'a', { viewer, admin })).map((r) => [r.from + ':' + r.by, r.canEdit]));
  assert.deepEqual(await can('Ieva'), { 'history:Ieva': true, 'history:Laura': false, 'call:Ieva': true, 'notes:null': true });
  assert.deepEqual(await can('Laura'), { 'history:Ieva': false, 'history:Laura': true, 'call:Ieva': false, 'notes:null': true });
  assert.deepEqual(await can('Aigars', true), { 'history:Ieva': true, 'history:Laura': true, 'call:Ieva': true, 'notes:null': true });
  assert.deepEqual(await can(''), { 'history:Ieva': false, 'history:Laura': false, 'call:Ieva': false, 'notes:null': false }, 'nobody signed: nothing');
  await db.close();
});

test('an edit by its writer: the comment changes in place, History keeps the old text, the List line shows the new one', async () => {
  const { db, id, long } = await seeded();
  const r = await editComment(db, 'a', { ref: `event:${id}`, text: '  Decided: NAV, January.  ', by: 'Ieva', at: '2026-10-20T08:00:00.000Z' });
  assert.deepEqual(r, { ok: true, changed: true });
  assert.equal((await db.prepare('SELECT body, occurred_at FROM events WHERE id = ?').get(id)).body, 'Decided: NAV, January.');
  const log = await db.prepare("SELECT * FROM events WHERE kind = 'edit' AND field = 'comment'").all();
  assert.equal(log.length, 1);
  assert.equal(log[0].subject, COMMENT_EDITED);
  assert.equal(log[0].old_value, long, 'the old text is kept, whole');
  assert.equal(log[0].new_value, 'Decided: NAV, January.');
  assert.equal(log[0].body, `event:${id}`, 'which comment it was');
  assert.equal(log[0].actor, 'Ieva');
  assert.equal(log[0].origin, 'manual');
  const rows = await commentsFor(db, 'a', { viewer: 'Ieva' });
  assert.deepEqual(rows[0].edited, { by: 'Ieva', at: '2026-10-20T08:00:00.000Z' });
  assert.equal(rows[0].at, '2026-10-16T09:00:00.000Z', 'the comment keeps its own day');
  const [row] = await db.prepare(`SELECT pe.*, ${LIST_NOTE_COLS} FROM people pe ${LIST_NOTE_JOINS} WHERE pe.id = 'a'`).all();
  assert.equal(pickListNote(row).text, 'Decided: NAV, January.');
  // the same text again changes nothing and logs nothing
  assert.deepEqual(await editComment(db, 'a', { ref: `event:${id}`, text: 'Decided: NAV, January.', by: 'Ieva' }), { ok: true, changed: false });
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM events WHERE field = 'comment'").get()).n, 1);
  await db.close();
});

test('refused: somebody else\'s comment, an empty text, a line that is not a comment, another person\'s comment', async () => {
  const { db, id, long } = await seeded();
  assert.equal((await editComment(db, 'a', { ref: `event:${id}`, text: 'mine now', by: 'Laura' })).status, 403);
  assert.equal((await editComment(db, 'a', { ref: `event:${id}`, text: '   ', by: 'Ieva' })).status, 400);
  assert.equal((await editComment(db, 'a', { ref: 'event:abc', text: 'x', by: 'Ieva' })).status, 400);
  assert.equal((await editComment(db, 'a', { ref: 'people:a', text: 'x', by: 'Ieva' })).status, 400);
  assert.equal((await editComment(db, 'a', { ref: `event:${id}`, text: 'x', by: '' })).status, 400);
  const status = await ev(db, { kind: 'status', subject: 'Status: New -> Contacted', body: 'moved', at: '2026-10-16T10:00:00.000Z' });
  assert.equal((await editComment(db, 'a', { ref: `event:${status}`, text: 'x', by: 'Ieva' })).status, 404, 'a stage move is not a comment');
  const merged = (await db.prepare("SELECT id FROM events WHERE subject LIKE 'Merged:%'").get()).id;
  assert.equal((await editComment(db, 'a', { ref: `event:${merged}`, text: 'x', by: 'Ieva' })).status, 404, 'a machine line is not a comment');
  await db.prepare(`INSERT INTO people (id, name, status, created_at) VALUES ('b', 'B', 'Contacted', '2026-10-01T00:00:00Z')`).run();
  assert.equal((await editComment(db, 'b', { ref: `event:${id}`, text: 'x', by: 'Ieva' })).status, 404, 'only through its own person');
  assert.equal((await db.prepare('SELECT body FROM events WHERE id = ?').get(id)).body, long, 'nothing changed');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM events WHERE field = 'comment'").get()).n, 0, 'nothing logged');
  // an admin may
  assert.deepEqual(await editComment(db, 'a', { ref: `event:${id}`, text: 'fixed by an admin', by: 'Aigars', admin: true }), { ok: true, changed: true });
  await db.close();
});

test('a call note: its writer edits it, one line as the call writes it; the Notes field: every user, its own History line', async () => {
  const { db } = await seeded();
  const ref = 'call:u-2026-10-14T09:00:00.000Z';
  assert.equal((await editComment(db, 'a', { ref, text: 'x', by: 'Laura' })).status, 403);
  assert.equal((await editComment(db, 'a', { ref, text: 'y'.repeat(201), by: 'Ieva' })).status, 400);
  assert.deepEqual(await editComment(db, 'a', { ref, text: 'asked about\nthe dormitory and the price', by: 'Ieva' }), { ok: true, changed: true });
  const c = await db.prepare("SELECT note, note_by FROM pbx_calls WHERE uniqueid = 'u-2026-10-14T09:00:00.000Z'").get();
  assert.deepEqual({ ...c }, { note: 'asked about the dormitory and the price', note_by: 'Ieva' });
  const callLog = await db.prepare("SELECT old_value, new_value, body FROM events WHERE field = 'comment'").get();
  assert.deepEqual({ ...callLog }, { old_value: 'asked about the dormitory', new_value: 'asked about the dormitory and the price', body: ref });
  // the Notes field: anybody, logged as "Notes changed" with the old text (the edit the panel always made)
  assert.deepEqual(await editComment(db, 'a', { ref: 'notes', text: 'from the sheet, checked', by: 'Laura' }), { ok: true, changed: true });
  const n = await db.prepare("SELECT subject, old_value, new_value, actor FROM events WHERE field = 'notes'").get();
  assert.deepEqual({ ...n }, { subject: 'Notes changed', old_value: 'from the sheet', new_value: 'from the sheet, checked', actor: 'Laura' });
  assert.equal((await editComment(db, 'a', { ref: 'notes', text: '', by: 'Laura' })).status, 400, 'never emptied here');
  await db.close();
});

// ------------------------------------------------------------------------------------------ server --
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

test('server: GET lists them with what the caller may edit; POST edits, refuses somebody else\'s with 403', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const call = (method, p, who, b) => fetch(s.base + p, { method, headers: { 'content-type': 'application/json', 'x-acting-as': who, origin: s.base },
    ...(b ? { body: JSON.stringify(b) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const a = (await call('POST', '/api/people', 'Ieva', { name: 'Anna Testa', email: 'anna@example.com', confirmedNotDuplicate: true })).body;
  await call('POST', `/api/people/${a.id}/note`, 'Ieva', { kind: 'note', body: 'first comment <b>' });
  await call('POST', `/api/people/${a.id}/edit`, 'Laura', { notes: 'the Notes field' });
  const asLaura = (await call('GET', `/api/people/${a.id}/comments`, 'Laura')).body;
  assert.deepEqual(asLaura.rows.map((r) => [r.from, r.text, r.canEdit]).sort(), [['history', 'first comment <b>', false], ['notes', 'the Notes field', true]]);
  const ref = asLaura.rows.find((r) => r.from === 'history').ref;
  const no = await call('POST', `/api/people/${a.id}/comments`, 'Laura', { ref, text: 'not mine' });
  assert.equal(no.status, 403);
  const yes = await call('POST', `/api/people/${a.id}/comments`, 'Ieva', { ref, text: 'first comment, corrected' });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.rows.find((r) => r.ref === ref).text, 'first comment, corrected');
  assert.equal(yes.body.rows.find((r) => r.ref === ref).edited.by, 'Ieva');
  const person = (await call('GET', `/api/people/${a.id}?as=Ieva`, 'Ieva')).body;
  const line = person.timeline.find((e) => e.subject === 'Comment edited');
  assert.equal(line.old_value, 'first comment <b>');
  assert.equal(line.new_value, 'first comment, corrected');
  assert.equal((await call('GET', '/api/people/nobody/comments', 'Ieva')).status, 404);
});

test('server: the route reads who is asking from the session when sign-in is on (actorOf / viewerOf), admin from the role', () => {
  const i = SERVER.indexOf("/^\\/api\\/people\\/[^/]+\\/comments$/");
  assert.ok(i > 0);
  const route = SERVER.slice(i, SERVER.indexOf('\n    }\n', i));
  assert.match(route, /await actorOf\(req, b\)/);
  assert.match(route, /await viewerOf\(req, url\)/);
  assert.match(route, /me \? me\.role === 'admin' : isAdmin\(who\)/);
});

// ------------------------------------------------------------------------------------------ the page --
const fnSrc = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n', i) + 1); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('page (a): the note line carries the whole text and a click opens it in place, a second click closes it', () => {
  const ctx = { esc, fmtDate: (iso) => (iso ? String(iso).slice(0, 10) : ''), todayStr: () => '2026-10-20', actorName: (x) => x,
    cNotePreview: (s) => String(s ?? '').replace(/^(?:(?:Sheet status|Docs):[^|]*\|\s*)+/, '').trim() };
  const long = 'Sheet status: WARM | wants a call back\nafter the holidays, talk to the parents first';
  vm.runInNewContext(line('const cNoteDay =') + line('const cComment =') + line('const cCommentFull =') + fnSrc('function cListNote(')
    + fnSrc('function cNoteOpen(') + '\nthis.out = cListNote(P); this.open = cNoteOpen;',
  Object.assign(ctx, { P: { list_note: { text: long, by: 'Ieva Gudaneca', at: '2026-10-16T09:00:00.000Z', from: 'notes' } } }));
  assert.match(ctx.out, /<span class="c-ln-one">Ieva · 16\.10: wants a call back after the holidays, talk to the parents first<\/span>/, 'one line, as before');
  assert.match(ctx.out, /<span class="c-ln-all" hidden>Ieva Gudaneca · 16\.10: Sheet status: WARM \| wants a call back\nafter the holidays, talk to the parents first<\/span>/, 'the whole text, as written');
  assert.match(ctx.out, /onclick="event\.stopPropagation\(\);cNoteOpen\(this\)"/, 'the row does not open');
  // a tiny element: the toggle flips the two spans, the class and aria-expanded
  const span = () => ({ hidden: false });
  const one = span(); const all = { hidden: true }; const attrs = { 'aria-expanded': 'false' }; const cls = new Set();
  const el = { getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; },
    classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) }, querySelector: (q) => (q === '.c-ln-one' ? one : all) };
  ctx.open(el);
  assert.deepEqual([attrs['aria-expanded'], cls.has('is-open'), one.hidden, all.hidden], ['true', true, true, false]);
  ctx.open(el);
  assert.deepEqual([attrs['aria-expanded'], cls.has('is-open'), one.hidden, all.hidden], ['false', false, false, true]);
  assert.match(APP, /\.c-line > \.c-lnote\.is-open\{white-space:pre-wrap;overflow:visible;text-overflow:clip/);
});

test('page (b): the opened row lists the comments, Edit only where allowed, escaped; one Add a comment box; no Notes box', () => {
  const form = fnSrc('function cEditForm(');
  assert.match(form, /<div id="pe-comments" class="c-talk pe-comments">\$\{cCommentsHtml\(p\.id\)\}<\/div>/);
  assert.match(form, /<label for="pe-new">Add a comment<\/label><textarea id="pe-new"/);
  assert.doesNotMatch(form, /pe-notes/, 'the Notes field is a comment in the list now, not a second box');
  const save = fnSrc('async function cSavePerson(');
  assert.doesNotMatch(save, /'notes'/, 'the save never overwrites the Notes field');
  assert.match(save, /const said = String\(v\('#pe-new'\) \|\| ''\)\.trim\(\);\n\s+if \(said\) await post\(`\/api\/people\/\$\{id\}\/note`, \{ kind: 'note', subject: 'Note', body: said \}\);/);
  const ctx = { esc, actorName: (x) => x, fmtDate: (iso) => (iso ? String(iso).slice(0, 10) : ''), todayStr: () => '2026-10-20', setTimeout: () => {} };
  vm.runInNewContext(line('const cNoteDay =') + line('const C_PCOMM =') + line('let C_PCEDIT =') + fnSrc('function cCommentsHtml(')
    + '\nthis.html = cCommentsHtml; this.C = C_PCOMM; this.edit = (r) => { C_PCEDIT = r; };', ctx);
  assert.match(ctx.html('a'), /Reading…/);
  ctx.C.set('a', [
    { ref: 'event:7', from: 'history', kind: 'note', text: 'mine <script>', by: 'Ieva', at: '2026-10-16T09:00:00.000Z', canEdit: true, edited: { by: 'Ieva', at: '2026-10-20T08:00:00.000Z' } },
    { ref: 'event:8', from: 'history', kind: 'call', text: 'hers', by: 'Laura', at: '2026-10-15T09:00:00.000Z', canEdit: false, edited: null },
    { ref: 'notes', from: 'notes', kind: 'notes', text: 'from the sheet', by: null, at: null, canEdit: true, edited: null }]);
  const html = ctx.html('a');
  assert.equal((html.match(/>Edit<\/button>/g) || []).length, 2, 'Edit on mine and on the Notes field, not on hers');
  assert.match(html, /mine &lt;script&gt;/);
  assert.match(html, /16\.10 · Ieva · <i>edited by Ieva 20\.10<\/i>/);
  assert.match(html, /15\.10 · Laura · call/);
  assert.match(html, /before Intake · Notes field/);
  ctx.edit('event:7');
  assert.match(ctx.html('a'), /<textarea id="pe-cedit" rows="3" aria-label="Edit the comment">mine &lt;script&gt;<\/textarea>/);
  ctx.C.set('b', []);
  assert.match(ctx.html('b'), /Nothing written yet\./);
  ctx.C.set('c', null);
  assert.match(ctx.html('c'), /Could not read the comments just now\./);
});

test('the Help center says it in one sentence', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'edit-a-comment');
  assert.ok(q);
  assert.match(q.a, /whole comment/);
  assert.match(q.a, /Edit/);
  assert.match(q.a, /History keeps the old text/);
  assert.equal(q.a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'one sentence');
});

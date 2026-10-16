// TWO ITEMS, Admissions (Ieva) and the owner, 16.10.2026.
// 1. CALLS TODAY FROM PEOPLE IN INTAKE: a call from a number that already belongs to a person goes straight to that
//    person's profile, with no Inbox card, so nobody saw it (Laura's 08:54 call looked lost). A quiet strip at the top of
//    the Inbox lists today's (Riga day) calls whose pbx_calls.person_id is set: time, name (a link to the profile), line,
//    "Answered by X · m:ss" / "Missed · rang m:ss". Newest first, five then "N more"; the Line filter applies; hidden when
//    there are none. The server sends only what the strip shows, behind sign-in.
// 2. MAKE A LEAD FROM A CALL CARD made "Unknown contact": the card form had no name field. A Name field, first and
//    optional, on a phone card and on any card without a known name, filled in when the card has one. It names a NEW
//    person only; the duplicate check keeps working.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify, callsTodayFromPeople } from '../src/intake.js';
import { storeCall } from '../src/sync.js';
import { start, get, userCookie } from './security_helpers.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

const out = () => ({ seen: 0, logged: 0, callBack: 0, again: 0, filtered: 0, inbox: 0, noNumber: 0 });
const call = (over = {}) => ({ uniqueid: 'u1', created_at: '2026-10-16T05:54:00.000Z', queue: '1001*Q-COORDINATORS',
  caller_num: '+37129111222', picked_up: true, operator_name: 'Laura', duration_sec: 140, talk_sec: 125, ...over });
const NOW = new Date('2026-10-16T10:00:00Z');   // 13:00 in Riga

// ------------------------------------------------------------------------------ 1. the server --
test('1: today\'s calls (a Riga day) logged on a person, newest first, with only what the strip shows', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, phone, status, owner) VALUES ('p1', 'Anna Ozola', '+37129111222', 'New', 'Admissions')`).run();
  await db.prepare(`INSERT INTO people (id, name, phone, status, owner) VALUES ('p2', 'Janis Berzins', '+37129333444', 'Contacted', 'Admissions')`).run();
  const at = '2026-10-16T10:00:00Z';
  await storeCall(db, call(), 'live', at, out());                                                         // 08:54 Riga, answered
  await storeCall(db, call({ uniqueid: 'u2', created_at: '2026-10-16T07:10:00.000Z', queue: '1001*Q-ADMISSION', caller_num: '29333444',
    picked_up: false, operator_name: null, duration_sec: 25, talk_sec: 0 }), 'live', at, out());       // 10:10 Riga, missed
  await storeCall(db, call({ uniqueid: 'u3', created_at: '2026-10-15T21:30:00.000Z' }), 'live', at, out());   // 00:30 Riga today
  await storeCall(db, call({ uniqueid: 'u4', created_at: '2026-10-15T20:30:00.000Z' }), 'live', at, out());   // 23:30 Riga yesterday
  await storeCall(db, call({ uniqueid: 'u5', created_at: '2026-10-16T08:00:00.000Z', caller_num: '+37120000001' }), 'live', at, out());   // a stranger: Inbox card
  const rows = await callsTodayFromPeople(db, { now: NOW });
  assert.deepEqual(rows.map((r) => r.id), ['u2', 'u1', 'u3'], 'today only, newest first; a stranger has an Inbox card instead');
  assert.deepEqual(rows[1], { id: 'u1', at: '2026-10-16T05:54:00.000Z', line: 'Student Coordinator', answered: true, operator: 'Laura',
    talkSec: 125, durationSec: 140, personId: 'p1', name: 'Anna Ozola' });
  assert.deepEqual(rows[0], { id: 'u2', at: '2026-10-16T07:10:00.000Z', line: 'Admissions', answered: false, operator: null,
    talkSec: 0, durationSec: 25, personId: 'p2', name: 'Janis Berzins' });
  assert.ok(rows.every((r) => !('caller_num' in r) && !('note' in r) && !JSON.stringify(r).includes('29111222')), 'never the number or the note');
  assert.deepEqual(await callsTodayFromPeople(db, { now: new Date('2026-10-17T10:00:00Z') }), [], 'a new day starts empty');
});

test('1: the Inbox answer carries them, only on the waiting Inbox, and only behind sign-in', async (t) => {
  assert.match(SERVER, /callsToday: state === 'new' \? await callsTodayFromPeople\(db\) : \[\],/);
  assert.doesNotMatch(SERVER.slice(SERVER.indexOf('function openBeforeSignIn('), SERVER.indexOf('const PRODUCTION_LOCK')), /\/api\/intake'/, 'not an open door');
  const s = await start({ DATASET: 'empty' });
  t.after(() => s.child.kill());
  const anon = await get(s, '/api/intake?state=new', { headers: { accept: 'application/json' } });
  await anon.arrayBuffer();
  assert.equal(anon.status, 401, 'signed out: nothing');
  const r = await get(s, '/api/intake?state=new', { cookie: userCookie() });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).callsToday, []);
  const aside = await get(s, '/api/intake?state=archived', { cookie: userCookie() });
  assert.deepEqual((await aside.json()).callsToday, [], 'the set-aside view has no strip');
});

// ------------------------------------------------------------------------------ 1. the strip --
function strip(calls, { user = null, line: chosen, callsAll = false } = {}) {
  const helpers = APP.slice(APP.indexOf('const cLines = '), APP.indexOf('let C_TP = '));
  const ctx = { CFG, AUTH: { user }, ACTOR: '', C_IP: { callsAll }, TZ: 'Europe/Riga',
    localStorage: { getItem: () => null, setItem: () => {} } };
  vm.runInNewContext([line('const esc = '),
    APP.slice(APP.indexOf('const fmtDateTime = '), APP.indexOf('// Today in RIGA.')).replace(/^const /, 'var '),
    helpers.replace(/^const /gm, 'var '), fnBody('function cCallLen('), fnBody('function cCallWhat('),
    line('const C_CALLS_TODAY_SHOW = ').replace(/^const /, 'var '), fnBody('function cCallsToday('),
    'this.strip = cCallsToday;'].join('\n'), ctx);
  if (chosen !== undefined) ctx.C_IP.line = chosen;
  return ctx.strip(calls, chosen === undefined ? '' : chosen);
}
const c = (id, at, line, answered, extra = {}) => ({ id, at, line, answered, operator: answered ? 'Laura' : null, talkSec: null,
  durationSec: null, personId: 'p-' + id, name: 'Person ' + id, ...extra });
const LAURA = c('u1', '2026-10-16T05:54:00.000Z', 'Student Coordinator', true, { talkSec: 125, name: 'Anna Ozola', personId: 'p1' });
const MISSED = c('u2', '2026-10-16T07:10:00.000Z', 'Admissions', false, { durationSec: 25, name: 'Janis <b>Berzins</b>' });

test('1: one row says the time in Riga, the name as a link to the profile, the line\'s label and what happened', () => {
  const html = strip([MISSED, LAURA]);
  assert.match(html, /^<section class="ib-today" aria-label="Calls today from people in Intake"><h3>Calls today from people in Intake<b>2<\/b><\/h3>/);
  assert.match(html, /<li class="ib-call"><span>08:54<\/span><a href="#\/person\/p1">Anna Ozola<\/a><span>Student coordination<\/span><b>Answered by Laura · 2:05<\/b><\/li>/);
  assert.match(html, /<li class="ib-call is-missed"><span>10:10<\/span><a href="#\/person\/p-u2">Janis &lt;b&gt;Berzins&lt;\/b&gt;<\/a><span>Admissions<\/span><b>Missed · rang 0:25<\/b><\/li>/, 'escaped');
  assert.ok(html.indexOf('10:10') < html.indexOf('08:54'), 'in the order the server gives: newest first');
  assert.doesNotMatch(html, /What was it about/, 'no call note here');
});

test('1: five at most, then "N more"; Show fewer folds it again; nothing at all when there are none', () => {
  const many = Array.from({ length: 8 }, (_, i) => c('m' + i, `2026-10-16T0${8 - i}:00:00.000Z`, 'Admissions', true));
  const five = strip(many);
  assert.equal((five.match(/<a href=/g) || []).length, 5);
  assert.match(five, /<h3>Calls today from people in Intake<b>8<\/b><\/h3>/);
  assert.match(five, /onclick="C_IP\.callsAll=true;cInboxPool\(\)">3 more<\/button>/);
  const all = strip(many, { callsAll: true });
  assert.equal((all.match(/<a href=/g) || []).length, 8);
  assert.match(all, />Show fewer<\/button>/);
  assert.equal(strip([]), '', 'hidden');
  assert.equal(strip(undefined), '', 'hidden');
});

test('1: the Line filter applies as on the cards: a line sees its own calls, All sees everything', () => {
  const rows = [LAURA, MISSED, c('u3', '2026-10-16T06:00:00.000Z', 'Other', true)];
  const ids = (html) => [...html.matchAll(/<a href="#\/person\/([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(ids(strip(rows, { line: '1' })), ['p-u2'], 'Admissions: its one call');
  assert.deepEqual(ids(strip(rows, { line: '3' })), ['p-u3'], 'Other: its one call');
  assert.match(strip(rows, { line: '2' }), /Anna Ozola/);
  assert.doesNotMatch(strip(rows, { line: '2' }), /Janis/);
  assert.equal((strip(rows, { line: '' }).match(/<a href=/g) || []).length, 3, 'All');
  assert.equal(strip([LAURA], { line: '3' }), '', 'nothing on this line: hidden');
});

test('1: on the Inbox, under the filters and above the columns; the card\'s call lines share one wording', () => {
  assert.match(APP, /body: D\.receipt \+ \(live && D\.callsToday \? cCallsToday\(D\.callsToday, C_IP\.line\) : ''\) \+ board,/);
  assert.match(APP, /C_IPD = \{ rows, receipt, form, val, marks: d\.marks \|\| \[\], reasons: d\.archiveReasons \|\| \[\], callsToday: d\.callsToday \|\| \[\] \};/);
  const cards = fnBody('function cCallsHtml(');
  assert.match(cards, /<b>\$\{cCallWhat\(c\)\}<\/b>/, 'the phone card says it with the same function');
  assert.doesNotMatch(cards, /const len = /, 'the length is worked out in one place');
  assert.equal((APP.match(/'Missed' \+/g) || []).length, 1, 'one "Missed" wording');
  // no new colours: the strip uses the app's own tokens
  const css = APP.split('\n').filter((l) => l.includes('.ib-today')).join('\n');
  assert.ok(css.length > 0);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, 'only the existing colour tokens');
});

test('1: the Help center says it', () => {
  assert.match(HELP.tour.find((x) => x.title === 'Inbox').body,
    /Calls today from people already in Intake have no card, so they are listed at the top of the Inbox with a link to each person\./);
});

// ------------------------------------------------------------------------------ 2. the name --
const FORM = APP.slice(APP.indexOf('  const form = (r) => {'), APP.indexOf('  C_IPD = { rows, receipt'));
function formOf(r) {
  const ctx = { CFG: { programmes: ['Navigation'] }, cNextPick: () => '<next>' };
  vm.runInNewContext(line('const esc = ') + '\n' + FORM + '\nthis.form = form;', ctx);
  return ctx.form({ fields: [], ...r });
}
const nameField = (html) => (html.match(/<input id="qName"[^>]*>/) || [null])[0];

test('2: the Name field: first and optional on a phone card and on a card without a known name, filled when there is one', () => {
  const phone = formOf({ id: 1, channel: 'phone', contact_name: null, contact_phone: '+37129111222' });
  assert.equal(nameField(phone), '<input id="qName" type="text" autocomplete="off" maxlength="200" value="">');
  assert.ok(phone.indexOf('for="qName"') < phone.indexOf('for="qInterest"'), 'shown first');
  assert.doesNotMatch(phone, /id="qName"[^>]*required/, 'optional');
  assert.match(nameField(formOf({ id: 2, channel: 'phone', contact_name: 'Anna Ozola' })), /value="Anna Ozola"/, 'a phone card with a name: filled');
  assert.match(nameField(formOf({ id: 3, channel: 'messenger', contact_name: '' , contact_handle: 'anna.o' })), /value=""/, 'no name: asked');
  assert.match(nameField(formOf({ id: 4, channel: 'gmail', contact_name: 'Unknown contact' })), /value=""/, '"Unknown" is not a name');
  assert.equal(nameField(formOf({ id: 5, channel: 'gmail', contact_name: 'Ilze Vanaga', contact_email: 'ilze@example.com' })), null, 'a named email card: as before');
  assert.equal(nameField(formOf({ id: 6, channel: 'phone', contact_name: null, joins: { id: 'p1', name: 'Anna Ozola' } })), null, 'Add to X: somebody we have');
  assert.match(nameField(formOf({ id: 7, channel: 'phone', contact_name: '"><script>' })), /value="&quot;&gt;&lt;script&gt;"/, 'escaped');
});

test('2: the card sends the typed name; empty sends nothing', () => {
  const fn = fnBody('async function doQualify(');
  assert.match(fn, /const name = typed\('#qName'\);/);
  assert.match(fn, /stated, \.\.\.\(name \? \{ name \} : \{\}\), \.\.\.opts \};/);
  assert.match(APP, /if \(C_LOPEN\) \{ const sel = \$\('#qName'\) \|\| \$\('#qInterest'\); if \(sel && sel\.focus\) sel\.focus\(\); \}/, 'the cursor starts on it');
  assert.match(HELP.tour.find((x) => x.title === 'Inbox').body, /A call card, and any card without a name, asks for the name first\./);
});

async function aCall(db, ext = 'call-1', phone = '+371 2999 0001') {
  return receive(db, { channel: 'phone', externalId: ext, receivedAt: '2026-10-16T05:54:00Z', phone, body: 'Incoming call' });
}
const make = (db, id, extra = {}) => qualify(db, id, { qualification: 'lead', createPerson: true, by: 'Arina', nextAction: 'First call', ...extra });

test('2: a lead made from a call card gets the typed name; empty stays "Unknown contact" as before', async () => {
  const db = await openDb(':memory:');
  const a = await make(db, (await aCall(db)).id, { name: '  Anna   Ozola ' });
  assert.ok(a.ok, a.error);
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get(a.personId)).name, 'Anna Ozola', 'trimmed, one space');
  const b = await make(db, (await aCall(db, 'call-2', '+371 2999 0002')).id, { name: '' });
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get(b.personId)).name, 'Unknown contact');
  const c2 = await make(db, (await aCall(db, 'call-3', '+371 2999 0003')).id);
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get(c2.personId)).name, 'Unknown contact', 'no name sent: as before');
  const long = await make(db, (await aCall(db, 'call-4', '+371 2999 0004')).id, { name: 'x'.repeat(300) });
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get(long.personId)).name.length, 200);
});

test('2: the duplicate check keeps working: "This is them" never renames, "a different person" gets the typed name', async () => {
  const db = await openDb(':memory:');
  const first = await make(db, (await aCall(db)).id, { name: 'Anna Ozola' });
  // the same number again, a new card: strong match on the number
  await db.prepare(`UPDATE inbound SET state = 'qualified' WHERE id IN (SELECT id FROM inbound)`).run();
  const again = await receive(db, { channel: 'phone', externalId: 'call-9', receivedAt: '2026-10-16T09:00:00Z', phone: '+371 2999 0001', body: 'Incoming call' });
  const dup = await make(db, again.id, { name: 'Anna O.' });
  assert.equal(dup.duplicate, true);
  assert.equal(dup.strong, true);
  assert.equal(dup.matches[0].name, 'Anna Ozola');
  const them = await qualify(db, again.id, { qualification: 'lead', personId: first.personId, by: 'Arina', name: 'Anna O.' });
  assert.ok(them.ok, them.error);
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get(first.personId)).name, 'Anna Ozola', 'not renamed');
  // a different number, the same typed name: a name-only match asks first, then "a different person" makes them
  const other = await aCall(db, 'call-10', '+371 2888 0005');
  const maybe = await make(db, other.id, { name: 'Anna Ozola' });
  assert.equal(maybe.duplicate, true, 'the typed name is checked too');
  assert.equal(maybe.strong, false, 'only the name matches');
  const diff = await make(db, other.id, { name: 'Anna Ozola', differentPerson: true });
  assert.ok(diff.ok, diff.error);
  assert.notEqual(diff.personId, first.personId);
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get(diff.personId)).name, 'Anna Ozola');
});

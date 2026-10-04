// THE CALL POP-UP (Q6, 04.10.2026), built as if the phone system notifies us on every call.
// Simulated TeleGroup events in: ringing, answered, ended, a retry, an unknown number and a known
// one. What lands in Intake, and what each colleague's screen is told.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive } from '../src/intake.js';
import { storeCall } from '../src/sync.js';
import { isOperator, plainName, whoIsCalling, callFeed } from '../src/callpop.js';
import { adaptPhoneEvent, receivePhoneEvent } from '../src/phoneevent.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONSOLE = fs.readFileSync(path.join(ROOT, 'src', 'console.html'), 'utf8');
const SECRET = 'test-phone-event-secret-not-real-0';
const Q = '1001*Q-ADMISSION';

async function seeded() {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, phone, status, owner) VALUES ('p1', 'Anna Ozola', '29990001', 'Contacted', 'Ieva')`).run();
  await db.prepare(`INSERT INTO events (person_id, kind, occurred_at, origin, body) VALUES ('p1', 'note', '2026-10-01T09:00:00Z', 'manual', 'Wants Navigation, call after 16:00')`).run();
  await db.prepare(`INSERT INTO events (person_id, kind, occurred_at, origin, body) VALUES ('p1', 'status', '2026-10-02T09:00:00Z', 'automatic', 'machine line, not a comment')`).run();
  await db.prepare(`INSERT INTO tasks (person_id, label, due_at, created_at) VALUES ('p1', 'Send the programme brochure', '2026-10-06T08:00:00Z', '2026-10-01T09:00:00Z')`).run();
  await receive(db, { channel: 'phone', externalId: 'call-old', receivedAt: '2026-10-03T08:00:00Z', name: 'Juris', phone: '+371 2888 0002', body: 'Incoming call' });
  return db;
}
const ev = (call_id, event, caller, extra = {}) => ({ call_id, event, caller, queue: Q, at: '2026-10-04T08:00:00Z', ...extra });
const count = async (db, sql, ...a) => Number((await db.prepare(sql).get(...a)).n);

// ----------------------------------------------------------- the adapter --

test('the adapter: our names, and the names TeleGroup\'s call list already uses', () => {
  const a = adaptPhoneEvent({ call_id: 'c1', event: 'ringing', caller: '+37129990001', queue: Q, operator: null, at: '2026-10-04T08:00:00Z' });
  assert.equal(a.callId, 'c1');
  assert.equal(a.event, 'ringing');
  const b = adaptPhoneEvent({ uniqueid: 'u9', state: 'ANSWER', caller_num: '29990001', operator_name: 'Ieva K', created_at: '2026-10-04 11:00:00' });
  assert.equal(b.callId, 'u9');
  assert.equal(b.event, 'answered');
  assert.equal(b.operator, 'Ieva K');
  assert.equal(b.at, '2026-10-04T08:00:00.000Z', 'Riga wall clock, read as Riga');
  assert.equal(adaptPhoneEvent({ call_id: 'x', type: 'HANGUP', answered: 'true' }).event, 'ended');
  assert.throws(() => adaptPhoneEvent({ event: 'ringing' }), /no call_id/);
  assert.throws(() => adaptPhoneEvent({ call_id: 'x', event: 'dancing' }), /unknown event/);
});

// --------------------------------------------------- ring, answer, end --

test('an unknown number: ring, answer, end - one new lead, made exactly as the daily pull makes it', async () => {
  const db = await seeded();
  for (const e of ['ringing', 'answered', 'ended']) {
    const r = await receivePhoneEvent(db, ev('u1', e, '+37126660003', e === 'ringing' ? {} : { operator: 'Ieva Kalnina' }), { mode: 'live' });
    assert.equal(r.stored, true, e);
  }
  assert.equal(await count(db, `SELECT COUNT(*) n FROM call_events WHERE call_id = 'u1'`), 3);
  const call = await db.prepare(`SELECT * FROM pbx_calls WHERE uniqueid = 'u1'`).get();
  assert.equal(Number(call.picked_up), 1);
  assert.equal(call.operator_name, 'Ieva Kalnina');
  assert.equal(call.called_at, '2026-10-04T08:00:00.000Z', 'from when it started ringing');
  const lead = await db.prepare(`SELECT * FROM inbound WHERE external_id = 'u1'`).get();
  assert.equal(lead.channel, 'phone');
  assert.equal(lead.state, 'new');
  assert.equal(lead.source, 'provider', 'live mode is a real provider row');
  assert.match(lead.body, /answered by Ieva Kalnina/);
});

test('a known number: the call is logged on the person, and no lead is made', async () => {
  const db = await seeded();
  await receivePhoneEvent(db, ev('u2', 'ringing', '+371 29990001'), { mode: 'test' });
  const r = await receivePhoneEvent(db, ev('u2', 'ended', '+371 29990001', { answered: 'false' }), { mode: 'test' });
  assert.equal(r.call.logged, 1);
  assert.equal(await count(db, `SELECT COUNT(*) n FROM inbound WHERE external_id = 'u2'`), 0);
  assert.equal(await count(db, `SELECT COUNT(*) n FROM events WHERE person_id = 'p1' AND kind = 'call'`), 1);
  assert.equal(Number((await db.prepare(`SELECT picked_up FROM pbx_calls WHERE uniqueid = 'u2'`).get()).picked_up), 0, 'missed');
});

test('a retry of the same event is stored once and does nothing twice', async () => {
  const db = await seeded();
  await receivePhoneEvent(db, ev('u3', 'ringing', '+37126660004'), { mode: 'test' });
  const again = await receivePhoneEvent(db, ev('u3', 'ringing', '+37126660004'), { mode: 'test' });
  assert.equal(again.duplicate, true);
  await receivePhoneEvent(db, ev('u3', 'ended', '+37126660004'), { mode: 'test' });
  const endAgain = await receivePhoneEvent(db, ev('u3', 'ended', '+37126660004'), { mode: 'test' });
  assert.equal(endAgain.duplicate, true);
  assert.equal(await count(db, `SELECT COUNT(*) n FROM call_events WHERE call_id = 'u3'`), 2);
  assert.equal(await count(db, `SELECT COUNT(*) n FROM inbound WHERE external_id = 'u3'`), 1);
});

test('the daily pull and the push never make two leads for one call, whichever comes first', async () => {
  const db = await seeded();
  const out = () => ({ seen: 0, logged: 0, inbox: 0, again: 0, filtered: 0, noNumber: 0 });
  // the push first, then the pull finds the same uniqueid
  await receivePhoneEvent(db, ev('u4', 'ended', '+37126660005'), { mode: 'live' });
  const o1 = out();
  await storeCall(db, { uniqueid: 'u4', created_at: '2026-10-04T08:00:00Z', queue: Q, caller_num: '+37126660005', picked_up: false, operator_name: null }, 'live', '2026-10-05T05:15:00Z', o1);
  assert.equal(o1.seen, 1);
  // the pull first (a lost push), then a late "ended" arrives
  const o2 = out();
  await storeCall(db, { uniqueid: 'u5', created_at: '2026-10-04T08:05:00Z', queue: Q, caller_num: '+37126660006', picked_up: false, operator_name: null }, 'live', '2026-10-05T05:15:00Z', o2);
  const late = await receivePhoneEvent(db, ev('u5', 'ended', '+37126660006'), { mode: 'live' });
  assert.equal(late.call.seen, 1);
  for (const id of ['u4', 'u5']) assert.equal(await count(db, `SELECT COUNT(*) n FROM inbound WHERE external_id = ?`, id), 1, id);
});

test('another company\'s queue on the same phone system is not ours', async () => {
  const db = await seeded();
  const r = await receivePhoneEvent(db, ev('u6', 'ringing', '+37126660007', { queue: 'OTHER*Q' }), { mode: 'test' });
  assert.equal(r.ignored, 'not a college queue');
  assert.equal(await count(db, 'SELECT COUNT(*) n FROM call_events'), 0);
});

// --------------------------------------------------------------- the feed --

test('operators are matched to Intake users, diacritics and case aside', () => {
  assert.equal(plainName('  Līga   ŠMITE '), 'liga smite');
  assert.ok(isOperator('Līga Šmite', 'Liga Smite'));
  assert.ok(isOperator('Ieva Kalnina', 'Ieva'));
  assert.ok(!isOperator('Ieva Kalnina', 'Ieva Ozola'));
  assert.ok(!isOperator(null, 'Ieva'));
});

test('who is calling: a person with the last COMMENT and next step; a waiting lead; a new caller by four digits', async () => {
  const db = await seeded();
  const p = await whoIsCalling(db, '+371 29990001');
  assert.equal(p.kind, 'person');
  assert.equal(p.lastNote, 'Wants Navigation, call after 16:00', 'a machine line is not a comment');
  assert.equal(p.nextStep, 'Send the programme brochure');
  assert.equal((await whoIsCalling(db, '0037128880002')).kind, 'lead');
  assert.deepEqual({ ...(await whoIsCalling(db, '+37126660003')) }, { kind: 'unknown', isNew: true, last4: '0003' });
});

test('the feed: nothing on opening, then only newer events; a ring for everybody, an answer for whoever answered', async () => {
  const db = await seeded();
  const now = new Date('2026-10-04T08:00:30Z');
  const users = ['Ieva', 'Laura', 'Ritvars'];
  await receivePhoneEvent(db, ev('old', 'ringing', '+37126660009'), { mode: 'test', now });
  const open = await callFeed(db, { viewer: 'Ritvars', users, now });
  assert.equal(open.events.length, 0, 'opening or reloading pops nothing');
  await receivePhoneEvent(db, ev('u7', 'ringing', '+371 29990001'), { mode: 'test', now });
  await receivePhoneEvent(db, ev('u7', 'answered', '+371 29990001', { operator: 'Ieva Kalnina' }), { mode: 'test', now });
  const ieva = await callFeed(db, { after: open.last, viewer: 'Ieva', users, now });
  assert.deepEqual(ieva.events.map((e) => e.event), ['ringing', 'answered']);
  assert.equal(ieva.events[0].who.name, 'Anna Ozola', 'everybody sees the ring');
  assert.equal(ieva.events[1].forYou, true);
  const laura = await callFeed(db, { after: open.last, viewer: 'Laura', users, now });
  assert.equal(laura.events[0].who.kind, 'person');
  assert.deepEqual({ ...laura.events[1] }, { id: laura.events[1].id, callId: 'u7', event: 'answered', at: laura.events[1].at, taken: true },
    'the others learn it was taken, and nothing about the caller');
  const again = await callFeed(db, { after: ieva.last, viewer: 'Ieva', users, now });
  assert.equal(again.events.length, 0, 'no repeats');
  assert.ok(!JSON.stringify(ieva).includes('29990001'), 'the number never leaves the server');
});

// ------------------------------------------------------------------- the route --

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', PHONE_EVENT_SECRET: SECRET, CHANNEL_MODE_PHONE: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const push = (s, body, secret = SECRET) => fetch(s.base + '/api/inbound/phone-event', { method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret ? { 'x-crm-secret': secret } : {}) }, body: JSON.stringify(body) });

test('the webhook: the secret is required, a retry is a repeat, and any colleague can read the feed', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  assert.equal((await push(s, ev('w1', 'ringing', '+37126660010'), null)).status, 401);
  assert.equal((await push(s, ev('w1', 'ringing', '+37126660010'), 'wrong-secret-of-the-same-len-0000')).status, 401);
  const first = await push(s, ev('w1', 'ringing', '+37126660010'));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).stored, true);
  assert.equal((await (await push(s, ev('w1', 'ringing', '+37126660010'))).json()).duplicate, true);
  assert.equal((await push(s, { call_id: 'w2' })).status, 400, 'no event is refused, not guessed');
  const feed = await fetch(s.base + '/api/calls/events', { headers: { 'x-acting-as': 'Laura' } });
  assert.equal(feed.status, 200, 'not an admin route');
  assert.deepEqual((await feed.json()).events, []);
});

test('the webhook: refused while the phone channel is off, and unconfigured without its secret', async (t) => {
  const off = await start({ CHANNEL_MODE_PHONE: 'off' });
  t.after(() => off.child.kill());
  assert.equal((await push(off, ev('w3', 'ringing', '+37126660011'))).status, 409);
  const none = await start({ PHONE_EVENT_SECRET: '' });
  t.after(() => none.child.kill());
  assert.equal((await push(none, ev('w4', 'ringing', '+37126660012'))).status, 503);
});

// ------------------------------------------------------------------- the app --

function client({ search = '', stored = {}, open = '' } = {}) {
  const store = { ...stored };
  const box = { dataset: { call: open }, innerHTML: 'x' };
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    fmtDate: (d) => String(d).slice(0, 10), location: { search, hash: '#/' },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    URLSearchParams, document: { querySelector: () => box, querySelectorAll: () => [], createElement: () => box, body: { appendChild() {} } } };
  const a = APP.indexOf('// ===================================================== THE CALL POP-UP (Q6) ==');
  const b = APP.indexOf('(async () => {\n  // WHO ARE YOU');
  vm.runInNewContext(APP.slice(a, b) + `
    this.handle = cpHandle; this.variant = cpVariant; this.card = cpCardHtml; this.where = cpWhere;
    this.show = cpShow;`, ctx);
  return { ctx, box };
}

test('the screen: a ring pops once, an answer for me updates it, a colleague\'s answer closes it, an end changes nothing', () => {
  const { ctx, box } = client();
  const ring = { callId: 'c1', event: 'ringing', who: { kind: 'unknown', isNew: true, last4: '0003' } };
  assert.equal(ctx.handle(ring), 'shown');
  assert.equal(box.dataset.call, 'c1');
  assert.equal(ctx.handle(ring), 'already', 'no repeats');
  assert.equal(ctx.handle({ callId: 'c1', event: 'answered', forYou: true, who: ring.who }), 'shown');
  assert.equal(ctx.handle({ callId: 'c1', event: 'ended' }), 'ignored');
  assert.equal(ctx.handle({ callId: 'c1', event: 'answered', taken: true }), 'closed');
  assert.equal(box.dataset.call, '', 'a colleague took it: the card goes');
});

test('A opens the page for whoever answered only; a ring elsewhere is a line with Open', () => {
  const { ctx, box } = client();
  const who = { kind: 'person', isNew: false, id: 'p1', name: 'Anna Ozola' };
  ctx.show({ callId: 'c2', event: 'ringing', forYou: false, who });
  assert.equal(ctx.location.hash, '#/', 'a ring does not move anybody\'s screen');
  assert.match(box.innerHTML, /href="#\/person\/p1">Open</);
  ctx.show({ callId: 'c2', event: 'answered', answered: true, forYou: true, who });
  assert.equal(ctx.location.hash, '#/person/p1', 'whoever answered gets the page');
});

test('B, the card: who, new or existing, last note, next step, Open; never the number', () => {
  const { ctx } = client({ stored: { callpopVariant: 'b' } });
  const html = ctx.card({ callId: 'c1', forYou: true, answered: true, who: { kind: 'person', isNew: false, id: 'p1', name: 'Anna Ozola',
    status: 'Contacted', lastNote: 'Wants Navigation', nextStep: 'Send the brochure', nextStepAt: '2026-10-06T08:00:00Z' } });
  for (const want of ['You answered', 'Anna Ozola', 'In Intake · Contacted', 'Last note', 'Wants Navigation', 'Next step', 'Send the brochure', 'href="#/person/p1"', '>Open<']) {
    assert.ok(html.includes(want), want);
  }
  const fresh = ctx.card({ callId: 'c3', who: { kind: 'unknown', isNew: true, last4: '0003' } });
  assert.match(fresh, /New caller ···0003/);
  assert.match(fresh, /Ringing on the college line/);
  assert.doesNotMatch(fresh, />Open</);
});

test('A or B by address or stored choice, A by default, no C; the poll is quiet and starts with the shell', () => {
  assert.equal(client().ctx.variant(), 'a');
  assert.equal(client({ stored: { callpopVariant: 'b' } }).ctx.variant(), 'b');
  assert.equal(client({ search: '?cp=b' }).ctx.variant(), 'b');
  assert.equal(client({ search: '?cp=c' }).ctx.variant(), 'a');
  const shell = APP.slice(APP.indexOf('async function startShell()'), APP.indexOf('async function startShell()') + 3000);
  assert.match(shell, /callPopStart\(\);/);
  assert.match(APP, /fetch\('\/api\/calls\/events' \+ q, \{ headers: \{ 'x-acting-as': ACTOR \} \}\)/, 'not api(): no busy bar');
  assert.doesNotMatch(APP, /\/api\/calls\/now/, 'the app never asks TeleGroup');
});

test('DEV CONTROL simulates a pushed call: ring, answer, end, and a retry', () => {
  for (const want of ["callEvent('ringing')", "callEvent('answered')", "callEvent('ended')", "callEvent('again')", "/api/console/phone-event"]) {
    assert.ok(CONSOLE.includes(want), want);
  }
});

// THE CALL POP-UP (Q6, 04.10.2026). When the phone rings, whoever answers sees who is calling.
// Tested here without TeleGroup: a fake call list in, what each colleague is shown out.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive } from '../src/intake.js';
import { isOperator, plainName, whoIsCalling, popsFor, liveCalls, clearCache, CACHE_MS } from '../src/callpop.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const TOKEN = 'test-pbx-token-not-real-0000';
const ENV = { PBX_API_TOKEN: TOKEN };

async function seeded() {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, phone, status, owner) VALUES ('p1', 'Anna Ozola', '29990001', 'Contacted', 'Ieva')`).run();
  await db.prepare(`INSERT INTO events (person_id, kind, occurred_at, origin, body) VALUES ('p1', 'note', '2026-10-01T09:00:00Z', 'manual', 'Wants Navigation, call after 16:00')`).run();
  await db.prepare(`INSERT INTO events (person_id, kind, occurred_at, origin, body) VALUES ('p1', 'status', '2026-10-02T09:00:00Z', 'automatic', 'machine line, not a comment')`).run();
  await db.prepare(`INSERT INTO tasks (person_id, label, due_at, created_at) VALUES ('p1', 'Send the programme brochure', '2026-10-06T08:00:00Z', '2026-10-01T09:00:00Z')`).run();
  await receive(db, { channel: 'phone', externalId: 'call-1', receivedAt: '2026-10-03T08:00:00Z', name: 'Juris', phone: '+371 2888 0002', body: 'Incoming call' });
  return db;
}

// ---------------------------------------------------------------- operators --

test('the operator TeleGroup names is matched to an Intake user, diacritics and case aside', () => {
  assert.equal(plainName('  Līga   ŠMITE '), 'liga smite');
  assert.ok(isOperator('Līga Šmite', 'Liga Smite'));
  assert.ok(isOperator('Ieva Kalnina', 'Ieva'), 'a colleague known by one word is the operator\'s first name');
  assert.ok(!isOperator('Ieva Kalnina', 'Ieva Ozola'), 'two full names must agree');
  assert.ok(!isOperator('Laura Berzina', 'Ieva'));
  assert.ok(!isOperator(null, 'Ieva'));
});

// ------------------------------------------------------------------ callers --

test('a caller who is a person: name, status, the last COMMENT and the next step', async () => {
  const db = await seeded();
  const w = await whoIsCalling(db, '+371 29990001');
  assert.equal(w.kind, 'person');
  assert.equal(w.isNew, false);
  assert.equal(w.id, 'p1');
  assert.equal(w.name, 'Anna Ozola');
  assert.equal(w.status, 'Contacted');
  assert.equal(w.lastNote, 'Wants Navigation, call after 16:00', 'a machine line is not a comment');
  assert.equal(w.nextStep, 'Send the programme brochure');
});

test('a caller still waiting in the Inbox is a new lead; anybody else is a new caller, told by four digits', async () => {
  const db = await seeded();
  const lead = await whoIsCalling(db, '0037128880002');
  assert.equal(lead.kind, 'lead');
  assert.equal(lead.isNew, true);
  assert.equal(lead.name, 'Juris');
  const nobody = await whoIsCalling(db, '+37126660003');
  assert.deepEqual({ ...nobody }, { kind: 'unknown', isNew: true, last4: '0003' });
});

// --------------------------------------------------------------- who sees --

const CALLS = [
  { id: 'c1', at: '2026-10-04T08:00:00Z', state: 'ANSWER', operator: 'Ieva Kalnina', callerNum: '+37129990001' },
  { id: 'c2', at: '2026-10-04T08:01:00Z', state: 'ANSWER', operator: 'Laura Berzina', callerNum: '+37128880002' },
  { id: 'c3', at: '2026-10-04T08:02:00Z', state: null, operator: null, callerNum: '+37126660003' },
  { id: 'c4', at: '2026-10-04T08:03:00Z', state: 'ANSWER', operator: 'Somebody Temporary', callerNum: '+37126660004' },
];
const USERS = ['Ieva', 'Laura', 'Ritvars'];

test('a call answered by a colleague goes to that colleague; a ringing or unknown one goes to everybody', async () => {
  const db = await seeded();
  const ieva = await popsFor(db, { calls: CALLS, viewer: 'Ieva', users: USERS });
  assert.deepEqual(ieva.map((c) => c.id), ['c1', 'c3', 'c4']);
  assert.equal(ieva[0].forYou, true);
  assert.equal(ieva[0].who.kind, 'person');
  const laura = await popsFor(db, { calls: CALLS, viewer: 'Laura', users: USERS });
  assert.deepEqual(laura.map((c) => c.id), ['c2', 'c3', 'c4']);
  const ritvars = await popsFor(db, { calls: CALLS, viewer: 'Ritvars', users: USERS });
  assert.deepEqual(ritvars.map((c) => c.id), ['c3', 'c4'], 'nobody else\'s answered call');
  assert.equal(ritvars[0].forYou, false);
});

test('the caller\'s number never leaves the server', async () => {
  const db = await seeded();
  const out = JSON.stringify(await popsFor(db, { calls: CALLS, viewer: 'Ritvars', users: USERS }));
  for (const c of CALLS) assert.ok(!out.includes(c.callerNum.slice(-8)), 'no full number in what the app gets');
  assert.match(out, /"last4":"0003"/);
});

// ------------------------------------------------------------------- the read --

test('the TeleGroup read: ours only, shared for 8 s, the token never in the answer', async () => {
  clearCache();
  let fetches = 0;
  const body = [
    { uniqueid: 'u1', created_at: '2026-10-04 11:00:00', destination: 'incoming', queue: '1001*Q-ADMISSION', caller_num: '+37129990001', state: 'ANSWER', operator_name: 'Ieva Kalnina' },
    { uniqueid: 'u2', created_at: '2026-10-04 11:00:05', destination: 'outgoing', queue: '1001*Q-ADMISSION', caller_num: '+37129990009' },
    { uniqueid: 'u3', created_at: '2026-10-04 11:00:09', destination: 'incoming', queue: 'OTHER-COMPANY', caller_num: '+37129990008' },
  ];
  const fetchImpl = async (url) => { fetches++; assert.match(String(url), /token=/); return { ok: true, json: async () => body }; };
  const now = new Date('2026-10-04T08:01:00Z');
  const a = await liveCalls({ env: ENV, now, fetchImpl });
  const b = await liveCalls({ env: ENV, now: new Date(now.getTime() + CACHE_MS - 1), fetchImpl });
  assert.equal(fetches, 1, 'five colleagues polling make one TeleGroup read');
  assert.deepEqual(a.calls.map((c) => c.id), ['u1'], 'incoming, our queues only');
  assert.equal(a.calls[0].at, '2026-10-04T08:00:00.000Z', 'Riga wall clock, read as Riga');
  assert.equal(b, a);
  await liveCalls({ env: ENV, now: new Date(now.getTime() + CACHE_MS + 1), fetchImpl });
  assert.equal(fetches, 2, 'and it reads again after');
  assert.ok(!JSON.stringify(a).includes(TOKEN));
  clearCache();
  const bad = await liveCalls({ env: ENV, now, fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'token=' + TOKEN }) });
  assert.equal(bad.ok, false);
  assert.ok(!JSON.stringify(bad).includes(TOKEN));
  clearCache();
});

// ------------------------------------------------------------------- the route --

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', PBX_API_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('the route answers every colleague, not only admins, and says plainly when there is no phone to read', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await fetch(s.base + '/api/calls/now', { headers: { 'x-acting-as': 'Laura' } });
  assert.equal(r.status, 200, 'not an admin route');
  assert.deepEqual(await r.json(), { ok: true, available: false, calls: [] });
});

// ------------------------------------------------------------------- the app --

function client({ search = '', stored = {} } = {}) {
  const store = { ...stored };
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    fmtDate: (d) => String(d).slice(0, 10), location: { search, hash: '#/' },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    URLSearchParams, document: { querySelector: () => null, querySelectorAll: () => [] } };
  const start = APP.indexOf('// ===================================================== THE CALL POP-UP (Q6) ==');
  const end = APP.indexOf('(async () => {\n  // WHO ARE YOU');
  vm.runInNewContext(APP.slice(start, end) + `
    this.fresh = cpFresh; this.remember = cpRemember; this.seen = cpSeen; this.variant = cpVariant;
    this.card = cpCardHtml; this.who = cpWho; this.where = cpWhere;`, ctx);
  return { ctx, store };
}

test('new calls only: the first read is a baseline, and a call pops once', () => {
  const { ctx } = client();
  const calls = [{ id: 'c1' }, { id: 'c2' }];
  assert.equal(ctx.fresh(calls, {}, false).length, 0, 'nothing pops on load or reload');
  const seen = ctx.remember(['c1', 'c2'], 1000);
  assert.deepEqual(ctx.fresh([...calls, { id: 'c3' }], seen, true).map((c) => c.id), ['c3']);
  assert.equal(ctx.fresh(calls, ctx.remember(['c3'], 2000), true).length, 0, 'no repeats');
  const later = ctx.remember([], 2000 + 11 * 60 * 1000);
  assert.equal(Object.keys(later).length, 0, 'remembered ten minutes, then forgotten');
});

test('A or B, by address or stored choice; A by default; there is no C', () => {
  assert.equal(client().ctx.variant(), 'a');
  assert.equal(client({ stored: { callpopVariant: 'b' } }).ctx.variant(), 'b');
  assert.equal(client({ search: '?cp=b' }).ctx.variant(), 'b');
  assert.equal(client({ search: '?cp=c' }).ctx.variant(), 'a');
  assert.match(APP, /A REVIEW control, not product furniture: \?cp=a or \?cp=b/);
});

test('B, the card: who, new or existing, last note, next step, Open; never the number', () => {
  const { ctx } = client();
  const person = { id: 'c1', forYou: true, answered: true, who: { kind: 'person', isNew: false, id: 'p1', name: 'Anna Ozola',
    status: 'Contacted', lastNote: 'Wants Navigation', nextStep: 'Send the brochure', nextStepAt: '2026-10-06T08:00:00Z' } };
  const html = ctx.card(person);
  for (const want of ['You answered', 'Anna Ozola', 'Contacted', 'Last note', 'Wants Navigation', 'Next step', 'Send the brochure', 'href="#/person/p1"', '>Open<']) {
    assert.ok(html.includes(want), want);
  }
  const fresh = ctx.card({ id: 'c3', answered: false, who: { kind: 'unknown', isNew: true, last4: '0003' } });
  assert.match(fresh, /New caller ···0003/);
  assert.match(fresh, /New, not in Intake/);
  assert.match(fresh, /Ringing on the college line/);
  assert.doesNotMatch(fresh, />Open</, 'nothing to open for somebody Intake has never seen');
  assert.equal(ctx.where({ kind: 'lead' }), '#/inbox');
});

test('the poll starts once the shell starts, quietly, and the pop-up has one arrival', () => {
  const shell = APP.slice(APP.indexOf('async function startShell()'), APP.indexOf('async function startShell()') + 3000);
  assert.match(shell, /callPopStart\(\);/);
  assert.match(APP, /fetch\('\/api\/calls\/now', \{ headers: \{ 'x-acting-as': ACTOR \} \}\)/, 'not api(): no busy bar every ten seconds');
  assert.match(APP, /const CP_EVERY_MS = 10000;/);
  assert.match(APP, /@media\(prefers-reduced-motion:reduce\)\{#callpop \.cp-card,#callpop \.cp-strip\{animation:none\}\}/);
});

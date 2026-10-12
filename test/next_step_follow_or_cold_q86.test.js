// Q86 + Q87 (Admissions, 12.10.2026; the owner: "All Ievas feedback to be built and commited and deployed.")
// Q86: "pie next step - vajadzētu maksimāli tos vienkāršot, tīri uz a) follow up + uzlikt datumu, vai b) cold".
//      Wherever a next step is chosen there are two answers: Follow up on a date that has to be set, or Cold (closed as
//      Not proceeding, tagged cold, a reason only if there is one). Steps planned earlier keep their names.
// Q87: "tur leadi iet pēc datumiem, lai augšā vistuvākie datumi". The Journey list runs by the next-step date.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('Q86 on the server: Make a lead can be Cold at once, and Cold needs no reason anywhere', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const h = { 'content-type': 'application/json', 'x-acting-as': 'Ieva' };
  const post = async (u, b) => { const r = await fetch(base + u, { method: 'POST', headers: h, body: JSON.stringify(b) }); return [r.status, await r.json()]; };

  // Follow up on a date
  const [, a] = await post('/api/intake/receive', { channel: 'gmail', externalId: 'q86-a', email: 'a.q86@gmail.com', name: 'Anna Follow', body: 'navigation?' });
  const [sa, qa] = await post(`/api/intake/${a.id}/qualify`, { qualification: 'lead', createPerson: true, nextAction: 'Follow up', nextActionDue: '2026-10-20T09:00:00.000Z', stated: { interest: CFG.programmes[0] } });
  assert.equal(sa, 200, JSON.stringify(qa));
  const pa = await (await fetch(`${base}/api/people/${qa.landed.id}`, { headers: h })).json();
  assert.deepEqual(pa.tasks.filter((x) => !x.done_at).map((x) => [x.label, x.due_at]), [['Follow up', '2026-10-20T09:00:00.000Z']]);

  // Cold, no reason: kept, closed as Not proceeding, tagged cold, nothing planned
  const [, b] = await post('/api/intake/receive', { channel: 'gmail', externalId: 'q86-b', email: 'b.q86@gmail.com', name: 'Bruno Cold', body: 'maybe next year' });
  const [sb, qb] = await post(`/api/intake/${b.id}/qualify`, { qualification: 'lead', createPerson: true, cold: { reason: '' }, stated: { interest: CFG.programmes[0] } });
  assert.equal(sb, 200, JSON.stringify(qb));
  const pb = await (await fetch(`${base}/api/people/${qb.landed.id}`, { headers: h })).json();
  assert.equal(pb.status, 'Not proceeding');
  assert.equal(pb.closed_tag, 'cold');
  assert.equal(pb.closed_reason, null);
  assert.equal(pb.tasks.filter((x) => !x.done_at).length, 0, 'nothing left planned');
  assert.ok(pb.timeline.some((e) => /Not proceeding \(Cold\)/.test(e.subject || '')), 'the close is on the History');

  // a person page / Done / Choose: Cold through the status call, without a reason
  const [sc] = await post(`/api/people/${qa.landed.id}/status`, { status: 'Not proceeding', closedTag: 'cold' });
  assert.equal(sc, 200, 'Cold goes without a reason');
  const pc = await (await fetch(`${base}/api/people/${qa.landed.id}`, { headers: h })).json();
  assert.equal(pc.closed_tag, 'cold');
  assert.equal(pc.tasks.filter((x) => !x.done_at).length, 0, 'the Follow up closed with them');

  // Reject still needs its reason (Decision 8 stands for everything but Cold)
  const [, d] = await post('/api/intake/receive', { channel: 'gmail', externalId: 'q86-d', email: 'd.q86@gmail.com', name: 'Dana', body: 'hi' });
  const [, qd] = await post(`/api/intake/${d.id}/qualify`, { qualification: 'lead', createPerson: true, nextAction: 'Follow up', nextActionDue: '2026-10-21T09:00:00.000Z', stated: { interest: CFG.programmes[0] } });
  const [sd] = await post(`/api/people/${qd.landed.id}/status`, { status: 'Not proceeding', closedTag: 'reject' });
  assert.equal(sd, 400, 'a reject without a reason is refused, as before');
});

test('Q86 in the app: one picker, two answers, on the Inbox card, Done, Choose and the quick edit', () => {
  const pick = fn('function cNextPick(');
  assert.match(pick, /value="follow"[^>]*><b>Follow up<\/b><\/label>\s*<input id="\$\{esc\(pfx\)\}-date" type="date" min="\$\{cTodayIso\(\)\}"/, 'Follow up and its date');
  assert.match(pick, /value="cold"[^>]*><b>Cold<\/b><\/label>\s*<select id="\$\{esc\(pfx\)\}-reason"[^>]*hidden><option value="">No reason<\/option>/, 'Cold and an optional reason');
  assert.match(pick, /onchange="cNextPickSet\(\$\{p\}\)"/, 'the handler built the safe way');
  const read = fn('function cNextPickRead(');
  assert.match(read, /return due \? \{ kind: 'follow', due \} : \{ kind: 'follow', error: 'Set the follow-up date\.' \};/, 'the date is required');
  assert.match(APP, /\$\{cNextPick\('q'\)\}/, 'the Inbox card');
  assert.match(APP, /\$\{cNextPick\('c'\)\}/, 'Done');
  assert.match(APP, /\$\{cNextPick\('t'\)\}/, 'Choose next step');
  assert.match(APP, /\$\{cNextPick\('pe', true\)\}/, 'the quick edit, nothing chosen until a choice is made');
  assert.match(APP, /const C_FOLLOW = 'Follow up';/);
  assert.ok(CFG.nextActions.flatMap((g) => g.items).some((i) => i.label === 'Follow up' && i.anyStage), 'Follow up is a step of every stage');
});

test('Q86: the date-less Follow up is refused before anything is saved', () => {
  const doc = { checked: { value: 'follow' }, date: { value: '' }, reason: { value: '' } };
  const ctx = { document: { querySelector: (q) => (q.includes(':checked') ? doc.checked : q.endsWith('-date') ? doc.date : doc.reason) } };
  vm.runInNewContext(fn('function cNextPickRead(') + '\nthis.read = cNextPickRead;', ctx);
  assert.deepEqual({ ...ctx.read('q') }, { kind: 'follow', error: 'Set the follow-up date.' });
  doc.date.value = '2026-10-15';
  assert.deepEqual({ ...ctx.read('q') }, { kind: 'follow', due: '2026-10-15' });
  doc.checked = { value: 'cold' }; doc.reason.value = '';
  assert.deepEqual({ ...ctx.read('q') }, { kind: 'cold', reason: '' });
});

test('Q87: the Journey list runs by the next-step date, nearest first; the finished last', () => {
  const pool = fn('function cDrawJourneyPool(');
  assert.match(pool, /list = cJSort\(list, taskOf\);\s*list = \[\.\.\.list\.filter\(\(p\) => !C_TERMINAL\.includes\(p\.status\)\), \.\.\.list\.filter\(\(p\) => C_TERMINAL\.includes\(p\.status\)\)\];/);
  // run the board's order on people with known dates
  const TODAY = '2026-10-12';
  const ctx = { Date, Math, cTodayIso: () => TODAY, cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''), C_SIS_HOLDS: [], cSisHolds: () => false };
  const line = (s) => { const i = APP.indexOf(s); return APP.slice(i, APP.indexOf('\n', i) + 1); };
  vm.runInNewContext([line('const cWhenClass = '), line('const cDaysLate = '), fn('function cJUrgency('), fn('function cJSort(')].join('\n') + '\nthis.sort = cJSort;', ctx);
  const ppl = ['none', 'later', 'today', 'late1', 'late9', 'soon'].map((id) => ({ id }));
  const taskOf = new Map([['later', { due_at: '2026-10-30T09:00:00Z' }], ['soon', { due_at: '2026-10-14T09:00:00Z' }],
    ['today', { due_at: '2026-10-12T09:00:00Z' }], ['late1', { due_at: '2026-10-11T09:00:00Z' }], ['late9', { due_at: '2026-10-03T09:00:00Z' }]]);
  assert.deepEqual(ctx.sort(ppl, taskOf).map((p) => p.id), ['late9', 'late1', 'today', 'soon', 'later', 'none']);
});

test('the Help center says it in the same change', () => {
  const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  assert.match(HELP.tour.find((x) => x.title === 'Due').body, /choose the next step: Follow up on a date, or Cold/);
  assert.match(HELP.faq.find((x) => x.id === 'step-due').a, /Cold: they are kept as Not proceeding, tagged Cold/);
});

// "Set aside: a way back" (the owner put it on the finish line, 07.10.2026). Set aside on an Inbox card used to be a
// one-way door: the set-aside messages were only listed, read-only, at #/leads?show=archived. Bring back returns a
// message to the Inbox as new, in its arrival-day column, logged with who and when; nothing is deleted. It works for
// what the Q31 filter set aside too, because a filter mistake is the likeliest case. Every user may, as with Set aside.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, listInbound, archive, bringBack, inboundHistory, refilterOpen } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

// ---------------------------------------------------------------- the data --
test('set aside -> bring back -> in the Inbox again, both steps in the history, the arrival time untouched', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'gmail', externalId: 'b1', email: 'anna@gmail.com', name: 'Anna', body: 'I want to study navigation',
    receivedAt: '2026-10-03T08:00:00.000Z', source: 'provider' });
  const a = await archive(db, r.id, { reason: 'Other', note: 'clicked by mistake', by: 'Ieva' });
  assert.ok(a.ok);
  assert.equal((await listInbound(db, { state: 'new' })).length, 0);

  const b = await bringBack(db, r.id, { by: 'Laura' });
  assert.ok(b.ok, JSON.stringify(b));
  assert.equal(b.from, 'archived');
  const [back] = await listInbound(db, { state: 'new' });
  assert.equal(back.id, r.id, 'in the Inbox again');
  assert.equal(back.received_at, '2026-10-03T08:00:00.000Z', 'its arrival day, so its own column');
  assert.equal(back.archive_reason, null);
  assert.equal(b.textKept, false, 'Set aside deletes the text on purpose; it cannot come back, and says so');

  const h = await inboundHistory(db, r.id);
  assert.deepEqual(h.map((x) => [x.action, x.actor]), [['set_aside', 'Ieva'], ['brought_back', 'Laura']]);
  assert.equal(h[1].from_state, 'archived');
  assert.equal(h[1].reason, 'Other');
  assert.equal(h[1].note, 'clicked by mistake', 'what the set-aside said is kept');
  assert.equal(h[1].earlier_actor, 'Ieva');
  assert.ok(h[1].earlier_at && h[1].at);
});

test('a second Bring back is harmless: it says so and writes nothing', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'gmail', externalId: 'b2', email: 'b@gmail.com', body: 'hello', source: 'provider' });
  await archive(db, r.id, { reason: 'Spam', by: 'Ieva' });
  assert.ok((await bringBack(db, r.id, { by: 'Ieva' })).ok);
  const again = await bringBack(db, r.id, { by: 'Ieva' });
  assert.deepEqual({ ...again }, { ok: true, id: r.id, already: true });
  assert.equal((await inboundHistory(db, r.id)).length, 2, 'set aside + one bring back, not two');
});

test('a message the filter set aside comes back WITH its text, and the clean-up button leaves it alone after', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'gmail', externalId: 'b3', email: 'novikontas-noreply@m-s-solutions.net',
    name: 'Novikontas Noreply', body: 'A registration: MECH / 2026-10-05', source: 'provider' });
  assert.equal(r.filtered, true);
  const b = await bringBack(db, r.id, { by: 'Ieva' });
  assert.equal(b.from, 'filtered');
  assert.equal(b.textKept, true);
  const [back] = await listInbound(db, { state: 'new' });
  assert.equal(back.body, 'A registration: MECH / 2026-10-05');
  const h = await inboundHistory(db, r.id);
  assert.equal(h[0].action, 'brought_back');
  assert.equal(h[0].earlier_actor, 'machine');
  assert.match(h[0].note, /automatic sender/);
  assert.equal((await refilterOpen(db)).wouldMove, 0, 'a person brought it back; the rule does not take it again');
});

test('only a set-aside message can come back; a lead made from a message cannot', async () => {
  const db = await openDb(':memory:');
  assert.equal((await bringBack(db, 999, { by: 'Ieva' })).error, 'not found');
  const r = await receive(db, { channel: 'gmail', externalId: 'b4', email: 'c@gmail.com', body: 'hi', source: 'provider' });
  await db.prepare("UPDATE inbound SET state = 'qualified' WHERE id = ?").run(r.id);
  assert.match((await bringBack(db, r.id, { by: 'Ieva' })).error, /only a message set aside/);
  assert.match((await bringBack(db, r.id, {})).error || '', /who|only/);
});

// ---------------------------------------------------------------- the route --
function start() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '' },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('the route, as a user (not only admins): set aside, list, bring back, list again, twice', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const as = { 'x-acting-as': 'Ieva', 'content-type': 'application/json' };
  const sim = await fetch(s.base + '/api/inbound/website/simulate', { method: 'POST', headers: as, body: '{}' }).then((r) => r.json());
  assert.ok(sim.ok, JSON.stringify(sim));
  const list = (st) => fetch(`${s.base}/api/intake?state=${st}`, { headers: as }).then((r) => r.json()).then((j) => j.rows);
  const [row] = await list('new');
  const aside = await fetch(`${s.base}/api/intake/${row.id}/archive`, { method: 'POST', headers: as, body: JSON.stringify({ reason: 'Spam' }) });
  assert.equal(aside.status, 200);
  assert.equal((await list('archived')).length, 1);
  const back = await fetch(`${s.base}/api/intake/${row.id}/bring-back`, { method: 'POST', headers: as, body: '{}' }).then((r) => r.json());
  assert.equal(back.ok, true);
  assert.equal(back.from, 'archived');
  assert.deepEqual((await list('new')).map((r) => r.id), [row.id], 'back in the Inbox');
  assert.equal((await list('archived')).length, 0, 'and gone from the set-aside view');
  const twice = await fetch(`${s.base}/api/intake/${row.id}/bring-back`, { method: 'POST', headers: as, body: '{}' }).then((r) => r.json());
  assert.equal(twice.already, true, 'a double click is harmless');
  assert.equal((await fetch(`${s.base}/api/intake/99999/bring-back`, { method: 'POST', headers: as, body: '{}' })).status, 404);
});

// ----------------------------------------------------------------- the view --
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
function board(show) {
  const view = { innerHTML: '' };
  const rows = [{ id: 7, contact_name: 'Anna', channel: 'gmail', received_at: '2026-10-06T08:00:00Z', body: null, fields: [], state: show === 'new' ? 'new' : 'archived', senderKind: 'other' }];
  const ctx = {
    C_IP: { col: null, channel: '', kind: '', show }, C_LOPEN: null,
    C_IPD: { rows, receipt: '', val: () => '', form: () => '<form>' },
    cTodayIso: () => '2026-10-06', cDay: (iso) => String(iso).slice(0, 10),
    esc: (s) => String(s ?? ''), channelLabel: (c) => c, cTelLink: () => '', fmtDateTime: (x) => x, cCallLine: (b) => b,
    cPoolFrame: (o) => o.body, cPoolBand: () => '', cPoolSelect: () => '', cPoolFilters: () => '',
    $: () => view, view, cPoolWire: () => {}, cPoolOpened: () => {},
  };
  vm.runInNewContext([line('const C_IP_KIND = '), fnBody('function cInboxAge(iso) {'), line('const cAgo = '), fnBody('function cInboxPool() {'), 'cInboxPool();'].join('\n'), ctx);
  return view.innerHTML;
}

test('the set-aside view: each card has one action, Bring back; the Inbox itself shows no such button', () => {
  for (const show of ['archived', 'filtered', 'notrelevant']) {
    const html = board(show);
    assert.match(html, /onclick="event\.stopPropagation\(\);cBringBack\(7, this\)">Bring back<\/button>/, show);
    assert.doesNotMatch(html, /Make a lead|Set aside/, show + ': still none of the Inbox actions');
  }
  assert.doesNotMatch(board('new'), /Bring back/, 'no new entry point on the Inbox (MAIN draws that as an A/B)');
  const f = fnBody('async function cBringBack(id, btn) {');
  assert.match(f, /\/bring-back', \{ method: 'POST'/);
  assert.match(f, /await viewLeadsC\(\);/, 'the view reloads, so the card leaves it');
});

test('the Help center says how, in the same change', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const h = help.howto.find((x) => x.do === 'Bring a set-aside message back');
  assert.ok(h, 'the how-to exists');
  assert.equal(h.href, '#/leads?show=notrelevant', 'it opens the set-aside messages, by a person and by the filter');
});

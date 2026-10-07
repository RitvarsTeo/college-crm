// FIRST-REPLY TIME (the owner, 07.10.2026: on the finish line; "Yes, from edu@"). For each real email enquiry the
// pull reads its thread's SENT messages (format=metadata, the Date header only) and keeps ONLY the time of the first
// one after the enquiry. A call's reply is its first answered call. The report row compares the median with UPCEA 2025
// (3 h 18 min), over enquiries 24 h+ old, "no reply yet" counted, an unread thread never counted as "no reply".
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncReplies, syncPbx, syncGmail } from '../src/sync.js';
import { rowsFrom } from '../lib/pbx.js';
import { firstSentAfter } from '../lib/gmail.js';
import { report, firstReply, periodOf } from '../src/reports.js';
import { localDate } from '../src/bizday.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const H = 3600000;
const NOW = new Date();
const ago = (h) => new Date(NOW.getTime() - h * H).toISOString();
const rfc = (iso) => new Date(iso).toUTCString();   // a Date header

// a throwaway signing key, as test/gmail_to_new_leads.test.js does: the token step signs a real JWT
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'live', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };

const msg = (id, labels, iso) => ({ id, labelIds: labels, internalDate: String(Date.parse(iso)), payload: { headers: [{ name: 'Date', value: rfc(iso) }] } });
function fakeGmail(threads) {
  const asked = [];
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      const body = { access_token: 'x', expires_in: 3600 };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }
    asked.push(url);
    const id = decodeURIComponent(url.split('/threads/')[1].split('?')[0]);
    if (!threads[id]) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ id, messages: threads[id] }), text: async () => '' };
  };
  return { fetchImpl, asked };
}
async function enquiry(db, { channel = 'gmail', thread = null, at, state = 'new', source = 'provider', person = null }) {
  const r = await db.prepare(`INSERT INTO inbound (channel, thread_key, external_id, received_at, surface_at, suggested, state, source, person_id)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(channel, thread, 'x' + Math.random(), at, at, 'raw', state, source, person);
  return Number(r.lastInsertRowid ?? r.lastID ?? (await db.prepare('SELECT MAX(id) n FROM inbound').get()).n);
}

test('the thread: only the FIRST message edu@ sent after the enquiry counts; earlier mail and later replies do not', () => {
  const t0 = ago(30);
  const thread = { messages: [msg('a', ['SENT'], ago(40)), msg('e', ['INBOX'], t0), msg('r1', ['SENT'], ago(28)), msg('r2', ['SENT'], ago(25))] };
  assert.equal(firstSentAfter(thread, t0), new Date(rfc(ago(28))).toISOString());
  assert.equal(firstSentAfter({ messages: [msg('e', ['INBOX'], t0)] }, t0), null, 'no reply yet');
  const noDate = { id: 'n', labelIds: ['SENT'], internalDate: String(Date.parse(ago(29))), payload: { headers: [] } };
  assert.equal(firstSentAfter({ messages: [noDate] }, t0), new Date(Date.parse(ago(29))).toISOString(), "Gmail's internalDate only when a message has no Date");
});

test('the pull: reads ONLY the Date header; keeps the first reply time; stamps every read; a refused thread is read again', async () => {
  const db = await openDb(':memory:');
  await db.prepare("INSERT INTO people (id,name,status,owner,created_at) VALUES ('p1','T','New','Admissions',?)").run(ago(40));
  const t0 = ago(30);
  const replied = await enquiry(db, { thread: 'T1', at: t0 });
  const person = await enquiry(db, { thread: 'T2', at: t0, state: 'qualified', person: 'p1' });
  const silent = await enquiry(db, { thread: 'T3', at: t0 });
  const refused = await enquiry(db, { thread: 'T4', at: t0 });
  const simulated = await enquiry(db, { thread: 'T5', at: t0, source: 'simulated' });
  const set = await enquiry(db, { thread: 'T6', at: t0, state: 'filtered' });
  const both = [msg('e', ['INBOX'], t0), msg('r1', ['SENT'], ago(28)), msg('r2', ['SENT'], ago(25))];
  const { fetchImpl, asked } = fakeGmail({ T1: both, T2: both, T3: [msg('e', ['INBOX'], t0)], T5: both, T6: both });
  const r = await syncReplies(db, { now: NOW, env: ENV, fetchImpl, refreshToken: null });
  assert.deepEqual({ ...r }, { ok: true, read: 3, replied: 2, refused: 1 }, 'the thread Gmail refused is COUNTED, never silently dropped');
  for (const u of asked) assert.match(u, /\/threads\/T\d\?format=metadata&metadataHeaders=Date$/, 'never the body, the subject or the recipients');
  assert.deepEqual(asked.map((u) => u.match(/threads\/(T\d)/)[1]).sort(), ['T1', 'T2', 'T3', 'T4'], 'a test-mode copy and a filtered row are never read');
  const row = async (id) => db.prepare('SELECT first_reply_at, reply_checked_at FROM inbound WHERE id = ?').get(id);
  const first = new Date(rfc(ago(28))).toISOString();
  assert.equal((await row(replied)).first_reply_at, first, 'the first reply, not the second');
  assert.ok((await row(silent)).reply_checked_at && !(await row(silent)).first_reply_at, 'read, no reply yet');
  assert.ok(!(await row(refused)).reply_checked_at, 'Gmail refused: not stamped, read again next run');
  assert.ok(!(await row(simulated)).reply_checked_at && !(await row(set)).reply_checked_at);
  const ev = await db.prepare("SELECT kind, channel, direction, origin, occurred_at, subject, body FROM events WHERE person_id = 'p1'").all();
  assert.deepEqual(ev.map((e) => ({ ...e })), [{ kind: 'email', channel: 'email', direction: 'out', origin: 'automatic', occurred_at: first, subject: 'Email reply sent', body: null }],
    'the person History: an outgoing email at its own time, no subject line of theirs, no body');
  // a second run: the replied rows are not read again, nothing doubles
  const again = await syncReplies(db, { now: NOW, env: ENV, fetchImpl, refreshToken: null });
  assert.equal(again.replied, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM events WHERE person_id = 'p1'").get()).n, 1);
  await db.close();
});

test('the report: matured enquiries only, phone by its first answered call, an unread thread left out; nothing known = no row', async () => {
  const db = await openDb(':memory:');
  const p = periodOf(localDate().slice(0, 4) + '-01-01', localDate());
  assert.equal(await firstReply(db, p), null, 'nothing known: nothing drawn');
  const e1 = await enquiry(db, { thread: 'A', at: ago(50) });
  await db.prepare('UPDATE inbound SET first_reply_at = ?, reply_checked_at = ? WHERE id = ?').run(ago(48), ago(1), e1);   // 2 h
  const e2 = await enquiry(db, { thread: 'B', at: ago(50) });
  await db.prepare('UPDATE inbound SET reply_checked_at = ? WHERE id = ?').run(ago(1), e2);                                 // read, no reply
  await enquiry(db, { thread: 'C', at: ago(50) });                                                                          // never read: left out
  await enquiry(db, { thread: 'D', at: ago(2) });                                                                           // too young
  await enquiry(db, { thread: 'E', at: ago(50), state: 'filtered' });                                                       // set aside
  const call = async (inb, at, picked) => db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up, operator_name, person_id, inbound_id, inserted_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('u' + Math.random(), at, '1001*Q-ADMISSION', '20000000', picked, 'op', null, inb, at);
  const ph1 = await enquiry(db, { channel: 'phone', thread: 'phone:1', at: ago(60) }); await call(ph1, ago(60), 1);           // answered: 0 min
  const ph2 = await enquiry(db, { channel: 'phone', thread: 'phone:2', at: ago(60) }); await call(ph2, ago(60), 0);           // missed, no answer
  const ph3 = await enquiry(db, { channel: 'phone', thread: 'phone:3', at: ago(60) }); await call(ph3, ago(60), 0); await call(ph3, ago(56), 1);   // rang again, answered 4 h later
  const f = await firstReply(db, p);
  assert.deepEqual([f.of, f.reached, f.noReply, f.unread], [5, 3, 2, 1], 'e1 e2 ph1 ph2 ph3 known; C unread; D young; E set aside');
  assert.equal(f.median, 120, 'replies 0 min, 2 h, 4 h: the median is 2 h');
  assert.deepEqual(f.reachedIds.sort(), [e1, ph1, ph3].sort());
  assert.deepEqual({ ...(await report(db, { from: p.from.slice(0, 10), to: localDate() })).steps.firstReply }, { ...f }, 'the report carries the same figure');
  await db.close();
});

test('the row: one more row of the benchmark design, a 0-24 h track, the UPCEA tick, its figures open the Inbox', () => {
  const ctx = { CFG, esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) };
  const block = APP.slice(APP.indexOf('// minutes in words:'), APP.indexOf('// One figure, drawn as the click to its people.'));
  const go = APP.slice(APP.indexOf('const cRepGo = '), APP.indexOf('// A label for a breakdown value'));
  vm.runInNewContext([block, go].join('\n').replace(/^const /gm, 'var '), ctx);
  assert.equal(ctx.cMinWord(198), '3 h 18 min'); assert.equal(ctx.cMinWord(45), '45 min'); assert.equal(ctx.cMinWord(1440), '24 h'); assert.equal(ctx.cMinWord(1560), '26 h');
  const b = CFG.benchmarks.rows.find((r) => r.id === 'first_reply');
  const html = ctx.cRepBench([{ b, few: true, pct: null, minutes: 120, base: { n: 5, go: 'inbox' }, won: { n: 3, go: 'inbox' } }]);
  assert.match(html, /<b>First reply<\/b><small><a class="rp-go" href="#\/outcomes" data-n="5" data-kgo="inbox"[^>]*>5<\/a> &rarr; <a class="rp-go" href="#\/outcomes" data-n="3" data-kgo="inbox"[^>]*>3<\/a><\/small>/);
  assert.match(html, /<div class="bm-trackbox" tabindex="0" role="button" data-kgo="inbox" data-tip="First reply\|~2 h\|3 h 18 min typical · US colleges, 2025">/);
  assert.match(html, /<span class="bm-end bm-0">0<\/span><span class="bm-end bm-100">24 h<\/span>/, 'the time track says its scale');
  assert.match(html, /<span class="bm-band" style="left:13.75%;width:0%"><\/span>/, 'the tick at 3 h 18 min of 24 h');
  assert.match(html, /<span class="bm-dot few" style="left:8.33%" data-v="~2 h"><b>~2 h<\/b><i><\/i><\/span>/);
  const late = ctx.cRepBench([{ b, few: false, pct: null, minutes: 1560, base: { n: 30, go: 'inbox' }, won: { n: 20, go: 'inbox' } }]);
  assert.match(late, /style="left:100%" data-v="26 h"/, 'past 24 h: at the end of the track, and it says its real value');
  assert.ok(!ctx.cRepBench([{ b, few: false, pct: null, minutes: null, base: { n: 4, go: 'inbox' }, won: { n: 0, go: 'inbox' } }]).includes('bm-dot'), 'no reply at all: no dot');
});

test('the row stays OFF (config on:false) and, even on, waits until no enquiry of the period is unread', () => {
  const block = APP.slice(APP.indexOf('const C_BENCH_NEEDS'), APP.indexOf('// Variant A: one bullet row per benchmark.'));
  const ctx = {};
  vm.runInNewContext(block.replace(/^const /gm, 'var '), ctx);
  const b = CFG.benchmarks.rows.find((r) => r.id === 'first_reply');
  assert.equal(b.on, false, 'off in config until the email is read and the Inbox can open the exact enquiries');
  const steps = { leadToApplication: { of: 30, pct: 40 }, contractToAdmitted: { of: 5, pct: 80 }, firstReply: { kind: 'inbox', of: 15, reached: 10, median: 0, unread: 0 } };
  // all benchmarks are parked since 07.10 (benchmarks.on false); with the switch on, this row's own rules still hold
  const parked = { ...CFG.benchmarks, on: true };
  assert.deepEqual(ctx.cRepBenchRows(steps, parked).map((x) => x.b.id), ['lead_to_application', 'contract_to_admitted'], 'absent while on:false');
  const on = { ...parked, rows: parked.rows.map((r) => (r.id === 'first_reply' ? { ...r, on: true } : r)) };
  assert.deepEqual(ctx.cRepBenchRows(steps, on).map((x) => x.b.id), ['lead_to_application', 'contract_to_admitted', 'first_reply'], 'switched on and complete: drawn');
  assert.deepEqual(ctx.cRepBenchRows({ ...steps, firstReply: { ...steps.firstReply, unread: 57 } }, on).map((x) => x.b.id),
    ['lead_to_application', 'contract_to_admitted'], 'an unread thread in the period: not drawn (missing values are never shown)');
});

test('the Gmail run saves its reply read with the run, refused threads included', async () => {
  const db = await openDb(':memory:');
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) { const body = { access_token: 'x', expires_in: 3600 }; return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }; }
    if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [] }), text: async () => '' };
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };   // every thread refused
  };
  await enquiry(db, { thread: 'R1', at: ago(30) });
  const r = await syncGmail(db, { now: NOW, env: ENV, fetchImpl });
  assert.deepEqual({ ...r.replies }, { ok: true, read: 0, replied: 0, refused: 1 });
  const saved = JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'gmail'").get()).detail);
  assert.deepEqual(saved.replies, { ok: true, read: 0, replied: 0, refused: 1 }, 'the refusal is on the record of the run');
  await db.close();
});

test('(b) the phone run saves how many calls of each destination the list returned: counts only', async () => {
  const c = (over) => ({ uniqueid: 'u' + Math.random(), destination: 'incoming', queue: '1001*Q-ADMISSION', caller_num: '+37129111222',
    state: 'ANSWER', operator_name: 'op', created_at: '2026-10-01 11:58:00', ...over });
  const calls = [c({}), c({ destination: 'outgoing', queue: null }), c({ destination: 'outgoing', queue: null }), c({ destination: 'internal' }), c({ destination: undefined })];
  assert.deepEqual(rowsFrom(calls).destinations, { incoming: 1, outgoing: 2, internal: 1, none: 1 });
  const db = await openDb(':memory:');
  const r = await syncPbx(db, { now: new Date('2026-10-01T09:05:00Z'), minutes: 15, env: { PBX_API_TOKEN: 'test-pbx-token-not-real-0000', CHANNEL_MODE_PHONE: 'live' },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => calls, text: async () => '' }) });
  assert.equal(r.destinations.outgoing > 0, true);
  const saved = JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'pbx_until'").get()).detail);
  assert.ok(saved.destinations && saved.destinations.outgoing > 0 && saved.destinations.incoming > 0, 'saved with the run');
  assert.ok(!JSON.stringify(saved).includes('37129111222'), 'no number, no person: counts only');
  await db.close();
});

test('the end labels are clear of a dot at 0 and at the end of the track', () => {
  assert.match(APP, /html\.ui-c \.bm-trackbox\{position:relative;height:74px;margin:0 56px 0 28px\}/);
  assert.match(APP, /html\.ui-c \.bm-0\{left:-24px\}/);
  assert.match(APP, /html\.ui-c \.bm-100\{right:-54px\}/);
  assert.match(APP, /@media \(max-width:700px\)\{ html\.ui-c \.bm-row\{grid-template-columns:1fr;gap:6px\} html\.ui-c \.bm-trackbox\{margin:0 56px 0 28px\} \}/);
});

test('the Help center says what staff can see now, in the same commit', () => {
  const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const f = HELP.faq.find((x) => x.id === 'first-reply');
  assert.equal(f.q, "What is \"Email reply sent\" in a person's History?");
  assert.match(f.a, /only the time of the first reply sent from edu@ in that conversation, never its text/);
  assert.doesNotMatch(f.a, /Reports|First reply figure/, 'the benchmarks are parked (07.10): the Help sends nobody to a row that is not there');
});

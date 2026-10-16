// ONE RULE ON EVERY CARD (the owner, 14.10.2026; reasons as changed the same day: "we need some history with people in
// our app"). Every card on every channel has two actions, Make a lead and Set aside. Set aside = pick one of exactly
// four reasons on the card: Not a prospective student (the usual one, first), Supplier or vendor, Internal, Spam. The
// last three also MARK the phone number or email address until somebody removes the mark: a marked number or address
// never pops up and never reaches the Inbox. The phone card's own "Not a lead" went. Somebody set aside before who gets
// in touch again comes back, with "Set aside before: dd.mm, who, reason". An answered call carries one line, "What was
// it about?", which travels with Make a lead. Everything here runs on an in-memory database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, listInbound, archive, setMark, removeMark, bringBack, qualify, inboundHistory, callsFor, setCallNote, withCallNotes,
  CALL_NOTE_MAX, CALL_NOTE_SUBJECT, CONFIG } from '../src/intake.js';
import { storeCall } from '../src/sync.js';
import { callFeed } from '../src/callpop.js';
import { markFor } from '../src/phonefilter.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const FOUR = ['Not a prospective student', 'Supplier or vendor', 'Internal', 'Spam'];
const NP = 'Not a prospective student';

const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const ESC = line('const esc = ');
const FOLD = APP.slice(APP.indexOf('const C_UNFOLD = '), APP.indexOf('let C_TP = ')).replace(/^const /gm, 'var ') + '\n';

// the Inbox board as the app draws it, with the app's own escaping
function board(rows, { show = 'new', aside = null } = {}) {
  const view = { innerHTML: '' };
  const ctx = {
    C_IP: { col: null, channel: '', kind: '', show, aside }, C_LOPEN: null,
    C_IPD: { rows, receipt: '', val: () => '', form: () => '<form>', reasons: FOUR, marks: CONFIG.intake.marks },
    cTodayIso: () => '2026-10-14', cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''),
    channelLabel: (c) => c, cTelLink: () => '', fmtDateTime: (x) => String(x || ''), cCallLine: (b) => b,
    cPoolFrame: (o) => o.body, cPoolBand: () => '', cPoolSelect: () => '', cPoolFilters: () => '',
    $: () => view, view, cPoolWire: () => {}, cPoolOpened: () => {},
  };
  vm.runInNewContext([ESC, line('const cPhone = '), line('const C_ST = '), line('const C_ST_RAIL = '), fnBody('function cStateLine('),
    line('const C_IP_KIND = '), fnBody('function cInboxAge(iso) {'), line('const cAgo = '), line('const cDdMm = '),
    line('const C_MARK_SHORT = '), line('const cAsideWhen = '), fnBody('function cMarkCtl('), fnBody('function cAsideChoice('),
    fnBody('function cCallsHtml('), fnBody('function cCallLen('), fnBody('function cCallWhat('), fnBody('function cCallNoteInput('),
    'var CFG = globalThis.CFG || {};', FOLD + fnBody('function cInboxPool() {'), 'cInboxPool();'].join('\n'), ctx);
  return view.innerHTML;
}
const cardOf = (html, id) => { const i = html.indexOf(`data-id="${id}"`); assert.ok(i >= 0, 'card ' + id); return html.slice(i, html.indexOf('data-id=', i + 10) > 0 ? html.indexOf('data-id=', i + 10) : undefined); };

const call = (over = {}) => ({ uniqueid: 'u1', created_at: '2026-10-14T09:00:00.000Z', queue: '1001*Q-ADMISSION',
  caller_num: '+37129111222', picked_up: true, operator_name: 'Ieva', ...over });
const out = () => ({ seen: 0, logged: 0, callBack: 0, again: 0, filtered: 0, inbox: 0, noNumber: 0 });

// ------------------------------------------------------------------ 1. one rule --
test('1: Set aside is the same on every channel: one of the four reasons, kept with date, who and reason', async () => {
  assert.deepEqual(CONFIG.intake.archiveReasons, FOUR);
  assert.deepEqual(CONFIG.intake.marks, FOUR.slice(1));
  const db = await openDb(':memory:');
  const channels = ['gmail', 'phone', 'website', 'linkedin', 'sis', 'whatsapp', 'facebook', 'instagram', 'messenger'];
  for (const [i, channel] of channels.entries()) {
    const r = await receive(db, { channel, externalId: 'one' + i, name: 'Person ' + i, body: 'hello', source: 'provider' });
    assert.equal((await archive(db, r.id, { by: 'Ieva' })).error.startsWith('pick why'), true, channel + ': a reason is the action');
    const a = await archive(db, r.id, { reason: NP, by: 'Ieva' });
    assert.equal(a.ok, true, channel);
    const row = await db.prepare('SELECT state, archive_reason, processed_by, processed_at FROM inbound WHERE id = ?').get(r.id);
    assert.deepEqual([row.state, row.archive_reason, row.processed_by], ['archived', NP, 'Ieva'], channel);
    assert.ok(row.processed_at);
    const [h] = await inboundHistory(db, r.id);
    assert.deepEqual([h.action, h.actor, h.reason], ['set_aside', 'Ieva', NP], channel + ': in the history');
  }
});

test('1: the phone card and the email card carry the same two actions; no Not a lead; Set aside opens the four on the card', () => {
  const rows = [
    { id: 1, contact_name: 'Anna', channel: 'gmail', received_at: '2026-10-14T08:00:00Z', body: 'hello', fields: [], state: 'new', senderKind: 'other' },
    { id: 2, contact_phone: '+37129111222', channel: 'phone', received_at: '2026-10-14T08:10:00Z', body: 'Incoming call', fields: [], state: 'new', senderKind: 'other',
      calls: [{ id: 'u1', at: '2026-10-14T08:10:00Z', line: 'Admissions', answered: true, operator: 'Ieva' }] },
  ];
  const html = board(rows);
  for (const id of [1, 2]) {
    const c = cardOf(html, id);
    assert.match(c, new RegExp(`C_LOPEN=${id};cInboxPool\\(\\)">Make a lead</button><button type="button" class="ib-aside" onclick="event\\.stopPropagation\\(\\);C_IP\\.aside=${id};cInboxPool\\(\\)">Set aside</button></div>`), 'card ' + id);
  }
  assert.doesNotMatch(html, /Not a lead/);
  assert.doesNotMatch(APP, /cNotALead|id="aReason"|async function openArchive\(/, 'the phone button and the reason dialog are gone');
  const why = cardOf(board(rows, { aside: 2 }), 2);
  assert.deepEqual([...why.matchAll(/cSetAside\(2, &quot;([^&]+)&quot;, this\)">([^<]+)</g)].map((m) => m[2]), FOUR, 'the four, these words, this order');
});

// ------------------------------------------------------------------ 2. marks --
test('2: Spam on an email card marks the ADDRESS: its next message on any channel is set aside, logged, never the Inbox', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'gmail', externalId: 'm1', email: 'Seller@Example.com', name: 'Seller', body: 'offer', source: 'provider' });
  const a = await archive(db, r.id, { reason: 'Spam', by: 'Ieva' });
  assert.deepEqual(a.marked, ['email']);
  assert.deepEqual((await markFor(db, { email: 'seller@example.com' })).mark, 'Spam');
  for (const [i, channel] of ['gmail', 'website', 'linkedin'].entries()) {
    const n = await receive(db, { channel, externalId: 'm2' + i, email: 'seller@example.com', body: 'again', source: 'provider' });
    assert.equal(n.filtered, true, channel);
    const row = await db.prepare('SELECT state, archive_note, processed_by FROM inbound WHERE id = ?').get(n.id);
    assert.deepEqual([row.state, row.archive_note, row.processed_by], ['filtered', 'this address is marked "Spam"', 'machine'], channel);
  }
  assert.equal((await listInbound(db, { state: 'new' })).length, 0, 'never the Inbox');
  const folder = await listInbound(db, { state: 'notrelevant' });
  assert.ok(folder.every((x) => x.mark === 'Spam'), 'every card of it says its mark');
  const h = await inboundHistory(db, r.id);
  assert.deepEqual(h.map((x) => [x.action, x.reason]), [['set_aside', 'Spam'], ['marked', 'Spam']]);
});

test('2: Supplier or vendor and Internal mark a NUMBER: later calls are set aside and never pop; Not a prospective student marks nothing', async () => {
  for (const reason of ['Supplier or vendor', 'Internal', NP]) {
    const db = await openDb(':memory:');
    const o = out();
    await storeCall(db, call(), 'live', '2026-10-14T09:01:00Z', o);
    const [card] = await listInbound(db, { state: 'new' });
    await archive(db, card.id, { reason, by: 'Laura' });
    const o2 = out();
    await storeCall(db, call({ uniqueid: 'u2', caller_num: '29111222', created_at: '2026-10-14T09:10:00.000Z' }), 'live', '2026-10-14T09:11:00Z', o2);
    assert.equal(o2.filtered, reason === NP ? 0 : 1, reason);
    assert.equal(o2.inbox, reason === NP ? 1 : 0, reason);
    // the pop-up: a ring from that number now
    const now = new Date('2026-10-14T09:20:00Z');
    await db.prepare(`INSERT INTO call_events (call_id, event, at, queue, caller_num, operator, extension, source, received_at)
      VALUES ('r1', 'ringing', ?, '1001*Q-ADMISSION', '+371 29 111 222', NULL, NULL, 'provider', ?)`).run(now.toISOString(), now.toISOString());
    const feed = await callFeed(db, { after: 0, viewer: 'Ieva', users: ['Ieva', 'Laura'], now });
    assert.equal(feed.events.filter((e) => e.callId === 'r1').length, reason === NP ? 1 : 0, reason + ': pops only when not marked');
  }
});

test('2: Mark from the set-aside folder, then Remove mark: set, effect, undone, both logged; the folder card is not moved', async () => {
  const db = await openDb(':memory:');
  const a = await receive(db, { channel: 'website', externalId: 'f1', email: 'shop@supplier.lv', phone: '+371 2000 0001', body: 'catalogue', source: 'provider' });
  await archive(db, a.id, { reason: NP, by: 'Ieva' });
  const waiting = await receive(db, { channel: 'gmail', externalId: 'f2', email: 'shop@supplier.lv', body: 'still here', source: 'provider' });
  assert.equal((await listInbound(db, { state: 'new' })).length, 1);
  assert.match((await setMark(db, a.id, { mark: 'Other', by: 'Ieva' })).error, /a mark is one of/);
  assert.match((await setMark(db, a.id, { mark: 'Spam' })).error, /who/);
  const m = await setMark(db, a.id, { mark: 'Supplier or vendor', by: 'Ieva' });
  assert.deepEqual([m.ok, m.marked, m.setAside], [true, ['phone', 'email'], [waiting.id]], 'number AND address; its waiting card leaves the Inbox');
  assert.equal((await db.prepare('SELECT archive_reason FROM inbound WHERE id = ?').get(waiting.id)).archive_reason, 'Supplier or vendor');
  assert.equal((await db.prepare('SELECT archive_reason FROM inbound WHERE id = ?').get(a.id)).archive_reason, NP, 'the folder card keeps its own reason');
  assert.equal((await receive(db, { channel: 'phone', externalId: 'f3', phone: '20000001', body: 'call', source: 'provider' })).filtered, true, 'the number too');
  const [folderCard] = (await listInbound(db, { state: 'archived' })).filter((x) => x.id === a.id);
  assert.equal(folderCard.mark, 'Supplier or vendor');
  // Remove mark
  const u = await removeMark(db, a.id, { by: 'Laura' });
  assert.deepEqual([u.ok, u.removed], [true, 'Supplier or vendor']);
  assert.equal((await removeMark(db, a.id, { by: 'Laura' })).already, true, 'a second click is harmless');
  assert.equal((await receive(db, { channel: 'gmail', externalId: 'f4', email: 'shop@supplier.lv', body: 'hello again', source: 'provider' })).filtered, false, 'reaches the Inbox again');
  const h = (await inboundHistory(db, a.id)).map((x) => [x.action, x.actor, x.reason]);
  assert.deepEqual(h, [['set_aside', 'Ieva', NP], ['marked', 'Ieva', 'Supplier or vendor'], ['unmarked', 'Laura', 'Supplier or vendor']]);
  const keys = (await db.prepare('SELECT contact_key, mark, set_by FROM contact_marks ORDER BY contact_key').all()).map((x) => [x.contact_key, x.mark, x.set_by]);
  assert.deepEqual(keys, [['email:shop@supplier.lv', null, 'Laura'], ['phone:20000001', null, 'Laura']], 'kept until changed: who changed it last');
});

test('2: Bring back on the card that was set aside as Spam undoes that mark too (a wrong pick); a mark from another card stays', async () => {
  const db = await openDb(':memory:');
  const a = await receive(db, { channel: 'gmail', externalId: 'w1', email: 'mum@gmail.com', body: 'my son', source: 'provider' });
  await archive(db, a.id, { reason: 'Spam', by: 'Ieva' });
  const back = await bringBack(db, a.id, { by: 'Ieva' });
  assert.equal(back.unmarked, 'Spam');
  assert.equal(await markFor(db, { email: 'mum@gmail.com' }), null);
  assert.deepEqual((await inboundHistory(db, a.id)).map((x) => x.action), ['set_aside', 'marked', 'brought_back', 'unmarked']);
  // marked from the folder on ANOTHER card: Bring back of this one leaves it
  const b = await receive(db, { channel: 'gmail', externalId: 'w2', email: 'shop@x.lv', body: 'offer', source: 'provider' });
  const c = await receive(db, { channel: 'website', externalId: 'w3', email: 'shop@x.lv', body: 'offer 2', source: 'provider' });
  await archive(db, b.id, { reason: NP, by: 'Ieva' });
  await setMark(db, b.id, { mark: 'Spam', by: 'Ieva' });   // sets c aside with the mark as its reason
  assert.equal((await bringBack(db, c.id, { by: 'Ieva' })).unmarked, undefined);
  assert.equal((await markFor(db, { email: 'shop@x.lv' })).mark, 'Spam');
});

test('2: a number set aside as Spam BEFORE the one rule still counts as marked, and Remove mark ends it', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'phone', externalId: 'l1', phone: '+37129999888', threadKey: 'phone:29999888', body: 'call', source: 'provider' });
  await db.prepare("UPDATE inbound SET state = 'archived', archive_reason = 'Spam', processed_by = 'Ieva', processed_at = '2026-10-10T09:00:00Z' WHERE id = ?").run(r.id);
  assert.equal((await markFor(db, { phone: '29999888' })).legacy, true);
  assert.equal((await listInbound(db, { state: 'archived' }))[0].mark, 'Spam');
  await removeMark(db, r.id, { by: 'Ieva' });
  assert.equal(await markFor(db, { phone: '29999888' }), null);
});

test('2: the folder card shows its mark and Remove mark; an unmarked one offers Mark: Supplier · Internal · Spam', () => {
  const base = { channel: 'gmail', received_at: '2026-10-13T08:00:00Z', body: 'x', fields: [], state: 'archived', senderKind: 'other', markable: true,
    processed_at: '2026-10-13T09:00:00Z', processed_by: 'Ieva' };
  const html = board([{ ...base, id: 5, contact_name: 'Marked', archive_reason: NP, mark: 'Spam' },
    { ...base, id: 6, contact_name: 'Plain', archive_reason: NP, mark: null }], { show: 'archived' });
  const marked = cardOf(html, 5);
  assert.match(marked, /<span class="ib-kind ib-marktag">Spam<\/span>/);
  assert.match(marked, /Set aside: 13\.10, Ieva, Not a prospective student/, 'date, who, reason');
  assert.match(marked, /cBringBack\(5, this\)">Bring back<\/button><button type="button" class="ib-aside" onclick="event\.stopPropagation\(\);cUnmark\(5, this\)">Remove mark<\/button>/);
  const plain = cardOf(html, 6);
  assert.match(plain, /<span class="ib-mark">Mark: <button[^>]*cMark\(6, &quot;Supplier or vendor&quot;, this\)">Supplier<\/button> · <button[^>]*>Internal<\/button> · <button[^>]*>Spam<\/button><\/span>/);
});

// ------------------------------------------------------------------ 3. comes back --
test('3: set aside, then in touch again on another channel: back in the Inbox with "Set aside before: dd.mm, who, reason"', async () => {
  const db = await openDb(':memory:');
  const a = await receive(db, { channel: 'gmail', externalId: 'c1', email: 'kid@school.lv', body: 'prank', source: 'provider' });
  await archive(db, a.id, { reason: NP, by: 'Ieva', at: '2026-10-13T10:00:00.000Z' });
  const b = await receive(db, { channel: 'website', externalId: 'c2', email: 'KID@school.lv', name: 'Kid', body: 'prank again', source: 'provider' });
  const [card] = await listInbound(db, { state: 'new' });
  assert.equal(card.id, b.id, 'like anyone new');
  assert.deepEqual({ ...card.setAsideBefore }, { at: '2026-10-13T10:00:00.000Z', by: 'Ieva', reason: NP });
  const html = cardOf(board([{ ...card, received_at: '2026-10-14T08:00:00Z' }]), b.id);
  assert.match(html, /<div class="ib-before"><span>Set aside before: 13\.10, Ieva, Not a prospective student<\/span><span class="ib-mark">Mark: /);
  // the second time: marked, so it does not come back
  const m = await setMark(db, b.id, { mark: 'Spam', by: 'Laura' });
  assert.deepEqual(m.setAside, [b.id], 'the card that came back is set aside with the mark');
  assert.equal((await receive(db, { channel: 'gmail', externalId: 'c3', email: 'kid@school.lv', body: 'third', source: 'provider' })).filtered, true);
  assert.equal((await listInbound(db, { state: 'new' })).length, 0);
});

test('3: a first contact has no "Set aside before"; a filter is not a person setting aside', async () => {
  const db = await openDb(':memory:');
  await receive(db, { channel: 'gmail', externalId: 'n1', email: 'noreply@shop.lv', body: 'auto', source: 'provider' });   // filtered by the rule
  await receive(db, { channel: 'gmail', externalId: 'n2', email: 'anna@gmail.com', body: 'hi', source: 'provider' });
  for (const r of await listInbound(db, { state: 'new' })) assert.equal(r.setAsideBefore, null);
});

test('3: making a lead brings the earlier set-asides onto the person\'s History: date, who, reason, once', async () => {
  const db = await openDb(':memory:');
  const a = await receive(db, { channel: 'gmail', externalId: 'h1', email: 'eva@gmail.com', body: 'hm', source: 'provider' });
  await archive(db, a.id, { reason: NP, by: 'Ieva', at: '2026-10-12T10:00:00.000Z' });
  const b = await receive(db, { channel: 'gmail', externalId: 'h2', email: 'eva@gmail.com', body: 'I want navigation', source: 'provider' });
  const q = await qualify(db, b.id, { qualification: 'lead', createPerson: true, by: 'Laura', nextAction: 'Call and establish interest' });
  assert.ok(q.ok, JSON.stringify(q));
  const ev = await db.prepare("SELECT subject, actor, occurred_at FROM events WHERE person_id = ? AND subject LIKE 'Set aside%'").all(q.personId);
  assert.deepEqual(ev.map((e) => [e.subject, e.actor, e.occurred_at]), [['Set aside: Not a prospective student', 'Ieva', '2026-10-12T10:00:00.000Z']]);
});

// ------------------------------------------------------------------ 5. the call note --
test('5: "What was it about?" is saved on the answered call, shown under it, escaped, capped; a missed call has none', async () => {
  const db = await openDb(':memory:');
  await storeCall(db, call(), 'live', '2026-10-14T09:01:00Z', out());
  await storeCall(db, call({ uniqueid: 'u2', picked_up: false, operator_name: null, created_at: '2026-10-14T09:05:00.000Z' }), 'live', '2026-10-14T09:06:00Z', out());
  assert.match((await setCallNote(db, 'u2', { note: 'x', by: 'Ieva' })).error, /answered/);
  assert.match((await setCallNote(db, 'nope', { note: 'x', by: 'Ieva' })).error, /not found/);
  assert.match((await setCallNote(db, 'u1', { note: 'x' })).error, /who/);
  assert.match((await setCallNote(db, 'u1', { note: 'a'.repeat(CALL_NOTE_MAX + 1), by: 'Ieva' })).error, /at most 200/);
  const s = await setCallNote(db, 'u1', { note: '  Asked about the\n <b>ENG</b> price  ', by: 'Ieva' });
  assert.equal(s.note, 'Asked about the <b>ENG</b> price', 'one line');
  const [card] = await listInbound(db, { state: 'new' });
  const answered = card.calls.find((c) => c.id === 'u1');
  assert.deepEqual([answered.note, answered.noteBy], ['Asked about the <b>ENG</b> price', 'Ieva']);
  const html = cardOf(board([{ ...card, received_at: '2026-10-14T08:00:00Z' }]), card.id);
  assert.match(html, /<li class="ib-call-note"><input type="text" class="ib-note" maxlength="200" placeholder="What was it about\?" aria-label="What was it about\?" value="Asked about the &lt;b&gt;ENG&lt;\/b&gt; price" title="Ieva"/);
  assert.equal((html.match(/class="ib-note"/g) || []).length, 1, 'only under the answered call');
  assert.doesNotMatch(html, /<b>ENG<\/b>/, 'escaped');
  assert.equal((await setCallNote(db, 'u1', { note: '', by: 'Ieva' })).note, null, 'an empty line clears it');
});

test('5: the call note travels with Make a lead into the person\'s History', async () => {
  const db = await openDb(':memory:');
  await storeCall(db, call(), 'live', '2026-10-14T09:01:00Z', out());
  await setCallNote(db, 'u1', { note: 'Wants navigation, will send documents', by: 'Ieva' });
  const [card] = await listInbound(db, { state: 'new' });
  const q = await qualify(db, card.id, { qualification: 'lead', createPerson: true, by: 'Laura', nextAction: 'Call and establish interest',
    stated: { interest: CONFIG.programmes[0] } });
  assert.ok(q.ok, JSON.stringify(q));
  const ev = await db.prepare('SELECT kind, subject, body, actor, occurred_at, origin FROM events WHERE person_id = ? AND subject = ?').get(q.personId, CALL_NOTE_SUBJECT);
  assert.deepEqual({ ...ev }, { kind: 'note', subject: 'What the call was about', body: 'Wants navigation, will send documents',
    actor: 'Ieva', occurred_at: '2026-10-14T09:00:00.000Z', origin: 'manual' });
});

test('5: a known person\'s call is on their History, and the same one line is added there', async () => {
  const db = await openDb(':memory:');
  await db.prepare("INSERT INTO people (id, name, phone, status, owner, created_at) VALUES ('p1', 'Anna', '+37129111222', 'Contacted', 'Ieva', '2026-10-01T00:00:00Z')").run();
  const o = out();
  await storeCall(db, call(), 'live', '2026-10-14T09:01:00Z', o);
  assert.equal(o.logged, 1, 'not the Inbox');
  const events = await db.prepare("SELECT * FROM events WHERE person_id = 'p1'").all();
  await withCallNotes(db, 'p1', events);
  const entry = events.find((e) => e.kind === 'call');
  assert.deepEqual({ ...entry.call }, { id: 'u1', answered: true, note: null, noteBy: null });
  await setCallNote(db, 'u1', { note: 'Asked when the term starts', by: 'Ieva' });
  const again = await withCallNotes(db, 'p1', await db.prepare("SELECT * FROM events WHERE person_id = 'p1'").all());
  assert.equal(again.find((e) => e.kind === 'call').call.note, 'Asked when the term starts');
  assert.match(fnBody('async function viewPersonC(id) {'), /e\.call && e\.call\.answered && e\.call\.id \? `<div class="c-evt-body">\$\{cCallNoteInput\(e\.call\)\}<\/div>`/, 'the profile shows the field');
});

// ------------------------------------------------------------------ over HTTP --
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env, PORT: '0', CRM_DB: ':memory:' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}
test('the routes: Set aside needs one of the four; mark and unmark; a call note on an unknown call is 404', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const post = (p, data) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva' }, body: JSON.stringify({ by: 'Ieva', ...data }) });
  const made = await (await post('/api/intake/receive', { channel: 'gmail', externalId: 'h1', email: 'x@shop.lv', body: 'buy' })).json();
  const list = await (await fetch(base + '/api/intake?state=new', { headers: { 'x-acting-as': 'Ieva' } })).json();
  assert.deepEqual(list.archiveReasons, FOUR);
  assert.deepEqual(list.marks, FOUR.slice(1));
  assert.equal((await post(`/api/intake/${made.id}/archive`, {})).status, 400);
  const r = await (await post(`/api/intake/${made.id}/archive`, { reason: 'Spam' })).json();
  assert.deepEqual([r.ok, r.landed.reason, r.marked], [true, 'Spam', ['email']]);
  assert.equal((await post(`/api/intake/${made.id}/unmark`, {})).status, 200);
  assert.equal((await post(`/api/intake/${made.id}/mark`, { mark: 'Nope' })).status, 400);
  assert.equal((await post(`/api/intake/${made.id}/mark`, { mark: 'Internal' })).status, 200);
  assert.equal((await post('/api/calls/nope/note', { note: 'x' })).status, 404);
});

// ------------------------------------------------------------------ 7. help --
test('7: Help keeps up: the four reasons, the marks, Set aside before, the call note; no Not a lead, no Other', () => {
  const words = JSON.stringify(HELP);
  assert.doesNotMatch(words, /Not a lead|Already handled/);
  const inbox = HELP.tour.find((x) => x.title === 'Inbox').body;
  assert.match(inbox, /Set aside, and pick why: Not a prospective student, Supplier or vendor, Internal or Spam\./);
  assert.match(inbox, /Supplier or vendor, Internal and Spam also mark the number or address, so it stays out of the Inbox until Remove mark\./);
  assert.match(inbox, /with Set aside before on the card/);
  const calls = HELP.faq.find((x) => x.id === 'phone-calls').a;
  assert.match(calls, /type one line in What was it about\?; it goes onto the person's History with Make a lead/);
  assert.match(calls, /Supplier or vendor, Internal or Spam also marks the number: it never reaches the Inbox, until Remove mark/);
  assert.match(calls, /A marked number never pops up\./);
  assert.equal(HELP.howto.find((h) => h.do === 'Set a message aside').where, 'Inbox, Set aside on the card, then pick why; the message is kept and can be brought back');
});

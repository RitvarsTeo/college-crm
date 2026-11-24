// THE TRAINING CENTRE WHATSAPP, FORWARDED BY TELEGROUP (patch 165; his words "Yes, build it now"). Meta's own payload shape for
// the Training Centre number (phone id 654184684448536); invented people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { receiveTcWhatsApp, TC_PHONE_ID } from '../src/tcwhatsapp.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './security_helpers.js';

const delivery = (phoneId, messages, extra = {}) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { display_phone_number: '37162444609', phone_number_id: phoneId },
  contacts: [{ profile: { name: 'Anna Example' }, wa_id: '37120000009' }], messages, ...extra } }] }] });
const msg = (id, text) => ({ from: '37120000009', id, timestamp: '1795424400', type: 'text', text: { body: text } });

test('a Training Centre message is kept once, in its own table, never the Academy Inbox', async () => {
  const db = await openDb();
  const r = await receiveTcWhatsApp(db, delivery(TC_PHONE_ID, [msg('wamid.A1', 'Hello, do you have BOSIET in January?')]));
  assert.deepEqual([r.ok, r.stored], [true, 1]);
  const again = await receiveTcWhatsApp(db, delivery(TC_PHONE_ID, [msg('wamid.A1', 'Hello, do you have BOSIET in January?')]));
  assert.equal(again.duplicates, 1, 'the same message id is one message');
  const row = await db.prepare('SELECT * FROM tc_whatsapp_in').get();
  assert.deepEqual([row.name, row.from_num, row.body, row.phone_id], ['Anna Example', '37120000009', 'Hello, do you have BOSIET in January?', TC_PHONE_ID]);
  assert.equal(row.at, '2026-11-23T09:00:00.000Z');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n), 0, 'nothing in the Academy Inbox');
});

test('another number, a status, a reply from the phone or not WhatsApp at all: a 200, nothing kept', async () => {
  const db = await openDb();
  assert.match((await receiveTcWhatsApp(db, delivery('999999999', [msg('wamid.B1', 'academy')]))).ignored, /not the Training Centre number/);
  assert.match((await receiveTcWhatsApp(db, delivery(TC_PHONE_ID, [], { statuses: [{ id: 'wamid.X', status: 'read' }] }))).ignored, /no message/);
  assert.match((await receiveTcWhatsApp(db, { hello: 1 })).ignored, /not a WhatsApp delivery/);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_whatsapp_in').get()).n), 0);
});

test('the Training Centre Inbox (patch 166): one card per number, a known number shows its person and company, Done moves it to Handled', async () => {
  const { tcInbox, tcInboxDone } = await import('../src/tcwhatsapp.js');
  const db = await openDb();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, created_at) VALUES (7, 'Baltic Example Shipping', 'baltic example shipping', 'contacted', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, phone, created_at) VALUES (7, 'Anna Example', '+371 20 000 009', '2026-11-01T00:00:00Z')`).run();
  await receiveTcWhatsApp(db, delivery(TC_PHONE_ID, [msg('wamid.C1', 'First question'), { ...msg('wamid.C2', 'Second question'), timestamp: '1795424500' }]));
  await receiveTcWhatsApp(db, { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: TC_PHONE_ID },
    contacts: [{ wa_id: '37129999999' }], messages: [{ from: '37129999999', id: 'wamid.C3', timestamp: '1795424600', type: 'text', text: { body: 'Unknown number here' } }] } }] }] });
  const W = await tcInbox(db);
  assert.equal(W.cards.length, 2, 'one card per number');
  const anna = W.cards.find((c) => c.key === '20000009');
  assert.deepEqual([anna.person, anna.company, anna.companyId, anna.messages.length], ['Anna Example', 'Baltic Example Shipping', 7, 2]);
  assert.equal(W.cards.find((c) => c.key === '29999999').person, undefined, 'an unknown number has a card too');
  assert.deepEqual(await tcInboxDone(db, '20000009', 'Ritvars'), { ok: true, done: 2 });
  assert.deepEqual((await tcInbox(db)).cards.map((c) => c.key), ['29999999']);
  const H = await tcInbox(db, { handled: true });
  assert.deepEqual([H.cards.map((c) => c.key), H.cards[0].seenBy, H.waiting], [['20000009'], 'Ritvars', 1]);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n), 0, 'still nothing in the Academy Inbox');
});

test('the page: Inbox under Home in the Training Centre menu and in the phone More, the Academy board and card parts, Done', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(APP.includes('<a href="#/tc/inbox" data-c="tc-inbox"') && APP.includes("${more('#/tc/inbox', C_ICON.inbox || C_ICON.home, 'Inbox')}"));
  const fn = APP.slice(APP.indexOf('function tcInboxDraw('), APP.indexOf('async function tcInboxDone('));
  for (const part of ['c-cols ib-board', 'c-col ib-col', 'ib-card', 'ib-ch', 'C_SRC_COLOUR.whatsapp', 'cInboxAge(c.at)', "cStateLine('new'", 'Waiting', 'Handled']) assert.ok(fn.includes(part), part);
});

test('Make a lead from a TC Inbox card (his pick "TC client/contact"): company + contact under Clients, a WhatsApp line in its history, never an Academy lead', async () => {
  const tc = await import('../src/tc.js');
  const db = await openDb();
  const out = await tc.quickAdd(db, { newCompany: 'Example Wind UAB', name: 'Jonas Sample', phone: '+37060000002', note: 'Can you send the GWO price list?', via: 'whatsapp' }, 'Laura');
  assert.equal(out.newCompany, true);
  const line = await db.prepare('SELECT kind, body FROM tc_activities WHERE company_id = ? AND kind = ?').get(out.companyId, 'contact');
  assert.equal(line.body, 'WhatsApp from Jonas Sample. Can you send the GWO price list?');
  assert.equal(Number((await db.prepare("SELECT COUNT(*) n FROM tc_activities WHERE body LIKE 'Met %'").get()).n), 0, 'not a meeting');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM people').get()).n), 0, 'never an Academy lead');
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.ok(srv.includes("if ((b.via === 'whatsapp' || b.via === 'email') && b.waKey) out.inbox = await tcInboxDone(db, b.waKey, by);"), 'the card moves to Handled');
});

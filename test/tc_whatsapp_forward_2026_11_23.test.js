// THE TRAINING CENTRE WHATSAPP, FORWARDED BY TELEGROUP (patch 165; his words "Yes, build it now"). Meta's own payload shape for
// the Training Centre number (phone id 654184684448536); invented people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { receiveTcWhatsApp, TC_PHONE_ID } from '../src/tcwhatsapp.js';

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

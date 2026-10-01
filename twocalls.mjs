import { openDb } from './src/db.js';
import { syncPbx } from './src/sync.js';

const db = await openDb('data/crm.db');
const ENV = { PBX_API_TOKEN: 'local-fake-token-not-real-0000', CHANNEL_MODE_PHONE: 'test' };
const call = (o) => ({ uniqueid: o.id, destination: 'incoming', queue: o.q || '1001*Q-ADMISSION',
  caller_num: o.num, state: o.ans ? 'ANSWER' : 'NOANSWER', operator_name: o.ans ? 'Ieva' : '',
  created_at: o.at });
const fakeFetch = (calls) => async () => ({ ok: true, status: 200, json: async () => calls, text: async () => '' });

const NOW = new Date('2026-10-01T09:40:00Z');
const a = await syncPbx(db, { now: NOW, env: ENV,
  fetchImpl: fakeFetch([call({ id: 'demo-1', num: '+37126554411', ans: false, q: '1001*Q-OTHER', at: '2026-10-01 11:05:00' })]) });
console.log('first run :', JSON.stringify({ inbox: a.inbox, again: a.again }));

const b = await syncPbx(db, { now: new Date(NOW.getTime() + 20 * 60000), env: ENV,
  fetchImpl: fakeFetch([
    call({ id: 'demo-2', num: '26554411', ans: false, q: '1001*Q-OTHER', at: '2026-10-01 11:31:00' }),
    call({ id: 'demo-3', num: '+371 26 554 411', ans: true, q: '1001*Q-ADMISSION', at: '2026-10-01 11:52:00' }),
  ]) });
console.log('second run:', JSON.stringify({ inbox: b.inbox, again: b.again }));

const rows = await db.prepare("SELECT id, contact_phone, thread_key, received_at, body FROM inbound WHERE channel='phone'").all();
console.log('\nphone rows in the queue:', rows.length);
for (const r of rows) console.log('  #' + r.id, r.contact_phone, '|', r.thread_key, '\n   ' + String(r.body).split('\n').join('\n   '));
const calls = await db.prepare("SELECT uniqueid, inbound_id FROM pbx_calls").all();
console.log('\ncalls stored:', calls.map((c) => c.uniqueid + '->row' + c.inbound_id).join(', '));

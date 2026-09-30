// The channel gaps Session C found on 30.09.2026 (crm-channel-docs HANDOVER.md, C1-C7), fixed by
// Session B the same day on Ritvars' "LETS DO ALL as per maximum in our code".
//
// NOTHING HERE CALLS A PROVIDER. Every token and secret below is a fake that says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptAll } from '../src/adapters.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const send = (base, channel, payload) => fetch(`${base}/api/inbound/${channel}`, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-crm-simulated': '1', 'x-acting-as': 'Ieva' },
  body: JSON.stringify(payload) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const newLeads = (base) => fetch(`${base}/api/intake?state=new`, { headers: { 'x-acting-as': 'Ieva' } })
  .then((r) => r.json()).then((j) => (Array.isArray(j) ? j : j.items || j.rows || []));

// ------------------------------------------------------------------ C1 ----
// Decided by Ritvars 30.09 (popup B): the Facebook Page registers ONE Meta address,
// /api/inbound/facebook. Inside it, messaging[] is Messenger and a leadgen change is Facebook.
const page = {
  object: 'page',
  entry: [{
    id: 'page-1', time: 1727690000,
    changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-1', form_id: 'form-1', ad_id: 'ad-1', created_time: 1727690000 } }],
    messaging: [{ sender: { id: 'psid-1' }, recipient: { id: 'page-1' }, timestamp: 1727690001000,
      message: { mid: 'm-1', text: 'Hello, I want to study navigation' } }],
  }],
};

test('C1: a Page delivery on the facebook address: messages are Messenger, lead forms are Facebook', () => {
  const evs = adaptAll('facebook', page);
  assert.deepEqual(evs.map((e) => [e.channel, e.externalEventId]), [['facebook', 'lead-1'], ['messenger', 'm-1']]);
  // Instagram keeps its own channel for both
  assert.deepEqual(adaptAll('instagram', page).map((e) => e.channel), ['instagram', 'instagram']);
});

test('C1 over the wire: one POST to /api/inbound/facebook lands as one Messenger and one Facebook item', async (t) => {
  const s = await start({ CHANNEL_MODE_FACEBOOK: 'test' });
  t.after(() => s.child.kill());
  const r = await send(s.base, 'facebook', page);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const items = await newLeads(s.base);
  assert.deepEqual(items.map((i) => i.channel).sort(), ['facebook', 'messenger']);
  // a Meta retry of the same delivery adds nothing
  await send(s.base, 'facebook', page);
  assert.equal((await newLeads(s.base)).length, 2);
});

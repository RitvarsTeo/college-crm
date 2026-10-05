// Mailchimp is activity about somebody, not an enquiry. The rule was written down on 24.09.2026 in
// config/prototype.json mailchimp._note: "A Mailchimp event is ACTIVITY ABOUT SOMEBODY, not
// automatically a new person - a newsletter subscriber is not a lead." Until 01.10.2026 every
// event still landed in New Leads (backlog: "Mailchimp events land in New Leads instead of consent").
//   - a subscriber we already know: the event goes on their timeline;
//   - anybody: the event is kept (Not relevant, with the reason, body kept), never in the queue.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'test-mailchimp-secret-not-real';

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', CHANNEL_MODE_MAILCHIMP: 'test', MAILCHIMP_WEBHOOK_SECRET: SECRET },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const as = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
const event = (o) => new URLSearchParams({ type: 'subscribe', fired_at: '2026-10-01 08:00:00',
  'data[list_id]': 'c6ab4facba', 'data[merges][FNAME]': 'Liga', ...o }).toString();
const send = (s, body) => fetch(`${s.base}/api/inbound/mailchimp?s=${SECRET}`, { method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
const list = (s, state) => fetch(`${s.base}/api/intake?state=${state}`).then((r) => r.json()).then((j) => j.rows);

test('Mailchimp: a subscriber is not a lead - kept, set aside with the reason, never in New Leads', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await send(s, event({ 'data[email]': 'stranger@example.com' }));
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await list(s, 'new')).length, 0);
  const kept = (await list(s, 'notrelevant')).find((i) => i.channel === 'mailchimp');
  assert.ok(kept, 'kept, never dropped');
  assert.match(kept.archive_note, /not a lead/);
  assert.equal(kept.contact_email, 'stranger@example.com');
});

test('Mailchimp: an event about somebody we know goes on their timeline', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const add = await fetch(`${s.base}/api/people`, { method: 'POST', headers: as,
    body: JSON.stringify({ name: 'Liga Kalnina', email: 'liga@example.com', phone: '+37120000099', source_channel: 'in_person' }) });
  assert.ok(add.ok, await add.clone().text());
  const id = (await add.json()).id || (await add.json()).person?.id;
  await send(s, event({ type: 'unsubscribe', 'data[email]': 'liga@example.com' }));
  assert.equal((await list(s, 'new')).length, 0);
  const person = await fetch(`${s.base}/api/people/${id}`, { headers: as }).then((r) => r.json());
  const evs = JSON.stringify(person);
  assert.match(evs, /Mailchimp: unsubscribe/);
});

// Q26 (05.10.2026): an open GET answered the URL check AND overwrote the proof that Mailchimp checked
// our address, so anybody could fake it. It still answers (Mailchimp must keep saving); it records
// only when the address carries our secret, as the callback URL does.
test('Q26: the URL check always answers, and is recorded only with the matching secret', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const at = async () => (await fetch(`${s.base}/api/admin/channels`, { headers: as }).then((r) => r.json()))
    .channels.find((c) => c.channel === 'mailchimp').providerHandshakeAt;
  for (const q of ['', '?s=wrong-secret-of-the-same-size!', '?s=']) {
    const r = await fetch(`${s.base}/api/inbound/mailchimp${q}`);
    assert.equal(r.status, 200, 'Mailchimp would refuse to save a URL whose check fails: ' + q);
    assert.equal(await r.text(), 'ok');
  }
  assert.equal(await at(), null, 'no proof written without the secret');
  const ok = await fetch(`${s.base}/api/inbound/mailchimp?s=${SECRET}`);
  assert.equal(ok.status, 200);
  assert.ok(await at(), 'the real check, with our secret, is recorded');
});

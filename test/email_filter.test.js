// The edu@ filter (popup A, 01.10.2026). The first real read of edu@ put 40 emails in the Inbox and
// most were automatic (noreply-apps-scripts-notifications@google.com, calendar-notification@google.com,
// no-reply@zoom.us) or our own colleagues (@novikontas.org, @novikontas.lv). Those are set aside with
// the reason, kept, body kept (decision 1d); everybody else still reaches the Inbox.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { emailFilterWhy, refilterOpenEmail, receive, listInbound, CONFIG } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('email filter: the rule is in config, and matches the real senders of the first read', () => {
  assert.deepEqual(CONFIG.emailFilter.internalDomains, ['novikontas.org', 'novikontas.lv']);
  for (const a of ['noreply-apps-scripts-notifications@google.com', 'calendar-notification@google.com',
    'no-reply@zoom.us', 'noreply@example.com', 'mailer-daemon@googlemail.com', 'colleague@novikontas.org', 'x@NOVIKONTAS.LV']) {
    assert.ok(emailFilterWhy(a), a);
  }
  for (const a of ['someone@gmail.com', 'person@m-s-solutions.net', 'info@viaa.gov.lv', 'drive-shares-dm@google.com', 'a.b@inbox.lv', '']) {
    assert.equal(emailFilterWhy(a), null, a || '(empty)');
  }
});

const message = (id, from, body) => ({ id, threadId: 't-' + id, labelIds: ['INBOX'],
  payload: { headers: [{ name: 'Date', value: 'Wed, 01 Oct 2026 09:00:00 +0300' }, { name: 'From', value: from },
    { name: 'Subject', value: 'Subject ' + id }], body: { data: Buffer.from(body, 'utf8').toString('base64url') } } });
function fakeGmail(messages) {
  return async (url) => {
    const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (url.includes('oauth2.googleapis.com/token')) return ok({ access_token: 'x', expires_in: 3600 });
    if (url.includes('/messages?')) return ok({ messages: messages.map((m) => ({ id: m.id })) });
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    return ok(messages.find((m) => m.id === id));
  };
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'live', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };

test('email filter: the poll sets automatic and internal mail aside, with the reason and the body', async () => {
  const db = await openDb(':memory:');
  const r = await syncGmail(db, { env: ENV, now: new Date('2026-10-01T12:00:00Z'), fetchImpl: fakeGmail([
    message('m1', 'Apps Script <noreply-apps-scripts-notifications@google.com>', 'Summary of failures'),
    message('m2', 'Ieva <ieva@novikontas.org>', 'Pārsūtu'),
    message('m3', 'Anna Ozola <anna@gmail.com>', 'Gribu mācīties navigāciju'),
  ]) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.inbox, 1);
  assert.equal(r.filtered, 2);
  const inbox = await listInbound(db, { state: 'new' });
  assert.deepEqual(inbox.map((i) => i.contact_email), ['anna@gmail.com']);
  const aside = await listInbound(db, { state: 'notrelevant' });
  assert.equal(aside.length, 2);
  for (const a of aside) {
    assert.equal(a.state, 'filtered');
    assert.match(a.archive_note, /automatic sender|our own address/);
    assert.ok(a.body, 'decision 1d: the body is kept');
  }
});

test('email filter: the items already waiting are set aside by the same rule; nothing else moves', async () => {
  const db = await openDb(':memory:');
  // rows that arrived BEFORE the rule (since Q31 receive() sets them aside on arrival, so they are
  // planted here the way production still holds them)
  for (const [i, from] of ['no-reply@zoom.us', 'colleague@novikontas.lv', 'person@m-s-solutions.net', 'anna@gmail.com'].entries()) {
    await db.prepare(`INSERT INTO inbound (channel, external_id, received_at, surface_at, contact_email, body, state, source, suggested, suggestion_why)
      VALUES ('gmail', ?, '2026-10-01T09:00:00Z', '2026-10-01T09:00:00Z', ?, ?, 'new', 'provider', 'unclear', 'planted')`).run('e' + i, from, 'text ' + i);
  }
  await receive(db, { channel: 'phone', externalId: 'c1', phone: '+37120000000', body: 'Missed call', source: 'provider' });
  const r = await refilterOpenEmail(db);
  assert.deepEqual(r, { checked: 4, setAside: 2, left: 2 });
  const left = (await listInbound(db, { state: 'new' })).map((i) => i.contact_email || i.contact_phone).sort();
  assert.deepEqual(left, ['+37120000000', 'anna@gmail.com', 'person@m-s-solutions.net']);
  assert.deepEqual(await refilterOpenEmail(db), { checked: 2, setAside: 0, left: 2 }, 'running it again changes nothing');
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', CHANNEL_MODE_WEBSITE: '', WEBSITE_FORM_SECRET: 'test-website-secret-not-real-0000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('channel switch: a webhook follows the Channels screen switch, not only the Vercel setting', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const post = () => fetch(s.base + '/api/inbound/website', { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-crm-secret': 'test-website-secret-not-real-0000' },
    body: new URLSearchParams({ tranid: '1:2', Name: 'A', Email: 'a@example.com' }).toString() });
  assert.equal((await post()).status, 409, 'off by default');
  await fetch(s.base + '/api/admin/channels/website/check', { method: 'POST', headers: { 'x-acting-as': 'Ritvars' } });
  const sw = await fetch(s.base + '/api/admin/channels/website/mode', { method: 'POST',
    headers: { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'test' }) });
  if (sw.status !== 200) { t.diagnostic('switch refused: ' + (await sw.text())); }
  assert.equal(sw.status, 200);
  assert.equal((await post()).status, 200, 'the switch reached the webhook');
});

test('refilter route: admins only', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  assert.equal((await fetch(s.base + '/api/admin/gmail/refilter', { method: 'POST', headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  const ok = await fetch(s.base + '/api/admin/gmail/refilter', { method: 'POST', headers: { 'x-acting-as': 'Ritvars' } }).then((r) => r.json());
  assert.deepEqual(ok, { ok: true, checked: 0, setAside: 0, left: 0 });
});

// APPLICATIONS lane, item 1 (01.10.2026): a person the SIS created reads as who they are.
//
// Measured on the lane branch before the fix, real syncSis on the local server, person page of an
// SIS-created applicant whose email and programme the SIS sent:
//   Came from     "sis not a channel"
//   Still to find out: interest, start, education, question, email, phone
// The SIS told us the email, the phone and the programme. Listing them as unknown is the card
// showing nobody in a new place. The person page draws from GET /api/people/<id> (missingInfo)
// and from cChannel() in src/app.html, so both are read here: the route over the wire, and the
// label function run from the page's own source.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis } from '../src/sync.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const SECRET = 'test-application-secret-not-real-0000';
const ENV = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };

const app = (over = {}) => ({
  reference: 'ref-id', applicationId: 'app-id', givenName: 'Liene', familyName: 'Kalna',
  email: 'liene.kalna@example.com', phone: '+371 29990002', programmeCode: 'NAV', status: 'started',
  registeredAt: '2026-09-30T06:00:00.000Z', changedAt: '2026-09-30T06:05:00.000Z', ...over,
});
const feed = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', SIS_APPLICATION_SECRET: '', CHANNEL_MODE_SIS: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const H = { 'x-acting-as': 'Ieva' };
const getJson = (base, p) => fetch(base + p, { headers: H }).then((r) => r.json());
const list = (j) => (Array.isArray(j) ? j : j.people || j.rows || []);

test('identity: what the SIS sent is known on the person page, not "still to find out"', async (t) => {
  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  const r = await fetch(s.base + '/api/intake/application', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-crm-application-secret': SECRET }, body: JSON.stringify(app()) });
  assert.equal(r.status, 200, await r.text());
  const [p] = list(await getJson(s.base, '/api/people'));
  const page = await getJson(s.base, '/api/people/' + p.id);
  assert.equal(page.name, 'Liene Kalna');
  assert.equal(page.email, 'liene.kalna@example.com');
  assert.equal(page.phone, '+371 29990002');
  for (const known of ['email', 'phone', 'interest']) {
    assert.ok(!page.missingInfo.includes(known), `${known} came from the SIS: ${page.missingInfo.join(', ')}`);
  }
  // what the SIS never says stays honestly open
  assert.ok(page.missingInfo.includes('education'));
});

test('identity: the SIS facts are written once, as the provider\'s, and a second run adds none', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-09-30T07:00:00Z'), env: ENV, fetchImpl: feed([app()]) });
  await syncSis(db, { now: new Date('2026-10-01T05:00:00Z'), env: ENV,
    fetchImpl: feed([app({ status: 'submitted', changedAt: '2026-09-30T08:00:00.000Z' })]) });
  const person = await db.prepare('SELECT id FROM people').get();
  const f = await db.prepare('SELECT field, value, provenance FROM field_values WHERE person_id = ? ORDER BY field').all(person.id);
  assert.deepEqual(f.map((x) => [x.field, x.value, x.provenance]), [
    ['email', 'liene.kalna@example.com', 'provider'],
    ['interest', 'NAV', 'provider'],
    ['phone', '+371 29990002', 'provider'],
  ]);
});

test('identity: a registered-only person with no phone and no programme claims neither', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-09-30T07:00:00Z'), env: ENV,
    fetchImpl: feed([app({ applicationId: '', programmeCode: null, phone: null, status: 'registered' })]) });
  const person = await db.prepare('SELECT id, status FROM people').get();
  assert.equal(person.status, 'New');
  const f = await db.prepare('SELECT field FROM field_values WHERE person_id = ?').all(person.id);
  assert.deepEqual(f.map((x) => x.field), ['email']);
});

// The page's own label function, run from src/app.html.
const statement = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf(';\n', i) + 2); };
function cChannel() {
  const ctx = { CFG: CONFIG };
  vm.runInNewContext(statement('const channelLabel =') + statement('const cChannel =') + 'this.cChannel = cChannel;', ctx);
  return (c) => [...ctx.cChannel(c)];   // out of the sandbox's own Array
}

test('identity: "Came from" reads SIS, and an alias is never called "not a channel"', () => {
  const c = cChannel();
  assert.deepEqual(c('sis'), ['SIS', '']);
  for (const [alias, label] of Object.entries(CONFIG.channelAliases)) assert.deepEqual(c(alias), [label, ''], alias);
  assert.deepEqual(c('facebook'), [CONFIG.channels.facebook, '']);
  assert.deepEqual(c('carrier_pigeon'), ['carrier_pigeon', 'not a channel'], 'a truly unknown source still says so');
});

// Q31 (05.10.2026). Ritvars on the production Inbox, where Google Chat notices from colleagues,
// "Novikontas Noreply" course registrations and Google Forms responses sat between real leads:
// "collaguese should not be there!", and asked whether noreply / Google Chat / Google Forms should be
// filtered automatically: "Yes, filter them".
// The senders below are the real SHAPES seen in the 04.10 production backup; no real person's address.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, listInbound, noiseWhy, senderKind, refilterOpen, CONFIG } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Q31: the rules are config Admissions can tune', () => {
  const f = CONFIG.emailFilter;
  assert.ok(f.automaticSender && Array.isArray(f.textPatterns) && f.textPatterns.length >= 2);
  for (const p of f.textPatterns) assert.ok(p.match && p.why, JSON.stringify(p));
  assert.ok(CONFIG.senderKind && Array.isArray(CONFIG.senderKind.studentWords));
});

test('Q31: colleagues, noreply senders, Google Chat and Google Forms are set aside; a real lead is not', () => {
  const aside = [
    { email: 'ieva@novikontas.org', name: 'Ieva', body: 'Pārsūtu' },
    { email: 'chat-noreply@google.com', name: 'Colleague (Google Chat)', body: 'Colleague / Navigator <x@novikontas.org> messaged you on Oct 4 while you were away' },
    { email: 'novikontas-noreply@m-s-solutions.net', name: 'Novikontas Noreply', body: 'Someone registration: THERMO / 2026-10-05' },
    { email: 'forms-receipts-noreply@google.com', name: 'Google Forms', body: 'Your form, Study Course Evaluation Form, has new responses.' },
    { email: 'calendar-notification@google.com', name: 'Google Calendar', body: 'Invitation' },
    { email: null, name: 'Somebody', body: 'Your form, Admissions survey, has new responses.' },
  ];
  for (const x of aside) assert.ok(noiseWhy(x), JSON.stringify(x));
  for (const x of [
    { email: 'anna.ozola@gmail.com', name: 'Anna Ozola', body: 'Gribu mācīties navigāciju, kad sākas nodarbības?' },
    { email: 'person@m-s-solutions.net', name: 'Person', body: 'Question about the course' },
    { email: 'drive-shares-dm@google.com', name: 'Google Drive', body: 'shared a file with you' },
    { email: 'info@viaa.gov.lv', name: 'VIAA', body: 'Par akreditāciju' },
  ]) assert.equal(noiseWhy(x), null, JSON.stringify(x));
});

test('Q31: on arrival, on any channel, kept with the reason, never deleted', async () => {
  const db = await openDb(':memory:');
  const staff = await receive(db, { channel: 'gmail', externalId: 'g1', email: 'staff@novikontas.org', name: 'Staff', body: 'FYI', source: 'provider' });
  const lead = await receive(db, { channel: 'gmail', externalId: 'g2', email: 'janis@gmail.com', name: 'Janis', body: 'I want to study navigation', source: 'provider' });
  const form = await receive(db, { channel: 'website', externalId: 'w1', email: 'test@novikontas.lv', name: 'Test', body: 'test', source: 'provider' });
  assert.equal(staff.filtered, true);
  assert.equal(form.filtered, true, 'the rule is not only for email');
  assert.equal(lead.filtered, false);
  const inbox = await listInbound(db, { state: 'new' });
  assert.deepEqual(inbox.map((r) => r.contact_email), ['janis@gmail.com']);
  const aside = await listInbound(db, { state: 'notrelevant' });
  assert.equal(aside.length, 2, 'both reachable from the Filtered view');
  for (const a of aside) {
    assert.equal(a.state, 'filtered');
    assert.match(a.archive_note, /our own address/);
    assert.ok(a.body, 'the body is kept');
  }
});

test('Q31: the phone and Mailchimp keep their own rule, which wins', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'mailchimp', externalId: 'm1', email: 'x@gmail.com', body: 'subscribe',
    source: 'provider', filterWhy: 'Mailchimp audience activity: a newsletter subscriber is not a lead' });
  assert.equal(r.filtered, true);
  const [row] = await listInbound(db, { state: 'notrelevant' });
  assert.match(row.archive_note, /newsletter subscriber/);
});

test('Q31: sender kind on every row, with its why', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, phone, status, created_at) VALUES ('p1', 'Admitted One', 'one@gmail.com', '+37120000001', 'Admitted', '2026-09-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO sis_applicants (reference, application_id, email, status, changed_at, synced_at) VALUES ('R1', 'A1', 'two@gmail.com', 'matriculated', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO sis_applicants (reference, application_id, email, status, changed_at, synced_at) VALUES ('R2', 'A2', 'three@gmail.com', 'submitted', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`).run();
  const add = (id, o) => receive(db, { channel: 'gmail', externalId: id, source: 'provider', ...o });
  await add('k1', { email: 'one@gmail.com', body: 'hello' });
  await add('k2', { email: 'two@gmail.com', body: 'hello' });
  await add('k3', { email: 'three@gmail.com', body: 'hello' });
  await add('k4', { email: 'four@gmail.com', body: 'Can I move to another time? My group starts Monday' });
  await add('k5', { email: 'five@gmail.com', body: 'Kad ir iestājeksāmens?' });
  await add('k6', { email: 'boss@novikontas.org', body: 'internal' });
  const all = [...await listInbound(db, { state: 'new' }), ...await listInbound(db, { state: 'notrelevant' })];
  const kind = Object.fromEntries(all.map((r) => [r.contact_email, r.senderKind]));
  assert.deepEqual(kind, {
    'one@gmail.com': 'current_student', 'two@gmail.com': 'current_student', 'three@gmail.com': 'possible_student',
    'four@gmail.com': 'current_student', 'five@gmail.com': 'possible_student', 'boss@novikontas.org': 'other',
  });
  for (const r of all) assert.ok(r.senderKindWhy, r.contact_email);
  assert.equal(all.find((r) => r.contact_email === 'four@gmail.com').senderKindWhy, 'writes "my group"');
  assert.equal(senderKind({ state: 'new', body: 'hi' }).senderKind, 'possible_student', 'nothing known: possible');
});

test('Q31: rows already waiting are NOT touched; the action says what it would move, then moves only on apply', async () => {
  const db = await openDb(':memory:');
  const plant = (id, ch, email, name, body) => db.prepare(`INSERT INTO inbound (channel, external_id, received_at, surface_at,
    contact_email, contact_name, body, state, source, suggested, suggestion_why) VALUES (?, ?, '2026-10-01T09:00:00Z', '2026-10-01T09:00:00Z', ?, ?, ?, 'new', 'provider', 'unclear', 'planted')`)
    .run(ch, id, email, name, body);
  await plant('o1', 'gmail', 'novikontas-noreply@m-s-solutions.net', 'Novikontas Noreply', 'X registration: MECH / 2026-10-05');
  await plant('o2', 'gmail', 'chat-noreply@google.com', 'A (Google Chat)', 'A messaged you on Oct 4 while you were away');
  await plant('o3', 'gmail', 'colleague@novikontas.org', 'Colleague', 'FYI');
  await plant('o4', 'gmail', 'lead@gmail.com', 'Lead', 'I want to apply');
  await plant('o5', 'phone', null, null, 'Missed call');
  const before = (await listInbound(db, { state: 'new' })).length;
  assert.equal(before, 5, 'nothing moved by itself');
  const preview = await refilterOpen(db);
  assert.equal(preview.applied, false);
  assert.equal(preview.wouldMove, 3);
  assert.equal(preview.moved, 0);
  assert.equal(preview.checked, 4, 'the phone is not checked: it has its own rule');
  assert.equal(Object.values(preview.byReason).reduce((a, b) => a + b, 0), 3);
  assert.equal((await listInbound(db, { state: 'new' })).length, 5, 'the preview wrote nothing');
  const done = await refilterOpen(db, { apply: true });
  assert.equal(done.moved, 3);
  assert.deepEqual((await listInbound(db, { state: 'new' })).map((r) => r.contact_email || 'phone').sort(), ['lead@gmail.com', 'phone']);
  assert.equal((await refilterOpen(db)).wouldMove, 0, 'running it again changes nothing');
});

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

test('Q31: the action is admins only; GET previews, POST without apply:true moves nothing', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const url = s.base + '/api/admin/inbox/refilter';
  assert.equal((await fetch(url, { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  const g = await fetch(url, { headers: { 'x-acting-as': 'Ritvars' } }).then((r) => r.json());
  assert.equal(g.ok, true);
  assert.equal(g.applied, false);
  const p = await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' }, body: '{}' }).then((r) => r.json());
  assert.equal(p.applied, false, 'a POST must say apply:true');
  const a = await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' }, body: '{"apply":true}' }).then((r) => r.json());
  assert.equal(a.applied, true);
});

// Q31 (a): Ritvars cannot call an API, so the two steps are a control on Settings > Channels.
test('Q31: the Inbox filter control checks first and moves only on the second click', async () => {
  const fs = await import('node:fs');
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const fn = (name) => { const i = APP.indexOf('async function ' + name + '(') >= 0 ? APP.indexOf('async function ' + name + '(') : APP.indexOf('function ' + name + '(');
    return APP.slice(i, APP.indexOf('\n}\n', i)); };
  assert.match(fn('chFilterHtml'), /Check waiting rows/);
  assert.match(fn('chFilterHtml'), /onclick="chFilterCheck\(\)"/, 'the first click only checks');
  assert.doesNotMatch(fn('chFilterCheck'), /method|apply/, 'the check is a GET and moves nothing');
  assert.match(fn('chFilterCheck'), /'Move ' \+ r\.wouldMove/, 'the second button names how many');
  assert.match(fn('chFilterMove'), /apply: true/, 'only the second click moves');
  assert.equal((APP.match(/apply: true/g) || []).length, 1, 'nowhere else in the page moves rows');
  assert.match(APP, /\$\{chFilterHtml\(\)\}/, 'it is on the Channels page, which is admins only');
});

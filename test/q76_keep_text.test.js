// Q76, 07.10.2026 (Aigars's KISS list: "chain of communication with the lead jabut pieejamai profila"; Ritvars
// decided). "Make a lead" no longer empties the message text: it stays, and the person's History shows what they
// wrote. The 13-month retention still empties it on time - for a lead's messages too. Reverses the 23.09 rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify, purgeLineBodies, messagesFor, activePersonFor } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NEXT = 'First call';

async function lead(db, body = 'Hello, I want to study Navigation. When does it start?', at = '2026-10-07T09:00:00Z') {
  const r = await receive(db, { channel: 'gmail', externalId: 'e1', receivedAt: at, email: 'anna@example.com', name: 'Anna', body });
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT });
  return { id: r.id, pid: q.personId };
}

test('Make a lead keeps the message text, on the row and on its lines', async () => {
  const db = await openDb(':memory:');
  const { id } = await lead(db);
  const row = await db.prepare('SELECT state, body, body_deleted_at FROM inbound WHERE id = ?').get(id);
  assert.equal(row.state, 'qualified');
  assert.match(row.body, /study Navigation/);
  assert.equal(row.body_deleted_at, null);
  const line = await db.prepare('SELECT body FROM inbound_line WHERE inbound_id = ?').get(id);
  assert.match(line.body, /study Navigation/);
});

test('the person\'s messages are what they wrote, one entry per message, newest first', async () => {
  const db = await openDb(':memory:');
  const { pid } = await lead(db);
  // a second email from her, filed on her by the Q74 rule
  const second = await receive(db, { channel: 'gmail', externalId: 'e2', receivedAt: '2026-10-08T10:00:00Z',
    email: 'anna@example.com', name: 'Anna', body: 'Do you have a dormitory?', attachTo: await activePersonFor(db, 'anna@example.com') });
  assert.equal(second.attached, true);
  const m = await messagesFor(db, pid);
  assert.deepEqual(m.map((x) => x.body), ['Do you have a dormitory?', 'Hello, I want to study Navigation. When does it start?']);
  assert.equal(m[0].subject, 'Wrote');
  assert.equal(m[0].direction, 'in');
  assert.equal(m[0].channel, 'gmail');
  assert.equal(m[0].occurred_at, '2026-10-08T10:00:00Z');
  const copies = await db.prepare(`SELECT COUNT(*) n FROM events WHERE person_id = ? AND body LIKE '%dormitory%'`).get(pid);
  assert.equal(Number(copies.n), 0, 'the text is never copied into events, which are kept for ever');
});

test('retention still empties the text at 13 months - a lead\'s messages too', async () => {
  const db = await openDb(':memory:');
  const old = await lead(db, 'An old question', '2025-08-01T09:00:00Z');
  const fresh = await receive(db, { channel: 'gmail', externalId: 'e3', receivedAt: '2026-10-07T09:00:00Z', email: 'liga@example.com', name: 'Liga', body: 'A new question' });
  await qualify(db, fresh.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT });
  await purgeLineBodies(db, '2025-09-07T00:00:00Z');
  assert.equal((await db.prepare('SELECT body FROM inbound WHERE id = ?').get(old.id)).body, null, 'the old row is emptied');
  assert.equal((await db.prepare('SELECT body FROM inbound_line WHERE inbound_id = ?').get(old.id)).body, null);
  assert.equal((await messagesFor(db, old.pid)).length, 0, 'and its History entry goes with it');
  assert.equal((await db.prepare('SELECT body FROM inbound WHERE id = ?').get(fresh.id)).body, 'A new question', 'a recent one stays');
});

// ------------------------------------------------------------------- the screen --

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('the History the person page reads shows what they wrote (no screen change needed)', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const H = { 'content-type': 'application/json', 'x-acting-as': 'Ritvars' };
  const sent = await fetch(s.base + '/api/console/send', { method: 'POST', headers: H,
    body: JSON.stringify({ channel: 'gmail', scenario: 'study_enquiry', person: 'new', message: 'I would like to study Navigation in Riga' }) }).then((r) => r.json());
  const q = await fetch(s.base + `/api/intake/${sent.inboundId}/qualify`, { method: 'POST', headers: H,
    body: JSON.stringify({ qualification: 'lead', createPerson: true, nextAction: NEXT, stated: { interest: 'Navigation' } }) }).then((r) => r.json());
  assert.ok(q.personId, JSON.stringify(q));
  const p = await fetch(s.base + '/api/people/' + q.personId, { headers: H }).then((r) => r.json());
  const wrote = (p.timeline || []).find((e) => e.subject === 'Wrote');
  assert.ok(wrote, 'a "Wrote" entry is in the History');
  assert.match(wrote.body, /study Navigation in Riga/);
  assert.equal(p.hiddenCorrections, 0, 'messages in the History never make the hidden-corrections count negative (seen running: "-1")');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /\$\{esc\(e\.subject \|\| e\.kind \|\| ''\)\}<\/div>/, 'the History shows each entry\'s subject');
  assert.match(app, /e\.body \? `<div class="c-evt-body">\$\{esc\(e\.body\)\}<\/div>`/, 'and its text');
});

test('the readiness doc and Help say the text stays', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'CHANNEL_READINESS.md'), 'utf8');
  assert.match(doc, /Changed for Make a lead on 07\.10\.2026/);
  const help = fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8');
  assert.match(help, /What they wrote stays on their History/);
});

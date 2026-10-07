// Q74, 07.10.2026: three simple email rules (Aigars 07.10: "email kkadu automatizaciju, sobrid visi emaili ienak
// inboxa"; Ritvars yes). 1) somebody already in Intake -> their history + "Answer the question" today, not the
// Inbox; 2) the same new sender again -> joins their waiting card; 3) a newsletter -> set aside, kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify, listInbound, activePersonFor, noiseWhy, messagesFor } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const at = (h) => `2026-10-07T${String(h).padStart(2, '0')}:00:00Z`;
async function email(db, ext, from, body = 'Hello, a question about Navigation', h = 9) {
  return receive(db, { channel: 'gmail', externalId: ext, receivedAt: at(h), email: from, name: 'Sender',
    body, attachTo: await activePersonFor(db, from), joinOpenSender: true });
}
const inbox = async (db) => (await listInbound(db, { state: 'new' }));

async function withLead(db, addr = 'anna@example.com', status = null) {
  const first = await receive(db, { channel: 'phone', externalId: 'c1', receivedAt: at(8), phone: '+37129990001', body: 'Incoming call' });
  const q = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call',
    stated: { email: addr } });
  if (status) await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(status, q.personId);
  return q.personId;
}

test('rule 1: an email from somebody already in Intake goes on their history with a step for today', async () => {
  const db = await openDb(':memory:');
  const pid = await withLead(db);
  const r = await email(db, 'm1', 'Anna@Example.com', 'Can I still apply for Navigation?');
  assert.equal(r.attached, true);
  assert.equal(r.personId, pid);
  assert.equal((await inbox(db)).length, 0, 'not in the Inbox');
  const row = await db.prepare('SELECT state, person_id, processed_by FROM inbound WHERE id = ?').get(r.id);
  assert.deepEqual({ ...row }, { state: 'qualified', person_id: pid, processed_by: 'machine' }, 'kept and counted');
  const wrote = (await messagesFor(db, pid)).find((m) => /Can I still apply/.test(m.body));
  assert.ok(wrote, 'the conversation is on their profile (Q76: read from the message, never copied into events)');
  const task = await db.prepare(`SELECT label, due_at FROM tasks WHERE person_id = ? AND label = 'Answer the question'`).get(pid);
  assert.equal(task.due_at, at(9), 'due today, from when they wrote');
  await email(db, 'm2', 'anna@example.com', 'And one more thing', 10);
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND label = 'Answer the question' AND done_at IS NULL`).get(pid)).n), 1,
    'one open "Answer the question" at a time');
});

test('rule 1 stops at a finished person: an admitted student\'s email stays in the Inbox', async () => {
  const db = await openDb(':memory:');
  await withLead(db, 'student@example.com', 'Admitted');
  assert.equal(await activePersonFor(db, 'student@example.com'), null);
  const r = await email(db, 'm3', 'student@example.com');
  assert.ok(!r.attached);
  assert.equal((await inbox(db)).length, 1);
});

test('rule 1 never guesses: two people with one address is a question for a person', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, status) VALUES ('a', 'Anna', 'family@example.com', 'New'), ('b', 'Juris', 'family@example.com', 'New')`).run();
  assert.equal(await activePersonFor(db, 'family@example.com'), null);
  const r = await email(db, 'm4', 'family@example.com');
  assert.ok(!r.attached);
});

test('rule 2: the same new sender again joins their waiting card - one card per person', async () => {
  const db = await openDb(':memory:');
  const a = await email(db, 'm5', 'new@example.com', 'First question', 9);
  const b = await email(db, 'm6', 'NEW@example.com', 'Second question', 11);
  assert.equal(b.joined, true);
  assert.equal(b.id, a.id);
  const cards = await inbox(db);
  assert.equal(cards.length, 1);
  assert.match(cards[0].body, /First question[\s\S]*Second question/);
  assert.equal(cards[0].received_at, at(9), 'the wait clock does not restart');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM inbound_line WHERE inbound_id = ?').get(a.id)).n), 2, 'each message keeps its own line');
  const other = await email(db, 'm7', 'someone.else@example.com');
  assert.ok(!other.joined, 'a different sender is a different card');
});

test('rule 3: a newsletter is set aside with the reason - its unsubscribe link at the very end is found', async () => {
  const db = await openDb(':memory:');
  const long = 'Our autumn news. '.repeat(200) + '\nTo stop receiving these emails, unsubscribe here.';
  const r = await email(db, 'm8', 'news@school.example', long);
  assert.equal(r.filtered, true);
  const row = await db.prepare('SELECT state, archive_note FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.state, 'filtered');
  assert.equal(row.archive_note, 'a newsletter (has an unsubscribe link)');
  assert.equal(noiseWhy({ email: 'x@y.lv', body: 'Lai atrakstītos no jaunumiem, spiediet šeit' }), 'a newsletter (has an unsubscribe link)');
});

test('the sender address is not widened on a guess: info@ without an unsubscribe link still comes in', async () => {
  const db = await openDb(':memory:');
  const r = await email(db, 'm9', 'info@partner-school.example', 'We have three students interested in your programme.');
  assert.ok(!r.filtered);
  assert.equal((await inbox(db)).length, 1);
});

test('the email poll applies all three rules on arrival', () => {
  const sync = fs.readFileSync(path.join(ROOT, 'src', 'sync.js'), 'utf8');
  assert.match(sync, /attachTo: await activePersonFor\(db, it\.email\), joinOpenSender: true/);
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
  assert.ok(cfg.emailFilter.newsletter, 'the newsletter marker is configuration, Admissions can tune it');
});

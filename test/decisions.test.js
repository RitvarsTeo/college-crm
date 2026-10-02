// The locked decisions of 23.09.2026, asserted against the code that claims to
// follow them. A decision that is only written in a document is not a decision
// the software keeps.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runFullDemo, runScenario } from '../src/simulator.js';
import { logEvent, applyEdit, MANUAL, AUTOMATIC } from '../src/history.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const PROVIDERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'providers.json'), 'utf8'));

// ------------------------------------------------------- 1. users are locked --

test('the CRM users and the three admins are exactly what was locked', async () => {
  // Arina joined 23.09.2026 when the phone menu was mapped: she answers button 3.
  assert.deepEqual(CONFIG.users.map((u) => u.name),
    ['Ieva', 'Laura', 'Tetiana', 'Maris Cirulis', 'Arina']);
  const role = (n) => CONFIG.users.find((u) => u.name === n).role;
  const title = (n) => CONFIG.users.find((u) => u.name === n).title;
  assert.equal(role('Ieva'), 'Admissions');
  assert.equal(role('Laura'), 'Student Coordinator');
  assert.equal(role('Tetiana'), 'Marketing');
  assert.equal(title('Tetiana'), 'Head of Marketing');
  assert.equal(title('Maris Cirulis'), 'Director of Education');
  assert.equal(title('Arina'), 'Internship Coordinator');
  assert.deepEqual(CONFIG.admins, ['Aigars', 'Ritvars', 'Marina']);
});

// ------------------------------------------ feedback is not an admin screen --
// 24.09.2026: the feedback inbox is for Aigars and Ritvars. Marina is an admin
// and must NOT see it, so the list is its own and is never derived from admins.
test('the feedback inbox has its own reader list, shorter than the admin list', async () => {
  assert.deepEqual(CONFIG.feedbackReaders, ['Aigars', 'Ritvars']);
  assert.ok(!CONFIG.feedbackReaders.includes('Marina'),
    'Marina is an admin and must not be able to read feedback');
  // and it must not quietly become "the admins" again
  assert.notDeepEqual(CONFIG.feedbackReaders, CONFIG.admins,
    'if these two lists ever become equal, the rule has been lost');
  for (const reader of CONFIG.feedbackReaders) {
    assert.ok(CONFIG.admins.includes(reader), reader + ' should also be an admin');
  }
});

test('the code checks the reader list, not the admin list', async () => {
  // The whole point is that isAdmin() is NOT enough. If a feedback route ever
  // goes back to isAdmin(), Marina silently gains access.
  const routes = SERVER.slice(SERVER.indexOf('// ------------------------------------------------------------- feedback -'));
  assert.ok(!/isAdmin\(viewerOf/.test(routes),
    'a feedback route must not gate on isAdmin');
  assert.match(SERVER, /const canReadFeedback = \(who\) => FEEDBACK_READERS\.includes/);
  assert.match(APP, /mayReadFeedback = \(\) => \(CFG\.feedbackReaders/,
    'the screen hides the inbox from anybody who is not a reader');
});

test('an admin may hold channel access without becoming a CRM role owner', async () => {
  // Marina is one of the three real admins AND has Facebook, Instagram and
  // WhatsApp. Access is not ownership, so she appears in the access matrix and
  // not in the user list.
  assert.ok(!CONFIG.users.some((u) => u.name === 'Marina'), 'Marina is an admin, not a role owner');
  assert.ok(CONFIG.channelAccess.byPerson.Marina.includes('whatsapp'), 'but she does have WhatsApp');
});

test('no CRM user is an admin and no admin is a CRM user', async () => {
  for (const u of CONFIG.users) assert.ok(!CONFIG.admins.includes(u.name), u.name + ' must not be an admin');
  for (const a of CONFIG.admins) {
    assert.ok(!CONFIG.users.some((u) => u.name === a), a + ' is an admin, not one of the four users');
  }
});

test('a role is not a person: the owner list holds roles, the user list holds people', async () => {
  for (const role of CONFIG.owners) {
    assert.ok(!CONFIG.users.some((u) => u.name === role), role + ' is a role and must not also be a name');
  }
  // every user's role must be a real role, or the two lists have drifted apart
  for (const u of CONFIG.users) {
    assert.ok(CONFIG.owners.includes(u.role), u.name + "'s role " + u.role + ' is not in the owner list');
  }
});

test('nobody has been asked for an email address yet', async () => {
  for (const u of CONFIG.users) {
    assert.ok(!('email' in u), u.name + ' must not carry an email until authentication is designed');
  }
});

// --------------------------------------------- 3. one person, whole lifecycle --

test('the lifecycle is one record from lead to admitted, handed over at Admitted', async () => {
  assert.equal(CONFIG.lifecycle.samePersonThroughout, true);
  assert.equal(CONFIG.lifecycle.handoverStage, 'Admitted');
  assert.match(CONFIG.lifecycle._note, /does not become the student information system/i);
});

test('moving a person all the way to Admitted never creates a second record', async () => {
  const db = await openDb();
  const r = await runScenario(db, 'website_form', 'new_lead');
  const before = (await db.prepare('SELECT COUNT(*) n FROM people').get()).n;
  const arrivedOn = await db.prepare('SELECT source_channel, created_at FROM people WHERE id = ?').get(r.personId);
  const stages = ['Contacted', 'Follow-up', 'Application', 'Contract', 'Admitted'];
  for (const st of stages) {
    await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(st, r.personId);
    await logEvent(db, { personId: r.personId, kind: 'status', at: new Date().toISOString(),
      origin: MANUAL, actor: 'Ieva', subject: 'Status -> ' + st, field: 'status', newValue: st });
  }
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, before, 'still one row');
  const p = await db.prepare('SELECT * FROM people WHERE id = ?').get(r.personId);
  assert.equal(p.status, 'Admitted');
  assert.equal(p.source_channel, arrivedOn.source_channel,
    'the source it arrived on is untouched by the whole journey');
  assert.equal(p.created_at, arrivedOn.created_at, 'and so is the first contact date');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM events WHERE person_id = ?").get(r.personId)).n >= 6, true,
    'the whole story stays attached to that row');
});

// ------------------------------------------------------------ 4. ownership ---

test('ownership follows the stage as a principle, and the map is honestly not built yet', async () => {
  assert.equal(CONFIG.ownershipFollowsStage, false, 'it must not claim to be automatic yet');
  assert.match(CONFIG._owners, /NOT decided/);
  assert.ok(CONFIG.owners.includes('Marketing'), 'marketing owns some stages, so it is an owner role');
});

// ----------------------------------------------------------- 7. note types ---

test('a note carries a type, and the types are the ones asked for', async () => {
  const labels = CONFIG.noteTypes.map((t) => t.label);
  for (const want of ['Call note', 'On-site visit note', 'Admissions note', 'Stage note']) {
    assert.ok(labels.includes(want), 'missing note type: ' + want);
  }
  assert.ok(labels.some((l) => /other/i.test(l)), 'there must be an "other" type');
});

test('a typed note is still in the one history, not in a silo', async () => {
  const db = await openDb();
  await runScenario(db, 'website_form', 'new_lead');
  const id = (await db.prepare('SELECT id FROM people LIMIT 1').get()).id;
  await logEvent(db, { personId: id, kind: 'note', at: new Date().toISOString(), origin: MANUAL,
    actor: 'Ieva', subject: 'On-site visit note', body: 'came in with a parent' });
  const rows = await db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY id').all(id);
  assert.ok(rows.some((r) => r.subject === 'On-site visit note'));
  assert.ok(rows.some((r) => r.kind === 'channel'), 'and the channel event is in the same table');
  // there is exactly one table events can live in
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%note%'").all();
  assert.equal(tables.length, 0, 'no separate notes table may exist');
});

// -------------------------------------------------------- 8. closed reasons --

test('the closed reasons are the agreed list, with no redundant pair', async () => {
  for (const want of ['No response', 'Chose another institution', 'Changed study plans', 'Not eligible',
    'Financial reasons', 'Timing / postponed', 'Programme not suitable', 'Requirements not met',
    'Duplicate', 'Other']) {
    assert.ok(CONFIG.closedReasons.includes(want), 'missing reason: ' + want);
  }
  assert.equal(new Set(CONFIG.closedReasons).size, CONFIG.closedReasons.length, 'no duplicates in the list');
  assert.deepEqual(CONFIG.closedReasonNeedsNote, ['Other'], '"Other" needs an explanation');
});

test('the server refuses to close somebody without a reason, and "Other" without a note', async () => {
  assert.match(SERVER, /A reason is required to stop working with somebody/);
  assert.match(SERVER, /needs an explanation/);
  assert.match(SERVER, /closedReasonNeedsNote/);
});

test('the record has somewhere to keep the reason', async () => {
  const db = await openDb();
  const cols = (await db.prepare('PRAGMA table_info(people)').all()).map((c) => c.name);
  assert.ok(cols.includes('closed_reason'));
  assert.ok(cols.includes('closed_note'));
});

// ------------------------------------------------------------ 9. duplicates --

test('duplicate prevention is on, and a match blocks rather than warns', async () => {
  assert.equal(CONFIG.duplicateRule.blockOnMatch, true);
  assert.deepEqual(CONFIG.duplicateRule.matchOn, ['email', 'phone', 'name']);
  assert.match(SERVER, /This person may already be in Intake/);
  assert.match(SERVER, /confirmedNotDuplicate/);
  assert.match(SERVER, /409/, 'a blocked save must be a refusal, not a silent success');
});

test('the live warning and the blocking save use the same matcher', async () => {
  // two rules would mean the warning and the block could disagree about the
  // same two people, which is how a duplicate gets in
  //
  // Strengthened 24.09.2026 after the audit. The old version only looked inside
  // server.js, so it happily passed while src/intake.js - the path that turns a
  // channel message into a person - created twins without ever asking. Two
  // Emils Baltputnis records with the same phone got in that way.
  const IDENTITY = fs.readFileSync(path.join(ROOT, 'src', 'identity.js'), 'utf8');
  const INTAKE = fs.readFileSync(path.join(ROOT, 'src', 'intake.js'), 'utf8');
  assert.equal((IDENTITY.match(/export async function findMatches/g) || []).length, 1,
    'exactly one matcher, and it lives in identity.js');
  assert.ok(!/function findMatches\s*\(\{/.test(SERVER), 'server.js must not define its own');
  for (const [name, src] of [['server.js', SERVER], ['intake.js', INTAKE]]) {
    assert.match(src, /from '\.\/identity\.js'/, name + ' must use the shared matcher');
  }
  // and the path that creates a person from a channel must actually call it
  assert.match(INTAKE, /duplicateCheck\(db/, 'qualifying must run the duplicate check');
});

// --------------------------------------------------------------- 10. search --

test('search reaches every field the operator might remember', async () => {
  for (const f of ['id', 'name', 'email', 'phone', 'programme', 'source_channel', 'student_no']) {
    assert.ok(CONFIG.searchFields.includes(f), 'search must cover ' + f);
  }
  assert.match(SERVER, /channelLabel\(r\.source_channel\)\.toLowerCase\(\)\.includes\(q\)/,
    'the plain channel name must be searchable, not only the internal id');
});

// ---------------------------------------------------------- 11. today screen --

test('the three Today groups exist and each says what it is for', async () => {
  // Four until 24.09.2026. Follow-ups and Replies became one 'waiting' queue:
  // two tabs answering the same question, and a person with a due step AND an
  // unanswered message was listed in both.
  assert.deepEqual(CONFIG.todayGroups.map((g) => g.id),
    ['new_leads', 'waiting', 'attention']);
  for (const g of CONFIG.todayGroups) assert.ok(g.what && g.what.length > 10, g.id + ' needs a plain description');
  assert.match(CONFIG._todayGroups, /merged/i, 'the merge stays recorded, not silently dropped');
});

test('the merged queue still says which of the two reasons put a row there', async () => {
  // The merge must not cost the operator the information: a step we planned is
  // marked done, a message they sent is answered. Different actions.
  const card = APP.slice(APP.indexOf('function todayCard'), APP.indexOf('async function viewToday('));
  assert.match(card, /why === 'both'/, 'a person who is in for both reasons says so');
  assert.match(card, /they wrote/, 'an unanswered message is labelled');
  assert.match(card, /we planned this/, 'a due step is labelled');
  assert.match(card, /openComplete/, 'a due step is marked done');
  assert.match(card, /openNote/, 'a message is answered');
});

test('Today is a work queue: one person at a time, and every queue still reachable', async () => {
  assert.match(APP, /Today is a work queue, not a dashboard/);
  assert.match(APP, /order\.map\(id => byId\[id\]\)/, 'every group the server returned is kept');
  assert.match(APP, /todayPickQueue/, 'any queue can be jumped to directly');
  assert.match(APP, /todayStep/, 'and stepped through one at a time');
  assert.match(APP, /touchend/, 'with a swipe');
  assert.match(APP, /items\[TODAY_ITEM\]/, 'exactly one item is rendered');
});

test('Today shows no wall of metrics', async () => {
  const today = APP.slice(APP.indexOf('async function viewToday('), APP.indexOf('function funnelHtml'));
  assert.ok(!today.includes('class="tiles"'), 'Today must not carry the reports tiles');
  assert.ok(!today.includes('conversionPct'), 'a conversion figure belongs in Reports');
  assert.ok(!today.includes('/api/metrics/core'), 'Today does not fetch metrics at all');
});

test('a cleared queue reads as cleared, not as an empty box', async () => {
  assert.match(APP, /Nothing waiting here|All \$\{g\.total\} done today/);
  assert.match(APP, /tick-big/, 'and it looks finished rather than broken');
});

// ------------------------------------------------------------- 12. metrics ---

test('the three core metrics exist, and the conversion caveat is stated', async () => {
  assert.deepEqual(CONFIG.coreMetrics, ['New leads this month', 'Admissions this month', 'Conversion %']);
  assert.match(SERVER, /newLeadsThisMonth/);
  assert.match(SERVER, /admissionsThisMonth/);
  assert.match(SERVER, /conversionPct/);
  assert.match(SERVER, /count different populations/,
    'admissions-this-month and conversion-this-month are different populations and must say so');
});

test('the reporting dimensions are marked as things to investigate, not a dashboard', async () => {
  assert.match(CONFIG._coreMetrics, /REQUIREMENTS TO INVESTIGATE/);
  assert.match(CONFIG._coreMetrics, /Nationality is not in the prototype schema/i,
    'a dimension we cannot report on must be named, not quietly skipped');
});

// ------------------------------------------------------- 13. channels, plain --

test('the daily screens name a channel in plain words, never an endpoint', async () => {
  const daily = APP.slice(APP.indexOf('async function viewToday('), APP.indexOf('async function viewIntegrations'));
  void daily;
  for (const jargon of ['webhook', 'oauth', 'Pub/Sub', 'endpoint', 'API key']) {
    assert.ok(!daily.toLowerCase().includes(jargon.toLowerCase()),
      'the daily screens must not say "' + jargon + '"');
  }
  assert.match(daily, /channelLabel/, 'they show the channel by its plain name');
});

test('every channel the simulator can name has a plain name somewhere', async () => {
  // Added 24.09.2026. The person's timeline now shows the channel a message
  // ARRIVED on, which exposed three simulator ids - website_form, gmail and
  // open_day - that had no plain name and were printed raw on a person's page.
  const plain = (id) => CONFIG.channels[id] || (CONFIG.channelAliases || {})[id];
  for (const c of PROVIDERS.channels) {
    assert.ok(plain(c.id), 'the simulator channel "' + c.id + '" has no plain name');
  }
  // an alias must never duplicate a real channel key, or the People filter would
  // offer the same thing twice under two names
  for (const key of Object.keys(CONFIG.channelAliases || {})) {
    assert.ok(!CONFIG.channels[key], key + ' is both a channel and an alias');
  }
});

test('every channel the simulator runs has a plain name for the operator', async () => {
  const db = await openDb();
  await runFullDemo(db);
  const used = (await db.prepare('SELECT DISTINCT source_channel c FROM people').all()).map((r) => r.c);
  // A provider id may differ from the CRM's own id - the simulator still calls the
  // walk-in desk 'klatiene' because that is what providers.json researched. What
  // matters is that an OPERATOR never sees it, so this resolves the name the same
  // way the screens do: the channel list first, then the aliases.
  const plain = (id) => CONFIG.channels[id] || (CONFIG.channelAliases || {})[id];
  for (const c of used) {
    assert.ok(plain(c), 'no plain name for the channel "' + c + '"');
    assert.ok(!/^[a-z_]+$/.test(plain(c)) || plain(c) === plain(c),
      'the plain name must be words, not an id');
  }
  // and nothing Latvian reaches a screen
  for (const c of used) assert.ok(!/ā|ē|ī|ū|ļ|ņ|š|ž|č|ģ|ķ/i.test(plain(c)), plain(c) + ' is not English');
});

// ------------------------------------------------ 2. corrections stay private --

test('a colleague\'s correction is not on the person page, but their activity is', async () => {
  const db = await openDb();
  const r = await runScenario(db, 'website_form', 'new_lead');
  const at = new Date().toISOString();
  await logEvent(db, { personId: r.personId, kind: 'call', at, origin: MANUAL, actor: 'Laura',
    subject: 'Call: answered', body: 'she rang them' });
  await applyEdit(db, r.personId, { programme: 'ENG' }, 'Laura', at);

  const all = await db.prepare('SELECT * FROM events WHERE person_id = ?').all(r.personId);
  // the rule the server applies, asserted on the same shape it applies it to
  const forIeva = all.filter((e) => e.kind !== 'edit' || e.actor === 'Ieva');
  assert.ok(forIeva.some((e) => e.subject === 'Call: answered'),
    'Laura calling the applicant IS the applicant\'s activity and Ieva must see it');
  assert.ok(!forIeva.some((e) => e.kind === 'edit'),
    'Laura correcting a field is internal and Ieva must not see it');
  assert.ok(all.some((e) => e.kind === 'edit'), 'an admin sees it, so it is there to be seen');
});

test('the person page counts what it is hiding rather than pretending nothing happened', async () => {
  assert.match(SERVER, /hiddenCorrections/);
  assert.match(APP, /not shown\. Corrections are private to whoever made them/);
});

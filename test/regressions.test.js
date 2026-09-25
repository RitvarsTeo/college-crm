// The three faults the 24.09.2026 audit found, each with a test that fails if the
// fault comes back. All three had the same shape: a rule that was written down and
// enforced on the manual screen, and skipped on the path a channel message takes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify } from '../src/intake.js';
import { findMatches, duplicateCheck, isStrong } from '../src/identity.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const FULL = "Hi, I'm interested in studying Navigation. I finished secondary school and want to start next year. Can you tell me the price?";
const HI = 'Hi';
const STEP = 'Call and establish interest';

// -------------------------------------------------- 1. the person page crash --
// "fieldChip is not defined". Called on the person page, never defined anywhere.
// It broke 4 of 12 demo people - exactly those qualified through CAR with a
// confirmed field - and so 4 of the 5 'open' links in CAR Done. Present since the
// V1 commit and invisible because the rows clicked during testing had no fields.

test('every function the person page calls is actually defined', () => {
  const view = APP.slice(APP.indexOf('async function viewPerson'), APP.indexOf('function latestConsents'));
  const called = new Set([...view.matchAll(/\$\{[^}]*?\b([a-z][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
  // .map(fieldChip) style references are calls too, and are what broke
  for (const m of view.matchAll(/\.map\((\w+)\)/g)) called.add(m[1]);
  // 'var' is CSS, var(--steel), not a call
  const BUILTIN = new Set(['esc', 'if', 'for', 'return', 'typeof', 'Number', 'String', 'Boolean',
    'Object', 'Array', 'Math', 'Date', 'JSON', 'filter', 'map', 'join', 'find', 'slice',
    'var', 'calc', 'rgba', 'url']);
  const missing = [...called].filter((name) => !BUILTIN.has(name)
    && !new RegExp(`(function|const|let)\\s+${name}\\b`).test(APP));
  assert.deepEqual(missing, [], 'the person page calls something that does not exist: ' + missing.join(', '));
});

test('fieldChip exists, because the What we know card maps over it', () => {
  assert.match(APP, /const fieldChip = /, 'defined');
  assert.match(APP, /p\.fields\.map\(fieldChip\)/, 'and still used by the card that needed it');
});

// ------------------------------------------------------- 2. silent duplicates --
// config.duplicateRule.blockOnMatch has been true since 23.09.2026 and was applied
// on the manual Add person screen only. Qualifying from a channel created twins.
// The demo held two Emils Baltputnis records sharing +371 20423829.

test('qualifying refuses to create somebody we already hold, and says who', () => {
  const db = openDb();
  const a = receive(db, { channel: 'event', name: 'Emīls Baltputnis', phone: '+371 20 423 829',
    body: FULL, externalId: 'dup_a' });
  const first = qualify(db, a.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: STEP });
  assert.equal(first.ok, true);

  // the same human writes from a different channel, the number written differently
  const b = receive(db, { channel: 'whatsapp', name: 'Emils Baltputnis', phone: '37120423829',
    body: FULL, externalId: 'dup_b' });
  const second = qualify(db, b.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: STEP });

  assert.equal(second.duplicate, true, 'it must not go through');
  assert.equal(second.strong, true, 'a phone match is a strong one');
  assert.equal(second.matches[0].id, first.personId, 'and it names the person we already have');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 1, 'still one person');
  assert.equal(db.prepare('SELECT state FROM inbound WHERE id = ?').get(b.id).state, 'new',
    'and the item stays in the queue rather than being consumed');
});

test('the operator can still say it is a different person, explicitly', () => {
  const db = openDb();
  const a = receive(db, { channel: 'event', name: 'Jānis Bērziņš', body: FULL, externalId: 'n_a' });
  qualify(db, a.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: STEP });
  const b = receive(db, { channel: 'instagram', name: 'Jānis Bērziņš', body: FULL, externalId: 'n_b' });

  assert.equal(qualify(db, b.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    nextAction: STEP }).duplicate, true, 'a shared name still stops it');
  const forced = qualify(db, b.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: STEP, differentPerson: true });
  assert.equal(forced.ok, true, 'but saying so in as many words gets through');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 2);
});

test('linking to the existing person is the other way through, and keeps one record', () => {
  const db = openDb();
  const a = receive(db, { channel: 'event', name: 'Anna Liepa', phone: '+37129000111',
    body: HI, externalId: 'l_a' });
  const first = qualify(db, a.id, { qualification: 'unclear', createPerson: true, by: 'Tetiana',
    nextAction: 'Send the programme description' });
  const b = receive(db, { channel: 'whatsapp', name: 'Anna Liepa', phone: '+37129000111',
    body: FULL, externalId: 'l_b' });
  const linked = qualify(db, b.id, { qualification: 'lead', personId: first.personId,
    by: 'Ieva', confirmFields: ['interest'] });
  assert.equal(linked.ok, true);
  assert.equal(linked.personId, first.personId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 1);
});

test('one matcher answers for every path, and a phone written three ways is one person', () => {
  const db = openDb();
  db.prepare(`INSERT INTO people (id,name,email,phone,status,created_at)
    VALUES ('px','Emīls Baltputnis','e@x.lv','+371 20 423 829','New','2026-09-24T09:00:00.000Z')`).run();
  for (const written of ['+37120423829', '37120423829', '20423829', '+371 20 423 829']) {
    assert.equal(findMatches(db, { phone: written }).length, 1, written + ' must find the same person');
  }
  assert.equal(findMatches(db, { email: 'E@X.LV' }).length, 1, 'email ignores case');
  assert.equal(findMatches(db, { name: 'emīls baltputnis' }).length, 1, 'name ignores case');
  assert.equal(findMatches(db, { phone: '+37129999999' }).length, 0, 'and a different number is nobody');
  assert.equal(isStrong(findMatches(db, { phone: '20423829' })[0]), true);
  assert.equal(isStrong(findMatches(db, { name: 'Emīls Baltputnis' })[0]), false, 'a name alone is weak');
  assert.equal(duplicateCheck(db, { phone: '20423829' }, { exclude: 'px' }).blocked, false,
    'a person never blocks against themselves');
});

// ------------------------------------------------------ 3. leads with no step --
// config.nextActionRequired has been true since 23.09.2026. Completing a task
// enforced it; creating a lead from a channel did not, so three demo leads sat on
// the pipeline with nobody scheduled to do anything about them.

test('a lead cannot reach the pipeline without a next step, an owner and a due date', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', name: 'Nobody Assigned', body: FULL, externalId: 'ns1' });

  const refused = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'] });
  assert.match(refused.error, /next step is required/i);
  assert.ok(refused.nextActions, 'and it offers the configured list to choose from');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 0, 'nothing was half written');

  const ok = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: STEP });
  const task = db.prepare('SELECT * FROM tasks WHERE person_id = ?').get(ok.personId);
  assert.equal(task.label, STEP);
  assert.equal(task.owner, CONFIG.routing.lead, 'owned by the role it was routed to');
  assert.ok(task.due_at > '2026', 'with a real due date');
  assert.equal(task.done_at, null);
});

test('the due date comes from the configured action, not from a number in the code', () => {
  const db = openDb();
  const cfgDays = CONFIG.nextActions.flatMap((g) => g.items).find((i) => i.label === 'Consultation about the programme').days;
  const r = receive(db, { channel: 'instagram', name: 'Due Date', body: FULL, externalId: 'dd1' });
  const at = Date.now();
  const ok = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: 'Consultation about the programme' });
  const task = db.prepare('SELECT * FROM tasks WHERE person_id = ?').get(ok.personId);
  const days = Math.round((Date.parse(task.due_at) - at) / 86400000);
  assert.equal(days, cfgDays, 'the configured number of days, whatever it is set to');
});

test('a later message about somebody who already has a step does not stack another', () => {
  const db = openDb();
  const a = receive(db, { channel: 'instagram', name: 'Chatty Person', body: HI, externalId: 'c1' });
  const first = qualify(db, a.id, { qualification: 'unclear', createPerson: true, by: 'Tetiana',
    nextAction: 'Send the programme description' });
  const b = receive(db, { channel: 'instagram', name: 'Chatty Person', body: FULL, externalId: 'c2' });
  const second = qualify(db, b.id, { qualification: 'lead', personId: first.personId, by: 'Ieva',
    confirmFields: ['interest'] });
  assert.equal(second.ok, true, 'no next step needed: they already have one');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ?').get(first.personId).n, 1,
    'and the pile does not grow');
});

test('nobody active is left without a next step by the qualify path', () => {
  const db = openDb();
  for (const [i, body] of [FULL, HI, FULL].entries()) {
    const r = receive(db, { channel: 'instagram', name: 'Person ' + i, body, externalId: 'z' + i });
    qualify(db, r.id, { qualification: body === FULL ? 'lead' : 'unclear', createPerson: true,
      by: 'Ieva', confirmFields: body === FULL ? ['interest'] : [],
      nextAction: STEP, differentPerson: true });
  }
  const stranded = db.prepare(`SELECT COUNT(*) n FROM people pe
    WHERE pe.status NOT IN ('Admitted','Not proceeding')
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`).get().n;
  assert.equal(stranded, 0, 'this is the number Aigars asked about: people living in Done forever');
});

// ------------------------------------------------- Admissions ownership --
// LOCKED 24.09.2026. Once something is a confirmed Admissions case the owner is
// Admissions, and Ieva holds that role - whatever channel it arrived on. Channel
// access is a different question and must never move ownership.

test('a confirmed lead is owned by Admissions no matter which channel it came from', () => {
  for (const channel of ['instagram','facebook','messenger','whatsapp','website','google_form','gmail','mailchimp','open_day','phone','agent','linkedin','tiktok','in_person']) {
    const db = openDb();
    const r = receive(db, { channel, name: 'Somebody ' + channel, body: FULL, externalId: 'own-' + channel });
    const q = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana',
      confirmFields: ['interest'], nextAction: STEP });
    assert.equal(q.ok, true, channel + ': ' + q.error);
    assert.equal(q.owner, CONFIG.admissionsOwner,
      channel + ' must route a confirmed lead to Admissions');
    assert.equal(db.prepare('SELECT owner FROM people WHERE id = ?').get(q.personId).owner,
      CONFIG.admissionsOwner, channel + ': the person record must say so too');
  }
  // and the role is held by Ieva, recorded rather than implied
  assert.equal(CONFIG.admissionsOwnerPerson, 'Ieva');
  assert.match(CONFIG._admissionsOwner, /whatever channel/i);
});

test('who can open a channel never decides who owns the case', () => {
  // Tetiana is the only person with LinkedIn access, and a LinkedIn lead is still
  // Admissions work. That distinction is the whole point.
  const db = openDb();
  const r = receive(db, { channel: 'linkedin', name: 'From LinkedIn', body: FULL, externalId: 'li-own' });
  const q = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana',
    confirmFields: ['interest'], nextAction: STEP });
  assert.equal(q.owner, 'Admissions', 'Tetiana qualified it; Admissions owns it');
  const access = CONFIG.channelAccess.byPerson;
  assert.ok(access.Tetiana.includes('linkedin'));
  assert.ok(!access.Ieva.includes('linkedin'), 'Ieva cannot open LinkedIn, and still owns the case');
  // Arina has no social access at all
  assert.ok(!access.Arina.some((c) => ['facebook', 'instagram', 'messenger', 'whatsapp', 'linkedin', 'tiktok'].includes(c)),
    'Arina is phone button 3 backup only');
});

test('a database file that already exists gains new columns', () => {
  // CREATE TABLE IF NOT EXISTS does nothing for a table that is already there, so
  // a column added later never appeared in an existing file and every query for it
  // failed with "no such column". Found by opening the demo database after adding
  // nationality.
  const db = openDb();
  const cols = db.prepare("SELECT name FROM pragma_table_info('people')").all().map((r) => r.name);
  assert.ok(cols.includes('nationality'), 'nationality must exist on a fresh database');
  // and opening it again must not fail or duplicate the column
  const again = db.prepare("SELECT COUNT(*) n FROM pragma_table_info('people') WHERE name = 'nationality'").get().n;
  assert.equal(again, 1);
});

// --------------------------------------------------- the suggested next step --
// The dialog offers a first move rather than whatever happened to be top of the
// list. It is a suggestion and nothing more: the whole list is still there.

test('the suggestion rules are data, so Admissions can change them without code', () => {
  const rules = CONFIG.suggestedNextAction;
  assert.ok(rules, 'there must be rules to read');
  const ids = new Set(CONFIG.nextActions.flatMap((g) => g.items).map((i) => i.id));

  // every rule must point at an action that exists, or the dialog silently offers
  // nothing and falls back to the top of the list
  for (const [question, id] of Object.entries(rules.byQuestion || {})) {
    assert.ok(ids.has(id), `byQuestion.${question} points at "${id}", which is not an action`);
  }
  for (const [channel, id] of Object.entries(rules.byChannel || {})) {
    assert.ok(ids.has(id), `byChannel.${channel} points at "${id}", which is not an action`);
  }
  assert.ok(ids.has(rules.whenProgrammeKnown));
  assert.ok(ids.has(rules.whenNothingKnown));

  // and every kind of question the machine can read has an answer
  const EXTRACT = fs.readFileSync(path.join(ROOT, 'src', 'extract.js'), 'utf8');
  // read the whole block rather than a fixed number of characters: adding a
  // comment above it used to be enough to make this test find nothing and pass
  const start = EXTRACT.indexOf('const QUESTION_WORDS');
  const block = EXTRACT.slice(start, EXTRACT.indexOf('\n};', start));
  const kinds = [...block.matchAll(/^\s+(\w+):\s*\[/gm)].map((m) => m[1]);
  assert.ok(kinds.length >= 4, 'the question list should have been found, and was not');
  for (const k of kinds) {
    assert.ok(rules.byQuestion[k], `the machine can read a "${k}" question and nothing suggests a reply`);
  }
});

test('the suggestion is offered first and is still only a suggestion', () => {
  const view = APP.slice(APP.indexOf('function suggestNextAction'), APP.indexOf('async function openQualify'));
  assert.match(view, /byQuestion/, 'it reads the rules rather than hardcoding one');
  assert.match(view, /optgroup label="Suggested"/, 'and puts it at the top under its own heading');
  // the full list must still be there underneath
  assert.match(view, /nextActionOptions\(null\)/, 'the whole grouped list stays available');
  // it says WHY, because a suggestion nobody understands is just a default
  const dialog = APP.slice(APP.indexOf('async function openQualify'), APP.indexOf('async function doQualify'));
  assert.match(dialog, /Suggested because/);
  assert.match(dialog, /Change it to anything else/);
});

test('nothing implies an application deadline, because there is not one', () => {
  // Locked 24.09.2026: Novikontas accepts submissions ALL YEAR ROUND. Somebody
  // asking "what is the deadline" is carrying a wrong assumption, so the reply
  // corrects it. Sending a programme description does not, and the question
  // comes back.
  assert.equal(CONFIG.admissionIsYearRound, true);
  assert.match(CONFIG._admissionIsYearRound, /ALL YEAR ROUND/);
  assert.equal(CONFIG.suggestedNextAction.byQuestion.dates, 'answer_question',
    'a dates question is answered by a person, not posted a brochure');

  // and no screen may tell somebody they have missed anything
  for (const [file, text] of [['app.html', APP]]) {
    const visible = text
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const word of ['deadline', 'closing date', 'applications close']) {
      assert.ok(!new RegExp(word, 'i').test(visible), `${file} says "${word}" and there is no such thing`);
    }
  }
});

// ------------------------------------------------- questions already answered --
// Ritvars had to answer the same things more than once because open-question lists
// were regenerated from notes written BEFORE his answer arrived. His answers
// existed; the summaries did not read them. config.settled is the one place that
// records a decision, and this test makes reopening one fail.

test('nothing Ritvars has settled can come back as an open question', () => {
  const settled = CONFIG.settled;
  assert.ok(settled, 'there must be a record of what is already decided');

  const closed = Object.entries(settled).filter(([k, v]) => !k.startsWith('_') && v.doNotReopen);
  assert.ok(closed.length >= 5, 'the decisions taken on 24.09.2026 must all be in here');
  for (const [key, d] of closed) {
    assert.ok(d.question && d.answer, key + ' must record both the question and the answer');
    assert.ok(d.decidedBy && d.decidedOn, key + ' must say who decided it and when');
  }

  // the PBX token is the one he had to repeat three times
  const token = settled.pbxTokenNotRotated;
  assert.match(token.answer, /NO\./);
  assert.equal(token.doNotReopen, true);

  // And no document may ask any of them again.
  //
  // This guard checked only the TOKEN wording, and on 25.09.2026 the backlog's
  // open-questions list was still asking whether the TeleGroup event says which
  // button was pressed - the exact question `pbxQueueIsTheButton` settles. A
  // guard that covers one settled item and not the rest is not a guard, so the
  // phrases below cover every settled decision, and a live question may not
  // carry any of them.
  const REOPENS = {
    pbxTokenNotRotated: ['must be rotated', 'must be changed', 'exposed in a chat', 'no longer safe'],
    pbxQueueIsTheButton: ['does a post-call notification exist', 'which menu button',
      'which button the caller'],
    phoneButtonsConfirmed: ['are the buttons confirmed'],
    instagramIsProfessional: ['is our instagram a professional', 'is the instagram account a professional'],
    metaAccessConfirmed: ['who owns our facebook page', 'who has meta business suite access'],
    whatsappNumber: ['is there a spare phone number', 'which number do we use for whatsapp'],
    mailchimpWebhooksAvailable: ['does our mailchimp plan include webhooks',
      'does the mailchimp plan include webhooks'],
    admissionIsYearRound: ['deadline for applications', 'what is the application deadline'],
  };
  // Every settled decision must be covered, or a new one silently gains no guard.
  for (const [key] of closed) {
    assert.ok(REOPENS[key], key + ' is settled but no phrase guards it from being re-asked');
  }

  const docs = ['BACKLOG.md', 'CHANNEL_READINESS.md', 'CONNECTING_CHANNELS.md', 'PBX_CALL_LOGGER.md'];
  for (const name of docs) {
    const file = path.join(ROOT, 'docs', name);
    if (!fs.existsSync(file)) continue;
    // A struck-through line that records the answer is the record working, not
    // a reopening, so only LIVE text counts.
    const live = fs.readFileSync(file, 'utf8').split('\n')
      .filter((l) => !l.includes('~~') && !/ANSWERED|SETTLED|do not ask again/i.test(l))
      .join('\n').toLowerCase();
    for (const [key, phrases] of Object.entries(REOPENS)) {
      for (const phrase of phrases) {
        assert.ok(!live.includes(phrase),
          `docs/${name} reopens ${key}: "${phrase}"`);
      }
    }
  }

  // and the live open-questions list may not ask a settled thing either
  const openText = Object.values(CONFIG.openQuestions)
    .filter((q) => q && q.ask).map((q) => q.ask.toLowerCase()).join(' | ');
  for (const [key, phrases] of Object.entries(REOPENS)) {
    for (const phrase of phrases) {
      assert.ok(!openText.includes(phrase), `openQuestions reopens ${key}: "${phrase}"`);
    }
  }

  // nor may the channel register list it as a blocker
  const CHANNELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));
  for (const [id, c] of Object.entries(CHANNELS.channels)) {
    const text = JSON.stringify(c);
    assert.ok(!/rotate|exposed in a chat/i.test(text), id + ' still raises the token question');
  }
});

test('the PBX button question is answered, and the answer was always in the brief', () => {
  // The event carries a `queue`, and the queue IS the button. It was in the
  // original TeleGroup brief and mapped in phoneMenu on 23.09.2026, and it was
  // still being listed as an open question a day later.
  assert.equal(CONFIG.settled.pbxQueueIsTheButton.doNotReopen, true);
  const menu = CONFIG.phoneMenu;
  assert.equal(menu['1'].queue, '1001*Q-ADMISSION');
  assert.equal(menu['2'].queue, '1001*Q-COORDINATORS');
  assert.equal(menu['3'].queue, '1001*Q-OTHER');
  assert.deepEqual(menu['1'].handledBy, ['Ieva']);
  assert.deepEqual(menu['3'].handledBy, ['Tetiana', 'Arina']);

  // and the phone channel must not claim to be blocked on it
  const CHANNELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));
  const blocker = CHANNELS.channels.phone.externalBlocker || '';
  assert.ok(!/button|menu/i.test(blocker),
    'the phone channel still says it is blocked on the button question: ' + blocker);
});

test('Meta access is recorded, so nobody is asked for it again', () => {
  assert.equal(CONFIG.settled.metaAccessConfirmed.doNotReopen, true);
  assert.deepEqual(CONFIG.metaBusinessSuite.access, ['Ieva', 'Laura', 'Tetiana', 'Marina']);
  const acc = CONFIG.channelAccess.byPerson;
  for (const who of ['Ieva', 'Laura', 'Tetiana', 'Marina']) {
    assert.ok(acc[who].includes('facebook'), who + ' should have Facebook');
    assert.ok(acc[who].includes('instagram'), who + ' should have Instagram');
    assert.ok(acc[who].includes('messenger'), who + ' should have Messenger');
  }
  assert.ok(!acc.Arina.some((c) => ['facebook', 'instagram', 'messenger', 'whatsapp'].includes(c)),
    'Arina has no social access');
  // an account inside Business Suite IS a professional account, so that is not a question
  assert.equal(CONFIG.settled.instagramIsProfessional.doNotReopen, true);
});

test('the open-questions list holds only things nobody has answered', () => {
  const open = CONFIG.openQuestions;
  assert.ok(open, 'the real unknowns must be recorded in one place');
  const items = Object.entries(open).filter(([k]) => !k.startsWith('_'));
  assert.ok(items.length > 0);

  const ids = Object.keys(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8')).channels);

  const settledText = Object.values(CONFIG.settled)
    .filter((d) => d && d.question)
    .map((d) => d.question.toLowerCase());

  for (const [key, q] of items) {
    for (const f of ['ask', 'why', 'who', 'blocks', 'status']) {
      assert.ok(q[f] !== undefined, key + ' is missing ' + f);
    }
    assert.ok(q.ask.length > 10, key + ' must be a real question');
    // it must not be a re-ask of something decided
    const low = q.ask.toLowerCase();
    for (const phrase of ['menu button', 'professional account', 'rotate', 'deadline']) {
      assert.ok(!low.includes(phrase), key + ' re-asks a settled question: ' + phrase);
    }
    for (const cid of q.blocks) {
      assert.ok(ids.includes(cid), key + ' blocks an unknown channel: ' + cid);
    }
  }

  // Every channel the register says is blocked must trace to a question on this
  // list, otherwise "waiting on somebody" has no owner and nobody chases it.
  // Read from channels.json, never a hand-written list, so closing a blocker
  // closes the question with it.
  const owned = new Set(items.flatMap(([, q]) => q.blocks));
  const CH = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8')).channels;
  for (const [id, c] of Object.entries(CH)) {
    if (!c.externalBlocker) continue;
    // 'work' blockers are ours to do; only a 'question' needs somebody to answer
    assert.ok(['question', 'work'].includes(c.blockerKind),
      id + ' is blocked but does not say whether that is a question or work');
    if (c.blockerKind !== 'question') continue;
    assert.ok(owned.has(id), id + ' is blocked but no open question owns it');
  }
  // and the reverse: a question may not claim to block a channel that is ready
  for (const [key, q] of items) {
    for (const cid of q.blocks) {
      assert.ok(CH[cid].externalBlocker,
        key + ' claims to block ' + cid + ', but that channel is ready');
      assert.equal(CH[cid].blockerKind, 'question',
        key + ' claims to block ' + cid + ', but that channel is waiting on work, not an answer');
    }
  }
  assert.ok(settledText.length >= 5);
});

test('the Desktop guide generator refuses to reopen a settled question', () => {
  // Sabotage: the guard is only worth having if it actually stops the build.
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'make_desktop_guide.py'), 'utf8');
  assert.match(script, /REFUSED: openQuestions/,
    'the generator must refuse, not warn, when a settled question comes back');
  assert.match(script, /cfg\['openQuestions'\]/,
    'the guide must read its questions from config, never from a hand-written list');
  for (const phrase of ['which menu button', 'professional account?', 'rotate']) {
    assert.ok(script.includes(phrase), 'the guard no longer catches: ' + phrase);
  }
});

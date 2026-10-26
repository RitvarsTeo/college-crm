// A DRAFT IN THE SIS (Admissions 26.10.2026, the owner's pick B, _ieva-feedback/drafts_AB_2026-10-26.png): everybody whose
// SIS form is started and not submitted still gets the ONE form call; once it is done they move by themselves to a navy
// band "Draft in the SIS" on Due - never Overdue, never "No next step" (Due, Journey, Home, Reports: one rule) - and leave
// it by themselves when the SIS says submitted, or when they write or call in. An account only is not part of it.
// Synthetic people only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './security_helpers.js';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { SIS_DRAFT_SQL, SIS_DRAFT_STEP, SIS_HOLDS_SQL } = await import('../src/lifecycle.js');
const { FORM_CHECK, FORM_START } = await import('../src/sync.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const DONE_AT = '2026-10-14T09:00:00.000Z';

async function seed(db) {
  const person = (id, p = {}) => db.prepare(`INSERT INTO people (id, name, email, status, owner, first_channel, created_at, sis_handoff_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, p.name || 'Paraugs ' + id, id + '@example.com', p.status || 'Follow-up', 'Admissions', p.first || 'website',
    '2026-10-01T08:00:00.000Z', p.handoff || null);
  const sis = (pid, status, app = 1) => db.prepare(`INSERT INTO sis_applicants (reference, application_id, person_id, status, changed_at, synced_at)
    VALUES (?,?,?,?,?,?)`).run('ref-' + pid, String(app), pid, status, '2026-10-12T10:00:00.000Z', '2026-10-12T10:05:00.000Z');
  const task = (pid, label, due, done = null) => db.prepare('INSERT INTO tasks (person_id, label, due_at, owner, created_at, done_at, outcome) VALUES (?,?,?,?,?,?,?)')
    .run(pid, label, due, 'Admissions', '2026-10-10T08:00:00.000Z', done, done ? 'No answer' : null);
  const ev = (pid, at, kind, channel, direction, subject = 'x', origin = 'manual') => db.prepare(`INSERT INTO events (person_id, kind, channel, direction,
    occurred_at, subject, body, actor, origin) VALUES (?,?,?,?,?,?,?,?,?)`).run(pid, kind, channel, direction, at, subject, 'b', 'Admissions', origin);
  // draft: started, the form call done (no answer), a follow-up since then overdue, emailed and called
  await person('draft'); await sis('draft', 'started'); await task('draft', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  await task('draft', 'Follow up', '2026-10-16T09:00:00.000Z');
  await ev('draft', DONE_AT, 'task', 'phone', 'note', `${FORM_CHECK}: No answer`);
  await ev('draft', '2026-10-15T09:00:00.000Z', 'email', 'email', 'out', 'Your application');
  // draft with nothing open: never "no next step"
  await person('draft2'); await sis('draft2', 'started'); await task('draft2', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  // started, the call not done yet: the call stays, in the normal flow
  await person('called_not_yet'); await sis('called_not_yet', 'started'); await task('called_not_yet', FORM_CHECK, '2026-10-13T09:00:00.000Z');
  // started, call done, then they wrote in: back in the normal flow
  await person('wrote'); await sis('wrote', 'started'); await task('wrote', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  await ev('wrote', '2026-10-20T09:00:00.000Z', 'note', 'gmail', 'in', 'Re: application', 'automatic');
  // started, call done, then they called in
  await person('phoned'); await sis('phoned', 'started'); await task('phoned', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  await ev('phoned', '2026-10-21T09:00:00.000Z', 'call', 'phone', 'in', 'Missed call', 'automatic');
  // started, call done, only the SIS's own line since: still a draft
  await person('sis_said'); await sis('sis_said', 'started'); await task('sis_said', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  await ev('sis_said', '2026-10-22T09:00:00.000Z', 'channel', 'sis', 'in', 'Linked to the SIS applicant record', 'automatic');
  // an account only: not part of it, keeps "did they start"
  await person('account'); await sis('account', 'registered'); await task('account', FORM_START, '2026-10-13T09:00:00.000Z', DONE_AT);
  await task('account', FORM_START, '2026-10-15T09:00:00.000Z');
  // started AND another application submitted: the SIS holds them
  await person('submitted', { first: 'sis' }); await sis('submitted', 'started', 1); await sis('submitted', 'submitted', 2);
  await task('submitted', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  // Admissions answered With the SIS: with the SIS, not a draft
  await person('handed', { handoff: '2026-10-20T09:00:00.000Z' }); await sis('handed', 'started'); await task('handed', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
  // a finished person is in no band
  await person('closed', { status: 'Not proceeding' }); await sis('closed', 'started'); await task('closed', FORM_CHECK, '2026-10-13T09:00:00.000Z', DONE_AT);
}
const drafts = async (db) => (await db.prepare(`SELECT pe.id FROM people pe WHERE pe.status NOT IN ('Admitted','Not proceeding') AND ${SIS_DRAFT_SQL} ORDER BY pe.id`).all()).map((r) => r.id);

test('one rule: started and not submitted, the form call done, nothing in from them since; not an account only', async () => {
  assert.equal(SIS_DRAFT_STEP, FORM_CHECK, 'the rule reads the same step the SIS plans');
  const db = await openDb();
  await seed(db);
  assert.deepEqual(await drafts(db), ['draft', 'draft2', 'sis_said']);
  const holds = (await db.prepare(`SELECT pe.id FROM people pe WHERE ${SIS_HOLDS_SQL} ORDER BY pe.id`).all()).map((r) => r.id);
  assert.deepEqual(holds, ['handed', 'submitted'], 'submitted and handed over are With the SIS, as before');
});

test('leaving: the SIS says submitted -> With the SIS; a new call after another one is answered and done -> back in the band', async () => {
  const db = await openDb();
  await seed(db);
  await db.prepare(`UPDATE sis_applicants SET status = 'submitted' WHERE person_id = 'draft'`).run();
  assert.ok(!(await drafts(db)).includes('draft'));
  // "wrote" came back into the flow; a second form call done after their message puts them back
  await db.prepare('INSERT INTO tasks (person_id, label, due_at, owner, created_at, done_at, outcome) VALUES (?,?,?,?,?,?,?)')
    .run('wrote', FORM_CHECK, '2026-10-22T09:00:00.000Z', 'Admissions', '2026-10-20T10:00:00.000Z', '2026-10-22T10:00:00.000Z', 'Answered');
  assert.ok((await drafts(db)).includes('wrote'));
});

// ------------------------------------------------------------------------------------------ a running copy
let srv = null;
after(() => { if (srv) srv.child.kill(); });
test('a running copy: Overdue, Due today and No next step leave drafts out on Due, Home and Reports; the rows say sis_draft', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-drafts-'));
  const file = path.join(dir, 'drafts.db');
  const db = await openDb(file);
  await seed(db);
  await db.close();
  srv = await start({ CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '' });
  const get = async (p) => (await fetch(srv.base + p, { headers: { 'x-acting-as': 'Ritvars' } })).json();
  const sum = await get('/api/summary');
  const overdueIds = new Set(sum.overdue.map((t) => t.person_id));
  assert.ok(!overdueIds.has('draft'), 'the draft\'s follow-up is not overdue');
  assert.ok(overdueIds.has('account'), 'an account only still is');
  assert.ok(overdueIds.has('called_not_yet'), 'the form call itself still is, until it is done');
  assert.ok(overdueIds.has('wrote') === false && overdueIds.has('phoned') === false, 'nothing open for them here');
  assert.equal(sum.sisDraft, 3, 'the band\'s figure');
  const people = (await get('/api/people')).rows;
  const by = Object.fromEntries(people.map((p) => [p.id, p]));
  assert.equal(by.draft.sis_draft, 1);
  assert.equal(by.account.sis_draft, 0);
  assert.equal(by.wrote.sis_draft, 0);
  assert.deepEqual([by.draft.sis_draft_emailed, by.draft.sis_draft_called], ['emailed', 'called'], 'what was tried, for the card');
  assert.deepEqual([by.draft2.sis_draft_emailed, by.draft2.sis_draft_called], ['', ''], 'nothing logged: nothing claimed');
  // "No next step" leaves out draft2 (a draft with nothing open) but keeps "wrote" (back in the flow, nothing open)
  const none = people.filter((p) => !['Admitted', 'Not proceeding'].includes(p.status) && !p.next_action_at).map((p) => p.id);
  assert.ok(none.includes('draft2') && none.includes('wrote'));
  const sum2 = await get('/api/summary');
  assert.equal(sum2.noNextAction, none.filter((id) => !['draft2', 'sis_said', 'handed', 'submitted'].includes(id)).length,
    'the count leaves out the drafts and the people the SIS holds');
  const tasks = await get('/api/tasks?scope=overdue');
  assert.ok(!tasks.some((t) => t.person_id === 'draft'));
  const open = await get('/api/tasks?scope=open');
  assert.equal(open.find((t) => t.person_id === 'draft').sis_draft, 1, 'Due puts it in the band');
  const rep = await get('/api/report?scope=all');
  assert.equal(rep.summary.overdue, sum.overdue.length, 'Reports counts Overdue the same way');
  const person = await get('/api/people/draft');
  assert.equal(person.sis_draft, 1, 'the person page reads the same rule');
});

test('the screen: one band on Due with its own figure, the card in words, navy, no red; the State filter knows it; Help center', () => {
  assert.match(APP, /\{ id: 'draft', label: 'Draft in the SIS', rows: D\.drafts\.filter\(okP\), fn: null, tone: 'draft' \}/);
  assert.match(APP, /<span>Waits for them to submit<\/span>/);
  assert.match(APP, /Draft since \$\{esc\(cDraftSince\(p\) \|\| 'the SIS'\)\}/);
  assert.match(APP, /c-rail c-rail-due t-draft/, 'the navy rail');
  assert.match(APP, /if \(p && Number\(p\.sis_draft\) === 1\) return \['draft',/, 'one state for every card');
  assert.match(APP, /\['draft', 'Draft in the SIS'\]\]/, 'the Journey State filter');
  assert.match(APP, /const none = open\.filter\(\(p\) => !p\.next_action_at && !cSisHolds\(p\) && !cIsDraft\(p\)\);/);
  assert.match(APP, /h3 b\.c-count\.draft\{background:var\(--btn-bg\)/);
  assert.match(APP, /const ST = \['over', 'today', 'due', 'none', 'sis', 'draft'\];/, 'the Journey graph counts it');
  assert.match(APP, /\['track', \['today', 'due', 'sis', 'draft'\], 'On track'\]/, 'in the navy part, never red');
  const cardStates = HELP.faq.find((f) => f.id === 'card-states').a;
  assert.match(cardStates, /Draft in the SIS is navy too/);
  assert.ok(HELP.faq.some((f) => f.id === 'draft-in-sis'));
});

// Lifecycle facts, 29.09.2026 (Aigars: "Application form started" and "Matriculated"): dated facts
// from the SIS, never stages, never invented, written once. The mapping is PROVISIONAL until a real
// SIS reply is seen (src/lifecycle.js says why) and lives in one place.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, pgSchemaSql } from '../src/db.js';
import { sisFacts, recordSisLifecycle, lifecycleOf, SIS_LIFECYCLE_MAP, LIFECYCLE_FACTS } from '../src/lifecycle.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const LIB = fs.readFileSync(path.join(ROOT, 'src', 'lifecycle.js'), 'utf8');
// the documented SIS row, as lib/sis.js toSisRow puts it (made-up values)
const row = (status, changed = '2026-09-28T07:58:02.000Z', extra = {}) => ({ reference: 'ref-1', application_id: 'app-1',
  status, registered_at: '2026-09-28T07:40:11.000Z', submitted_at: null, changed_at: changed, ...extra });

test('the mapping: started by changedAt; past started by submittedAt (Ritvars 29.09); matriculated by changedAt; nothing else', () => {
  assert.equal(SIS_LIFECYCLE_MAP.provisional, true, "'started' not yet seen in a real reply");
  assert.match(LIB, /THE MAPPING/);
  assert.deepEqual(sisFacts(row('started')), [{ fact: 'form_started', occurredAt: '2026-09-28T07:58:02.000Z', sourceRef: 'ref-1:app-1' }]);
  const sub = { submitted_at: '2026-09-27T12:00:00.000Z' };
  for (const s of ['submitted', 'admitted', 'rejected', 'withdrawn']) {
    assert.deepEqual(sisFacts(row(s, undefined, sub)).map((f) => [f.fact, f.occurredAt]), [['form_started', '2026-09-27T12:00:00.000Z']], s + ' with a submit date: form started, by that date');
    assert.deepEqual(sisFacts(row(s)), [], s + ' without a submit date: no fact, no made-up date');
  }
  assert.deepEqual(sisFacts(row('matriculated', undefined, sub)).map((f) => [f.fact, f.occurredAt]),
    [['form_started', '2026-09-27T12:00:00.000Z'], ['matriculated', '2026-09-28T07:58:02.000Z']]);
  assert.deepEqual(sisFacts(row('registered', undefined, sub)), [], 'registered only: no application, no fact');
  assert.deepEqual(sisFacts(row('registered')), []);
  assert.deepEqual(sisFacts(row('started', null)), [], 'no date in the record: no fact');
  assert.deepEqual(sisFacts(row('started', 'not a date')), []);
  assert.deepEqual(sisFacts({ ...row('started'), reference: '' }), [], 'no SIS person: no fact');
  assert.deepEqual(Object.keys(LIFECYCLE_FACTS), ['form_started', 'matriculated']);
});

test('recording is idempotent: the same record, or the same status again, writes nothing new', async () => {
  const db = await openDb();
  assert.equal(await recordSisLifecycle(db, 'r0001', row('started')), 1);
  assert.equal(await recordSisLifecycle(db, 'r0001', row('started')), 0, 'the same run twice');
  assert.equal(await recordSisLifecycle(db, 'r0001', row('started', '2026-09-29T10:00:00.000Z')), 0, 'seen again later: the first date stands');
  assert.equal(await recordSisLifecycle(db, 'r0001', row('submitted', '2026-09-29T11:00:00.000Z')), 0);
  assert.equal(await recordSisLifecycle(db, 'r0001', row('matriculated', '2026-10-05T09:00:00.000Z')), 1);
  assert.equal(await recordSisLifecycle(db, null, row('started')), 0, 'an unlinked SIS person writes nothing');
  assert.deepEqual(await lifecycleOf(db, 'r0001'), [
    { fact: 'form_started', label: 'Application form started', at: '2026-09-28T07:58:02.000Z', source: 'SIS' },
    { fact: 'matriculated', label: 'Matriculated', at: '2026-10-05T09:00:00.000Z', source: 'SIS' }]);
  assert.deepEqual(await lifecycleOf(db, 'r0002'), [], 'nobody else gains a fact');
  const n = (await db.prepare('SELECT COUNT(*) n FROM lifecycle_events').get()).n;
  assert.equal(Number(n), 2);
});

test('facts are not stages: nothing here touches people.status, and the token is not in this file', () => {
  assert.doesNotMatch(LIB, /UPDATE people|status\s*=\s*'Admitted'/);
  const code = LIB.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');   // the code, not its comments
  assert.doesNotMatch(code, /SIS_API_TOKEN|Bearer|process\.env|fetch\(/, 'this file never sees the token or calls the SIS');
  assert.match(pgSchemaSql(), /CREATE TABLE IF NOT EXISTS lifecycle_events \(\s*person_id TEXT COLLATE "C" NOT NULL,[\s\S]*PRIMARY KEY \(person_id, fact, source, source_ref\)\s*\);/);
});

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'demo' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('the API: a person without facts carries none; the list has the two dates, empty', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const list = await (await fetch(`${base}/api/people`)).json();
  assert.ok(list.rows.length > 0);
  assert.ok(list.rows.every((r) => 'form_started_at' in r && 'matriculated_at' in r));
  assert.ok(list.rows.every((r) => r.form_started_at === null && r.matriculated_at === null), 'nothing invented');
  const one = await (await fetch(`${base}/api/people/${list.rows[0].id}`)).json();
  assert.deepEqual(one.lifecycle, []);
});

test('the screen: a fact shows only when the SIS said it; none shows nothing', () => {
  const src = [APP.slice(APP.indexOf('function cLifeFacts('), APP.indexOf('function cPersonCard('))].join('\n');
  const ctx = { esc: (s) => String(s ?? ''), cDay: (s) => String(s).slice(0, 10) };
  vm.runInNewContext(src + '\nthis.line = cLifeLine; this.facts = cLifeFacts;', ctx);
  assert.equal(ctx.line({}), '');
  assert.equal(ctx.line({ lifecycle: [] }), '');
  assert.match(ctx.line({ lifecycle: [{ fact: 'form_started', at: '2026-09-28T07:58:02Z' }] }), /Application form started <time>by 2026-09-28<\/time>/, 'every SIS date is a "by" date');
  assert.match(ctx.line({ form_started_at: '2026-09-28', matriculated_at: '2026-10-05' }), /Application form started[\s\S]*Matriculated <time>by 2026-10-05<\/time>/);
  assert.match(APP, /\$\{cLifeLine\(p\)\}\$\{next\}/, 'on the person page, above the next step');
  assert.match(APP, /<b>\$\{esc\(p\.name\)\}<\/b>\$\{life\}\$\{t/, 'on the Journey card, under the name');
  assert.doesNotMatch(APP, /stages[^;\n]*form_started|'Matriculated'\s*:\s*\{\s*label/, 'no new stage');
});

// Ritvars, 29.09.2026: after submission it is the Student Coordinator's work; Admissions sees where
// the person is in the SIS and the next SIS step, to nudge. SIS statuses only, nothing guessed.
test('where they are in the SIS: the furthest open application, the next SIS status, who only where said', async () => {
  const { sisProgress } = await import('../src/lifecycle.js');
  assert.equal(sisProgress([]), null);
  assert.deepEqual(sisProgress([{ status: 'submitted', changed_at: '2026-09-28T07:58:02Z' }]),
    { status: 'submitted', label: 'Submitted', since: '2026-09-28T07:58:02Z', next: 'Admitted', nextBy: 'Student Coordinator' });
  const two = sisProgress([{ status: 'registered', changed_at: '2026-09-29' }, { status: 'admitted', changed_at: '2026-09-20' }]);
  assert.equal(two.label, 'Admitted');
  assert.equal(two.next, 'Matriculated');
  assert.equal(two.nextBy, null, 'nobody named where Ritvars has not said who');
  assert.equal(sisProgress([{ status: 'matriculated', changed_at: 'x' }]).next, null, 'the end');
  assert.equal(sisProgress([{ status: 'rejected', changed_at: '2026-09-28' }]).label, 'Rejected');
  assert.equal(sisProgress([{ status: 'rejected', changed_at: '2026-09-28' }]).next, null);
});

test('the screen says it in one line: In the SIS: Submitted by <date> - next: Admitted (Student Coordinator)', () => {
  const src = APP.slice(APP.indexOf('function cLifeFacts('), APP.indexOf('function cPersonCard('));
  const ctx = { esc: (s) => String(s ?? ''), cDay: (s) => String(s).slice(0, 10) };
  vm.runInNewContext(src + '\nthis.line = cLifeLine;', ctx);
  const html = ctx.line({ sis: { label: 'Submitted', since: '2026-09-28T07:58:02Z', next: 'Admitted', nextBy: 'Student Coordinator' } });
  assert.match(html, /In the SIS: <b>Submitted<\/b> <time>by 2026-09-28<\/time> · next: Admitted \(Student Coordinator\)/);
  assert.equal(ctx.line({}), '', 'not in the SIS: nothing');
});

// Q49, the owner 05.10.2026: Conversion counts only MATURED people, everywhere. It counted everyone who arrived in the
// period, last week's leads included, so it read low and could not be compared with any benchmark. Now:
// admitted / the people who arrived at least N days (config conversion.maturedDays) before the end of the period, or
// before today if the period has not ended. One definition (src/reports.js), read by Home, Reports and the export.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { report, maturedBasis, maturedConversion, periodOf, MATURED_DAYS } from '../src/reports.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const DAY = 86400000;

async function people(rows) {
  const db = await openDb(':memory:');
  for (const [id, created, admitted] of rows) {
    await db.prepare(`INSERT INTO people (id,name,status,owner,source_channel,created_at,last_contact_at,admitted_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, 'Test ' + id, admitted ? 'Admitted' : 'New', 'Admissions', 'website', created, created, admitted || null);
  }
  return db;
}
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

test('N is config: 60 to start, with its reason', () => {
  assert.equal(CFG.conversion.maturedDays, 60);
  assert.match(CFG.conversion._maturedDays, /MATURED/);
  assert.equal(MATURED_DAYS, 60);
});

test('a lead added last week is not in the denominator; one that arrived 60+ days ago is', async () => {
  const db = await people([
    ['old-won', ago(120), ago(30)], ['old-open', ago(90)], ['edge', ago(61)],
    ['last-week', ago(7)], ['last-week-won', ago(6), ago(1)], ['young', ago(40)]]);
  const r = await report(db, { from: '2000-01-01' , to: new Date().toISOString().slice(0, 10) });
  assert.equal(r.summary.newLeads, 6, 'every arrival is still a lead');
  assert.equal(r.summary.conversionB, 3, 'only the three who arrived 60+ days ago are the base');
  assert.equal(r.summary.conversionA, 1, 'and of them, the one admitted; last week\'s admission is not counted');
  assert.equal(r.summary.conversionPct, 33.3);
  assert.equal(r.summary.conversionWho, 'who arrived 60+ days ago');
  assert.equal(r.summary.conversionOf, '1 of 3 people who arrived 60+ days ago');
  // nobody matured: a dash, never 0%
  const fresh = await people([['a', ago(3)], ['b', ago(2), ago(1)]]);
  const f = (await report(fresh, { from: '2000-01-01', to: new Date().toISOString().slice(0, 10) })).summary;
  assert.equal(f.conversionB, 0);
  assert.equal(f.conversionPct, null);
});

test('the end of a past period is its last day; of a running one, today', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const sep = maturedBasis(periodOf('2026-09-01', '2026-09-30'), { now });
  assert.equal(sep.lastDay, '2026-08-01', '60 days before 30 Sep');
  assert.equal(sep.who, 'who arrived 60+ days before 2026-09-30');
  const year = maturedBasis(periodOf('2026-01-01', '2026-12-31'), { now });
  assert.equal(year.lastDay, '2026-08-06', '60 days before today, not before 31 Dec');
  assert.equal(year.who, 'who arrived 60+ days ago');
});

test('one definition: the server report, the core metric, Home and Reports all read it', () => {
  const R = fs.readFileSync(path.join(ROOT, 'src', 'reports.js'), 'utf8');
  assert.match(R, /const conv = await maturedConversion\(db, p\);/, 'the report');
  assert.match(SERVER, /const conv = await maturedConversion\(db, periodOf\(\)\);/, '/api/metrics/core');
  assert.doesNotMatch(SERVER, /cohortAdmitted/, 'the old all-arrivals rule is gone');
  // Home: only the small label changed; the figures are the report's a / b and its words
  assert.match(APP, /<div><span>Conversion<\/span><b>\$\{s\.conversionPct == null \? '-' : s\.conversionPct \+ '%'\}<\/b><small>\$\{s\.conversionA \?\? 0\} \/ \$\{s\.conversionB \?\? 0\} \$\{esc\(s\.conversionWho \|\| 'who arrived'\)\}<\/small>/);
  // Reports: the tab takes the server's cutoff, never its own rule
  const model = APP.slice(APP.indexOf('function cRepModel('), APP.indexOf('// One figure, drawn as the click to its people.'));
  assert.match(model, /const cut = S\.conversionCutoff \? Date\.parse\(S\.conversionCutoff\) : -Infinity;/);
  assert.match(model, /const ripe = arr\.filter\(\(p\) => Date\.parse\(p\.created_at\) < cut\);/);
  assert.match(model, /base: fig\('conversion:matured', /, 'the base is its own people, one click away');
  assert.doesNotMatch(model, /maturedDays|86400000 \* 60/, 'no second copy of the rule');
});

test('Reports counts the same people as the server, and the click opens exactly them', async () => {
  const db = await people([['old-won', ago(120), ago(30)], ['old-open', ago(90)], ['last-week', ago(7)], ['last-week-won', ago(6), ago(1)]]);
  const conv = await maturedConversion(db, periodOf('2000-01-01', new Date().toISOString().slice(0, 10)));
  assert.deepEqual([conv.admitted, conv.of], [1, 2]);
  // the browser side, on the same rows: people created before the cutoff
  const rows = await db.prepare('SELECT * FROM people').all();
  const ripe = rows.filter((p) => Date.parse(p.created_at) < Date.parse(conv.cutoff));
  assert.deepEqual(ripe.map((p) => p.id).sort(), ['old-open', 'old-won']);
  assert.deepEqual(ripe.filter((p) => p.admitted_at).map((p) => p.id), ['old-won']);
});

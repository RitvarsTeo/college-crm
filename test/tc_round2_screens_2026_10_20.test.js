// ROUND 2, EVERY TRAINING CENTRE SCREEN AT REAL SIZE (20.10.2026): checked on a synthetic copy with production's shape and
// volume (1,497 companies, 1,448 contacts). What it found and what these pin: Show more carries the next 100 only; Next
// contacts says what is empty and where to go; a long log and a long text fold, so a phone reaches the details.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const at = APP.indexOf(name); assert.ok(at >= 0, name); return APP.slice(at, APP.indexOf('\n}\n', at) + 3); };
const line = (start) => { const at = APP.indexOf(start); assert.ok(at >= 0, start); return APP.slice(at, APP.indexOf('\n', at) + 1); };

test('Show more asks for the next page only and adds it; the first read still carries the pages before', async () => {
  const db = await openDb();
  for (let i = 0; i < 250; i++) await tc.addCompany(db, { name: `Example Shipping ${String(i).padStart(3, '0')}`, country: 'Latvia' }, 'T');
  const two = await tc.listCompanies(db, {}, { page: 2, size: 100 });
  assert.equal(two.rows.length, 200, 'without only: the first two pages, as before');
  const only = await tc.listCompanies(db, {}, { page: 3, size: 100, only: true });
  assert.equal(only.rows.length, 50);
  assert.equal(only.rows[0].name, 'Example Shipping 200');
  assert.equal(only.total, 250);
  const more = fn('async function tcMoreCompanies(');
  assert.match(more, /qs\.set\('only', '1'\)/);
  assert.match(more, /T_LIST = \{ \.\.\.next, rows: T_LIST\.rows\.concat\(next\.rows\) \}/);
  assert.match(fn('function tcDrawCompanies('), /onclick="tcMoreCompanies\(\)">Show/);
});

test('Next contacts, empty: a status, and the way to the companies the dates are set on', () => {
  const ctx = { T_NX: { when: '', owner: '' }, esc: (s) => String(s) };
  vm.runInNewContext(fn('function tcNextEmpty(').replace('function tcNextEmpty', 'this.f = function'), ctx);
  const empty = { rows: [] };
  assert.match(ctx.f(empty), /<b>No next contact is planned\.<\/b><a class="kgo" href="#\/tc\/companies">Companies →<\/a>/);
  ctx.T_NX = { when: '', owner: 'me' };
  assert.match(ctx.f(empty), /None of your companies has a next contact\..*tcGo\('pic','me'\).*Your companies →/);
  ctx.T_NX = { when: 'over', owner: '' };
  assert.match(ctx.f({ rows: [{}] }), /Nothing is overdue\./);
  assert.doesNotMatch(fn('function tcDrawNext('), /Nothing here\./);
});

test('the company page: the latest 15 of a long log and Show all; a long text four lines and Show all', () => {
  assert.match(line('const T_LOG_FIRST = '), /= 15;/);
  const draw = fn('function tcDrawCompany(');
  assert.match(draw, /\(T_LOG_ALL \? c\.log : c\.log\.slice\(0, T_LOG_FIRST\)\)\.map\(tcEv\)/);
  assert.match(draw, /Show all \$\{Number\(c\.log\.length\)\}/);
  assert.match(draw, /tcClamp\(c\.infoToSend\)/);
  assert.match(draw, /tcClamp\(c\.notes, 'c-notes'\)/);
  assert.match(fn('async function viewTcCompany('), /T_LOG_ALL = false;/, 'another company opens folded');
  const ctx = { esc: (s) => String(s).replace(/</g, '&lt;') };
  vm.runInNewContext(line('const tcClamp = ').replace('const tcClamp', 'this.f') + APP.slice(APP.indexOf('const tcClamp = '), APP.indexOf('function tcToggle(')).split('\n').slice(1).join('\n'), ctx);
  assert.match(ctx.f('x'.repeat(300)), /c-clamp.*Show all 300 characters/s);
  assert.doesNotMatch(ctx.f('short'), /Show all/);
});

test('Home: the year under way is never compared with a whole year; the list rows keep their columns whatever the tag', () => {
  const home = fn('async function viewTcHome(');
  assert.match(home, /const ys = H\.cards\.delegates\.byYear\.filter\(\(y\) => y\.year < Number\(H\.asOf\.slice\(0, 4\)\)\);/);
  assert.match(home, /<span>Delegates trained<\/span><b>\$\{Number\(H\.cards\.delegates\.total\)\}<\/b><small>all years<\/small>/, 'the total still counts every year');
  assert.match(APP, /html\.ui-c \.p-rows \.c-line\.tc-cline\{grid-template-columns:minmax\(0,1\.4fr\) minmax\(0,1\.3fr\) 130px 150px\}/);
});

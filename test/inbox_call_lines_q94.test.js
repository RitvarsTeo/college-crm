// Q94 (the owner, 14.10.2026): all of the call takers use Intake; Admissions is the main priority and its Inbox has to stay
// clean. Every call carries its menu line (1 Admissions, 2 Student coordination, 3 Other). The Inbox shows a person the
// calls of THEIR line by default (config.phoneMenu handledByEmail); an admin or anybody not listed sees every line; the Line
// filter switches and is remembered per person. Everything that is not a call is shown to everyone. Nothing is hidden from
// the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const HELPERS = APP.slice(APP.indexOf('const cLines = '), APP.indexOf('let C_TP = '));

function env({ user = null, actor = '', stored } = {}) {
  const store = new Map(stored === undefined ? [] : [[stored[0], stored[1]]]);
  const ctx = { CFG, AUTH: { user }, ACTOR: actor, C_IP: {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
  vm.runInNewContext(HELPERS.replace(/^const /gm, 'var ') + '\nthis.lineOf = cLineOf; this.mine = cMyLine; this.now = cLineNow; this.inLine = cInLine; this.key = cLineKey;', ctx);
  delete ctx.C_IP.line;
  return ctx;
}
const call = (id, line) => ({ id, channel: 'phone', calls: [{ line }] });
const ROWS = [call(1, 'Admissions'), call(2, 'Student Coordinator'), call(3, 'Other'), call(4, 'Admissions'),
  { id: 5, channel: 'gmail' }, { id: 6, channel: 'sis' }, { id: 7, channel: 'phone', calls: [] }];
const shown = (E, line) => ROWS.filter((r) => E.inLine(r, line)).map((r) => r.id);

test('config: each line names who answers it, by sign-in email', () => {
  assert.deepEqual(CFG.phoneMenu['1'].handledByEmail, ['ieva.gudaneca@novikontas.org', 'edu@novikontas.org']);
  assert.deepEqual(CFG.phoneMenu['2'].handledByEmail, ['laura.skirmante@novikontas.org']);
  assert.deepEqual(CFG.phoneMenu['3'].handledByEmail, ['arina.danilevska@novikontas.org']);
  assert.deepEqual(['1', '2', '3'].map((k) => CFG.phoneMenu[k].label), ['Admissions', 'Student coordination', 'Other']);
});

test('the default line follows the signed-in email; admins and anybody not listed see every line', () => {
  assert.equal(env({ user: { email: 'Ieva.Gudaneca@novikontas.org', role: 'user' } }).mine(), '1');
  assert.equal(env({ user: { email: 'edu@novikontas.org', role: 'user' } }).mine(), '1');
  assert.equal(env({ user: { email: 'laura.skirmante@novikontas.org', role: 'user' } }).mine(), '2');
  assert.equal(env({ user: { email: 'arina.danilevska@novikontas.org', role: 'user' } }).mine(), '3');
  assert.equal(env({ user: { email: 'ritvars.vilcins@novikontas.org', role: 'admin' } }).mine(), '', 'admin: all');
  assert.equal(env({ user: { email: 'ieva.gudaneca@novikontas.org', role: 'admin' } }).mine(), '', 'an admin role always sees all');
  assert.equal(env({ user: { email: 'tetiana@novikontas.org', role: 'user' } }).mine(), '', 'not listed: all');
  assert.equal(env({ actor: 'Ieva' }).mine(), '1', 'a copy without sign-in: the Acting as name');
  assert.equal(env({ actor: 'Ritvars' }).mine(), '', 'and its admin');
});

test('a line shows its own calls, every non-call item and a call whose line is unknown; All shows everything', () => {
  const E = env();
  assert.deepEqual(shown(E, '1'), [1, 4, 5, 6, 7]);
  assert.deepEqual(shown(E, '2'), [2, 5, 6, 7]);
  assert.deepEqual(shown(E, '3'), [3, 5, 6, 7]);
  assert.deepEqual(shown(E, ''), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(E.lineOf({ channel: 'gmail' }), null, 'not a call');
  assert.equal(E.lineOf(call(9, '1001*Q-COORDINATORS')), '2', 'the queue name works too');
  assert.equal(E.lineOf({ channel: 'phone', calls: [], body: '1001*Q-OTHER' }), '3', 'no call row yet: the queue the adapter wrote');
});

test('the choice is remembered per person and wins over the default', () => {
  const ieva = { email: 'ieva.gudaneca@novikontas.org', role: 'user' };
  assert.equal(env({ user: ieva }).key(), 'intakeLine:ieva.gudaneca@novikontas.org');
  assert.equal(env({ user: ieva, stored: ['intakeLine:ieva.gudaneca@novikontas.org', ''] }).now(), '', 'she chose All');
  assert.equal(env({ user: ieva, stored: ['intakeLine:ieva.gudaneca@novikontas.org', '3'] }).now(), '3');
  assert.equal(env({ user: ieva, stored: ['intakeLine:ieva.gudaneca@novikontas.org', '9'] }).now(), '1', 'a line that does not exist falls back');
});

test('the Inbox, the Line filter, the menu count and Home all read the same line', () => {
  const pool = APP.slice(APP.indexOf('function cInboxPool() {'), APP.indexOf('\n}\n', APP.indexOf('function cInboxPool() {')));
  assert.match(pool, /&& cInLine\(r, C_IP\.line\);/, 'the board');
  assert.match(pool, /cPoolSelect\('Line', C_IP\.line \|\| '', cLines\(\)\.map\(\(\[k, m\]\) => \[k, m\.label \|\| m\.role\]\), 'cInboxLine\(this\.value\)'\)/, 'the filter');
  assert.match(APP, /function cInboxLine\(v\) \{\s*C_IP\.line = v \|\| '';\s*try \{ localStorage\.setItem\(cLineKey\(\), C_IP\.line\); \}/, 'remembered');
  assert.match(APP, /if \(C_IP\.line === undefined\) C_IP\.line = cLineNow\(\);/, 'set when the Inbox opens');
  assert.match(APP, /const inbox = \(i\.rows \|\| \[\]\)\.filter\(\(r\) => cInLine\(r, line\)\);/, 'the menu count');
  assert.match(APP, /inbox: intake && Array\.isArray\(intake\.rows\) \? intake\.rows\.filter\(\(r\) => cInLine\(r, cLineNow\(\)\)\)\.length/, 'Home');
});

test('the Help center says it', () => {
  const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  assert.match(HELP.tour.find((x) => x.title === 'Inbox').body, /Calls show the line you answer \(Admissions, Student coordination or Other\); the Line filter shows another line or all of them, and remembers your choice\./);
});

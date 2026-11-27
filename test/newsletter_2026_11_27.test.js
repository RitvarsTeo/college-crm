// NEWSLETTERS (27.11.2026): the owner's pick "ok, inside Intake". Open only to config newsletterUsers, checked on the
// server; example rows until the N3 data is connected; NO send route anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startWithAreas } from './security_helpers.js';
import { audience, cleanPick, mayOpenNewsletter, exampleRows, FILTERS, DEFAULT_PICK } from '../src/newsletter.js';

const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

test('only the named owner may open it; nobody else, no empty name', () => {
  assert.deepEqual(CONFIG.newsletterUsers, ['Ritvars']);
  assert.equal(mayOpenNewsletter('Ritvars', CONFIG.newsletterUsers), true);
  for (const who of ['', null, undefined, 'Aigars', 'Marina', 'Admissions', 'ritvars']) assert.equal(mayOpenNewsletter(who, CONFIG.newsletterUsers), false, String(who));
  assert.equal(mayOpenNewsletter('Ritvars', undefined), false, 'no list = closed');
});

test('the audience adds up: gets = match - unsubscribed - no email, and the first rows are people who get it', () => {
  const a = audience(DEFAULT_PICK);
  assert.equal(a.example, true);
  assert.equal(a.gets, a.match - a.unsubscribed - a.noEmail);
  assert.ok(a.gets > 0 && a.rows.length <= 5);
  for (const r of a.rows) { assert.ok(['b2b', 'b2c'].includes(r.kind)); assert.equal(r.email, undefined, 'no email address goes to the screen'); }
  const all = audience(DEFAULT_PICK, { first: 1000 });
  assert.equal(all.rows.length, all.gets);
  const none = audience({});
  assert.equal(none.match, exampleRows().length, 'no filters = everybody');
});

test('only known filters and options are used; expires takes one', () => {
  assert.deepEqual(cleanPick({ who: ['b2b', 'x'], course: ['<script>'], expires: ['3', '6'], evil: ['1'] }),
    { who: ['b2b'], course: [], last: [], expires: ['3'], country: [], language: [] });
  for (const k of Object.keys(FILTERS)) assert.ok(audience(DEFAULT_PICK).counts[k]);
});

test('example rows carry made-up names only', () => {
  for (const r of exampleRows()) { assert.match(r.name, /Example|Sample|Demo|Test/); if (r.email) assert.match(r.email, /@example\.com$/); }
});

test('there is no send: no newsletter POST route, no mail call, the send buttons are locked', () => {
  const routes = [...SERVER.matchAll(/p === '(\/api\/[^']*newsletter[^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(routes, ['/api/admin/newsletter/audience']);
  const at = SERVER.indexOf("p === '/api/admin/newsletter/audience'");
  const block = SERVER.slice(at, SERVER.indexOf('\n    }\n', at));
  assert.ok(!/send|gmail|mailchimp|smtp/i.test(block.replace(/no send route|The send is wired last|send is wired last/gi, '')), 'the route never sends');
  const nl = APP.slice(APP.indexOf('function nlSend()'), APP.indexOf('// ======================================================================= TWO HALVES'));
  assert.equal((nl.match(/disabled>/g) || []).length, 2, 'both send buttons are disabled');
  assert.ok(!/api\('\/api\/[^']*send/.test(nl));
});

test('a running copy: every test account is refused, GET and POST', async (t) => {
  const s = await startWithAreas();
  t.after(() => { s.child.kill(); });
  for (const who of ['admin', 'academy', 'tc', 'none']) {
    for (const method of ['GET', 'POST']) {
      const r = await fetch(s.base + '/api/admin/newsletter/audience', { method, headers: { origin: s.base, 'content-type': 'application/json', cookie: s.cookie(who) }, ...(method === 'POST' ? { body: '{}' } : {}) });
      await r.arrayBuffer();
      assert.equal(r.status, 403, `${who} ${method}`);
    }
  }
  const anon = await fetch(s.base + '/api/admin/newsletter/audience', { headers: { accept: 'application/json' }, redirect: 'manual' });
  await anon.arrayBuffer();
  assert.ok([401, 403].includes(anon.status), 'no session: refused at the door, ' + anon.status);
});

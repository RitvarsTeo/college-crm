// The Channels screen, 29.09.2026. One row per channel: a status word, On/Off and
// the last thing that actually arrived. The old screen had seven columns, an
// Endpoint, and a section headed "What the four words mean" - a screen that needs a
// table to explain its own vocabulary has the wrong vocabulary.
//
// Everything a local run cannot show is tested here instead: on this machine no
// secret is set, so every channel reads "Not set up" and no job has ever run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const span = (from, to) => { const i = APP.indexOf(from); assert.ok(i >= 0, from); return APP.slice(i, APP.indexOf(to, i)); };

function sandbox() {
  const ctx = { esc: (s) => String(s ?? ''), fmtDate: (d) => 'AT(' + String(d).slice(0, 10) + ')' };
  vm.runInNewContext([
    span('const CH_WORD = {', 'function chActivity('),
    fn('function chActivity('),
    'this.word = chWord; this.on = chOn; this.activity = chActivity; this.rank = CH_RANK;',
  ].join('\n'), ctx);
  return ctx;
}

const ch = (o) => ({ channel: 'website', direction: 'inbound_webhook', state: 'NOT CONFIGURED', live: false, mode: 'off', ...o });

test('one word per channel, on one axis, and only a provider can earn Receiving', () => {
  const s = sandbox();
  assert.equal(s.word(ch({ state: 'CONNECTED' })).word, 'Receiving');
  assert.equal(s.word(ch({ state: 'CONFIGURED' })).word, 'Ready');
  assert.equal(s.word(ch({ state: 'NOT CONFIGURED' })).word, 'Not set up');
  assert.equal(s.word(ch({ state: 'ERROR' })).word, 'Failed');
  assert.equal(s.word(ch({ direction: 'manual', state: 'CONFIGURED' })).word, 'By hand',
    'a channel somebody types in is never "Ready", there is nothing to make ready');

  // the vocabulary is the whole vocabulary: the explainer table is gone
  assert.doesNotMatch(APP, /What the four words mean/);
  for (const w of s.rank) assert.ok(typeof w === 'string' && w.length, 'every rank entry is a word');
});

test('a run in TEST mode never reads as Receiving, however much it brought in', () => {
  // sync.js stores a test-mode arrival as `simulated` on purpose, so it is not
  // provider evidence. The screen must not quietly promote it.
  const s = sandbox();
  const phoneInTest = ch({ channel: 'phone', direction: 'inbound_poll', state: 'CONFIGURED', live: true, mode: 'test' });
  assert.equal(s.word(phoneInTest).word, 'Ready', 'set up and running, but nothing has proved the provider reached us');
  assert.match(s.on(phoneInTest), /ON/);
  assert.match(s.on(phoneInTest), /ch-test/, 'and the screen says it is only test');
});

test('On, off, test and a manual channel each say what they are', () => {
  const s = sandbox();
  assert.match(s.on(ch({ live: true, mode: 'live' })), /^ON$/, 'live is just ON, with no marker');
  assert.match(s.on(ch({ live: false })), /off/);
  assert.match(s.on(ch({ direction: 'manual' })), /-/, 'a manual channel has nothing to switch');
});

test('last activity is what arrived, never an explanation', () => {
  const s = sandbox();
  const phone = ch({ channel: 'phone', direction: 'inbound_poll' });
  const sis = ch({ channel: 'sis', direction: 'inbound_poll' });

  assert.equal(s.activity(phone, { at: '2026-09-29T05:15:00Z', detail: { kept: 9, inbox: 9 } }),
    '9 calls · 9 to New Leads · AT(2026-09-29)');
  assert.equal(s.activity(sis, { at: '2026-09-29T14:30:00Z', detail: { stored: 6, inbox: 6 } }),
    '6 applicants · 6 to New Leads · AT(2026-09-29)');
  assert.equal(s.activity(phone, { at: '2026-09-29T05:15:00Z', detail: { kept: 1, inbox: 0 } }),
    '1 call · AT(2026-09-29)', 'one call, not "1 calls", and nothing about an empty inbox');

  // a number already in the queue that rang again makes no new row, and saying so
  // is the only way anybody can tell that run apart from a run that did nothing
  assert.equal(s.activity(phone, { at: '2026-09-29T05:15:00Z', detail: { kept: 3, inbox: 1, again: 2 } }),
    '3 calls · 1 to New Leads · 2 rang again · AT(2026-09-29)');

  // no run yet: what a provider sent, else what is still missing
  assert.equal(s.activity(ch({ events: 3, lastEventAt: '2026-09-20T10:00:00Z' }), null),
    '3 messages · AT(2026-09-20)');
  assert.equal(s.activity(ch({ missingSettings: ['A', 'B'] }), null), '2 settings missing');
  assert.equal(s.activity(ch({ missingSettings: ['A'] }), null), '1 setting missing');
  assert.match(s.activity(ch({}), null), /-/);
});

test('the screen shows four columns and no engineering detail', () => {
  const list = span("  const d = await api('/api/admin/channels');", '\nasync function viewChannel(id) {');
  assert.match(list, /<th>Channel<\/th><th>Status<\/th><th>On<\/th><th>Last activity<\/th>/);
  assert.doesNotMatch(APP, /<th>Endpoint<\/th>/, 'an endpoint is a machine detail');
  assert.doesNotMatch(APP, /A pass does NOT prove/, 'the audit prose is not product UI');
  assert.doesNotMatch(APP, /esc\(d\.honesty\)/, 'no honesty sentence above the table');
});

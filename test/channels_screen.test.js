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
    fn('function chWho('),
    fn('function chWaiting('),
    'this.word = chWord; this.on = chOn; this.activity = chActivity; this.rank = CH_RANK;',
    'this.who = chWho; this.waiting = chWaiting;',
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
    '9 calls · 9 to the Inbox · AT(2026-09-29)');
  assert.equal(s.activity(sis, { at: '2026-09-29T14:30:00Z', detail: { stored: 6, inbox: 6 } }),
    '6 applicants · 6 to the Inbox · AT(2026-09-29)');
  assert.equal(s.activity(phone, { at: '2026-09-29T05:15:00Z', detail: { kept: 1, inbox: 0 } }),
    '1 call · AT(2026-09-29)', 'one call, not "1 calls", and nothing about an empty inbox');

  // a number already in the queue that rang again makes no new row, and saying so
  // is the only way anybody can tell that run apart from a run that did nothing
  assert.equal(s.activity(phone, { at: '2026-09-29T05:15:00Z', detail: { kept: 3, inbox: 1, again: 2 } }),
    '3 calls · 1 to the Inbox · 2 rang again · AT(2026-09-29)');

  // no run yet: what a provider sent, else what is still missing
  assert.equal(s.activity(ch({ events: 3, lastEventAt: '2026-09-20T10:00:00Z' }), null),
    '3 messages · AT(2026-09-20)');
  assert.equal(s.activity(ch({ missingSettings: ['A', 'B'] }), null), '2 settings missing');
  assert.equal(s.activity(ch({ missingSettings: ['A'] }), null), '1 setting missing');
  assert.match(s.activity(ch({}), null), /-/);
});

test('the screen shows five columns and no engineering detail', () => {
  const list = span("  const d = await api('/api/admin/channels');", '\nasync function viewChannel(id) {');
  assert.match(list, /<th>Channel<\/th><th>Status<\/th><th>On<\/th><th>Last activity<\/th><th>Waiting on<\/th>/);
  assert.doesNotMatch(APP, /<th>Endpoint<\/th>/, 'an endpoint is a machine detail');
  assert.doesNotMatch(APP, /A pass does NOT prove/, 'the audit prose is not product UI');
  assert.doesNotMatch(APP, /esc\(d\.honesty\)/, 'no honesty sentence above the table');
});

// WAITING ON (01.10.2026). The fifth column is not decoration: before it, an operator
// could see that nine of fourteen channels were not receiving and could not see who
// was holding any one of them. config/channels.json has always named the person and
// the blocker, and src/channeladmin.js has always sent them - only the screen dropped them.
test('a channel that is not receiving says whose turn it is, in the config\u2019s own words', () => {
  const s = sandbox();
  const out = s.who(ch({ ownerPerson: 'Oksana', ownerAction: 'Add the Page token' }));
  assert.match(out, /Oksana/, 'the person is named');
  assert.match(out, /Add the Page token/, 'and the one thing they have to do');
});

test('the blocker outranks the action, because it is what actually stops the channel', () => {
  const s = sandbox();
  const out = s.who(ch({ ownerPerson: 'Marina', ownerAction: 'Connect the mailbox',
    externalBlocker: 'Google has not approved the app' }));
  assert.match(out, /Google has not approved the app/);
  assert.doesNotMatch(out, /Connect the mailbox/, 'one line, and it is the real obstacle');
});

test('a receiving channel is waiting on nobody', () => {
  const s = sandbox();
  const out = s.who(ch({ state: 'CONNECTED', live: true, mode: 'live',
    ownerPerson: 'Oksana', ownerAction: 'Add the Page token' }));
  assert.doesNotMatch(out, /Oksana/, 'a live channel does not keep asking for its setup');
});

test('a blocked channel with nobody named says so, instead of a blank cell', () => {
  const s = sandbox();
  const out = s.who(ch({ ownerAction: 'Somebody has to own this' }));
  assert.match(out, /nobody named/, '"no owner" is the finding, not an empty cell');
});

test('the count above the table is the channels, not a guess', () => {
  const s = sandbox();
  const rows = [
    ch({ channel: 'website', ownerPerson: 'Oksana', ownerAction: 'a' }),
    ch({ channel: 'facebook', ownerPerson: 'Oksana', ownerAction: 'b' }),
    ch({ channel: 'gmail', ownerPerson: 'Marina', ownerAction: 'c' }),
    ch({ channel: 'agent', ownerAction: 'nobody owns this one' }),
    ch({ channel: 'phone', state: 'CONNECTED', live: true, mode: 'live' }),
  ];
  const line = s.waiting(rows);
  assert.match(line, /4 of 5 channels are waiting on somebody/);
  assert.match(line, /Oksana, Marina/, 'each person once, in the order they appear');
  assert.match(line, /1 with nobody named/);
});

test('when nothing is blocked the line is absent, not an empty sentence', () => {
  const s = sandbox();
  assert.equal(s.waiting([ch({ state: 'CONNECTED', live: true, mode: 'live' })]), '');
});

test('a by-hand channel is not a gap, so it is never waiting on anybody', () => {
  // config/channels.json: manual_only = "a person enters it by hand, and that is the
  // design, not a gap". in_person's own action reads "Nothing to do. Already working".
  const s = sandbox();
  const out = s.who(ch({ channel: 'in_person', direction: 'manual', state: 'CONFIGURED',
    ownerAction: 'Nothing to do. Already working' }));
  assert.doesNotMatch(out, /nobody named/, 'a finished channel must not raise an alarm');
  assert.doesNotMatch(out, /Nothing to do/);
});

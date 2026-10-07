// THE COMMENT THREAD ON THE JOURNEY CARD (the review, item 3, open since 29.09.2026).
//
// The card showed ONE comment preview and a truncated notes blob, so reading what was
// actually said meant leaving the board for the person page and losing your place.
//
// No new architecture: the thread is the events the person already has. A comment is a
// note or a call somebody WROTE (kind 'note' or 'call'), which is what openNote() has
// always written through POST /api/people/<id>/note. Status changes, SIS facts and field
// edits are history, not conversation, and stay on the person page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

function sandbox(rows, { all = false } = {}) {
  const ctx = {
    esc: (s) => String(s ?? ''),
    cStamp: (d) => 'AT(' + String(d).slice(0, 10) + ')',
    C_JTALK: new Map([['p1', rows]]),
    C_JTALK_ALL: all,
    // the timeline shows one name for the system, whatever the stored row says
    actorName: (x) => (x === 'CRM' ? 'Intake' : x),
  };
  if (rows === undefined) ctx.C_JTALK = new Map();
  vm.runInNewContext(fn('function cTalkHtml(') + '\nthis.talk = cTalkHtml;', ctx);
  return ctx.talk({ id: 'p1' });
}

const note = (body, over = {}) => ({ kind: 'note', body, occurred_at: '2026-10-01T09:00:00.000Z', actor: 'Admissions', ...over });

test('it shows what people wrote, newest first, with who and when', () => {
  const html = sandbox([note('Called, wants the price'), note('Sent the programme list', { kind: 'call', actor: 'Marketing' })]);
  assert.match(html, /What was said<b>2<\/b>/, 'the count is on the heading');
  assert.match(html, /Called, wants the price/);
  assert.match(html, /Sent the programme list/);
  assert.match(html, /AT\(2026-10-01\) · Admissions/, 'who and when');
  assert.match(html, /· call/, 'a call says it was a call');
});

test('it carries the two ways to add to it, using the route that already exists', () => {
  const html = sandbox([]);
  assert.match(html, /openNote\((?:"|&#34;|&quot;)p1(?:"|&#34;|&quot;),'call'\)/, 'Log a call');
  assert.match(html, /openNote\((?:"|&#34;|&quot;)p1(?:"|&#34;|&quot;),'note'\)/, 'Add a note');
  assert.match(html, /event\.stopPropagation\(\)/, 'and adding one does not also select the card');
});

test('three at a time, with the way to see the rest', () => {
  const five = [1, 2, 3, 4, 5].map((n) => note('comment ' + n));
  const html = sandbox(five);
  assert.equal((html.match(/class="c-talkrow"/g) || []).length, 3, 'three shown');
  assert.match(html, /Show all 5/);
  const opened = sandbox(five, { all: true });
  assert.equal((opened.match(/class="c-talkrow"/g) || []).length, 5, 'all five once asked');
  assert.ok(!opened.includes('Show all'), 'and the button is gone');
});

// A comment is only what a person TYPED. The imported notes blob is not a conversation,
// so an empty thread says it is empty instead of quietly showing the blob as if somebody
// had written it.
test('an empty thread says so, and never falls back to the imported notes', () => {
  const html = sandbox([]);
  assert.match(html, /Nothing written yet/);
  assert.ok(!html.includes('c-talkrow'), 'no invented rows');
});

test('a thread that could not be read says that, and is not confused with an empty one', () => {
  assert.match(sandbox(null), /Could not read the history just now/);
  assert.match(sandbox(undefined), /Reading…/, 'and while it is still coming it says so');
});

// The loop this closed: the board redraws when the answer lands, and a redraw asks again.
test('asking for the thread can never spin: in flight is marked before the await', () => {
  const get = fn('async function cJourneyTalk(');
  const busyAt = get.indexOf('C_JTALK_BUSY.add'), awaitAt = get.indexOf('await api(');
  assert.ok(busyAt > 0 && awaitAt > busyAt, 'marked busy BEFORE the await, not after');
  assert.match(get, /finally \{\s*C_JTALK_BUSY\.delete\(id\);/, 'and always cleared');
  assert.match(get, /catch \{\s*C_JTALK\.set\(id, null\);/, 'a failure is recorded, not retried for ever');

  const draw = fn('function cDrawJourney(');
  assert.match(draw, /if \(C_JTALK\.has\(sel\.id\)\) cDrawJourney\(\);/,
    'and the redraw only happens if the answer actually arrived');
});

test('only conversation is on the card; history stays on the person page', () => {
  assert.match(APP, /const C_JTALK_KINDS = \['note', 'call'\];/);
  const get = fn('async function cJourneyTalk(');
  assert.match(get, /C_JTALK_KINDS\.includes\(e\.kind\)/, 'status changes and SIS facts are not comments');
});

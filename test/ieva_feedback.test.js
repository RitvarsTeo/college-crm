// Ieva, 29.09.2026: (1) "kā var pievienot jaunu leadu?" - Add lead on New Leads, the same form as
// Add person; (2) Next Steps shows the contact details and the notes on each row, "lai es uzreiz
// saprotu, kas bija runāts, un piezvanīt vai uzrakstīt", without opening the profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const view = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i)); };

test('New Leads has Add lead, opening the same add form as People', () => {
  assert.match(view('async function viewLeadsC()'), /<button class="btn" onclick="openAdd\(\)">Add lead<\/button>/);
});

test('every Next Steps row carries the phone and email as call / write links, and one line of what was said', () => {
  const v = view('async function viewTodayC()');
  // 29.09.2026: the links moved out of this view into one shared helper, because People and the
  // person card printed the same contact as dead text and had to get the same behaviour.
  assert.match(APP, /const cTelLink = \(p\) => \(p && p\.phone \? `<a href="tel:/, 'the call link is built once');
  assert.match(APP, /const cMailLink = \(p\) => \(p && p\.email \? `<a href="mailto:/, 'and the write link with it');
  assert.match(APP, /const cReach = \(p\) => \[cTelLink\(p\), cMailLink\(p\)\]/, 'one helper for both');
  assert.match(v, /cReach\(p\)/, 'the Next Steps row uses it');
  assert.match(v, /no email or phone/);
  assert.match(v, /cComment\(p\)/, 'the newest comment, else the imported note');
  assert.match(v, /\$\{reach\(byId\.get\(t\.person_id\)\)\}/, 'on the rows with a step');
  assert.match(v, /\$\{reach\(p\)\}/, 'and on the rows with none');
  assert.match(APP, /onclick="event\.stopPropagation\(\)"/, 'a tap on the number calls, it does not open the profile');
  assert.match(APP, /html\.ui-c \.c-nnote\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
});

test('the same call / write links are on the People row and the Journey person card', () => {
  // 29.09.2026: tel: and mailto: existed in exactly ONE place in the whole app, the Next Steps row.
  // People and the person card printed the same phone and email as dead text, so "piezvanīt vai
  // uzrakstīt" only worked on one of the three screens Ieva actually works in.
  // cDrawPeople, not viewPeopleC: the view only loads the data, the row is drawn here
  const people = view('function cDrawPeople()');
  assert.match(people, /cReach\(p\)/, 'the People row calls or writes without opening the profile');
  assert.match(people, /no contact details/, 'and still says so when there is nothing to call');

  const card = view('function cPersonCard(');
  assert.match(card, /cMailLink\(p\)/, 'the person card writes');
  assert.match(card, /cTelLink\(p\)/, 'and calls');
  assert.match(card, /not recorded/, 'an empty one still reads as not recorded, not as a dead link');

  assert.match(APP, /html\.ui-c \.c-reach a\{color:var\(--petink\);text-decoration:none\}/,
    'one look for every call / write link');
});

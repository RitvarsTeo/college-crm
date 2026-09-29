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
  const v = view('async function viewNextC()');
  assert.ok(v.includes('href="tel:${esc(String(p.phone).replace('), 'the phone is a call link');
  assert.match(v, /href="mailto:\$\{esc\(p\.email\)\}"/);
  assert.match(v, /no email or phone/);
  assert.match(v, /cComment\(p\)/, 'the newest comment, else the imported note');
  assert.match(v, /\$\{reach\(byId\.get\(t\.person_id\)\)\}/, 'on the rows with a step');
  assert.match(v, /\$\{reach\(p\)\}/, 'and on the rows with none');
  assert.match(v, /event\.stopPropagation\(\)/, 'a tap on the number calls, it does not open the profile');
  assert.match(APP, /html\.ui-c \.c-nnote\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
});

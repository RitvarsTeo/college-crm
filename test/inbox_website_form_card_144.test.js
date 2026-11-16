// Patch 144 (16.11.2026), the owner's pick "A, but use bold (not too much though)": a website form card shows the form's
// name bold, then one answer per line with its label semi-bold and the answer plain. This runs the card's own renderer
// (formHtml in cInboxPool) taken out of src/app.html, with the app's own esc().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

const grab = (re, what) => { const m = APP.match(re); assert.ok(m, what + ' is in app.html'); return m[0]; };
const escSrc = grab(/const esc = \(s\) => [^\n]*/, 'esc()');
const fn = grab(/const formHtml = \(r\) => \{[\s\S]*?\n {2}\};/, 'formHtml');
const formHtml = new Function(`${escSrc}\n${fn}\nreturn formHtml;`)();

const TALK = 'Talk to Admissions\nStudent: International student\nCitizenship: Turkey\nContact by: WhatsApp\n'
  + 'Wants to talk about: Visa & residence permit, English requirements\nCan I start in February?';
const VISIT = 'Book a visit\nPreferred time: Weekdays 14:00–18:00\nTour language: Latviešu\nComes with parents or a friend';

test('144: Talk to Admissions - name bold, each label semi-bold, answer plain, the question plain', () => {
  const h = formHtml({ channel: 'website', body: TALK });
  assert.match(h, /^<div class="ib-msg ib-form"><div class="ib-fname">Talk to Admissions<\/div>/);
  assert.match(h, /<div><b>Student:<\/b> International student<\/div>/);
  assert.match(h, /<div><b>Wants to talk about:<\/b> Visa &amp; residence permit, English requirements<\/div>/);
  assert.match(h, /<div>Can I start in February\?<\/div><\/div>$/);
  assert.equal((h.match(/<b>/g) || []).length, 4, 'four labels, no more bold');
});

test('144: Book a visit - a line without a label stays plain', () => {
  const h = formHtml({ channel: 'website', body: VISIT });
  assert.match(h, /<div><b>Preferred time:<\/b> Weekdays 14:00–18:00<\/div><div><b>Tour language:<\/b> Latviešu<\/div><div>Comes with parents or a friend<\/div>/);
});

test('144: Career support - the name alone', () => {
  assert.equal(formHtml({ channel: 'website', body: 'Career support' }),
    '<div class="ib-msg ib-form"><div class="ib-fname">Career support</div></div>');
});

test('144: everything is escaped - a question with HTML, or a fake label, is text', () => {
  const h = formHtml({ channel: 'website', body: 'Book a visit\n<img src=x onerror=alert(1)>\nTour language: <b>x</b>\nNote: hi' });
  assert.ok(!/<img|<b>x/.test(h), 'no raw HTML from the message');
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h, /<b>Tour language:<\/b> &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(h, /<div>Note: hi<\/div>/, 'an unknown "Label:" from the person is not bolded');
});

test('144: only website items with a form name; every other card is drawn as before', () => {
  assert.equal(formHtml({ channel: 'gmail', body: TALK }), '');
  assert.equal(formHtml({ channel: 'website', body: 'When does it start?' }), '', 'the old college form');
  assert.equal(formHtml({ channel: 'website', body: '' }), '');
  assert.match(APP, /r\.bodyClean \? msgHtml\(r\) : formHtml\(r\) \|\| `<div class="ib-msg">/);
});

test('144: the form card is not clamped; name 700, labels 600', () => {
  assert.match(APP, /html\.ui-c #view \.ib-card \.ib-msg\.ib-form\{display:block;-webkit-line-clamp:unset;overflow:visible\}/);
  assert.match(APP, /\.ib-form \.ib-fname\{font-weight:700;color:var\(--ink\)\}/);
  // inline: the card's own rule (.c-jp b{display:block}) would put every label on a line of its own
  assert.match(APP, /\.ib-form b\{display:inline;font-weight:600;color:var\(--t2\)\}/);
});

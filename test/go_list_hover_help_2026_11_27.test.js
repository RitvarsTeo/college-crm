// HOVER HELP (HIS PICK 27.11.2026 "Yes, use them"): on My Grand Opening list each button shows one plain sentence on mouse hover,
// the sentences exactly as he approved them. data-help, never data-tip (data-tip is the charts' own tooltip format "a|b|c").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const TIPS = new Function(APP.match(/const TCML_TIPS = \{[\s\S]*?\n\};/)[0] + '\nreturn TCML_TIPS;')();

test('the sentences are exactly the approved ones', () => {
  assert.deepEqual(TIPS, {
    all: 'Shows every company on your list.',
    todo: 'Shows only the companies you have not decided yet.',
    invite: 'Shows the companies you invite; they get the invitation by email.',
    postcard: 'Shows the companies that also get a printed postcard.',
    no: 'Shows the companies you do not invite.',
    doInvite: 'Invites this company; everyone still on the card gets the invitation by email.',
    doNo: 'This company is not invited.',
    in_person: 'Besides the email invitation, you also hand them a printed postcard yourself.',
    post: 'Besides the email invitation, a printed postcard also goes to them by post.',
    done: 'Closes this company with your choice and opens the next one.',
    person: 'Takes this person out of the invitation; tap again to put them back.',
    passOn: 'Sends this person to a colleague who knows them better.',
    waiver: 'Puts this person on the shared list, where a colleague who knows them can take them.',
    change: 'Opens a finished company again, so you can change your choice.',
    undo: 'Takes back your last change.',
    save: 'Saves now; every change also saves by itself.',
  });
});

test('every list button carries its sentence', () => {
  for (const k of ['person', 'passOn', 'waiver', 'change', 'doInvite', 'doNo', 'done', 'undo', 'save']) assert.ok(APP.includes(`\${tcMlTip('${k}')}`), k);
  assert.ok(APP.includes('class="tcml-fig${T_ML.bump === id ? \' bump\' : \'\'}"${tcMlTip(id)}'), 'the number boxes, by their filter id');
  assert.ok(APP.includes('${TCML_EXTRAS.map(([w, t]) => `<button type="button"${tcMlTip(w)}'), 'Hand over in person / Send by post');
  assert.ok(!APP.includes('onclick="tcMlUndo()" title="Ctrl+Z"'), 'no second, browser tooltip on Undo');
});

test('the popup is data-help, mouse only, escaped, and leaves the charts\' data-tip alone', () => {
  assert.ok(APP.includes('const tcMlTip = (k) => (TCML_TIPS[k] ? ` data-help="${esc(TCML_TIPS[k])}"` : \'\');'));
  assert.match(APP, /@media \(hover:hover\)\{ html\.ui-c #view \[data-help\]\{position:relative\}/);
  assert.match(APP, /html\.ui-c #view \[data-help\]:hover::after\{content:attr\(data-help\)/);
  assert.doesNotMatch(APP, /\[data-tip\]:hover::after/);
});

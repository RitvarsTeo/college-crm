// D-C8 / Q14, 05.10.2026: how Marketing finds and reads the cold ones. Ritvars asked for
// visual A/Bs; until he picks, both screens are what they were. Nothing is sent, exported or campaigned.
//   ?cold=a  Outcomes > Not proceeding > Cold, one card per programme
//   ?cold=b  All people, Stage "Not proceeding · Cold", with why / came from / last contact columns
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('// THE COLD LIST FOR MARKETING (D-C8'), APP.indexOf('async function viewOutcomesC() {'));
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

function load(search = '') {
  const ctx = { CFG: { programmes: ['NAV', 'ENG', 'MT OS', 'MT MR'] }, esc: (s) => String(s), location: { search }, URLSearchParams,
    cReach: (p) => `${p.phone || ''} · ${p.email || ''}`, cChannel: (k) => [k === 'phone' ? 'Phone' : String(k)], fmtDate: (d) => String(d).slice(0, 10) };
  vm.runInNewContext(BLOCK.replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const cold = (id, programme, extra = {}) => ({ id, name: 'P ' + id, programme, phone: '+371 2000000' + id, email: id + '@example.lv',
  closed_reason: 'No response', closed_tag: 'cold', source_channel: 'phone', last_contact_at: '2026-09-20T10:00:00Z', ...extra });

test('the switch: only ?cold=a or ?cold=b; with none both screens are unchanged', () => {
  assert.equal(load('').cColdMode(), '');
  assert.equal(load('?cold=a').cColdMode(), 'a');
  assert.equal(load('?cold=b').cColdMode(), 'b');
  assert.equal(load('?cold=x').cColdMode(), '');
  const out = fnBody('async function viewOutcomesC() {');
  assert.match(out, /C_OUT_TAG === 'cold' && cColdMode\(\) === 'a' \? cColdGroups\(list\) :/, 'A only on Cold, only with ?cold=a');
  assert.match(out, /!\(C_OUT_TAG === 'cold' && cColdMode\(\) === 'a'\) \? cReasonBreakdown/, 'the breakdown stays everywhere else');
  const ppl = fnBody('function cDrawPeople() {');
  assert.match(ppl, /const coldB = cColdMode\(\) === 'b' && C_PF\.stage === 'tag:cold';/);
  assert.match(ppl, /\$\{ps\.map\(coldB \? coldRow : row\)/);
  assert.match(ppl, /<th>Name<\/th><th>Programme<\/th><th>Stage<\/th><th>Next step<\/th><th>When<\/th>/, 'the default columns are still there');
  const go = fnBody('function cGoClosedTag(id) {');
  assert.match(go, /if \(id === 'cold' && cColdMode\(\) === 'b'\)/, 'only Cold, only with ?cold=b, opens All people');
  assert.match(go, /C_OUTCOME = 'Not proceeding'; C_OUT_FILTER = null; C_OUT_TAG = id;/, 'otherwise Outcomes, as before');
});

test('A: one card per programme, in the configured order, unknown and not-said last, each row reachable', () => {
  const html = load('?cold=a').cColdGroups([cold('1', 'MT MR'), cold('2', 'NAV'), cold('3', ''), cold('4', 'MT MR'), cold('5', 'ZZ')]);
  const heads = [...html.matchAll(/<h3>([^<]*)<b>(\d+)<\/b><\/h3>/g)].map((m) => m[1] + ' ' + m[2]);
  assert.deepEqual(heads, ['NAV 1', 'MT MR 2', 'ZZ 1', 'Programme not said 1']);
  assert.equal((html.match(/class="c-sheet c-cold"/g) || []).length, 4, 'each group is a card (the shared cards 3 rule via c-sheet)');
  assert.match(html, /onclick="location\.hash='#\/person\/1'"/);
  assert.match(html, /\+371 20000001 · 1@example\.lv/, 'how to reach them, on the row');
  assert.match(html, /No response/);
  assert.match(html, />Phone</);
  assert.match(html, />2026-09-20</);
  assert.match(load().cColdGroups([]), /Nobody here\./);
  assert.match(load().cColdWhy({}), /reason not recorded/);
});

test('nothing is sent, exported or campaigned from the cold list', () => {
  const code = (BLOCK + fnBody('function cDrawPeople() {')).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /mailto:|openExport|Download|campaign|Send\b|\/api\/[a-z/]*(send|export|mail)/i);
});

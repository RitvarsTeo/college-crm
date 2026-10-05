// D-C8 / Q14, PICKED 05.10.2026 (the owner: "Colds and Rejects to outcomes. Also these statuses are available just in
// the all people tab of course."): Marketing finds the cold and the rejected in Outcomes > Not proceeding > Cold or
// Reject, one card per programme. Nothing is sent, exported or campaigned. People still filters by Stage Cold / Reject.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('// THE COLD AND REJECT LISTS (D-C8'), APP.indexOf('async function viewOutcomesC() {'));
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

function load() {
  const ctx = { CFG: { programmes: ['NAV', 'ENG', 'MT OS', 'MT MR'] }, esc: (s) => String(s),
    cReach: (p) => `${p.phone || ''} · ${p.email || ''}`, cChannel: (k) => [k === 'phone' ? 'Phone' : String(k)], fmtDate: (d) => String(d).slice(0, 10) };
  vm.runInNewContext(BLOCK.replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const cold = (id, programme, extra = {}) => ({ id, name: 'P ' + id, programme, phone: '+371 2000000' + id, email: id + '@example.lv',
  closed_reason: 'No response', closed_tag: 'cold', source_channel: 'phone', last_contact_at: '2026-09-20T10:00:00Z', ...extra });

test('the pick is the default: a tag in Outcomes is grouped by programme; no switch, no B left', () => {
  const out = fnBody('async function viewOutcomesC() {');
  assert.match(out, /\$\{C_OUTCOME !== 'Admitted' && C_OUT_TAG \? cColdGroups\(list\) :/, 'Cold and Reject both');
  assert.match(out, /\$\{C_OUTCOME !== 'Admitted' && !C_OUT_TAG \? cReasonBreakdown\(np, noReason\) : ''\}/, 'the breakdown on Everybody only');
  assert.doesNotMatch(APP, /cColdMode|\?cold=|coldB|coldRow/, 'the A/B switch and option B are gone');
  const go = fnBody('function cGoClosedTag(id) {');
  assert.match(go, /C_OUTCOME = 'Not proceeding'; C_OUT_FILTER = null; C_OUT_TAG = id;/, "Home's Cold / Reject open Outcomes on that tag");
  assert.doesNotMatch(go, /people\/all/);
  assert.match(fnBody('function cPeopleFilters('), /'tag:' \+ t\.id/, 'People still filters by Stage Cold / Reject');
});

test('one card per programme, in the configured order, unknown and not-said last, each row reachable', () => {
  const html = load().cColdGroups([cold('1', 'MT MR'), cold('2', 'NAV'), cold('3', ''), cold('4', 'MT MR'), cold('5', 'ZZ')]);
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

test('nothing is sent, exported or campaigned from the lists', () => {
  const code = BLOCK.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /mailto:|openExport|Download|campaign|Send\b|\/api\/[a-z/]*(send|export|mail)/i);
});

// GO LIST REFINEMENTS (his order 27.11.2026: "we need all the refinements now! only then we can talk about making tour! and then
// sending reminders of any kind"): the directors' Grand Opening list, items 2-10 (item 1, the card that stays until Done, has its
// own test). Read from the page source, the way the other list tests read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(`function ${name}(`); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

test('2: no popup over the list - the Home tour opens only on Home, an open tour is taken off the list, the Academy popup never on a Training Centre page', () => {
  const onHome = new Function('location', APP.match(/const tcOnHome = [^\n]+/)[0] + '\nreturn tcOnHome;');
  assert.equal(onHome({ hash: '#/tc' })(), true);
  assert.equal(onHome({ hash: '#/tc/' })(), true);
  assert.equal(onHome({ hash: '#/tc/mylist' })(), false);
  assert.equal(onHome({ hash: '#/tc/week' })(), false);
  assert.match(fn('tcTourFirst'), /setTimeout\(\(\) => \{ if \(tcOnHome\(\)\) t\.open\(\); \}, 600\)/);
  assert.match(fn('viewTcMyList'), /const tour = document\.getElementById\('helpTour'\); if \(tour\) \{ tour\.remove\(\); document\.querySelectorAll\('\.ht-spot'\)\.forEach\(\(e\) => e\.classList\.remove\('ht-spot'\)\); \}/);
  assert.match(fn('cUpdatePopup'), /if \(force === null && String\(location\.hash \|\| ''\)\.startsWith\('#\/tc'\)\) return;/);
});

test('3: people passed to you count in Still to decide (and All), so a list never reads 0 while they wait', () => {
  const d = fn('tcMlDraw');
  assert.ok(d.includes('const todoN = F.todo + (D.passedToYou || []).length;'));
  assert.ok(d.includes("${fig('all', todoN + F.invite + F.no, 'All')}${fig('todo', todoN, 'Still to decide')}"));
});

test('4: Pass on - nobody pre-ticked, the button waits for a pick; with nobody left it goes at once', () => {
  const p = fn('tcPoPick');
  assert.ok(!p.includes("' checked'"), 'no colleague ticked');
  assert.ok(p.includes('<em class="tcpo-likely">Most likely</em>'), 'the Most likely tag stays, as a hint');
  assert.ok(p.includes(`class="btn sm tcpo-go"\${left.length ? ' disabled' : ''}`));
  assert.ok(p.includes("onchange=\"const b = this.querySelector('.tcpo-go'); if (b) b.disabled = false\""));
  assert.ok(fn('tcPoPass').includes('if (!box && document.querySelector('), 'no send without a pick');
});

test('5: a finished list says it is done', () => {
  assert.ok(fn('tcMlDraw').includes(`\${todoN === 0 && V.groups.length ? '<div class="tcml-finished" role="status"><b>✓ Your list is done.</b> Every company is decided. Nothing more is needed.</div>' : ''}`));
  assert.match(APP, /html\.ui-c \.tcml-finished\{/);
});

test('6: on a phone the figure boxes are one compact row', () => {
  assert.match(APP, /@media \(max-width:700px\)\{ html\.ui-c \.tcml-figs\{flex-wrap:nowrap;gap:4px;margin:0 0 10px\} html\.ui-c \.tcml-fig,html\.ui-c \.tcml-stack\{flex:1 1 0;min-width:0\}/);
});

test('7: on a phone a person moves only by Pass on or Waiver (no Move to box)', () => {
  assert.ok(!APP.includes('<option value="">Move to…</option>'));
  assert.ok(fn('tcMlDraw').includes('tcWvPut(${Number(p.id)})">Waiver</button>'));
});

test('8: Save is a quiet secondary button (everything saves by itself)', () => {
  assert.ok(fn('tcMlDraw').includes(`<button type="button" class="btn ghost"\${tcMlTip('save')} onclick="tcMlSaveNow()">`));
});

test('9: the list has one back line, "← Home", whichever way it was opened', () => {
  assert.ok(fn('cBackLink').includes("if (path.startsWith('#/tc/mylist')) { view.insertAdjacentHTML('afterbegin', `<p class=\"c-back\"><a href=\"#/tc\" title=\"Training Centre Home\">← Home</a></p>`); return; }"));
});

test('10: while a director has a list, Plan opens on it (desktop menu and phone bar)', () => {
  assert.ok(fn('tcGoNav').includes(`if (T_GO_MINE) document.querySelectorAll('.tcnav a[data-c="tc-plan"], .tctabs a[data-t="plan"]').forEach((a) => a.setAttribute('href', '#/tc/mylist'));`));
});

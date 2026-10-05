// THE MENU (the owner, 01.10.2026). Home came back as the first page, so the menu is
// grouped again and the hairline with it: a parent with indented children behind the
// `.cnav .kids` left rule, which is the established INTAKE pattern, not a new one.
//
//   Home        = how admissions is performing   (the visual dashboard)
//   Admissions  > Today   = what needs my attention
//               > Inbox   = what arrived and needs a person
//   People      > Journey, All people
//   Reports     = what is happening
//   Settings    at the foot, for admins
//
// Nothing was redirected. Every old hash still resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const place = (() => {
  const ctx = {};
  vm.runInNewContext(fn('function cPlace(') + '\nthis.place = cPlace;', ctx);
  return ctx.place;
})();

test('the menu is grouped, and the hairline is the established pattern', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  const labels = [...nav.matchAll(/<span>([A-Za-z ]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Home', 'Admissions', 'Inbox', 'Next steps', 'People', 'Journey', 'All people', 'Reports', 'Settings']);   // locked 05.10.2026
  assert.equal((nav.match(/class="kids"/g) || []).length, 2, 'two groups: Admissions and People');
  // the hairline itself, unchanged from the established rule
  assert.match(APP, /html\.ui-c \.cnav \.kids\{margin:1px 0 6px 18px;padding-left:10px;border-left:1px solid var\(--rule\)\}/,
    'the established INTAKE hairline, not a new one');
});

test('every menu item carries its locked icon', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  for (const k of ['C_ICON.home', 'C_ICON.adm', 'C_ICON.ppl', 'C_ICON.rep', 'C_ICON.set']) {
    assert.ok(nav.includes('${' + k + '}'), k + ' is on its menu item');
  }
  // the five locked ones are untouched; Reports is marked provisional where it is defined
  assert.match(APP, /PROVISIONAL, not a locked design-system decision[\s\S]{0,320}rep: '<svg/,
    'the Reports glyph says it is provisional');
});

test('every old hash still resolves, and lands in the right place', () => {
  const expected = {
    '': 'home', home: 'home',
    today: 'today', next: 'today', followup: 'today', admissions: 'today',
    leads: 'leads', inbox: 'leads', car: 'leads',
    people: 'people', person: 'people', journey: 'people', outcomes: 'people',
    reports: 'reports', funnel: 'reports', metrics: 'reports',
    settings: 'settings', help: 'settings', channels: 'settings', feedback: 'settings',
  };
  for (const [page, want] of Object.entries(expected)) {
    assert.equal(place(page), want, `#/${page} lands in ${want}`);
  }
  assert.equal(place('nonsense-somebody-typed'), undefined, 'an unknown hash falls through to Home');
});

test('Home is the metrics page and Today is the work; neither does the other job', () => {
  // Home is viewHomeC, its loader and B, the locked Home (02.10.2026)
  const home = ['async function viewHomeC(', 'async function cHomeData(', 'function cHomeB('].map(fn).join('\n');
  const today = fn('async function viewTodayC(');

  assert.match(home, /\/api\/report\?from=/, 'Home reads the report');
  assert.match(fn('function cHomeB('), /kstrip/, 'B carries the KPI strip as cards');
  assert.ok(!home.includes("sect('Overdue'"), 'Home does not list the work');

  assert.match(today, /<h1>Next steps<\/h1>/);
  for (const section of ['Overdue', 'Due today', 'Coming up', 'No next step']) {
    assert.ok(today.includes(`'${section}'`), section + ' is still a section on Today');
  }
  assert.ok(!today.includes('/api/report'), 'Today does not fetch the report');
  assert.ok(!today.includes('conversionPct'), 'a conversion figure belongs on Home or Reports');
});

// cChartGo is how a chart click opens the people behind the number. Removing Outcomes
// from the MENU must not take the screen away, or that drill-down breaks silently.
test('the Outcomes screen is still reachable, though it is not in the menu', () => {
  assert.match(fn('async function routeC('), /if \(page === 'outcomes'\) return viewOutcomesC\(\);/);
  assert.match(fn('function cChartGo('), /location\.hash = '#\/outcomes'/);
});

test('People is one place with two tabs, and one person has one record', () => {
  const tabs = fn('function cPeopleTabs(');
  assert.match(tabs, /#\/journey/);
  assert.match(tabs, /#\/people\/all/);
  assert.match(fn('function cDrawJourney('), /cPeopleTabs\('journey'\)/);
  assert.match(fn('function cDrawPeople('), /cPeopleTabs\('all'\)/);
});

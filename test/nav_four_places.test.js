// THE MENU IS FOUR PLACES (the owner, 01.10.2026): Today, Inbox, People, Reports, with
// Settings separated at the foot for admins.
//
//   Today   = what needs my attention   (Next Steps folded into it; the KPI Home is gone)
//   Inbox   = what arrived and needs a person to look at it
//   People  = who we are working with, and where they are   (Journey | All people)
//   Reports = what is happening   (promoted: it was only reachable from Outcomes)
//
// Nothing was redirected away. Every old hash still resolves, because people have these
// in bookmarks and in each other's messages.
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

test('the menu is exactly four places, plus Settings at the foot', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  const labels = [...nav.matchAll(/<span>([A-Za-z ]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Today', 'Inbox', 'People', 'Reports', 'Settings']);
  assert.match(nav, /id="cnSettings" class="c-navfoot"/, 'Settings is separated, not one of the four');
  assert.ok(!nav.includes('class="kids"'), 'nothing is nested in the menu any more');
  for (const gone of ['Admissions', 'Next Steps', 'Outcomes', 'Journey', 'Home']) {
    assert.ok(!labels.includes(gone), gone + ' is not a menu item');
  }
});

test('every old hash still resolves, and lands in the right place', () => {
  const expected = {
    '': 'home', home: 'home', today: 'home',
    admissions: 'home', next: 'home', followup: 'home',   // Next Steps folded into Today
    leads: 'leads', inbox: 'leads', car: 'leads',
    people: 'people', person: 'people', journey: 'people', outcomes: 'people',
    reports: 'reports', funnel: 'reports', metrics: 'reports',
    settings: 'settings', help: 'settings', channels: 'settings', feedback: 'settings',
  };
  for (const [page, want] of Object.entries(expected)) {
    assert.equal(place(page), want, `#/${page} lands in ${want}`);
  }
  assert.equal(place('nonsense-somebody-typed'), undefined, 'an unknown hash falls through to Today');
});

test('Today is the work screen and fetches no metrics', () => {
  const today = fn('async function viewTodayC(');
  assert.match(today, /<h1>Today<\/h1>/);
  for (const section of ['Overdue', 'Due today', 'Coming up', 'No next step']) {
    assert.ok(today.includes(`'${section}'`), section + ' is still a section');
  }
  assert.match(today, /c-todaystrip/, 'the counts strip');
  assert.match(today, /waiting in the Inbox/, 'and what is waiting, so neither kind of work is forgotten');
  assert.ok(!today.includes('/api/report'), 'Today does not fetch the report');
  assert.ok(!today.includes('conversionPct'), 'a conversion figure belongs on Reports');
  assert.ok(!APP.includes('async function viewHomeC('), 'the KPI Home is gone, not hidden');
  assert.ok(!APP.includes('function cDonut('), 'and so is its donut: People -> Journey says it better');
});

// cChartGo is how a Reports chart click opens the people behind the number. It goes to
// #/outcomes. Removing Outcomes from the MENU must not take the screen away, or that
// drill-down breaks silently and the closed reasons have nowhere to live.
test('the Outcomes screen is still reachable, though it is not in the menu', () => {
  assert.match(fn('async function routeC('), /if \(page === 'outcomes'\) return viewOutcomesC\(\);/);
  assert.match(APP, /async function viewOutcomesC\(/, 'the screen still exists');
  assert.match(fn('function cChartGo('), /location\.hash = '#\/outcomes'/, 'a chart click still drills into it');
  const out = fn('async function viewOutcomesC(');
  assert.match(out, /<a href="#\/journey">People<\/a>/, 'and it says where it sits, with a way back');
});

test('People is one place with two tabs, and one person has one record', () => {
  const tabs = fn('function cPeopleTabs(');
  assert.match(tabs, /#\/journey/);
  assert.match(tabs, /#\/people\/all/);
  assert.match(fn('function cDrawJourney('), /cPeopleTabs\('journey'\)/);
  assert.match(fn('function cDrawPeople('), /cPeopleTabs\('all'\)/);
  // All people is filtered by nothing: admitted and closed people are in it too
  assert.ok(!fn('function cDrawPeople(').includes('C_TERMINAL.includes(p.status)) return false'),
    'nobody is moved out of the database when their lifecycle state changes');
});

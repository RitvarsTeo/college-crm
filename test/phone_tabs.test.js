// Q16, the owner 05.10.2026: "The Menu is scrollable ..." then "OK, lets do bottom card!" (the phone tab bar).
// On a phone the sideways-scrolling menu row gives way to five fixed tabs - Home, Today, Inbox, People, More -
// and More opens a sheet with the rest. A wide screen keeps the left card, unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const CSS = APP.slice(APP.indexOf('/* THE PHONE TAB BAR (05.10.2026)'), APP.indexOf('/* Settings sections and the Help center */'));

test('five tabs in his order, More last; the sheet holds the rest of the menu', () => {
  const f = fnBody('function installCTabs() {');
  const tabs = [...f.matchAll(/tab\('(#\/[a-z/]+)', '([a-z]+)', C_ICON\.[a-z]+, '([A-Za-z ]+)'/g)].map((m) => m[3] + ' ' + m[1]);
  // Q47 (the owner, 05.10.2026): Home, Inbox, Today, Journey, More
  assert.deepEqual(tabs, ['Home #/home', 'Inbox #/leads', 'Today #/today', 'Journey #/journey']);
  assert.match(f, /data-t="more"[^>]*onclick="cMoreOpen\(\)">\$\{C_ICON\.more\}<span>More<\/span><\/button><\/div>/);
  const rows = [...f.matchAll(/row\('(#\/[a-z/]+)', C_ICON\.[a-z]+, '([A-Za-z ]+)'\)/g)].map((m) => m[2] + ' ' + m[1]);
  assert.deepEqual(rows, ['Reports #/reports', 'Settings #/settings', 'Help #/help']);
  assert.match(f, /<div class="ctabs" role="navigation"/, 'a div: the generic nav rules (sticky, top:0) never reach it');
});

test('the counts are the left card\'s own, copied whenever they change', () => {
  const f = fnBody('function installCTabs() {');
  assert.match(f, /\[\['#cnLeads', '#ctLeads'\], \['#cnNext', '#ctNext'\], \['#cnJourney', '#ctJourney'\]\]/);
  assert.match(f, /const copy = \(\) => \{ b\.innerHTML = a\.innerHTML; b\.className = a\.className; \};/, 'new / total is markup (Q39)');
  assert.match(f, /new MutationObserver\(copy\)\.observe\(a,/);
});

test('which tab is lit: the four with a tab, everything else under More; moving closes the sheet', () => {
  const ctx = {}; vm.runInNewContext(APP.match(/const cTabOf = [^\n]*/)[0].replace('const ', 'var '), ctx);
  for (const [place, tab] of [['home', 'home'], ['leads', 'leads'], ['today', 'today'], ['people', 'people'], ['reports', 'more'], ['settings', 'more'], ['help', 'more']])
    assert.equal(ctx.cTabOf(place), tab, place);
  const mark = fnBody('function markCNav(page) {');
  assert.match(mark, /const t = cTabOf\(place\);/);
  assert.match(mark, /cMoreClose\(\);/);
});

test('only on a phone: hidden on a wide screen, the side row hidden on a phone, Feedback above the bar', () => {
  assert.match(CSS, /^\s*\.ctabs,\.cmore\{display:none\}/m, 'off by default (wide screens)');
  assert.match(CSS, /@media \(max-width:760px\)\{\s*html\.ui-c \.cnav\{display:none\}/);
  assert.match(CSS, /html\.ui-c \.ctabs\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);position:fixed;left:0;right:0;bottom:0;/);
  assert.match(CSS, /env\(safe-area-inset-bottom\)/, 'clear of the phone\'s home bar');
  assert.match(CSS, /min-height:52px/, 'a tap target over 48px');
  assert.match(CSS, /html\.ui-c \.helpbtn\{bottom:calc\(74px/, 'Feedback sits above the bar');
  assert.match(CSS, /html\.ui-c\[data-theme="dark"\] \.ctabs\{background:#08182e;/, 'dark: solid, never see-through');
});

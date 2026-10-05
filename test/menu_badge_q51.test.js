// Q51 (the owner, 05.10.2026, on production): "The count is now one blur. Where is the only new count? new vs all??
// with different size of font?" His Q39 spec: "new / total. New is bigger and with a icon of new, total is little
// bit smaller font. Just like the new bmw m350i sign." And the menu: "I had Home then Admissions (under that inbox,
// today, journey) Then big Reports."
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

test('the badge: NEW mark, the new figure bold, then a smaller / total; nothing new = the total alone, small', () => {
  const ctx = {};
  vm.runInNewContext(APP.match(/const cBadge = [\s\S]*?: ''\);/)[0].replace('const ', 'var '), ctx);
  const both = ctx.cBadge(3, 41);
  assert.match(both, /^<i class="nw" aria-hidden="true">NEW<\/i><b class="nn">3<\/b><small class="nt">/, 'the mark first, then the new figure');
  assert.match(both, /<span aria-hidden="true">\/<\/span>41<\/small>$/, 'then / total');
  assert.match(both, /<span class="c-sr"> new of <\/span>/, 'a screen reader hears "3 new of 41"');
  assert.equal(ctx.cBadge(0, 41), '<small class="nt">41</small>', 'only the total, in the small style');
  assert.equal(ctx.cBadge(0, 0), '');
  // sizes: the new figure larger and bold, the total about 70% and lighter; the signal colour on the mark only
  assert.match(APP, /html\.ui-c \.n \.nn\{font-size:14px;font-weight:800;/);
  assert.match(APP, /html\.ui-c \.n \.nt\{font-size:10px;font-weight:500;line-height:1;opacity:\.78\}/);
  assert.match(APP, /html\.ui-c \.n \.nw\{[^}]*background:#F7C04F;color:#0a2463;/, 'amber is the mark, the words on it navy');
});

test('a browser that never opened a pool sees nothing new: counting starts from the first visit', () => {
  const counts = fnBody('async function cPoolCounts(');
  assert.match(counts, /const after = \(k, at\) => \{ const s = cSeen\(k\); return Boolean\(s && at && at > s\); \};/, 'no visit yet: never new');
  assert.match(counts, /const seenDay = cSeen\('today'\) \? cDay\(cSeen\('today'\)\) : '';/);
  assert.match(counts, /const becameDue = \(x\) => Boolean\(seenDay && cDay\(x\.due_at\) > seenDay\);/, 'a step is new when its due day began after the visit');
  assert.match(fnBody('function cPoolOpened('), /cSeeNow\(k\); cNavCounts\(\);/, 'opening a pool marks it seen');
});

test('the menu: Home, Admissions (Inbox, Today, Journey with their counts), Reports, Settings; Admissions opens the Inbox', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  assert.match(nav, /<a href="#\/admissions" data-c="admissions"[^>]*>\$\{C_ICON\.adm\}<span>Admissions<\/span><\/a>\s*<div class="kids"><a href="#\/leads" data-c="leads"/);
  for (const id of ['cnLeads', 'cnNext', 'cnJourney']) assert.match(nav, new RegExp(`<span class="n" id="${id}"></span>`), id);
  assert.match(APP, /leads: 'leads', inbox: 'leads', car: 'leads', admissions: 'leads',/, '#/admissions opens the Inbox');
  // the phone tab bar stays Home, Inbox, Today, Journey, More
  const tabs = fnBody('function installCTabs() {');
  assert.deepEqual([...tabs.matchAll(/tab\('(#\/[a-z]+)', '[a-z]+', C_ICON\.[a-z]+, '([A-Za-z]+)'/g)].map((m) => m[2]), ['Home', 'Inbox', 'Today', 'Journey']);
});

test('lit: a child lights itself and Admissions; Home, Reports and Settings light alone', () => {
  const ctx = {};
  vm.runInNewContext(fnBody('function cPlace(') + `
    var litFor = (page) => { const place = cPlace(page); ` +
    APP.match(/const parent = \['leads', 'today', 'people'\][^\n]*\n\s*const child = [^\n]*\n\s*const lit = \[parent, child\]\.filter\(Boolean\);/)[0] +
    ` return lit; };`, ctx);
  assert.deepEqual([...ctx.litFor('leads')], ['admissions', 'leads']);
  assert.deepEqual([...ctx.litFor('admissions')], ['admissions', 'leads'], 'Admissions opens its first child, the Inbox, lit with it');
  assert.deepEqual([...ctx.litFor('today')], ['admissions', 'today']);
  assert.deepEqual([...ctx.litFor('journey')], ['admissions', 'people']);
  assert.deepEqual([...ctx.litFor('outcomes')], ['admissions', 'people']);
  assert.deepEqual([...ctx.litFor('home')], ['home']);
  assert.deepEqual([...ctx.litFor('reports')], ['reports']);
  assert.deepEqual([...ctx.litFor('settings')], ['settings']);
});

test('the spine: only Home, Admissions and Reports carry icons, so it runs Home > Admissions > (under the children) > Reports and nowhere else', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  const kids = nav.slice(nav.indexOf('<div class="kids">'), nav.indexOf('</div>', nav.indexOf('<div class="kids">')));
  assert.doesNotMatch(kids, /\$\{C_ICON\./, 'the children carry no icon, so no spine piece starts or stops between them');
  const top = [...nav.replace(kids, '').matchAll(/<a href="(#\/[a-z]+)"[^>]*>\$\{C_ICON\.[a-z]+\}/g)].map((m) => m[1]);
  assert.deepEqual(top, ['#/home', '#/admissions', '#/reports', '#/settings']);
  const spine = fnBody('function cSpine(');
  assert.match(spine, /nav\.querySelectorAll\(':scope > a:not\(\.c-navfoot\) > svg'\)/, 'top-level icons only, Settings off the line');
  assert.match(spine, /for \(let k = 0; k < icons\.length - 1; k\+\+\)/, 'one segment per consecutive pair, nothing more');
});

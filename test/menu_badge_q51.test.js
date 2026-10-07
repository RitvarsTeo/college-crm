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

// Q52 (the owner, 05.10.2026, on patch 14, about "NEW 7 /64"): "Now the item count. Either we drop it or we do it
// properly. Lets drop it for now. And just new to each user count we show."
test('Q52 the badge: the NEW mark and the bold figure only; no total; nothing at all when nothing is new', () => {
  const ctx = {};
  vm.runInNewContext(APP.match(/const cBadge = [^\n]*/)[0].replace('const ', 'var '), ctx);
  assert.equal(ctx.cBadge(3), '<i class="nw" aria-hidden="true">NEW</i><b class="nn">3</b><span class="c-sr"> new</span>');
  assert.equal(ctx.cBadge(3, 41), ctx.cBadge(3), 'a total passed by mistake is never printed');
  assert.equal(ctx.cBadge(0), '', 'nothing new: no badge at all');
  assert.equal(ctx.cBadge(0, 41), '', 'not even the total');
  // no total in the menu or tab-bar markup, nor its style
  assert.doesNotMatch(APP, /class="nt"/);
  assert.doesNotMatch(APP, /\.n \.nt\{/);
  const counts = fnBody('async function cPoolCounts(');
  for (const id of ['cnLeads', 'cnNext', 'cnJourney']) assert.ok(counts.includes(`put('#${id}', cBadge(`), id);
  assert.doesNotMatch(counts, /inbox\.length\)|people\.length\)|dueNow\.length \+ none\.length/, 'no total is computed for the menu');
  assert.doesNotMatch(counts, /classList\.toggle\('warn'/, 'no amber on an empty badge');
  assert.match(APP, /html\.ui-c \.n \.nn\{font-size:14px;font-weight:800;/);
  assert.match(APP, /html\.ui-c \.n \.nw\{[^}]*background:#F7C04F;color:#0a2463;/, 'amber is the mark, the words on it navy');
});

// the seen store run for real, with a localStorage stand-in, the signed-in user and the acting-as user
const seenCtx = () => {
  const store = new Map();
  const ctx = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    AUTH: { on: false, user: null }, ACTOR: 'Admissions', store };
  const src = APP.slice(APP.indexOf('const cSeenWho = '), APP.indexOf('const cBadge = '))
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/^const /gm, 'var ');
  vm.runInNewContext(src, ctx);
  const counts = fnBody('async function cPoolCounts(');
  vm.runInNewContext('var after = ' + counts.match(/const after = (\(k, at\) => \{[^\n]*\};)/)[1], ctx);
  return ctx;
};

test('Q52 per user: the last-seen store is keyed by the signed-in user, else the acting-as user', () => {
  const ctx = seenCtx();
  ctx.AUTH.user = { email: 'Anna@novikontas.org', name: 'Anna' };
  ctx.cSeeNow('leads');
  assert.ok(ctx.store.has('crmSeen:anna@novikontas.org:leads'), 'keyed by the signed-in user');
  ctx.AUTH.user = null; ctx.ACTOR = 'Ieva';
  ctx.cSeeNow('today');
  assert.ok(ctx.store.has('crmSeen:ieva:today'), 'nobody signed in: the acting-as user');
  assert.equal(ctx.cSeen('leads'), '', 'Ieva has not seen what Anna saw');
});

test('Q52 per user: user A visiting does not clear the new of user B', () => {
  const ctx = seenCtx();
  ctx.AUTH.user = { email: 'b@novikontas.org' };
  ctx.store.set('crmSeen:b@novikontas.org:leads', '2026-10-05T08:00:00.000Z');
  ctx.AUTH.user = { email: 'a@novikontas.org' };
  ctx.cSeeNow('leads');                                   // A opens the Inbox now
  ctx.AUTH.user = { email: 'b@novikontas.org' };
  assert.equal(ctx.cSeen('leads'), '2026-10-05T08:00:00.000Z', 'B keeps the moment B last looked');
  assert.equal(ctx.after('leads', '2026-10-05T09:00:00.000Z'), true, 'so what arrived at 09:00 is still new for B');
});

test('Q52 a first visit for a user shows nothing new; the count starts from that visit', () => {
  const ctx = seenCtx();
  ctx.AUTH.user = { email: 'new@novikontas.org' };
  assert.equal(ctx.after('leads', '2026-10-05T09:00:00.000Z'), false, 'never opened: nothing is new');
  assert.equal(ctx.after('today', '2026-10-05T09:00:00.000Z'), false);
  assert.equal(ctx.after('journey', '2026-10-05T09:00:00.000Z'), false);
  const counts = fnBody('async function cPoolCounts(');
  assert.match(counts, /const seenDay = cSeen\('today'\) \? cDay\(cSeen\('today'\)\) : '';/, 'Today: the Q51 rule, now per user');
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
  assert.deepEqual([...tabs.matchAll(/tab\('(#\/[a-z]+)', '[a-z]+', C_ICON\.[a-z]+, '([A-Za-z]+)'/g)].map((m) => m[2]), ['Home', 'Inbox', 'Due', 'Journey']);
});

test('lit: a child lights itself and Admissions; Home, Reports and the Help center light alone', () => {
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
  assert.deepEqual([...ctx.litFor('settings')], ['help'], 'an old #/settings lights the Help center (06.10.2026)');
  assert.deepEqual([...ctx.litFor('channels')], ['help'], 'the admin pages sit under the Help center');
  assert.deepEqual([...ctx.litFor('help')], ['help']);
});

test('the spine: only Home, Admissions and Reports carry icons, so it runs Home > Admissions > (under the children) > Reports and nowhere else', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  const kids = nav.slice(nav.indexOf('<div class="kids">'), nav.indexOf('</div>', nav.indexOf('<div class="kids">')));
  assert.doesNotMatch(kids, /\$\{C_ICON\./, 'the children carry no icon, so no spine piece starts or stops between them');
  const top = [...nav.replace(kids, '').matchAll(/<a href="(#\/[a-z]+)"[^>]*>\$\{C_ICON\.[a-z]+\}/g)].map((m) => m[1]);
  assert.deepEqual(top, ['#/home', '#/admissions', '#/reports', '#/help'], 'the Help center is the foot (Settings left on 06.10.2026)');
  const spine = fnBody('function cSpine(');
  assert.match(spine, /nav\.querySelectorAll\(':scope > a:not\(\.c-navfoot\) > svg'\)/, 'top-level icons only, the foot off the line');
  assert.match(spine, /for \(let k = 0; k < icons\.length - 1; k\+\+\)/, 'one segment per consecutive pair, nothing more');
});

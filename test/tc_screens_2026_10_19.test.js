// TWO HALVES ON SCREEN (19.10.2026, the owner's pick A): the start page with two identical tiles, the door between the
// halves, the Training Centre menu and screens, People and access. The SERVER is the boundary (security_guards (e));
// these check what the screen draws and where each click goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const at = APP.indexOf(name); assert.ok(at >= 0, name); return APP.slice(at, APP.indexOf('\n}\n', at) + 3); };
const line = (start) => { const at = APP.indexOf(start); assert.ok(at >= 0, start); return APP.slice(at, APP.indexOf('\n', at) + 1); };

function door({ areas, hash, on = true }) {
  const seen = { drawn: null, replaced: null, area: null };
  const ctx = {
    AUTH: { on, user: on ? { name: 'T', areas } : null },
    location: { hash, replace: (h) => { seen.replaced = h; } },
    document: { documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [] },
    $: () => null,
    tcInstallNav: () => {}, cDrawNoArea: () => { seen.drawn = 'none'; },
    viewStart: async () => { seen.drawn = 'start'; }, viewAccess: async () => { seen.drawn = 'access'; },
    tcRoute: async (h) => { seen.drawn = 'tc ' + h; },
  };
  vm.runInNewContext([line('const cAreas = '), 'var C_AREA = "";', fn('function cSetArea('), fn('async function cAreaRoute('),
    'this.go = cAreaRoute; this.area = () => C_AREA;'].join('\n').replace(/^const /gm, 'var '), ctx);
  return { ctx, seen, run: async () => { const r = await ctx.go(hash); seen.area = ctx.area(); return r; } };
}

test('the door: one area lands in it, two areas open on the tiles, a half you may not open is never drawn', async () => {
  let d = door({ areas: ['academy', 'tc'], hash: '' });
  assert.equal(await d.run(), true); assert.equal(d.seen.drawn, 'start', 'both halves: the start page first');
  d = door({ areas: ['academy'], hash: '' });
  assert.equal(await d.run(), false, 'Academy only: straight into Academy, no extra click'); assert.equal(d.seen.area, 'academy');
  d = door({ areas: ['tc'], hash: '' });
  await d.run(); assert.equal(d.seen.replaced, '#/tc', 'Training Centre only: straight into it');
  d = door({ areas: ['tc'], hash: '#/start' });
  await d.run(); assert.equal(d.seen.replaced, '#/tc', 'one area has no start page');
  d = door({ areas: ['academy'], hash: '#/tc/companies' });
  await d.run(); assert.equal(d.seen.replaced, '#/home', 'a Training Centre link for an Academy account goes to Academy');
  assert.equal(d.seen.drawn, null);
  d = door({ areas: ['tc'], hash: '#/journey' });
  await d.run(); assert.equal(d.seen.replaced, '#/tc');
  d = door({ areas: [], hash: '#/home' });
  await d.run(); assert.equal(d.seen.drawn, 'none', 'no area: the no-access card');
  d = door({ areas: ['academy', 'tc'], hash: '#/tc/next' });
  await d.run(); assert.equal(d.seen.drawn, 'tc #/tc/next'); assert.equal(d.seen.area, 'tc');
  d = door({ areas: [], hash: '', on: false });
  await d.run(); assert.equal(d.seen.drawn, 'start', 'a laptop copy with sign-in off opens both');
});

test('the router asks the door first, and an account without Academy never asks for Academy\'s settings', () => {
  assert.match(fn('async function route('), /cRouteState\(hash, qs\);[^\n]*\n\s*\/\/[^\n]*\n\s*if \(UI === 'c' && await cAreaRoute\(hash\)\) return;/);
  const shell = fn('async function startShell(');
  assert.ok(shell.indexOf('return startShellTc();') < shell.indexOf("api('/api/config')"));
  const tc = fn('async function startShellTc(');
  assert.doesNotMatch(tc, /api\/config|callPopStart|scope\/years/, 'nothing of Academy');
  assert.match(fn('function installCScope('), /!AUTH\.user\.areas\.includes\('academy'\)\) return;/);
});

test('the start page: two identical tiles, each figure a click to where it is counted, only the halves you open', () => {
  const v = fn('async function viewStart(');
  assert.match(v, /mine\.includes\('academy'\) \? tile\('#\/home', C_ICON\.adm, 'Academy'/);
  assert.match(v, /mine\.includes\('tc'\) \? tile\('#\/tc', T_ICON\.co, 'Training Centre'/);
  for (const [label, href] of [['Due today', '#/due'], ['New in the Inbox', '#/leads'], ['Active leads', '#/journey'],
    ['Due this week', '#/tc/next'], ['Overdue contacts', '#/tc/next'], ['Active clients', '#/tc/clients']]) {
    assert.ok(v.includes(`fig('${label}'`) && v.includes(`'${href}'`), label);
  }
  assert.match(v, /cHomeData\(\)/, 'Academy\'s figures are Home\'s own reads');
  // identical at rest: one tile function, one class, no variant
  assert.equal((v.match(/class="dl-tile"/g) || []).length, 1);
  assert.match(APP, /html\.ui-c \.dl-tile\{display:flex;flex-direction:column;gap:18px;padding:24px 26px 20px;border-radius:16px;background:var\(--surface\);/);
});

test('the Training Centre menu: Home, Companies with Next contacts, Clients and Prospects, the Help center; the logo goes to the tiles', () => {
  const nav = fn('function tcInstallNav(');
  for (const h of ['#/tc"', '#/tc/companies"', '#/tc/next"', '#/tc/clients"', '#/tc/prospects"', '#/tc/help"']) assert.ok(nav.includes(h), h);
  assert.match(nav, /<div class="cnav tcnav"/, 'the Academy menu\'s own look');
  assert.match(nav, /<div class="ctabs tctabs"/, 'and its phone tabs');
  assert.match(fn('function cSetArea('), /brand\.setAttribute\('href', cAreas\(\)\.length > 1 \? '#\/start'/);
  assert.match(APP, /html\.ui-c\[data-area="tc"\] \.shell > nav > \.cnav:not\(\.tcnav\), html\.ui-c:not\(\[data-area="tc"\]\) \.shell > nav > \.tcnav\{display:none!important\}/);
  assert.match(APP, /html\.ui-c\[data-area="tc"\] #cScope/, 'the Year filter is Academy\'s');
});

test('Training Centre Home: Needs you and four figures, every one opening the companies it counts', () => {
  const h = fn('async function viewTcHome(');
  for (const [label, go] of [['Overdue contacts', "tcGoNext('over')"], ['Due this week', "tcGoNext('week')"], ['Information to send', "tcGo('info','yes')"]]) {
    assert.ok(h.includes(`need('${label}'`) && h.includes(go), label);
  }
  for (const [label, go] of [['Active clients', "tcGo('client','yes')"], ['Delegates trained', "tcGo('client','yes')"], ['Prospects', "tcGo('client','no')"], ['Countries', "tcGo('country','*')"]]) {
    assert.match(h, new RegExp(`onclick="${go.replace(/[()*]/g, '\\$&')}"><span>${label}</span>`), label);
  }
  assert.match(h, /<h2>Next contacts<\/h2>/);
});

test('Companies, the company page, Next contacts and People and access are built from Intake\'s own parts', () => {
  const list = fn('function tcDrawCompanies(');
  for (const part of ['cPoolFrame(', 'cPoolBand(', 'cPoolFilters(', 'cPoolSelect(', 'cPoolRows(']) assert.ok(list.includes(part), part);
  for (const f of ["'Area'", "'Country'", "'Person in charge'", "'Client'"]) assert.ok(list.includes(f), f);
  assert.match(list, /placeholder="Search company, city or country"/);
  const page = fn('function tcDrawCompany(');
  for (const part of ['c-pgrid', 'c-pmain', 'c-pside', 'Next communication', 'Log a communication', 'Contacts', 'Courses per year', 'Communications and changes']) {
    assert.ok(page.includes(part), part);
  }
  assert.ok(fn('function tcDrawNext(').includes('cPoolCards('), 'Next contacts is Due\'s card band');
  const access = fn('async function viewAccess(');
  assert.match(access, /if \(!isAdmin\(\)\)/);
  assert.match(access, /api\('\/api\/admin\/access'\)/);
  assert.match(fn('async function cHelpAdmin('), /<a href="#\/access"[^>]*>People and access<\/a>/, 'in the Help center admin pills');
  assert.match(fn('function viewTcHelp('), /isAdmin\(\) \? '<h2 class="c-set-h">For admins<\/h2><div class="c-helpadmin"><a href="#\/access">People and access<\/a>/);
});

test('Help keeps up: the Training Centre answers are one sentence each, and Academy says why there are two tiles', () => {
  const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  assert.ok(HELP.tc.faq.length >= 8);
  for (const f of [...HELP.tc.faq, HELP.faq.find((x) => x.id === 'two-tiles')]) {
    assert.match(f.id, /^[a-z0-9-]+$/);
    assert.doesNotMatch(f.a.replace(/\b(e\.g|i\.e)\./g, ''), /\.\s+\S/, 'one sentence: ' + f.id);
    assert.doesNotMatch(f.q + f.a, /[<>]/);
  }
  const ids = [...HELP.faq, ...HELP.tc.faq].map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique across both halves');
  for (const h of HELP.tc.howto) assert.match(h.href, /^#\/tc(\/|$)/);
});

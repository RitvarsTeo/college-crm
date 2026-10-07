// THE TARGET METERS SAY WHAT THEY ARE (the owner 07.10.2026, "Yes, label them", after "what is this? Has no explanation
// when i hover over" about "86% of 140" and "NAV + ENG 94 · 96% of 98"). Each line names what it counts, its figure,
// the target and the share; the mustard tick at the end of the track is the target and stands before the word "target"
// as its key; the hover names the target and its source (config targets[year]). Home's Admitted card and Reports >
// Admitted say it word for word. These RUN both cards on the same synthetic database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';
import { report } from '../src/reports.js';
import { localDate } from '../src/bizday.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };
const BLOCK = APP.slice(APP.indexOf('// ---------------------------------------------------- FULL REPORT, ONE LEVEL DEEPER (Q35)'),
  APP.indexOf('// apply.novikontas.org, from the SIS'));
const Y = () => Number(localDate().slice(0, 4));
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// every meter on a card: [class, hover, words]
const meters = (html) => [...html.matchAll(/<div class="ktgt (all|off)" title="([^"]*)">([^]*?)<\/div><\/div>/g)].map((m) => [m[1], unesc(m[2]), text(m[3]), m[3]]);

async function data() {
  const db = await openDb(':memory:');
  await seed(db);
  return { db, people: await db.prepare('SELECT * FROM people').all() };
}

// Home: cHomeData + cHomeB, the server's report answering /api/report
function home(r, people, cfg = CFG) {
  const ctx = {
    api: async (url) => {
      if (url.startsWith('/api/report')) return r;
      if (url === '/api/summary') return { noNextAction: 0, overdue: [], today: [] };
      if (url === '/api/intake') return { counts: { new: 0 } };
      throw new Error('unexpected ' + url);
    },
    Promise, Map, Set, Math, Number, String, Array, Intl, Date, URLSearchParams, location: { search: '' }, TZ: 'Europe/Riga', CFG: cfg,
    C_TERMINAL: ['Admitted', 'Not proceeding'], C_MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    cPeopleRows: async () => people, cTodayIso: () => localDate(), cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''),
    cSpark: () => '', cMonthChart: () => '', cBars: () => '', cDonut: () => '', C_REP_COH: {},
  };
  vm.createContext(ctx);
  vm.runInContext([
    line('const esc = '), line('const channelLabel = '), line('const cChannel = '), line('const cFig = '),
    APP.slice(APP.indexOf('const C_SCOPED = '), APP.indexOf('function cScopeHtml(')),
    fn('async function cHomeData('), fn('function cHomeMonths('),
    APP.slice(APP.indexOf("// ---- THE YEAR'S TARGET (D-C6"), APP.indexOf('// ---- B: TODAY FIRST')),
    fn('function cReachedWords('), fn('function cTargetBars('), fn('function cHomeB('),
  ].join('\n') + '\nthis.data = cHomeData; this.B = cHomeB;', ctx);
  return ctx;
}
const homeCard = (html) => html.slice(html.indexOf('<div class="khero">'), html.indexOf('<div><span>Leads</span>'));

// Reports: the model and the Admitted chapter's head
function reports(cfg = CFG) {
  const ctx = {
    CFG: cfg, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: {}, C_PQ: '', C_PEDIT: null, C_PMSG: '', C_PTAB: 'journey',
    C_PF_EMPTY: () => ({}), viewJourneyPool() {}, C_JP: { col: null, view: 'board' }, C_STAGE_OF: new Map(),
    C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_JF_EMPTY: () => ({ stage: [] }), cPoolRouteJourney() {},
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    cDay: (iso) => String(iso || '').slice(0, 10), cStage: (id) => id, cChannel: (c) => [c || 'Not recorded', ''], cSheetNotice: () => '', cTodayIso: () => localDate(),
    cScopeWord: () => String(Y()), cScopeDates: () => [Y() + '-01-01', ''], cScopeList: () => [Y()], cScopeAllYears: () => [Y()], cNowYear: Y,
    C_SCOPE_YEARS: [], C_MONTHS_LONG: MONTHS_LONG,
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), BLOCK, 'this.X = { cRepModel, cRepEcho };'].join('\n'), ctx);
  return ctx;
}

// what the config says, never written here
const T = () => CFG.targets[String(Y())];
const want = (adm, off) => {
  const t = T(), offGoal = Math.round(t.admitted * t.officerPct / 100), progs = t.officerProgrammes.join(' + ');
  return [
    ['all', `Target for ${Y()}: ${t.admitted} admitted. Source: ${t.hover}`, `Admitted ${adm} · target ${t.admitted} · ${Math.round(adm / t.admitted * 100)}%`],
    ['off', `Target for ${Y()}: ${t.officerPct}% of ${t.admitted} = ${offGoal} admitted in the officer programmes, ${progs}. Source: ${t.hover}`,
      `Officer (${progs}) ${off} · target ${offGoal} · ${Math.round(off / offGoal * 100)}%`]];
};

test('the config names the target, its share, its programmes and the hover\'s source', () => {
  const t = T();
  assert.ok(t, 'this year has a target');
  assert.ok(t.admitted > 0 && t.officerPct > 0 && t.officerProgrammes.length);
  assert.match(t.hover, /0\. NJK KPI 2026\.xlsx/, 'the KPI file the 140 and the 70% came from');
  assert.doesNotMatch(fn('function cTargetBars(').replace(/\/\/[^\n]*/g, ''), /\b(140|98|70)\b|NJK|'NAV'|'ENG'/, 'nothing of the target is written in the code');
});

test('Home and Reports say the same words, the same hover and the same key, on one seeded year', async () => {
  const { db, people } = await data();
  const r = await report(db, { years: [Y()] });
  const progs = T().officerProgrammes;
  const adm = people.filter((p) => p.status === 'Admitted' && p.admitted_at && p.admitted_at.slice(0, 4) === String(Y()));
  const off = adm.filter((p) => progs.includes(p.programme));
  assert.ok(adm.length > 0, 'the seed admits somebody this year');

  const H = home(r, people);
  const onHome = meters(homeCard(H.B(await H.data())));
  const R = reports();
  const M = R.X.cRepModel(r, people, CFG, localDate());
  const onReports = meters(R.X.cRepEcho('admitted', M).more);

  const expected = want(adm.length, off.length);
  assert.deepEqual(onHome.map(([c, t, w]) => [c, t, w]), expected, 'Home');
  assert.deepEqual(onReports.map(([c, t, w]) => [c, t, w]), expected, 'Reports, word for word');
  for (const [, , , inner] of [...onHome, ...onReports]) {
    assert.match(inner, /<span class="ktgt-b"><span class="ktgt-sep"> · <\/span><span class="ktgt-key" aria-hidden="true"><\/span>target <strong class="ktgt-goal">/, 'the tick stands before "target"');
    assert.match(inner, /<div class="ktgt-track" aria-hidden="true">[^]*<s><\/s><\/div>/, 'and ends the track');
  }
  // Reports: the figure and the share open exactly their people (every figure is a path to its people)
  const coh = (html, i) => [...html.matchAll(/data-coh="([^"]+)"/g)].map((m) => m[1])[i];
  for (const [k, [, , , inner], rows] of [['all', onReports[0], adm], ['off', onReports[1], off]]) {
    const ids = [...M.coh[coh(inner, 0)].ids].sort();
    assert.equal(ids.join(), rows.map((p) => p.id).sort().join(), k + ': the figure opens its people');
    assert.equal(coh(inner, 1), coh(inner, 0), k + ': the share opens the same people');
  }
  await db.close();
});

test('the words break only between their two halves, at any width; where they fit, one line', () => {
  const css = APP.slice(APP.indexOf("/* THE YEAR'S TARGET on the Admitted card"), APP.indexOf('html.ui-c .kb-top{'));
  assert.match(css, /\.ktgt-n \.ktgt-in\{display:flex;flex-wrap:wrap;[^}]*margin-left:-14px\}/, 'the halves wrap as two pieces');
  assert.match(css, /\.ktgt-n \.ktgt-a,html\.ui-c \.ktgt-n \.ktgt-b\{[^}]*padding-left:14px/, 'each half keeps the gap the dot lives in');
  assert.match(css, /\.ktgt-n\{overflow:hidden\}/, 'a dot at a line start is clipped');
  assert.match(css, /\.ktgt-n \.ktgt-b,html\.ui-c \.ktgt-n \.ktgt-nw\{white-space:nowrap\}/, '"target 98 · 96%" and "(NAV + ENG)" never break inside');
  assert.match(fn('function cTargetBars('), /`Officer <span class="ktgt-nw">\(\$\{esc\(G\.off\.label\)\}\)<\/span>`/);
});

test('the key and the tick are one colour, the target mustard', () => {
  const css = APP.slice(APP.indexOf("/* THE YEAR'S TARGET on the Admitted card"), APP.indexOf('html.ui-c .kb-top{'));
  assert.match(css, /\.ktgt-track s\{[^}]*background:var\(--v-tgt\)/);
  assert.match(css, /\.ktgt-n \.ktgt-key\{[^}]*background:var\(--v-tgt\)/);
  assert.match(css, /--v-tgt:#E0A526/);
});

test('no target, no meter: another year, two years together, a month', async () => {
  const { db, people } = await data();
  const none = { ...CFG, targets: {} };
  const r = await report(db, { years: [Y()] });
  const H = home(r, people, none);
  assert.equal(meters(homeCard(H.B(await H.data()))).length, 0, 'Home: no target in the config for the year');
  const R = reports(none);
  assert.equal(R.X.cRepEcho('admitted', R.X.cRepModel(r, people, none, localDate())).more, '', 'Reports: the same');
  const two = await report(db, { years: [Y() - 1, Y()] });
  const H2 = home(two, people);
  vm.runInContext(`C_SCOPE = { years: [${Y() - 1}, ${Y()}] };`, H2);
  assert.equal(meters(homeCard(H2.B(await H2.data()))).length, 0, 'Home: two years together have no one target');
  const R1 = reports();
  assert.equal(R1.X.cRepEcho('admitted', R1.X.cRepModel(two, people, CFG, localDate())).more, '', 'Reports: the same');
  const R2 = reports();
  const month = await report(db, { from: `${Y()}-01-01`, to: `${Y()}-06-30` });
  assert.equal(R2.X.cRepEcho('admitted', R2.X.cRepModel(month, people, CFG, localDate())).more, '', 'a month is not the year');
  await db.close();
});

test('Help says what the bars are, with no figure that could go stale', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'target-bars');
  assert.ok(q, 'a Help answer for the two bars');
  assert.match(q.a, /tick/);
  assert.match(q.a, /hover/i);
  assert.doesNotMatch(q.a, /\b(140|98|70)\b/, 'the numbers are on the card, from config');
});

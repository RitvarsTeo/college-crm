// REACHED APPLICATION IN THE CONVERSION CARD (the owner picked "B in the card", 07.10.2026, after the industry
// benchmarks were parked). Under "8 / 33 who arrived 60+ days ago" the card says "23 / 33 reached Application": the same
// matured people, the server's steps.leadToApplication. Home and Reports say it word for word (Q35: each tab starts with
// its Home card); each number opens its people; a missing figure draws nothing. These RUN Home's card and the Reports
// tab on the same synthetic database.
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
const text = (html) => html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').trim();
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function data() {
  const db = await openDb(':memory:');
  await seed(db);
  return { db, people: await db.prepare('SELECT * FROM people').all() };
}

// Home: cHomeData + cHomeB, the server's report answering /api/report
function home(r, people) {
  const ctx = {
    api: async (url) => {
      if (url.startsWith('/api/report')) return r;
      if (url === '/api/summary') return { noNextAction: 0, overdue: [], today: [] };
      if (url === '/api/intake') return { counts: { new: 0 } };
      throw new Error('unexpected ' + url);
    },
    Promise, Map, Set, Math, Number, String, Array, Intl, Date, URLSearchParams, location: { search: '' }, TZ: 'Europe/Riga', CFG,
    C_TERMINAL: ['Admitted', 'Not proceeding'], C_MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    cPeopleRows: async () => people, cTodayIso: () => localDate(), cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''),
    cSpark: () => '', cMonthChart: () => '', cBars: () => '', cDonut: () => '', C_REP_COH: {}, opened: null,
  };
  ctx.cGoCohort = (k) => { ctx.opened = ctx.C_REP_COH[k]; };
  vm.createContext(ctx);
  vm.runInContext([
    line('const esc = '), line('const channelLabel = '), line('const cChannel = '), line('const cFig = '),
    APP.slice(APP.indexOf('const C_SCOPED = '), APP.indexOf('function cScopeHtml(')),
    fn('async function cHomeData('), fn('function cHomeMonths('),
    APP.slice(APP.indexOf("// ---- THE YEAR'S TARGET (D-C6"), APP.indexOf('// ---- B: TODAY FIRST')),
    fn('function cReachedWords('), fn('function cHomeB('), fn('function cGoHomeReached('),
  ].join('\n') + '\nthis.data = cHomeData; this.B = cHomeB; this.go = cGoHomeReached; this.setD = (d) => { C_HOME_D = d; }; var C_HOME_D = null;', ctx);
  return ctx;
}
const homeCard = (html) => { const i = html.indexOf('<span>Conversion</span>'); return html.slice(html.indexOf('<small>', i) + 7, html.indexOf('</small>', i)); };

// Reports: the model and the tab card
function reports() {
  const ctx = {
    CFG, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: {}, C_PQ: '', C_PEDIT: null, C_PMSG: '', C_PTAB: 'journey',
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

test('Home and Reports say the same words, from the server figure, in one year, two years and a month', async () => {
  const { db, people } = await data();
  for (const period of [{ years: [Y()] }, { years: [Y() - 1, Y()] }, { from: `${Y()}-01-01`, to: `${Y()}-06-30` }]) {
    const r = await report(db, period);
    const st = r.steps.leadToApplication;
    const R = reports();
    const M = R.X.cRepModel(r, people, CFG, localDate());
    const tab = text(R.X.cRepEcho('conversion', M).small);
    if (!(st.of > 0)) { assert.doesNotMatch(tab, /reached Application/, 'nobody matured: no line'); continue; }
    assert.equal(tab.split('\n')[1], `${st.reached} / ${st.of} reached Application`, 'Reports: the server figure');
    assert.equal(M.coh[M.conversion.reached.won.k].ids.join(), st.reachedIds.join(), 'the 23 opens the people who reached Application');
    assert.equal(M.coh[M.conversion.reached.of.k].ids.join(), st.ofIds.join(), 'the 33 opens the matured people');
    assert.deepEqual([...M.coh[M.conversion.reached.of.k].ids].sort(), [...M.coh[M.conversion.base.k].ids].sort(), 'the same 33 as "8 / 33" above it');
    if (!period.years) continue;   // Home reads the corner's years, never a month
    const H = home(r, people);
    const D = await H.data();
    const card = text(homeCard(H.B(D)));
    assert.equal(card, tab.replace(/^.*?(\d+ \/ \d+ who arrived)/, '$1').replace(/^/, ''), 'Home says what the tab says');
    assert.equal(card, `${r.summary.conversionA} / ${r.summary.conversionB} ${r.summary.conversionWho}\n${st.reached} / ${st.of} reached Application`);
    H.setD(D); H.go('reached');
    assert.equal(H.opened.ids.join(), st.reachedIds.join(), 'Home: the 23 opens exactly them');
    H.go('of');
    assert.equal(H.opened.ids.join(), st.ofIds.join(), 'Home: the 33 opens exactly them');
    assert.match(H.opened.label, /who arrived 60\+ days/);
  }
  await db.close();
});

test('a missing figure draws nothing, on Home and on Reports', async () => {
  const { people } = await data();
  const r = { period: { from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', label: '2026-01-01 to 2026-12-31' },
    summary: { newLeads: 0, conversionPct: null, conversionA: 0, conversionB: 0, conversionWho: 'who arrived 60+ days ago', conversionCutoff: '2026-01-01T00:00:00Z' },
    trend: [], steps: {} };
  const R = reports();
  assert.doesNotMatch(R.X.cRepEcho('conversion', R.X.cRepModel(r, people, CFG, localDate())).small, /reached Application/);
  const H = home(r, people);
  assert.doesNotMatch(homeCard(H.B(await H.data())), /reached Application/);
  const zero = { ...r, steps: { leadToApplication: { of: 0, reached: 0, pct: null, ofIds: [], reachedIds: [] } } };
  const H0 = home(zero, people);
  assert.doesNotMatch(homeCard(H0.B(await H0.data())), /reached Application/, 'nobody matured: no line');
});

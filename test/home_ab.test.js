// HOME IS B, TODAY FIRST (locked by the owner, 02.10.2026: "B for home"). The former A,
// journey first, became the Journey band (test/journey_band.test.js).
//
// These run the real functions from src/app.html against stubbed API answers, so they
// prove what Home DRAWS from a known set of rows - not the text of the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

const STAGES = ['New', 'Contacted', 'Follow-up', 'Application', 'Contract'].map((id) => ({ id, label: id }));
const person = (id, status, extra = {}) => ({ id, status, programme: 'ENG', source_channel: 'phone', ...extra });
const PEOPLE = [
  person('n1', 'New'), person('n2', 'New'),
  person('a1', 'Application'), person('a2', 'Application'), person('a3', 'Application'),
  person('k1', 'Contract'),
  person('d1', 'Admitted', { admitted_at: '2026-09-10T10:00:00Z' }),
  person('d2', 'Admitted', { admitted_at: '2026-08-02T10:00:00Z' }),
  person('x1', 'Not proceeding', { closed_tag: 'cold' }),
  person('x2', 'Not proceeding', { closed_tag: 'cold' }),
  person('x3', 'Not proceeding', { closed_tag: 'reject' }),
  person('x4', 'Not proceeding'),
];
const TREND = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m, k) => ({ month: `2026-${m}`, admitted: m === '09' ? 4 : m === '08' ? 1 : 0, newLeads: k + 1 }));

function harness({ summary = 'ok', intake = 'ok' } = {}) {
  const api = async (url) => {
    if (url.startsWith('/api/report')) return { summary: { newLeads: 55, conversionPct: 19, conversionA: 2, conversionB: 55, medianDaysToAdmission: 38 }, trend: TREND };
    if (url === '/api/summary') {
      if (summary !== 'ok') throw new Error('down');
      return { noNextAction: 3, overdue: [
        { person_id: 'a1', status: 'Application' }, { person_id: 'a1', status: 'Application' },   // one person, two late tasks
        { person_id: 'a2', status: 'Application' }, { person_id: 'k1', status: 'Contract' }],
      today: [{ person_id: 'n1', status: 'New' }] };
    }
    if (url === '/api/intake') { if (intake !== 'ok') throw new Error('down'); return { counts: { new: 6 } }; }
    throw new Error('unexpected ' + url);
  };
  const ctx = {
    api, Promise, Map, Set, Math, Number, String, Array, Intl, Date, URLSearchParams, location: { search: '' },
    TZ: 'Europe/Riga',
    CFG: { stages: [...STAGES, { id: 'Admitted' }, { id: 'Not proceeding' }], programmes: ['ENG'], channels: { phone: 'Phone' },
      closedTags: [{ id: 'cold', label: 'Cold' }, { id: 'reject', label: 'Reject' }] },
    C_TERMINAL: ['Admitted', 'Not proceeding'], C_MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    cPeopleRows: async () => PEOPLE,
    cTodayIso: () => '2026-10-02',
    cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''),
    cSpark: (v, kind) => `<svg class="kspark ${kind}"></svg>`,
    cMonthChart: () => '<svg class="kchart"></svg>',
    cBars: (rows, kind) => `<div class="kbars ${kind}">${rows.length}</div>`,
    cDonut: (rows) => `<div class="kdonut">${rows.map((r) => r[0] + '=' + r[1]).join(',')}</div>`,
  };
  vm.createContext(ctx);
  vm.runInContext([
    line('const esc = '), line('const channelLabel = '), line('const cChannel = '),
    line('const cFig = '),
    fn('async function cHomeData('), fn('function cHomeMonths('),
    // the year's target on the Admitted card (test/home_target.test.js): loaded so cHomeB can call it
    APP.slice(APP.indexOf("// ---- THE YEAR'S TARGET (D-C6"), APP.indexOf('// ---- B: TODAY FIRST')),
    fn('function cHomeB('),
  ].join('\n') + '\nthis.data = cHomeData; this.B = cHomeB;', ctx);
  return ctx;
}

test('the loader counts PEOPLE, not tasks: two late tasks on one person are one overdue', async () => {
  const D = await harness().data();
  assert.equal(D.overdue, 3, 'a1, a2 and k1');
  assert.equal(D.dueToday, 1);
  assert.equal(D.inbox, 6);
  assert.equal(D.admitted.length, 2, 'admitted this year, by their date');
  assert.equal(D.tags, undefined, 'cold / reject are counted in Outcomes only since 05.10.2026 (Q43)');
});

test('a read that fails is null, never a remembered figure, and Home says so', async () => {
  const h = harness({ summary: 'down', intake: 'down' });
  const D = await h.data();
  assert.equal(D.overdue, null); assert.equal(D.noNext, null); assert.equal(D.inbox, null);
  assert.match(h.B(D), /class="kgapn"/, 'B shows a dash for Overdue');
});

test('B: what needs a person comes first, and every figure links to where the people are', async () => {
  const h = harness(); const html = h.B(await h.data());
  assert.ok(html.indexOf('Needs you') < html.indexOf('kb-strip'), 'the work before the performance');
  assert.match(html, /href="#\/today"[^>]*>\s*<span>Overdue<\/span><b>3<\/b>/);
  assert.match(html, /<span>Due today<\/span><b>1<\/b>/);
  assert.match(html, /href="#\/leads"[^>]*>\s*<span>In the Inbox<\/span><b>6<\/b>/);
  assert.match(html, /<span>No next step<\/span><b>3<\/b>/);
  assert.doesNotMatch(html, /The journey now|kday-side/, 'the journey card left Home on 05.10.2026 (Q37)');
  assert.match(html, /kdonut">Open=6,Not proceeding=4/, 'the donut counts the same people: Open and Not proceeding (Q43)');
});

test('B: the comparison is the last COMPLETE month against the one before, with its basis named', async () => {
  const h = harness(); const html = h.B(await h.data());
  // October is in progress on 2 October, so it is Sep against Aug - never Oct against Sep
  assert.match(html, /Sep <b>4<\/b> · vs Aug 1 · \+3/, 'admitted');
  assert.match(html, /Sep <b>9<\/b> · vs Aug 8 · \+1/, 'leads');
  assert.doesNotMatch(html, /Oct <b>/);
});

test('at most TWO scenes on Home (KB 08 P5), and no mark is scaled on arrival', async () => {
  const h = harness(); const html = h.B(await h.data());
  assert.equal((html.match(/\bm-scene\b/g) || []).length, 2, 'two scenes');
  assert.doesNotMatch(html, /\bm-(pop|bar|grow|bump)\b/, 'pop, bar and grow SCALE a mark, which reads as a different value');
  assert.doesNotMatch(fn('function cMonthChart('), /\bm-(pop|bar|grow)\b/, 'the month chart only fades and draws');
  assert.match(APP, /html\.ui-c\.m-on \.m-scene:not\(\.in\) :is\(\.kseg,\.kwall\)\{opacity:0\}/, 'the ring arrives with its scene');
});

// LOCKED 02.10.2026: Home = B only. The review switch and the A code are gone from the
// product, and an old ?home=a link cannot bring A back.
test('Home is B, always: no switch, no A, and ?home= changes nothing', () => {
  const home = fn('async function viewHomeC(');
  assert.match(home, /\$\{cHomeB\(D\)\}/, 'Home draws B');
  assert.doesNotMatch(home, /cHomeA|homeVariant|chab|Journey first|Today first/, 'and nothing else, with no switch');
  assert.doesNotMatch(APP, /function cHomeA\(|function homeVariant\(|function homeSetVariant\(|homevariant/, 'the A code and the remembered choice are gone');
  assert.doesNotMatch(APP, /get\('home'\)/, 'nothing reads ?home= any more');
});

test('a Home stage click lands on the Journey filtered to exactly that stage', () => {
  const ctx = { C_JF: { programme: ['ENG'], stage: [] }, C_PTAB: 'all', location: { hash: '#/home' }, viewJourneyC: () => {}, viewJourneyPool: () => {},
    C_JP: { col: null, view: 'list' }, C_TERMINAL: ['Admitted', 'Not proceeding'], C_PF: { programme: 'NAV' }, C_PCOHORT: { ids: new Set() } };
  vm.runInNewContext(line('const C_JF_EMPTY = ') + line('const C_PF_EMPTY = ') + fn('function cGoStage(') + '\nthis.go = cGoStage;', ctx);
  ctx.go('Application');
  // Q47: the stage is the Journey's column; Q57: on the drag-and-drop Board
  assert.equal(ctx.C_JP.col, 'Application');
  assert.equal(ctx.C_JP.view, 'board');
  assert.equal(ctx.C_PF.programme, '', 'nor does a List filter'); assert.equal(ctx.C_PCOHORT, null, 'nor a Reports cohort');
  assert.equal(JSON.stringify(ctx.C_JF.programme), '[]', 'an earlier programme filter does not hide anybody Home counted');
  assert.equal(ctx.C_PTAB, 'journey');
  assert.equal(ctx.location.hash, '#/journey');
});

// Admissions, 30.09: cold and reject "for statistics", and marketing aimed at the cold ones.
// One owner on Outcomes (agreed through QA, 02.10): the tag on each row, and one split whose
// counts are the filters.
test('Outcomes: Not proceeding splits by cold and reject, each a filter, and an unused tag is not drawn', () => {
  // Q47: on the Journey's Not proceeding column, Cold / Reject is the filter; each tag says its count, an unused one
  // is not offered; every Not proceeding row carries its tag, drawn by one helper
  const view = fn('function cDrawJourneyPool(');
  assert.match(view, /\.filter\(\(\[, , n\]\) => n > 0\)\.map\(\(\[id, label, n\]\) => \[id, `\$\{label\} \$\{n\}`\]\);/, 'counted; nobody tagged, not offered');
  assert.match(view, /if \(isNp && C_OUT_TAG\) list = list\.filter\(\(p\) => p\.closed_tag === C_OUT_TAG\);/);
  assert.match(view, /p\.status === closed \? `\$\{p\.closed_tag \? cTagChip\(p\.closed_tag\) : ''\}/, 'the tag on every Not proceeding row');
  assert.equal((view.match(/cTagChip\(|cTagLabel\(/g) || []).length, 1, 'drawn once per row, by one helper');
});

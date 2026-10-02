// HOME A AND B (02.10.2026). Two alternatives on the same live reads; neither is chosen.
//   A - journey first: arrived -> the five stages -> what happened, one dot per person
//   B - today first: what needs a person now, then performance with its comparison
//
// These run the real functions from src/app.html against stubbed API answers, so they
// prove what each variant DRAWS from a known set of rows - not the text of the code.
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
    api, Promise, Map, Set, Math, Number, String, Array, Intl, Date,
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
    line('const cFig = '), line('const cDots = '),
    fn('async function cHomeData('), fn('function cHomeMonths('), line('const cHomeProg = '), line('const cHomeChan = '),
    fn('function cHomeA('), fn('function cHomeB('),
  ].join('\n') + '\nthis.data = cHomeData; this.A = cHomeA; this.B = cHomeB;', ctx);
  return ctx;
}

test('the loader counts PEOPLE, not tasks: two late tasks on one person are one overdue', async () => {
  const D = await harness().data();
  assert.equal(D.overdue, 3, 'a1, a2 and k1');
  assert.equal(D.overdueIn('Application'), 2);
  assert.equal(D.overdueIn('Contract'), 1);
  assert.equal(D.dueToday, 1);
  assert.equal(D.inbox, 6);
  assert.equal(D.admitted.length, 2, 'admitted this year, by their date');
  assert.deepEqual(D.tags.map((t) => [t[0], t[2]]), [['cold', 2], ['reject', 1]], 'cold and reject counted from closed_tag');
});

test('a read that fails is null, never a remembered figure, and both variants say so', async () => {
  const h = harness({ summary: 'down', intake: 'down' });
  const D = await h.data();
  assert.equal(D.overdue, null); assert.equal(D.noNext, null); assert.equal(D.inbox, null);
  assert.match(h.B(D), /class="kgapn"/, 'B shows a dash for Overdue');
  assert.doesNotMatch(h.A(D), /overdue<\/em>/, 'A prints no overdue count it could not read');
});

test('A: one card per stage, in the configured order, each opening the Journey on that stage', async () => {
  const h = harness(); const html = h.A(await h.data());
  const stages = [...html.matchAll(/data-kgo="stage\|([^|"]+)\|/g)].map((m) => m[1]);
  assert.deepEqual(stages, STAGES.map((s) => s.id));
  assert.match(html, /data-kgo="inbox"/, 'Arrived opens the Inbox');
  assert.match(html, /data-kgo="outcome\|Admitted"/);
  assert.match(html, /data-kgo="outcome\|Not proceeding"/);
});

test('A: one dot per person, and the stage figure is the same count', async () => {
  const h = harness(); const html = h.A(await h.data());
  const cards = html.split('class="kfl kfl-st').slice(1);
  const want = { New: 2, Contacted: 0, 'Follow-up': 0, Application: 3, Contract: 1 };
  cards.forEach((c, k) => {
    const id = STAGES[k].id;
    assert.equal(Number(/<b>(\d+)<\/b>/.exec(c)[1]), want[id], id + ' figure');
    const dots = (/<span class="kdots[^"]*"[^>]*>((?:<i><\/i>)*)<\/span>/.exec(c) || ['', ''])[1];
    assert.equal(dots.length / 7, want[id], id + ' dots');
  });
  assert.match(cards[3], /2 overdue/, 'overdue sits on the stage it belongs to');
});

test('A: each fact once - conversion and the median on the Admitted card, the tags on Not proceeding', async () => {
  const h = harness(); const html = h.A(await h.data());
  const adm = html.slice(html.indexOf('kfl-adm'), html.indexOf('kfl-np'));
  assert.match(adm, /19%<\/b> converted · 2 \/ 55 who arrived/, 'the working, not a percentage under a figure it was not computed from');
  assert.match(adm, /38<\/b> days/);
  assert.equal((html.match(/19%/g) || []).length, 1, 'conversion printed once');
  const np = html.slice(html.indexOf('kfl-np'));
  assert.match(np, /Cold <b>2<\/b>/); assert.match(np, /Reject <b>1<\/b>/);
  assert.doesNotMatch(html, /kdonut/, 'A carries no donut: the band already says where everyone is');
});

test('B: what needs a person comes first, and every figure links to where the people are', async () => {
  const h = harness(); const html = h.B(await h.data());
  assert.ok(html.indexOf('Needs you') < html.indexOf('kb-strip'), 'the work before the performance');
  assert.match(html, /href="#\/today"[^>]*>\s*<span>Overdue<\/span><b data-count>3<\/b>/);
  assert.match(html, /<span>Due today<\/span><b data-count>1<\/b>/);
  assert.match(html, /href="#\/leads"[^>]*>\s*<span>In the Inbox<\/span><b data-count>6<\/b>/);
  assert.match(html, /<span>No next step<\/span><b data-count>3<\/b>/);
  assert.match(html, /cGoStage\('Application'\)/, 'the journey list opens the Journey on a stage');
  assert.match(html, /kdonut">Open=6,Admitted=2,Not proceeding=4/, 'the donut counts the same people');
});

test('B: the comparison is the last COMPLETE month against the one before, with its basis named', async () => {
  const h = harness(); const html = h.B(await h.data());
  // October is in progress on 2 October, so it is Sep against Aug - never Oct against Sep
  assert.match(html, /Sep <b>4<\/b> · vs Aug 1 · \+3/, 'admitted');
  assert.match(html, /Sep <b>9<\/b> · vs Aug 8 · \+1/, 'leads');
  assert.doesNotMatch(html, /Oct <b>/);
});

test('at most TWO scenes per variant (KB 08 P5), and no mark is scaled on arrival', async () => {
  const h = harness(); const D = await h.data();
  for (const [v, html] of [['A', h.A(D)], ['B', h.B(D)]]) {
    assert.equal((html.match(/\bm-scene\b/g) || []).length, 2, v + ' has two scenes');
    assert.doesNotMatch(html, /\bm-(pop|bar|grow|bump)\b/, v + ': pop, bar and grow SCALE a mark, which reads as a different value');
  }
  assert.doesNotMatch(fn('function cMonthChart('), /\bm-(pop|bar|grow)\b/, 'the month chart only fades and draws');
  assert.match(APP, /html\.ui-c\.m-on \.m-scene:not\(\.in\) :is\(\.kseg,\.kwall\)\{opacity:0\}/, 'the ring arrives with its scene');
});

test('the switch: ?home=a|b, remembered, A by default', () => {
  const store = {};
  const ctx = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, URLSearchParams, location: { search: '' } };
  vm.runInNewContext(fn('function homeVariant(') + '\nthis.v = homeVariant;', ctx);
  assert.equal(ctx.v(), 'a');
  ctx.location.search = '?home=b'; assert.equal(ctx.v(), 'b');
  ctx.location.search = ''; assert.equal(ctx.v(), 'b', 'remembered');
  ctx.location.search = '?home=nonsense'; assert.equal(ctx.v(), 'b', 'an unknown value changes nothing');
});

test('the switch works while ?home= is still in the address (found by QA, 02.10)', () => {
  const store = {}; let drawn = 0;
  const loc = { search: '?home=a', href: 'http://x/?home=a#/home' };
  const ctx = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, URLSearchParams, URL,
    location: loc, history: { state: null, replaceState: (st, t, url) => { loc.href = url; loc.search = new URL(url).search; } },
    viewHomeC: () => { drawn += 1; } };
  vm.runInNewContext(fn('function homeVariant(') + fn('function homeSetVariant(') + '\nthis.v = homeVariant; this.set = homeSetVariant;', ctx);
  assert.equal(ctx.v(), 'a');
  ctx.set('b');
  assert.equal(loc.search, '', 'the param is gone');
  assert.equal(ctx.v(), 'b', 'and the click holds on the next render');
  assert.equal(drawn, 1);
});

test('a Home stage click lands on the Journey filtered to exactly that stage', () => {
  const ctx = { C_JF: { programme: ['ENG'], stage: [] }, C_PTAB: 'all', location: { hash: '#/home' }, viewJourneyC: () => {} };
  vm.runInNewContext(line('const C_JF_EMPTY = ') + fn('function cGoStage(') + '\nthis.go = cGoStage;', ctx);
  ctx.go('Application');
  assert.equal(JSON.stringify(ctx.C_JF.stage), '["Application"]');
  assert.equal(JSON.stringify(ctx.C_JF.programme), '[]', 'an earlier programme filter does not hide anybody Home counted');
  assert.equal(ctx.C_PTAB, 'journey');
  assert.equal(ctx.location.hash, '#/journey');
});

// Admissions, 30.09: cold and reject "for statistics", and marketing aimed at the cold ones.
// One owner on Outcomes (agreed through QA, 02.10): the tag on each row, and one split whose
// counts are the filters.
test('Outcomes: Not proceeding splits by cold and reject, each a filter, and an unused tag is not drawn', () => {
  const ctx = { esc: (s) => String(s ?? ''), C_OUT_TAG: null,
    CFG: { closedTags: [{ id: 'cold', label: 'Cold' }, { id: 'reject', label: 'Reject' }] } };
  vm.runInNewContext(fn('function cTagSplit(') + '\nthis.split = cTagSplit;', ctx);
  const np = PEOPLE.filter((p) => p.status === 'Not proceeding');
  const html = ctx.split(np);
  assert.match(html, /Everybody 4/);
  assert.match(html, /onclick="C_OUT_TAG='cold';viewOutcomesC\(\)">Cold 2</);
  assert.match(html, /Reject 1/);
  assert.doesNotMatch(ctx.split(np.filter((p) => p.closed_tag !== 'reject')), /Reject/, 'nobody rejected, no Reject button');
  assert.equal(ctx.split(np.filter((p) => !p.closed_tag)), '', 'nobody tagged, nothing drawn');
  const view = fn('async function viewOutcomesC(');
  assert.match(view, /if \(C_OUTCOME !== 'Admitted' && C_OUT_TAG\) list = list\.filter\(\(p\) => p\.closed_tag === C_OUT_TAG\);/);
  assert.match(view, /C_OUTCOME !== 'Admitted' && p\.closed_tag \? cTagChip\(p\.closed_tag\)/, 'the tag on every Not proceeding row');
  assert.equal((view.match(/cTagChip\(|cTagLabel\(/g) || []).length, 1, 'drawn once per row, by one helper');
});

test('the switch works while ?home= is still in the address (found by QA, 02.10)', () => {
  const store = {}; let drawn = 0;
  const loc = { search: '?home=a', href: 'http://x/?home=a#/home' };
  const ctx = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, URLSearchParams, URL,
    location: loc, history: { state: null, replaceState: (st, t, url) => { loc.href = url; loc.search = new URL(url).search; } },
    viewHomeC: () => { drawn += 1; } };
  vm.runInNewContext(fn('function homeVariant(') + fn('function homeSetVariant(') + '\nthis.v = homeVariant; this.set = homeSetVariant;', ctx);
  assert.equal(ctx.v(), 'a');
  ctx.set('b');
  assert.equal(loc.search, '', 'the param is gone');
  assert.equal(ctx.v(), 'b', 'and the click holds on the next render');
  assert.equal(drawn, 1);
});

test('a Home stage click lands on the Journey filtered to exactly that stage', () => {
  const ctx = { C_JF: { programme: ['ENG'], stage: [] }, C_PTAB: 'all', location: { hash: '#/home' }, viewJourneyC: () => {} };
  vm.runInNewContext(line('const C_JF_EMPTY = ') + fn('function cGoStage(') + '\nthis.go = cGoStage;', ctx);
  ctx.go('Application');
  assert.equal(JSON.stringify(ctx.C_JF.stage), '["Application"]');
  assert.equal(JSON.stringify(ctx.C_JF.programme), '[]', 'an earlier programme filter does not hide anybody Home counted');
  assert.equal(ctx.C_PTAB, 'journey');
  assert.equal(ctx.location.hash, '#/journey');
});


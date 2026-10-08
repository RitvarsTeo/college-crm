// Q67 INBOX vs DUE (the owner's pick "B Due page", 07.10.2026: "in inbox i see today V, then yesterday <, then this
// week <> and then older <<<" and "then again, we have todays work. which is kind of confusing with the inboxes
// today"). The work page is "Due" everywhere (menu card, phone bar, title, Home links, the G shortcut and its list,
// the help); #/today stays an alias so old links and the Back history still land. The Inbox keeps short day words on
// ONE scale: Today / Yesterday / Earlier this week / Older. These RUN the Due page's frame and the Inbox board.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const FOLD = APP.slice(APP.indexOf('const C_UNFOLD = '), APP.indexOf('let C_TP = ')).replace(/^const /gm, 'var ') + '\n';   // the fold helper (08.10.2026), as vars so two boards can share one context
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const HELP = fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8');
const help = JSON.parse(HELP);
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

test('the address: #/due is the page, #/today its alias; the view writes #/due; the start page of the classic shell too', () => {
  const ctx = {};
  vm.runInNewContext(fn('function cPlace(') + '\nthis.cPlace = cPlace;', ctx);
  assert.equal(ctx.cPlace('due'), 'today', 'the page keeps its internal id');
  assert.equal(ctx.cPlace('today'), 'today', 'the old address still lands');
  assert.equal(ctx.cPlace('next'), 'today');
  for (const hash of ['#/due', '#/due?card=over', '#/today', '#/today?up=1']) {
    const c = { location: { hash } };
    vm.runInNewContext(line('const cOnDue = ') + '\nthis.on = cOnDue();', c);
    assert.equal(c.on, true, hash);
  }
  const c2 = { location: { hash: '#/leads' } };
  vm.runInNewContext(line('const cOnDue = ') + '\nthis.on = cOnDue();', c2);
  assert.equal(c2.on, false);
  const v = { C_REP_CH: null };
  vm.runInNewContext(fn('function cViewPath(') + '\nthis.p = cViewPath("today", "#/today");', v);
  assert.equal(v.p, '#/due', 'the address layer (Q61) writes the new name');
  assert.match(APP, /const START = \(\) => \(UI === 'c' \? '#\/home' : '#\/due'\);/);
});

test('RUN the Due page: its title and its band are "Due"; the sections keep their names', () => {
  const task = (id, pid, due) => ({ id, person_id: pid, name: pid, due_at: due, label: 'Call', programme: 'NAV', status: 'Application' });
  const people = [{ id: 'p1', status: 'Application', programme: 'NAV' }, { id: 'p2', status: 'New', programme: 'ENG' }];
  const D = { over: [task(1, 'p1', '2026-09-27T09:00:00Z')], today: [], later: [], none: [people[1]], people, pct: 50, open: people,
    byId: new Map(people.map((p) => [p.id, p])), pTasks: () => '<row>', pRow: () => '<prow>', done: () => '' };
  const frames = [], cards = [];
  const ctx = { C_TPD: D, C_TP: { col: null, programme: '', stage: '', source: '', upOpen: false, more: {}, pick: null }, C_TERMINAL: ['Admitted', 'Not proceeding'],
    CFG: CONFIG, cNotSaid: 'not said', channelLabel: (c) => c, esc: (s) => String(s ?? ''),
    cPoolFrame: (o) => { frames.push(o); return '<frame>'; }, cPoolCards: (name, title, cols) => { cards.push([name, title, cols.map((c) => c.label)]); return '<band>'; },
    cPoolFilters: () => '', cPoolSelect: () => '', cTodayBoard: () => '<board>', $: () => ({ innerHTML: '' }), cTodayWire() {}, cPoolWire() {}, cPoolOpened() {} };
  vm.runInNewContext(fn('function cByPerson(') + '\n' + (FOLD + fn('function cTodayPool(')) + '\ncTodayPool();', ctx);
  assert.equal(frames[0].title, 'Due', 'the page title');
  assert.deepEqual(JSON.parse(JSON.stringify(cards[0])), ['Due', 'Needs you', ['Overdue', 'Due today', 'Coming up', 'No next step']], 'the band is named for the page; its groups as before');
});

test('RUN the Inbox: short day words on one scale - Today, Yesterday, Earlier this week, Older - in the heads and the band', () => {
  class FixedDate extends Date { static now() { return Date.parse('2026-10-07T15:00:00Z'); } }
  const msg = (id, at) => ({ id, contact_name: 'P' + id, channel: 'gmail', received_at: at, body: 'Hello', fields: [], state: 'new', senderKind: 'possible_student' });
  const rows = [msg(1, '2026-10-07T12:00:00Z'), msg(2, '2026-10-06T12:00:00Z'), msg(3, '2026-10-04T12:00:00Z'), msg(4, '2026-09-20T12:00:00Z')];
  const view = { innerHTML: '' }; let band = null;
  const ctx = { Date: FixedDate, C_IP: { col: null, channel: '', kind: '', show: 'new' }, C_LOPEN: null, cTodayIso: () => '2026-10-07', cDay: (iso) => String(iso).slice(0, 10),
    C_IPD: { rows, receipt: '', val: () => '', form: () => '' }, channelLabel: (c) => c, cTelLink: () => '', fmtDateTime: (iso) => iso, cCallLine: (b) => b, esc: (s) => String(s ?? ''),
    cPoolFrame: (o) => o.body, cPoolBand: (name, cols) => { band = cols.map((c) => c.label); return ''; }, cPoolCards: (name, title, cols) => { band = cols.map((c) => c.label); return ''; },
    cPoolSelect: () => '', cPoolFilters: () => '', $: () => view, cPoolWire() {}, cPoolOpened() {} };
  vm.runInNewContext([line('const cPhone = '), line('const C_IP_KIND = '), fn('function cInboxAge(iso) {'), line('const cAgo = '), line('const C_ST = '), line('const C_ST_RAIL = '), fn('function cStateLine('),
    (FOLD + fn('function cInboxPool() {')), 'cInboxPool();'].join('\n'), ctx);
  const heads = [...view.innerHTML.matchAll(/<h3><span class="c-jn">\d<\/span>([^<]+)<b>(\d+)<\/b><\/h3>/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(heads, [['Today', 1], ['Yesterday', 1], ['Earlier this week', 1], ['Older', 1]]);
  assert.deepEqual(JSON.parse(JSON.stringify(band)), ['Today', 'Yesterday', 'Earlier this week', 'Older'], 'the band says the same four');
  assert.doesNotMatch(view.innerHTML, /This week/);
});

test('the page is "Due" everywhere a user reads it: menu card, phone bar, classic shell, the shortcut and its list', () => {
  assert.match(APP, /<a href="#\/due" data-c="today" title="What is due: overdue, due today, coming up"><span>Due<\/span><span class="n" id="cnNext"><\/span><\/a>/, 'the left card');
  assert.match(APP, /\$\{tab\('#\/due', 'today', C_ICON\.next, 'Due', 'ctNext'\)\}/, 'the phone bar');
  assert.match(APP, /<a class="item" href="#\/due" data-icon="today"><span>Due<\/span>/, 'the classic shell');
  assert.match(APP, /title: 'Due',/, 'the page title');
  assert.match(APP, /cPoolCards\('Due', 'Needs you',/, 'the band');
  assert.match(APP, /\['G then D', 'Due'\]/, 'the keyboard list');
  assert.match(APP, /const C_GO = \{ h: '#\/home', i: '#\/leads', d: '#\/due', j: '#\/journey', r: '#\/reports' \};/, 'G then D goes there; no T');
  assert.match(APP, /Going back to Due will reload it\./); assert.match(APP, /Back to Due<\/button>/);
  for (const link of ["cGoToday('cTodayOver')\", '#/due'", "cGoToday('cTodayDue')\", '#/due'", "cGoPeople({ due: 'none' })\", '#/due'"]) assert.ok(APP.includes(link), 'Home: ' + link);
});

test('no user-facing "Today" names the work page any more, in the app or in the help', () => {
  assert.equal(APP.split("'#/today'").length, 1, 'no link to #/today (the alias lives in cPlace and cOnDue only)');
  assert.doesNotMatch(APP, /href="#\/today"/);
  assert.doesNotMatch(APP, /<span>Today<\/span>|'Today', 'ctNext'|title: 'Today'|Back to Today|cPoolCards\('Today'|'G then T'/);
  assert.doesNotMatch(HELP, /#\/today|Today page|"Today"/);
  assert.ok(help.flow.some((m) => m.name === 'Due' && m.href === '#/due'), 'the flow stop');
  assert.ok(help.tour.some((t) => t.title === 'Due' && t.target === '.cnav a[data-c="today"]'), 'the tour step');
  assert.ok(help.howto.filter((h) => h.href === '#/due').every((h) => h.where.startsWith('Due, ')), 'the how-to lines');
  assert.ok(!help.howto.some((h) => /^Today,/.test(h.where)));
  // "Today" that is not the page stays: the Inbox's own column of today's messages, and "Due today"
  assert.match(APP, /\[\['today', 'Today'\], \['yesterday', 'Yesterday'\], \['week', 'Earlier this week'\], \['older', 'Older'\]\]/);
  assert.match(APP, /label: 'Due today'/);
});

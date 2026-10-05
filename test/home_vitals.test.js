// Q19, the owner 05.10.2026: "In HOME, only the most visible CORE, VITALLY NEEDED metrics to go on about the day,
// make it look simple and nice. And under it, have the reports tab, that goes in deeper data." An A/B he has not
// picked: ?home2=a the vitals only, ?home2=b the vitals and Admissions by month. No switch = Home as before.
// HARD RULE: nothing is lost. Every figure that leaves Home is in Reports; the two Reports lacked are added there.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const BLOCK = APP.slice(APP.indexOf("// ---- THE YEAR'S TARGET (D-C6"), APP.indexOf('// ---- B: TODAY FIRST'));
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

function load(search = '') {
  const ctx = { CFG: CONFIG, C_MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    esc: (s) => String(s), cFig: (n) => (n === null ? '—' : n), cTodayIso: () => '2026-10-05', cDay: (d) => String(d || '').slice(0, 10),
    cHomeMonths: () => '<section class="ksec MONTHS"></section>', location: { search }, URLSearchParams };
  vm.runInNewContext(BLOCK.replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const person = (programme, status, at) => ({ programme, status, admitted_at: at });
const D = {
  year: 2026, overdue: 21, dueToday: 2, inbox: 0, noNext: 0,
  admitted: [person('NAV', 'Admitted', '2026-03-10'), person('ENG', 'Admitted', '2026-07-02'), person('MT OS', 'Admitted', '2026-07-20')],
  months: [{ month: '2026-09', newLeads: 15, admitted: 3 }, { month: '2026-10', newLeads: 7, admitted: 1 }],
  stages: [{ id: 'New', label: 'New' }, { id: 'Application', label: 'Application' }],
  open: [{ status: 'New' }, { status: 'Application' }, { status: 'Application' }],
};

test('the switch: only ?home2=a or ?home2=b; with none Home, the menu and Reports are as before', () => {
  assert.equal(load('').cHome2Mode(), '');
  assert.equal(load('?home2=a').cHome2Mode(), 'a');
  assert.equal(load('?home2=b').cHome2Mode(), 'b');
  assert.equal(load('?home2=c').cHome2Mode(), '');
  assert.match(fnBody('async function viewHomeC() {'), /\$\{cHome2Mode\(\) \? cHomeVitals\(D, cHome2Mode\(\)\) : cHomeB\(D\)\}/);
  const nav = fnBody('function installCNav() {');
  assert.match(nav, /if \(cHome2Mode\(\)\) \{ const nav = document\.querySelector\('\.cnav'\); nav\.querySelector\('a\[data-c="home"\]'\)\.after\(nav\.querySelector\('a\[data-c="reports"\]'\)\); \}/,
    'Reports moves right under Home only with the switch; the menu as written is unchanged');
  assert.match(fnBody('async function viewReportsC() {'), /const home2 = cHome2Mode\(\) \? await cPeopleRows\(\) : null;/);
});

test('A: the vitals and nothing else, every figure a click', () => {
  const html = load('?home2=a').cHomeVitals(D, 'a');
  for (const want of ['<h2>Needs you</h2>', '<span>Overdue</span><b>21</b>', '<span>Due today</span><b>2</b>', '<span>In the Inbox</span><b>0</b>',
    '<span>Admitted</span><b>3</b><small>2026</small>', '<span>Leads</span><b>7</b><small>Oct 2026</small>', '<h3>The journey now</h3>']) assert.ok(html.includes(want), want);
  assert.match(html, /of <strong class="ktgt-goal">140</, 'the target, from config');
  assert.match(html, /NAV \+ ENG<\/span> <strong>2<\/strong>/);
  assert.doesNotMatch(html, /Conversion|Median|kdonut|MONTHS|kchart|by programme|came from/i, 'nothing else');
  assert.doesNotMatch(html, /No next step/, 'No next step only when somebody has none');
  assert.match(load().cHomeVitals({ ...D, noNext: 4 }, 'a'), /<span>No next step<\/span><b>4<\/b>/);
  assert.equal((html.match(/\bm-scene\b/g) || []).length, 1);
  // every figure leads somewhere
  assert.equal((html.match(/href="#\/today"/g) || []).length, 2, 'Overdue and Due today -> Next steps');
  assert.match(html, /href="#\/leads"[^>]*><span>In the Inbox/);
  assert.match(html, /onclick="cGoStage\('Application'\);return false"/);
  assert.match(html, /href="#\/outcomes" onclick="C_OUTCOME='Admitted';C_OUT_FILTER=null"><span>Admitted/);
  assert.match(html, /onclick="cGoReport\('year','r-prog'\);return false"/, 'the target -> Reports, This year, By programme');
  assert.match(html, /onclick="cGoReport\('month','r-top'\);return false"><span>Leads/, 'Leads -> Reports, This month');
});

test('B: A plus Admissions by month, two scenes', () => {
  const html = load('?home2=b').cHomeVitals(D, 'b');
  assert.match(html, /<div class="m-scene kb-charts"><section class="ksec MONTHS">/);
  assert.equal((html.match(/\bm-scene\b/g) || []).length, 2, 'KB 08 P5: two per tab');
});

test('nothing is lost: every figure that leaves Home has its place in Reports', () => {
  const rep = fnBody('async function viewReportsC() {');
  for (const want of ['<span>New leads</span>', '<span>Admitted</span>', '<span>Conversion</span>', '<span>Median time to admission</span>',
    '<h2>Twelve months</h2>', '<h2>By programme</h2>', "sect('stage', 'Stage right now'", 'open</span>', 'no next step</span>']) assert.ok(rep.includes(want), want);
  assert.match(rep, /id="r-top"/); assert.match(rep, /id="r-prog"/);
  assert.match(rep, /\$\{home2 \? cReportHome2\(home2, r\.period, bars\) : ''\}/);
  // the two Reports lacked
  const ctx = { CFG: CONFIG };
  vm.runInNewContext(fnBody('function cReportHome2(').replace(/^function /, 'var cReportHome2 = function '), ctx);
  const bars = (key, rows) => `[${key}:${rows.map((r) => r.value + '=' + r.count).join(',')}]`;
  const people = [
    { status: 'Admitted', admitted_at: '2026-03-01T10:00:00.000Z', source_channel: 'phone' },
    { status: 'Admitted', admitted_at: '2026-05-01T10:00:00.000Z', source_channel: 'phone' },
    { status: 'Admitted', admitted_at: '2025-05-01T10:00:00.000Z', source_channel: 'website' },   // before the period
    { status: 'Not proceeding', closed_tag: 'cold' }, { status: 'Not proceeding', closed_tag: 'cold' }, { status: 'Not proceeding', closed_tag: 'reject' },
    { status: 'Not proceeding', closed_tag: null }];
  const out = ctx.cReportHome2(people, { from: '2025-12-31T22:00:00.000Z', to: '2026-12-31T22:00:00.000Z' }, bars);
  assert.match(out, /<h2>Where admitted people came from<\/h2>.*\[source:phone=2\]/s, 'admitted in the period, by channel');
  assert.match(out, /<h2>Cold or reject<\/h2>.*\[tag:Cold=2,Reject=1\]/s, 'the cold / reject split of everybody not proceeding');
});

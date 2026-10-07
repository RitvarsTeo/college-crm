// THE INBOX BOARD (Q62, the owner's pick A from the pictures, 06.10.2026, via MASTER CONTROL): columns by arrival day
// (Today, Yesterday, This week, Older), cards, "Make a lead" with the small form ON the card, a quiet "Set aside";
// the filter row is Source + Kind; no New lead, Not relevant or Later column.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

const TODAY = '2026-10-06';
class FixedDate extends Date { static now() { return Date.parse('2026-10-06T15:00:00Z'); } }
const msg = (id, name, channel, at, body, extra = {}) => ({ id, contact_name: name, channel, received_at: at, body, fields: [], state: 'new', senderKind: 'possible_student', ...extra });
const ROWS = [
  msg(1, 'Kaspars Lapins', 'website', '2026-10-06T05:40:00Z', 'Is there still a place in the marine engineering group?', { fields: [{ field: 'interest', value: 'ENG' }] }),
  msg(2, 'Ilze Vanaga', 'gmail', '2026-10-06T07:15:00Z', 'My son finished 9th grade. Can he apply for navigation?', { answerNow: true }),
  msg(3, 'marta.celmina', 'instagram', '2026-10-05T13:00:00Z', 'How long is the navigation programme?', { aged: true }),
  msg(4, 'Liene Kalna', 'gmail', '2026-10-05T08:20:00Z', 'I am in my group MT OS part time. Could I get a certificate?', { aged: true, senderKind: 'current_student', senderKindWhy: 'writes "my group"' }),
  msg(5, 'Mark Lee', 'website', '2026-10-02T09:10:00Z', 'Is the Engineering programme taught in English?', { aged: true }),
  msg(6, 'Juris Ozolins', 'gmail', '2026-09-28T10:00:00Z', 'Which course gets me to officer?', { aged: true }),
];

function board(ip = {}, { rows = ROWS, open = null, show = 'new' } = {}) {
  const view = { innerHTML: '' };
  const ctx = {
    C_IP: { col: null, channel: '', kind: '', show, ...ip }, C_LOPEN: open,
    C_IPD: { rows, receipt: '', val: (r, f) => ((r.fields || []).find((x) => x.field === f) || {}).value || '', form: (r) => `<form-for-${r.id}>` },
    cTodayIso: () => TODAY, cDay: (iso) => String(iso).slice(0, 10), Date: FixedDate,   // the clock stands at Tue 06.10 15:00Z
    esc: (s) => String(s ?? ''), channelLabel: (c) => ({ gmail: 'Email', website: 'Website', instagram: 'Instagram' })[c] || c,
    cTelLink: () => '', fmtDateTime: (iso) => String(iso).slice(0, 16).replace('T', ' '), cCallLine: (b) => b,
    cPoolFrame: (o) => `<frame title="${o.title}">${o.band}${o.filters}<body>${o.body}</body></frame>`,
    cPoolBand: (name, cols, on, pick) => `<band ${name} on=${on} pick=${pick}>${cols.map((c) => c.id + ':' + c.n + ':' + c.tone).join(',')}</band>`,
    cPoolSelect: (label, value, values) => `<select label="${label}" value="${value}" n=${values.length}>`,
    cPoolFilters: (name, boxes, clear) => `<filters ${name} clear="${clear}">${boxes.join('')}</filters>`,
    $: (q) => (q === '#qInterest' ? { focus() {} } : view), view, cPoolWire: () => {}, cPoolOpened: () => {},
  };
  vm.runInNewContext([line('const C_IP_KIND = '), fnBody('function cInboxAge(iso) {'), line('const cAgo = '), line('const C_ST = '), line('const C_ST_RAIL = '), fnBody('function cStateLine('),
    fnBody('function cInboxPool() {'), 'cInboxPool();'].join('\n'), ctx);
  return ctx;
}

test('four columns by arrival day, in his order, each with its count; the band keeps the same four', () => {
  const html = board().view.innerHTML;
  const heads = [...html.matchAll(/<h3><span class="c-jn">(\d)<\/span>([^<]+)<b>(\d+)<\/b><\/h3>/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(heads, [['1', 'Today', 2], ['2', 'Yesterday', 2], ['3', 'This week', 1], ['4', 'Older', 1]]);
  assert.match(html, /<band Inbox on=null pick=cInboxPick>today:2:age-today,yesterday:2:age-yesterday,week:1:age-week,older:1:age-older<\/band>/);
  assert.match(html, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(html, /New lead|Not relevant|Later/, 'no such columns');
});

test('a card: name, the channel, the message, the programme and kind tags, and the state line: New, Answer now or Late, with how long ago', () => {
  const html = board().view.innerHTML;
  const card = (id) => { const i = html.indexOf(`data-id="${id}"`); return html.slice(i, html.indexOf('data-id=', i + 10) < 0 ? undefined : html.indexOf('data-id=', i + 10)); };
  assert.match(card(1), /<b class="c-reach">Kaspars Lapins<\/b><\/div>/, 'the age moved to the state line (Q66)');
  assert.match(card(1), /<div class="c-st c-st-new" title="2026-10-06 05:40"><span class="c-st-w">New<\/span><span class="c-st-d">· 9 h<\/span><\/div>/);
  assert.match(html, /class="c-jp row ib-card c-rail c-rail-due" data-id="1"/, 'new: the navy rail');
  assert.match(card(1), /<small class="ib-ch"><i><\/i>Website<\/small>/);
  assert.match(card(1), /<div class="ib-msg">Is there still a place in the marine engineering group\?<\/div>/);
  assert.match(card(1), /<span class="ib-prog">ENG<\/span>/);
  assert.match(html, /class="c-jp row ib-card c-rail c-rail-today" data-id="2"/, 'answer now: the amber rail');
  assert.match(card(2), /<div class="c-st c-st-now" title="[^"]+"><span class="c-st-w">Answer now<\/span>/);
  assert.match(html, /class="c-jp row ib-card c-rail c-rail-over" data-id="3"/, 'late: the red rail');
  assert.match(card(3), /<div class="c-st c-st-late" title="[^"]+"><span class="c-st-w">Late<\/span>/);
  assert.doesNotMatch(html, /c-late|c-answer/, 'no chip: the state line says it once');
  assert.match(card(4), /<span class="ib-kind" title="writes &quot;my group&quot;|<span class="ib-kind" title="writes "my group"">Current student<\/span>/);
  assert.match(card(6), /<div class="c-st c-st-late" title="2026-09-28 10:00"><span class="c-st-w">Late<\/span><span class="c-st-d">· 8 d<\/span><\/div>/);
  assert.match(APP, /class="c-jp row ib-card/, 'the Journey board\'s card');
});

test('the action is on the card: "Make a lead" opens the small form, "Set aside" is the quiet link to the reason dialog', () => {
  const closed = board().view.innerHTML;
  assert.match(closed, /<div class="ib-acts"><button class="btn sm" onclick="event\.stopPropagation\(\);C_LOPEN=2;cInboxPool\(\)">Make a lead<\/button><button type="button" class="ib-aside" onclick="event\.stopPropagation\(\);openArchive\(2\)">Set aside<\/button><\/div>/);
  assert.doesNotMatch(closed, /form-for-/, 'no form until a card is opened');
  const open = board({}, { open: 2 }).view.innerHTML;
  assert.match(open, /class="c-jp row ib-card c-rail c-rail-today is-open" data-id="2"/);
  assert.match(open, /<form-for-2>/, 'the form on that card');
  assert.doesNotMatch(open, /form-for-1|form-for-3/, 'and only that card');
  assert.match(open, /data-id="2" tabindex="0" onclick="C_LOPEN=null;cInboxPool\(\)"/, 'a click on the open card closes it');
  // the form itself: the same ids the classic dialog used, so doQualify and the duplicate check run unchanged
  const form = fnBody('async function viewLeadsC() {');
  assert.match(form, /<div class="ib-form" onclick="event\.stopPropagation\(\)"/);
  assert.match(form, /<label for="qInterest">Programme<\/label>\s*<select id="qInterest">/);
  assert.match(form, /<label for="qNext">Next step<\/label>\s*<select id="qNext">/);
  assert.match(form, /<div id="qErr"><\/div>/);
  assert.match(form, /<button class="btn sm" onclick="doQualify\(\$\{Number\(r\.id\)\}\)">Make a lead<\/button><button class="btn sm ghost" onclick="C_LOPEN=null;cInboxPool\(\)">Cancel<\/button>/);
  assert.match(fnBody('async function openArchive(id) {'), /Nothing is deleted\./, 'set aside: the reason dialog, nothing deleted');
  assert.match(APP, /viewInbox = \(\) => viewLeadsC\(\);/, 'after a save the board is drawn again');
  assert.match(fnBody('function cEscClose() {'), /#view \.ib-card\.is-open/, 'Esc closes the open card (Q61)');
});

test('the filter row is Source + Kind, nothing else; a band click narrows to that day; set-aside messages carry no actions', () => {
  const html = board().view.innerHTML;
  assert.match(html, /<filters the inbox clear=""><select label="Source" value="" n=3><select label="Kind" value="" n=3><\/filters>/);
  assert.doesNotMatch(APP, /C_IP_SHOW|<span>Show<\/span>/, 'no Show dropdown');
  const narrowed = board({ col: 'yesterday' }).view.innerHTML;
  assert.equal((narrowed.match(/<h3><span class="c-jn">/g) || []).length, 1, 'one column');
  assert.match(narrowed, /Yesterday<b>2<\/b>/);
  const filtered = board({ channel: 'gmail' }).view.innerHTML;
  assert.deepEqual([...filtered.matchAll(/<h3>[^<]*<span class="c-jn">\d<\/span>([^<]+)<b>(\d+)<\/b>/g)].map((m) => m[2]), ['1', '1', '0', '1']);
  assert.match(filtered, /clear="C_IP\.channel='';C_IP\.kind='';cInboxPool\(\)"/);
  const aside = board({ show: 'archived' }, { show: 'archived' }).view.innerHTML;
  assert.doesNotMatch(aside, /Make a lead|ib-aside/, 'a message set aside keeps its card, without the actions');
  assert.match(aside, /class="c-jp row ib-card c-rail c-rail-none"[\s\S]*<span class="c-st-w">Set aside<\/span>/, 'its state line says so, on the grey rail');
  assert.match(board({}, { rows: [] }).view.innerHTML, /Nothing waiting\. This queue is clear\./);
});

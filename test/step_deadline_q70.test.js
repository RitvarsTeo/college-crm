// Q70, Q71, Q72 (the owner's task list through MASTER CONTROL, 07.10.2026, "keep it stupid simple").
// Q70: every step has default days in config.nextActions, and staff now see them where the step is chosen:
//      "Call and establish interest · 1 day → 08.10".
// Q71: processing an Inbox message, the person can write a note as well as pick the step.
// Q72: wherever a step is chosen, the due date starts at the step's default and can be set to any other day.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

const ctx = { CFG, esc: (s) => String(s ?? ''), Date, Intl, TZ: 'Europe/Riga' };
vm.createContext(ctx);
vm.runInContext([
  'const fmtDate = (s) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s));',
  'const cDay = (iso) => (iso ? String(iso).slice(0, 10) : "");',
  line('const cDdMm = '), line('const cStepIn = '), line('const cStepDue = '),
  fn('function daysForAction('), fn('function stepsForStage('), fn('function nextActionOptions('), fn('function nextActionOptionsWithSuggestion('),
].join('\n') + '\nthis.opts = nextActionOptions; this.sugg = nextActionOptionsWithSuggestion; this.due = cStepDue; this.inn = cStepIn;', ctx);

const ddmm = (days) => { const d = ctx.due && new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000)); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };

test('Q70: every option says its default days and the day it lands on', () => {
  const html = ctx.opts(null);
  const all = CFG.nextActions.flatMap((g) => g.items);
  for (const i of all) {
    const words = i.days ? `${i.days} day${i.days === 1 ? '' : 's'} → ${ddmm(i.days)}` : 'today';   // Call back: 0 days
    assert.ok(html.includes(`>${i.label} · ${words}</option>`), `${i.label}: ${words}`);
  }
  assert.ok(html.includes(`>Call and establish interest · 1 day → ${ddmm(1)}</option>`), 'the owner\'s own example');
  assert.match(html, /<option value="Call and establish interest" data-days="1"/, 'the value stays the bare step, so nothing saved changes');
});

test('Q70: the suggested step says it too', () => {
  const html = ctx.sugg({ label: 'Call and establish interest' });
  assert.match(html, new RegExp(`<optgroup label="Suggested">\\s*<option value="Call and establish interest" selected>Call and establish interest · 1 day → ${ddmm(1).replace('.', '\\.')}</option>`));
});

test('Q72: the date field starts at the step\'s own default', () => {
  const consult = CFG.nextActions.flatMap((g) => g.items).find((i) => i.days > 1);
  assert.equal(ctx.due(consult.label).slice(8, 10), ddmm(consult.days).slice(0, 2));
});

test('Q71 + Q72: the Inbox card has a due date that follows the step, and a note', () => {
  const form = fn('async function viewLeadsC(');
  assert.match(form, /<select id="qNext" onchange="onNextActionChange\('qNext','qDue',''\)">\$\{nextActionOptionsWithSuggestion\(sugg\)\}<\/select><input id="qDue" type="date" value="\$\{cStepDue\(sugg\.label\)\}" aria-label="Due date">/);
  assert.match(form, /<label for="qNote">Note<\/label>\s*<textarea id="qNote" rows="2"><\/textarea>/);
  const q = fn('async function doQualify(');
  assert.match(q, /const due = \(document\.querySelector\('#qDue'\) \|\| \{\}\)\.value \|\| '';/);
  assert.match(q, /\.\.\.\(nextAction && due \? \{ nextActionDue: due \+ 'T09:00:00\.000Z' \} : \{\}\)/, 'the same 09:00 the other date fields save');
  assert.match(q, /const note = \(document\.querySelector\('#qNote'\)/);
});

test('Q72: every other place a step is chosen has a date that follows the step', () => {
  assert.match(APP, /<select id="pe-next" onchange="onNextActionChange\('pe-next','pe-ndue',''\)">/, 'Journey quick edit');
  assert.match(fn('function openComplete('), /onNextActionChange\('cNext', 'cDate', 'cHint'\)/, 'Due and person page "Done"');
  assert.match(fn('function openNewTask('), /onNextActionChange\('tLabel', 'tDate', 'tHint'\);/, '"Choose next step" opens on the default day');
  const change = fn('function onNextActionChange(');
  assert.match(change, /if \(!label\) return;/, '"No next step" leaves the date alone');
  assert.match(change, /const hint = hintId && document\.querySelector/, 'a picker without a hint line');
});

test('Q71 + Q72 on the server: the note is kept and the day staff set is the due day', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'gmail', externalId: 'q72', email: 'liga@gmail.com', name: 'Liga', body: 'navigation?',
    receivedAt: '2026-10-07T08:00:00.000Z', source: 'provider' });
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Ieva', note: 'wants the evening course',
    nextAction: 'Call and establish interest', nextActionDue: '2026-10-12T09:00:00.000Z', stated: { interest: CFG.programmes[0] } });
  assert.ok(q.ok !== false, JSON.stringify(q));
  const pid = (await db.prepare('SELECT id FROM people WHERE email = ?').get('liga@gmail.com')).id;
  const t = await db.prepare('SELECT label, due_at FROM tasks WHERE person_id = ?').get(pid);
  assert.equal(t.label, 'Call and establish interest');
  assert.equal(t.due_at, '2026-10-12T09:00:00.000Z', 'their day, not the 1-day default');
  const ev = await db.prepare("SELECT body FROM events WHERE person_id = ? AND kind = 'note'").all(pid);
  assert.ok(ev.some((e) => e.body === 'wants the evening course'), 'the note is on the record');
});

test('Q72 on the server: no day or a broken one = the step\'s default', async () => {
  const db = await openDb(':memory:');
  for (const [i, bad] of [[1, undefined], [2, 'not a date']]) {
    const r = await receive(db, { channel: 'gmail', externalId: 'q72b' + i, email: `x${i}@gmail.com`, name: 'X' + i, body: 'hi',
      receivedAt: '2026-10-07T08:00:00.000Z', source: 'provider' });
    await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'Call and establish interest', nextActionDue: bad, stated: { interest: CFG.programmes[0] } });
    const pid = (await db.prepare('SELECT id FROM people WHERE email = ?').get(`x${i}@gmail.com`)).id;
    const t = await db.prepare('SELECT due_at FROM tasks WHERE person_id = ?').get(pid);
    const days = (Date.parse(t.due_at) - Date.now()) / 86400000;
    assert.ok(days > 0.9 && days < 1.1, `${String(bad)}: one day out, got ${days.toFixed(2)}`);
  }
});

test('the Help center answers it in the same commit', () => {
  const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = HELP.faq.find((x) => x.id === 'step-due');
  assert.equal(q.q, 'When is a next step due?');
  assert.match(q.a, /Call and establish interest · 1 day → /);
  assert.match(q.a, /pick another day/);
  assert.match(q.a, /In the Inbox you can add a note too\./);
});

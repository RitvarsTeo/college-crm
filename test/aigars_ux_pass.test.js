// Aigars UX compliance pass, 28.09.2026: phone and tablet menu as one row, Journey cards with a plain
// next step and a one-line comment preview, the person card on a phone only once tapped, the dark
// menu without blocks, explaining sentences gone, Outcomes and Settings readable on a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

function card(p, t) {
  const ctx = { esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`), cTodayIso: () => '2026-09-28', cDay: (iso) => String(iso).slice(0, 10) };
  const i = APP.indexOf('const C_JICON = {');
  vm.runInNewContext(`${line('const cWhenClass =')}\n${line('const cTask =')}\n${line('const cNotePreview =')}\n${APP.slice(i, APP.indexOf('\n};', i) + 3)}\n${fn('function cJourneyCard(')}\nthis.card = cJourneyCard;`, ctx);
  return ctx.card(p, t, null);
}

test('the next step says what to do: the import\'s "(from the sheet)" is not shown; the stored title is untouched', () => {
  const html = card({ id: 'a', name: 'A' }, { label: 'Get in touch (from the sheet)', due_at: '2026-10-02T09:00:00Z' });
  assert.match(html, /<span class="c-jnext">[\s\S]*<span>Get in touch<\/span><\/span>/);
  assert.doesNotMatch(html, /from the sheet/);
  const other = card({ id: 'a', name: 'A' }, { label: 'Send the invoice', due_at: '2026-10-02T09:00:00Z' });
  assert.match(other, /<span>Send the invoice<\/span>/, 'any other step is shown exactly as written');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src', 'real.js'), 'utf8'), /Get in touch'\s*,/, 'sanity: the import code is not what changed');
});

test('the comment preview: one quiet line of what people wrote, without the import tags; the whole note in its title', () => {
  const html = card({ id: 'a', name: 'A', notes: 'Sheet status: COLD | Docs: Not submitted | Waiting for exam results' }, null);
  assert.match(html, /<small class="c-jnote" title="Sheet status: COLD \| Docs: Not submitted \| Waiting for exam results">Waiting for exam results<\/small>/);
  assert.doesNotMatch(card({ id: 'a', name: 'A', notes: '' }, null), /c-jnote/, 'no note, no line');
  assert.doesNotMatch(card({ id: 'a', name: 'A', notes: 'Sheet status: HOT | ' }, null), /c-jnote/, 'tags only, no line');
  assert.match(APP, /html\.ui-c \.c-jp small\.c-jnote\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/, 'one line, cut with an ellipsis');
});

test('phone and tablet: the menu is one sideways row, never wider than the page; the place you are in scrolls into view', () => {
  assert.match(APP, /@media \(max-width:900px\)\{\s*html\.ui-c \.shell\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(APP, /html\.ui-c \.cnav\{order:2;flex:1 0 100%;min-width:0;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;/);
  assert.match(APP, /html\.ui-c \.cnav \.kids\{display:contents\}/);
  assert.match(APP, /row\.scrollLeft = Math\.max\(0, here\.offsetLeft - row\.offsetLeft - 24\)/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.shell > nav\{background:#08182e\}/, 'pinned over the work in dark: solid');
});

test('phone: the Journey opens on its columns; the person card only once somebody taps one', () => {
  const draw = fn('function cDrawJourney(');
  assert.match(draw, /const sel = open\.find\(\(p\) => p\.id === C_JSEL\) \|\| \(narrow \? null : open\[0\]\);/);
  assert.match(draw, /if \(narrow && sel && C_JSEL === sel\.id\)/);
});

test('dark menu: no block behind the active item, like light', () => {
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.cnav a\.on\{background:transparent;color:#ffffff\}/);
});

test('explaining sentences are gone', () => {
  for (const s of ['A message someone sent is a New Lead; a promise we made is a Next Step.',
    'Changes when a step is done, or by hand here.', 'The stages are a working version, to be agreed with Admissions.',
    'How the CRM looks for you, and where to get help.', 'Where finished journeys end.']) assert.ok(!APP.includes(s), s);
  assert.match(APP, /<span class="c-dec">Stages to agree<\/span>/, 'the open decision is still said, in three words');
});

test('phone: Outcomes rows and the Settings switch use the full width', () => {
  assert.match(APP, /html\.ui-c \.c-line, html\.ui-c \.c-line\[style\]\{grid-template-columns:minmax\(0,1fr\) auto!important\}/);
  assert.match(APP, /html\.ui-c \.c-line\.c-set-theme\{grid-template-columns:minmax\(0,1fr\)!important/);
});

// Concept C, the main UI since 28.09.2026 (?ui=classic keeps the previous one).
// Rules decided for C that a later change could quietly undo.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

// Ritvars, 28.09.2026: hide the sidebar "needs you today / leads you own" counter in
// C, keep it in the classic view. Its one number mixed New Leads with overdue Next
// Steps, its link landed on Home, and its words were the old vocabulary.
test('the old sidebar counter is not drawn in C, and still is in the classic view', async () => {
  const start = APP.indexOf('async function drawWaiting(');
  const src = APP.slice(start, APP.indexOf('\n}\n', start) + 2);
  const run = async (UI, answer) => {
    const box = { innerHTML: 'untouched' };
    let asked = 0;
    const ctx = { UI, ACTOR: 'Ieva', encodeURIComponent, esc: (s) => String(s),
      document: { querySelector: (sel) => (sel === '#waiting' ? box : null) },
      api: async () => { asked += 1; return answer; } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    await vm.runInContext('drawWaiting()', ctx);
    return { html: box.innerHTML, asked };
  };
  const mine = { isAdmin: false, mine: { total: 5, intake: 3, overdue: 2, aged: 0, leads: 9 } };
  const admin = { isAdmin: true, byRole: [{ role: 'Admissions', total: 13, overdue: 1, aged: 0 }] };

  const cUser = await run('c', mine);
  assert.equal(cUser.asked, 0, 'C does not even ask for it');
  assert.equal(cUser.html, 'untouched');
  assert.equal((await run('c', admin)).html, 'untouched', 'nor the admin "waiting, per role" version');

  const classicUser = await run('classic', mine);
  assert.match(classicUser.html, /needs you today/);
  assert.match(classicUser.html, />5</, 'three new leads plus two overdue steps, as before');
  assert.match(classicUser.html, /leads you own/);
  assert.match((await run('classic', admin)).html, /waiting, per role/);

  // and in case anything else ever fills the boxes, C's stylesheet hides both
  assert.match(APP, /html\.ui-c #waiting, html\.ui-c #waiting2\{display:none!important\}/);
});

// The queue is called Inbox, not New Leads (Ritvars, 01.10.2026): a stranger who
// rang once is not a lead, and src/intake.js line 4 has always said so. The route
// (#/leads) and the id (cnLeads) are identifiers other things point at, so they stay.
test('Today and the Inbox keep their own counts in C\'s navigation', () => {
  assert.match(APP, /<span>Inbox<\/span><span class="n" id="cnLeads">/);
  assert.doesNotMatch(APP, /<span>New Leads<\/span>/, 'nothing calls the queue New Leads');
  // Next Steps was folded INTO Today (the owner, 01.10.2026), so the due count it carried
  // is now the Today badge: same id, same number, one screen fewer to visit.
  // 05.10.2026 (the owner, locked): the menu item reads "Next steps" again and the badge stays on it
  assert.match(APP, /<span>Next steps<\/span><span class="n" id="cnNext">/);
  assert.doesNotMatch(APP, /<span>Today<\/span><span class="n" id="cnNext">/, 'not Today any more');
  const start = APP.indexOf('async function cNavCounts(');
  const src = APP.slice(start, APP.indexOf('\n}\n', start));
  assert.match(src, /\(i\.counts \|\| \{\}\)\.new/, 'the Inbox counts new arrivals');
  assert.match(src, /cDueNow\(t\)\.length/, 'Today counts what is due now');
});

// Ritvars, 28.09.2026: C is the normal product. No visible control invites anybody back
// to the classic view; it stays a hidden fallback reached by the address ?ui=classic.
test('nothing on screen links to the classic view, and the address still reaches it', () => {
  const code = APP.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/href=["']\?ui=classic/.test(code), 'no link to ?ui=classic');
  assert.ok(!/item\('\?ui=classic'/.test(code), 'no Settings row for it');
  assert.ok(!/classic view/i.test(code), 'no visible words about it');

  const start = APP.indexOf('const UI = (() => {');
  const src = APP.slice(start, APP.indexOf('})();', start) + 5);
  const store = {};
  const pick = (search) => vm.runInNewContext(`${src}\nUI`, { URLSearchParams,
    location: { search }, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } });
  assert.equal(pick(''), 'c', 'the normal address opens C');
  assert.equal(pick('?ui=classic'), 'classic', '?ui=classic opens the classic view');
  assert.equal(pick(''), 'classic', 'and the browser remembers that choice, as before');
  assert.equal(pick('?ui=c'), 'c', '?ui=c opens C again');
  assert.equal(pick(''), 'c');
});

// Ritvars, 28.09.2026: the dark theme is the sign-in sea - the same navy gradient, a
// brighter amber (the old one read as "dirty amber or mustard") and glass panels.
test('dark C is the sign-in sea: its gradient, the bright amber, glass panels, one palette', () => {
  const sky = APP.match(/--gate-sky-top:(#[0-9a-f]{6});--gate-sky-mid:(#[0-9a-f]{6});--gate-sky-deep:(#[0-9a-f]{6})/);
  assert.ok(sky, 'the sign-in sky colours are where they were');
  const body = APP.match(/html\.ui-c\[data-theme="dark"\] body\{background:([^}]*)\}/);
  assert.ok(body, 'dark C paints the page');
  const dark = [...APP.matchAll(/html\.ui-c\[data-theme="dark"\]\{([^}]*)\}/g)].map((m) => m[1]);
  // the page's sea is named --sea since 02.10, so a frame can carry the same sea; it is
  // defined in the one dark palette, and resolved here before the colours are read
  const sea = (dark[0] || '').match(/--sea:([^;]*)/);
  const paint = body[1].replace('var(--sea)', sea ? sea[1] : '');
  for (const c of sky.slice(1)) assert.ok(paint.includes(c), `the dark page uses the sign-in colour ${c}`);
  assert.equal(dark.length, 1, 'one dark palette, so a later block cannot quietly override it');
  assert.match(dark[0], /--v-open:#E0A526/);   // the data mustard (02.10.2026), not the signal amber
  assert.match(dark[0], /--c-warn:#F7C04F/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] :is\([^)]*\.c-sheet[^)]*\.ksec[^)]*\)\{\s*background:var\(--glass\)/);
});

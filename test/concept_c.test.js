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

test('New Leads and Next Steps keep their own counts in C\'s navigation', () => {
  assert.match(APP, /<span>New Leads<\/span><span class="n" id="cnLeads">/);
  assert.match(APP, /<span>Next Steps<\/span><span class="n" id="cnNext">/);
  const start = APP.indexOf('async function cNavCounts(');
  const src = APP.slice(start, APP.indexOf('\n}\n', start));
  assert.match(src, /\(i\.counts \|\| \{\}\)\.new/, 'New Leads counts new arrivals');
  assert.match(src, /cDueNow\(t\)\.length/, 'Next Steps counts what is due now');
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

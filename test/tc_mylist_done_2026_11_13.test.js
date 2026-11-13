// A COMPANY DONE (his words 13.11.2026: "when director chooses a company its stays opened with all buttons clicked and nothing
// else happens ... we need a clear sign that the invitees are picked, company is picked and company goes into YES. Also post
// change to mail."). Invented companies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const fn = (name) => { const i = APP.indexOf(`function ${name}(`); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

test('done = No, or Invite with a way; Invite alone is still to decide', () => {
  const mlDone = new Function(APP.match(/const mlDone = [^\n]+/)[0].replace('const ', 'return (').replace(/;$/, ');').replace('mlDone = ', ''))();
  assert.equal(mlDone({ decision: 'no' }), true);
  assert.equal(mlDone({ decision: 'invite', way: 'digital' }), true);
  assert.equal(mlDone({ decision: 'invite', way: null }), false);
  assert.equal(mlDone({ decision: null }), false);
});

test('a finished company folds to its result with Change; the figure ticks; the next one to decide opens', () => {
  assert.ok(APP.includes('Invited · ${esc(way)} · ${tcN(g.people.length - left)} of ${tcN(g.people.length)}'));
  assert.ok(APP.includes('`Not invited · ${tcN(g.people.length)}'));
  assert.ok(APP.includes('onclick="tcMlEdit(${esc(JSON.stringify(String(g.key)))})">Change</button>'));
  const d = fn('tcMlDo');
  assert.ok(d.includes("T_ML.edit.delete(key); T_ML.open.delete(key); T_ML.bump = g.decision === 'no' ? 'no' : 'invite';"));
  assert.ok(d.includes('.find((x) => !mlDone(x));') && d.includes('T_ML.open.add(next.key)'));
  assert.ok(d.includes('T_ML.undo.push(mlClone(T_ML.W));') && d.includes('tcMlMarkDirty();'), 'the same unsaved / undo rules');
  assert.ok(APP.includes("filter: 'all'"), 'his pick B stays: All on by default');
});

test('By post is By mail everywhere; the stored value stays post', () => {
  assert.ok(APP.includes("['post', 'By mail']") && APP.includes("post: 'By mail' }, R = T_PC.rows") && APP.includes("fig('post', 'By mail')"));
  assert.ok(SERVER.includes("const WAY = { in_person: 'In person', post: 'By mail' };"));
  for (const f of ['app.html', 'server.js', 'tcmylist.js']) assert.ok(!/by post/i.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')), f);
});

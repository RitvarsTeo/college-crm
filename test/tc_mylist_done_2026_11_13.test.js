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

test('a company stays open until Done; Done folds it to its result with Change, the figure ticks, the next one to decide opens', () => {
  assert.ok(APP.includes('Invited · ${esc(way)} · ${tcN(g.people.length - left)} of ${tcN(g.people.length)}'));
  assert.ok(APP.includes('`Not invited · ${tcN(g.people.length)}'));
  assert.ok(APP.includes('onclick="tcMlEdit(${esc(JSON.stringify(String(g.key)))})">Change</button>'));
  const d = fn('tcMlDo'), f = fn('tcMlFinish');
  assert.ok(d.includes("if (a.type === 'decide' || a.type === 'way') { T_ML.edit.add(a.key); T_ML.open.add(a.key); }"), 'his words: keep it open until Done');
  assert.ok(d.includes('T_ML.undo.push(mlClone(T_ML.W));') && d.includes('tcMlMarkDirty();'), 'the same unsaved / undo rules');
  assert.ok(APP.includes("<button type=\"button\" class=\"btn tcml-donebtn\" ${mlDone(g) ? '' : 'disabled'} onclick=\"tcMlFinish("), 'Done only when the decision is complete');
  assert.ok(f.includes('if (!g || !mlDone(g)) return;') && f.includes("T_ML.edit.delete(key); T_ML.open.delete(key); T_ML.bump = g.decision === 'no' ? 'no' : 'invite';"));
  assert.ok(f.includes('.find((x) => !mlDone(x));') && f.includes('T_ML.open.add(next.key)'));
  assert.ok(APP.includes("filter: 'all'"), 'his pick B stays: All on by default');
});

test('By post is By mail everywhere; the stored value stays post', () => {
  assert.ok(APP.includes("['post', 'By mail']") && APP.includes("post: 'By mail' }, R = T_PC.rows") && APP.includes("fig('post', 'By mail')"));
  assert.ok(SERVER.includes("const WAY = { in_person: 'In person', post: 'By mail' };"));
  for (const f of ['app.html', 'server.js', 'tcmylist.js']) assert.ok(!/by post/i.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')), f);
});

// his words 13.11.2026: "for company list, there has to be a search bar and the companies should be put alphabetically"
test('companies A-Z with Latvian letters in place; the search finds a company, a person or an email, together with the views', () => {
  const pick = (re) => APP.match(re)[0];
  const src = [pick(/const mlNorm = [^\n]+/), pick(/const mlPersonHit = [^\n]+/), pick(/const mlShows = [^\n]+/), fn('tcMlShown')].join('\n');
  const run = (q, filter, groups) => new Function('T_ML', src + '; return tcMlShown;')({ q, filter })(groups).map((g) => g.name);
  const P = (label, email, decision = null) => ({ label, email, decision });
  const G = [
    { name: 'Wood', people: [P('Anna Berg', 'anna@wood.example')] },
    { name: 'Ādažu Osta', people: [P('Jānis Ozols', 'janis@adazi.example', 'invite')] },
    { name: 'acta marine', people: [P('Peter Smit', 'p.smit@acta.example', 'no')] },
    { name: 'Boskalis', people: [P('Žanis Kalns', 'zanis@boskalis.example')] },
  ];
  assert.deepEqual(run('', 'all', G), ['acta marine', 'Ādažu Osta', 'Boskalis', 'Wood']);
  assert.deepEqual(run('bosk', 'all', G), ['Boskalis'], 'a company name');
  assert.deepEqual(run('zanis', 'all', G), ['Boskalis'], 'a person, without the long letters');
  assert.deepEqual(run('smit@acta', 'all', G), ['acta marine'], 'an email');
  assert.deepEqual(run('a', 'invite', G), ['Ādažu Osta'], 'with the Invite view');
  assert.deepEqual(run('nobody', 'all', G), []);
  assert.ok(APP.includes('placeholder="Search a company, a person or an email"') && APP.includes('oninput="tcMlSearch(this.value)"'));
  assert.ok(fn('tcMlFinish').includes('const shown = tcMlShown(groups)'), 'the next company after Done follows A-Z');
});

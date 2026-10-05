// Q15, Ritvars 05.10.2026: "Going back and in overall moving stages should be documented, so notes
// box its for this. How could we in the best way make it work and not to annoy the user?"
// A move back needs a note; a move forward asks and can be skipped; a note or logged call in the
// last few minutes counts. He picked B, the small dialog, on 05.10; the rule is on (enforce) for
// every hand move, and the inline line (A) and the ?movenote switch are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moveDirection, recentMinutes } from '../src/stagemove.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const BLOCK = APP.slice(APP.indexOf('// A NOTE ON EVERY STAGE MOVE (Q15'), APP.indexOf('// Resolves to { note }'));

function page() {
  const ctx = { CFG: CONFIG };
  vm.runInNewContext(BLOCK.replace(/^const /gm, 'var '), ctx);
  return ctx;
}

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}
const postJson = (base, p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const person = async (base, name) => {
  const made = await postJson(base, '/api/people', { name, email: `${Math.random().toString(36).slice(2)}@example.lv`, programme: 'NAV' }).then((r) => r.json());
  const id = made.id || (made.person && made.person.id);
  assert.ok(id, 'created');
  return id;
};
const status = (base, id, s, extra = {}) => postJson(base, `/api/people/${id}/status`, { status: s, ...extra });
const lastStatusEvent = async (base, id) => (await fetch(`${base}/api/people/${id}`).then((r) => r.json())).timeline.find((e) => e.kind === 'status');

const STAGES = CONFIG.stages.map((s) => s.id);

test('direction: Journey order; leaving Not proceeding is back; into it is the reason dialog', () => {
  assert.equal(moveDirection(CONFIG, 'Follow-up', 'Contacted'), 'back');
  assert.equal(moveDirection(CONFIG, 'Contacted', 'Application'), 'forward');
  assert.equal(moveDirection(CONFIG, 'Not proceeding', 'Contract'), 'back');
  assert.equal(moveDirection(CONFIG, 'Not proceeding', 'Admitted'), 'back');
  assert.equal(moveDirection(CONFIG, 'Contract', 'Not proceeding'), 'close');
  assert.equal(moveDirection(CONFIG, 'New', 'New'), 'none');
  assert.equal(moveDirection(CONFIG, 'Somewhere odd', 'New'), 'forward', 'an unknown stage never blocks');
  assert.equal(recentMinutes(CONFIG), 10);
});

test('the page and the server give the same direction for every pair of stages', () => {
  const { cMoveDir } = page();
  for (const a of STAGES) for (const b of STAGES) assert.equal(cMoveDir(a, b), moveDirection(CONFIG, a, b), `${a} -> ${b}`);
});

test('B is the only form, always on: no switch, no inline line, the server rule is on', () => {
  assert.ok(!/movenote|cMoveNoteMode|cMoveLine|c-mvline/.test(APP), 'A and its switch are gone');
  assert.equal(CONFIG.stageMoveNote.enforce, true);
  const { cMoveBody } = page();
  assert.deepEqual({ ...cMoveBody('Contacted', { note: '' }) }, { status: 'Contacted' });
  assert.deepEqual({ ...cMoveBody('Contacted', { note: 'Moved too early' }) }, { status: 'Contacted', note: 'Moved too early' });
});

test('reasons come from the config, 2-3 per direction, joined with typed text', () => {
  const { cMoveReasons, cMoveText, cMoveQ } = page();
  for (const d of ['back', 'forward']) assert.ok(cMoveReasons(d).length >= 2 && cMoveReasons(d).length <= 3, d);
  assert.equal(cMoveText('Waiting on them', ' docs by Friday '), 'Waiting on them - docs by Friday');
  assert.equal(cMoveText('Waiting on them', ''), 'Waiting on them');
  assert.equal(cMoveQ('back', 'Follow-up'), 'Why back to Follow-up?');
});

test('every place that moves a stage by hand goes through the same ask', () => {
  const posts = APP.match(/post\(`\/api\/people\/\$\{id\}\/status`, [^\n]*/g) || [];
  for (const line of posts) assert.ok(/cMoveBody\(|'Not proceeding'|cClosedStage\(\)/.test(line), line.slice(0, 120));
  assert.equal((APP.match(/await cAskMoveNote\(id, /g) || []).length, 4, 'Journey drag, quick edit, person page, the old board');
});

test('server: a back move without a note is refused; a note or a recent note/call saves; forward never asks', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const b = await person(base, 'Needs a note');
  await status(base, b, 'Follow-up');
  const refused = await status(base, b, 'Contacted');
  assert.equal(refused.status, 400);
  const why = await refused.json();
  assert.equal(why.needsMoveNote, true); assert.equal(why.direction, 'back');
  assert.equal((await fetch(`${base}/api/people/${b}`).then((r) => r.json())).status, 'Follow-up', 'nothing saved');
  assert.equal((await status(base, b, 'Contacted', { note: '   ' })).status, 400, 'blank is not a note');
  assert.equal((await status(base, b, 'Contacted', { note: 'Moved too early' })).status, 200);
  assert.equal((await lastStatusEvent(base, b)).body, 'Moved too early', 'the note is the why in History');

  const c = await person(base, 'Recent call note');
  await status(base, c, 'Application');
  const before = await fetch(`${base}/api/people/${c}/move-check?to=Contacted`).then((r) => r.json());
  assert.deepEqual([before.direction, before.covered], ['back', false]);
  await postJson(base, `/api/people/${c}/note`, { kind: 'call', subject: 'Call note', body: 'Not ready, call in spring' });
  const after = await fetch(`${base}/api/people/${c}/move-check?to=Contacted`).then((r) => r.json());
  assert.deepEqual([after.direction, after.covered], ['back', true], 'a logged call minutes ago counts');
  assert.equal((await status(base, c, 'Contacted')).status, 200);

  const d = await person(base, 'Forward skip');
  assert.equal((await status(base, d, 'Contacted')).status, 200, 'forward never needs one');
  assert.equal((await lastStatusEvent(base, d)).body, 'changed by hand');

  const e = await person(base, 'Back from Not proceeding');
  await status(base, e, 'Not proceeding', { reason: 'No response' });
  assert.equal((await status(base, e, 'Contacted')).status, 400, 'leaving Not proceeding is a move back');
  assert.equal((await status(base, e, 'Contacted', { note: 'Called back, wants to start in spring' })).status, 200);
});

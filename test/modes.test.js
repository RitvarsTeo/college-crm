// Real data must always be restorable.
//
// The risk this guards against is simple and severe: somebody plays in demo mode,
// and the real imported database is gone. So the snapshot is taken from the SOURCE
// at load time, a restore replays it row for row, and the result is checksummed
// rather than assumed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import * as snapshot from '../src/snapshot.js';
import { buildDemo } from '../src/demo.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

async function seedRealish(db) {
  const ins = db.prepare(`INSERT INTO people (id,name,email,phone,programme,status,owner,
    source_channel,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 25; i += 1) {
    await ins.run('r' + i, 'Real Person ' + i, `p${i}@example.lv`, '+3712000' + String(1000 + i),
      i % 2 ? 'NAV' : 'ENG', i < 5 ? 'Admitted' : 'New', 'Admissions', 'email',
      '2026-0' + (1 + (i % 9)) + '-01T09:00:00.000Z');
    await db.prepare(`INSERT INTO events (person_id,kind,occurred_at,subject,actor,origin)
      VALUES (?,?,?,?,?,?)`).run('r' + i, 'note', '2026-05-01T09:00:00.000Z', 'imported', 'import', 'automatic');
  }
}

test('a snapshot is written from the source and can be restored exactly', async (t) => {
  const file = path.join(os.tmpdir(), 'crm-snap-' + Math.random().toString(36).slice(2) + '.json');
  process.env.CRM_SNAPSHOT = file;
  t.after(() => { try { fs.unlinkSync(file); } catch {} delete process.env.CRM_SNAPSHOT; });

  const db = await openDb();
  await seedRealish(db);
  const before = (await db.prepare('SELECT COUNT(*) n FROM people').get()).n;

  // the module resolves its path at call time, so this test genuinely writes to a
  // temporary file. It used to be a module constant, and this test wrote 25 fake
  // people straight over the real snapshot.
  assert.equal(snapshot.snapshotFile(), file, 'the test must not touch the real snapshot');
  const written = await snapshot.write(db, { source: 'test' });
  assert.equal(written.counts.people, before);
  assert.ok(written.checksum);

  // somebody plays: wipe it and put something else there entirely
  await db.exec('DELETE FROM events; DELETE FROM people');
  await db.prepare(`INSERT INTO people (id,name,status,created_at)
    VALUES ('demo1','Demo Person','New','2026-09-24T09:00:00.000Z')`).run();
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 1);

  const r = await snapshot.restore(db);
  assert.equal(r.ok, true);
  assert.equal(r.verified, true, 'the restore must be checksum-identical, not merely non-empty');
  assert.equal(r.counts.people, before);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, before);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM people WHERE id = 'demo1'").get()).n, 0,
    'nothing from the demo may survive a restore');
  assert.equal((await db.prepare("SELECT name FROM people WHERE id = 'r7'").get()).name, 'Real Person 7');
});

test('a restore fails honestly when there is no snapshot', async (t) => {
  const file = path.join(os.tmpdir(), 'crm-nosnap-' + Math.random().toString(36).slice(2) + '.json');
  process.env.CRM_SNAPSHOT = file;
  t.after(() => { delete process.env.CRM_SNAPSHOT; });
  assert.equal(snapshot.exists(), false);
  assert.equal(snapshot.info(), null);
});

test('feedback is not part of the snapshot, so it survives a restore', async (t) => {
  const file = path.join(os.tmpdir(), 'crm-fb-' + Math.random().toString(36).slice(2) + '.json');
  process.env.CRM_SNAPSHOT = file;
  t.after(() => { try { fs.unlinkSync(file); } catch {} delete process.env.CRM_SNAPSHOT; });

  const db = await openDb();
  await seedRealish(db);
  await snapshot.write(db);
  await db.prepare(`INSERT INTO feedback (author,kind,body,created_at)
    VALUES ('Aigars','BUG','something is wrong','2026-09-24T09:00:00.000Z')`).run();
  await snapshot.restore(db);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM feedback').get()).n, 1,
    'feedback is about the software, not the data, and must not be wiped by a restore');
  assert.ok(!snapshot.TABLES.includes('feedback'));
});

// ------------------------------------------------------------- the demo --

test('the demo environment is built through the real inbound path', async () => {
  const db = await openDb();
  const info = await buildDemo(db, CONFIG);

  assert.ok(info.people >= 8, 'enough people to be worth looking at');
  assert.ok(info.people <= 20, 'and few enough to read in one screen');
  assert.ok(info.inbox > 0, 'there is work waiting in the Inbox');
  assert.ok(info.filtered > 0, 'a sales pitch was filtered');
  assert.ok(info.notRelevant > 0, 'something was marked not relevant, with a reason');
  assert.ok(info.overdue > 0, 'and something is overdue, so Follow-ups is not empty');

  // it arrived the real way: every person has an inbound row behind them
  const viaInbound = (await db.prepare(`SELECT COUNT(DISTINCT person_id) n FROM inbound
    WHERE person_id IS NOT NULL`).get()).n;
  assert.equal(viaInbound, info.people, 'every demo person came through the Inbox, not a direct insert');

  // and the rule holds: nobody active is left with nothing scheduled
  const stranded = (await db.prepare(`SELECT COUNT(*) n FROM people pe
    WHERE pe.status NOT IN ('Admitted','Not proceeding')
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`).get()).n;
  assert.equal(stranded, 0);
});

test('the demo covers the channels and stages somebody needs to see', async () => {
  const db = await openDb();
  await buildDemo(db, CONFIG);
  const channels = (await db.prepare('SELECT DISTINCT channel c FROM inbound').all()).map((r) => r.c);
  for (const must of ['instagram', 'facebook', 'messenger', 'whatsapp', 'website', 'gmail',
    'google_form', 'open_day', 'phone', 'agent', 'linkedin', 'tiktok', 'mailchimp', 'in_person']) {
    assert.ok(channels.includes(must), 'the demo never shows ' + must);
  }
  const stages = (await db.prepare('SELECT DISTINCT status s FROM people').all()).map((r) => r.s);
  assert.ok(stages.length >= 4, 'several admissions stages are represented, not just New');
  assert.ok(stages.includes('Admitted'), 'and the end of the journey is visible');

  // a reason was recorded for anything marked not relevant
  const archived = await db.prepare("SELECT archive_reason, processed_by FROM inbound WHERE state = 'archived'").all();
  assert.ok(archived.length > 0);
  for (const a of archived) {
    assert.ok(a.archive_reason, 'not relevant always carries a reason');
    assert.ok(a.processed_by, 'and who did it');
  }
});

// -------------------------------------------------------------- over HTTP --

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    // PORT=0: the system hands out a free port and the boot line names it. A random pick
    // from a 90-port range collided with parallel suites and other local servers.
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('switching the database requires a deliberate confirmation', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'content-type': 'application/json', 'x-acting-as': 'Ritvars' };

  // A typo in a fetch must not be able to replace the database.
  const noConfirm = await fetch(`${base}/api/console/mode`, { method: 'POST', headers: H,
    body: JSON.stringify({ mode: 'demo' }) });
  assert.equal(noConfirm.status, 428);
  assert.equal((await noConfirm.json()).needsConfirm, true);

  const ok = await fetch(`${base}/api/console/mode`, { method: 'POST', headers: H,
    body: JSON.stringify({ mode: 'demo', confirm: 'yes' }) }).then((r) => r.json());
  assert.equal(ok.mode, 'demo');
  assert.ok(ok.built.people > 0);

  // and the state is reported, never guessed
  const st = await fetch(`${base}/api/console/state`).then((r) => r.json());
  assert.equal(st.isDemo, true);
  assert.equal(st.isReal, false);
});

test('the Console is a separate page, and the CRM has no way into it', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const crm = await fetch(`${base}/`).then((r) => r.text());
  const console_ = await fetch(`${base}/console`);
  assert.equal(console_.status, 200);
  const consoleHtml = await console_.text();

  assert.match(consoleHtml, /<title>Academy CRM - Console<\/title>/);
  assert.match(crm, /<title>Academy CRM - prototype<\/title>/);

  // the CRM must not link to the console, or carry demo machinery
  assert.ok(!/href="\/console"/.test(crm), 'the CRM must not link to the Console');
  assert.ok(!/#\/console/.test(crm), 'and must not route to it');
  // What a USER can see, so a source comment does not count. The point is that no
  // developer language reaches the interface, not that the file never says it.
  const visible = crm
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const word of ['Load demo data', 'DEV CONTROL', 'Clear everything']) {
    assert.ok(!visible.includes(word), `the CRM interface still says "${word}"`);
  }
  // and no route reaches our tooling. This is the check that matters: a screen
  // nobody can navigate to is not part of the product.
  const routes = crm.slice(crm.indexOf('async function route()'), crm.indexOf('async function refreshBadge'));
  for (const gone of ['integrations', 'inspector', 'console', 'connections', 'inbound']) {
    assert.ok(!new RegExp(`page === '${gone}'`).test(routes),
      `the CRM still routes to ${gone}`);
  }
  // six tabs, and nothing technical
  for (const tab of ['Today', 'Inbox', 'Admissions', 'Follow-ups', 'People', 'Reports']) {
    assert.ok(crm.includes('>' + tab + '<'), 'the CRM is missing the ' + tab + ' tab');
  }
  for (const gone of ['>CAR<', '>Pipeline<', '>Connections<', '>What arrived<']) {
    assert.ok(!crm.includes(gone), 'the CRM still shows ' + gone);
  }
});

test('the words on screen are the words in the navigation', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const crm = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
  const cfg = await fetch(`http://127.0.0.1:${port}/api/config`).then((r) => r.json());

  // The tabs were renamed and several sentences underneath them were not. A
  // person reading "onto the pipeline" has to work out that it means Admissions.
  const visible = crm
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // an href is a link target, not something anybody reads
    .replace(/href="[^"]*"/g, '')
    .replace(/page === '[a-z]+'/g, '')
    // the route alias keeps old links working; it is a target, not a word anybody reads
    .replace(/const ALIAS = \{[^}]*\};/, '');

  for (const word of ['pipeline', 'Pipeline', 'CAR', 'Channel Automation']) {
    assert.ok(!visible.includes(word), `the interface still says "${word}"`);
  }
  // and the same for anything the config puts on a screen
  for (const [key, text] of Object.entries(cfg.provisional || {})) {
    assert.ok(!/pipeline/i.test(String(text)), `config.provisional.${key} still says pipeline`);
  }
});

// ---------------------------------------------------------- choosing a dataset --
//
// loadDataset() had no `demo` branch, so `demo` fell through to the else and
// produced an EMPTY database while reporting success. Three consequences, all
// found together on 26.09.2026:
//   - .env.example documented a value that did nothing
//   - one channels test asserted that a demo build is not mistaken for a real
//     provider connection, while there was no demo build to mistake
//   - POST /api/dataset takes the name from the caller, so a typo emptied every
//     table and answered 200 ok
//
// The first fix still cleared the database before complaining. Validation now
// happens BEFORE anything is cleared, which is the whole point.

test('DATASET=demo actually builds the demo', async (t) => {
  const { child, port } = await startServer({ DATASET: 'demo' });
  t.after(() => child.kill());
  const h = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
  assert.ok(h.people > 0, 'DATASET=demo produced an empty database');
});

test('every dataset the documentation offers actually works', async (t) => {
  // .env.example lists these. A name that is documented and does nothing is
  // worse than one that is not documented at all.
  for (const kind of ['empty', 'demo', 'synthetic']) {
    const { child, port } = await startServer({ DATASET: kind });
    t.after(() => child.kill());
    const st = await fetch(`http://127.0.0.1:${port}/api/console/state`).then((r) => r.json());
    assert.equal(st.mode === 'real', false, `${kind} must not load real data`);
    const h = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
    if (kind !== 'empty') assert.ok(h.people > 0, `${kind} produced nothing`);
  }
});

test('an unknown DATASET refuses to start rather than starting empty', async () => {
  await assert.rejects(() => startServer({ DATASET: 'noSuchThing' }), (err) => {
    assert.match(err.message, /unknown dataset/);
    return true;
  });
});

test('A TYPO OVER HTTP MUST NOT EMPTY THE DATABASE', async (t) => {
  // The destructive one. POST /api/dataset passes whatever the caller typed
  // straight into loadDataset, and clearAll() used to run first.
  const { child, port } = await startServer({ DATASET: 'synthetic' });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const count = async () => (await fetch(`${base}/healthz`).then((r) => r.json())).people;

  const before = await count();
  assert.ok(before > 0, 'nothing to lose means nothing is proved');

  const r = await fetch(`${base}/api/dataset`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-as': 'Ritvars' },
    body: JSON.stringify({ kind: 'definitely-not-a-dataset' }) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /unknown dataset/);

  assert.equal(await count(), before, 'THE DATABASE WAS EMPTIED BY A NAME THAT WAS REFUSED');
});

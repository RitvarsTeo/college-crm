// Q75 (decided by the owner 07.10.2026, KISS list): the Contract stage comes out. The stages are New,
// Contacted, Follow-up, Submitted application, then Admitted / Not proceeding. "Submitted application" is
// the Application stage with a new LABEL; the key stays 'Application' so stored people keep their meaning.
// Everybody at Contract moves into it once, with a line on their timeline.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { foldContractStage, WHY } from '../src/stagefold.js';
import { report } from '../src/reports.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

test('config: five stages and the two ends, Application relabelled, nothing points at Contract', () => {
  assert.deepEqual(CFG.stages.map((s) => [s.id, s.label]), [['New', 'New'], ['Contacted', 'Contacted'], ['Follow-up', 'Follow-up'],
    ['Application', 'Submitted application'], ['Admitted', 'Admitted'], ['Not proceeding', 'Not proceeding']]);
  assert.deepEqual(CFG.stageOrder, ['New', 'Contacted', 'Follow-up', 'Application', 'Admitted']);
  assert.deepEqual(CFG.terminalStages, ['Admitted', 'Not proceeding']);
  assert.equal(CFG.stageRoles.application, 'Application', 'the key is unchanged');
  const steps = CFG.nextActions.flatMap((g) => g.items);
  assert.ok(!steps.some((i) => i.advancesTo === 'Contract'), 'no step moves anybody to Contract');
  for (const id of ['prepare_contract', 'sign_contract', 'send_invoice', 'chase_payment']) {
    assert.equal(steps.find((i) => i.id === id).advancesTo, 'Application', id + ' keeps them at Submitted application');
  }
  assert.equal(steps.find((i) => i.id === 'confirm_payment').advancesTo, 'Admitted');
  assert.equal(CFG.stepGroupsByStage.Contract, undefined);
  assert.deepEqual(CFG.stepGroupsByStage.Application, ['Application and documents', 'Contract and payment']);
  assert.equal(CFG.closedReasonsByStage.Contract, undefined);
  const live = JSON.stringify({ ...CFG, benchmarks: null });
  assert.ok(!/"Contract"/.test(live), 'no stage id "Contract" left anywhere outside the parked benchmark');
  const row = CFG.benchmarks.rows.find((b) => b.id === 'contract_to_admitted');
  assert.equal(row.on, false, 'the deposit benchmark is parked: it does not compare to Submitted application -> Admitted');
});

const person = async (db, id, status, created = '2026-03-01T10:00:00.000Z') => {
  await db.prepare(`INSERT INTO people (id, name, status, created_at) VALUES (?,?,?,?)`).run(id, 'P ' + id, status, created);
};

test('the move: everybody at Contract goes to Application once, with a line saying why; a second run moves nobody', async () => {
  const db = await openDb(':memory:');
  await person(db, 'k1', 'Contract'); await person(db, 'k2', 'Contract'); await person(db, 'a1', 'Application'); await person(db, 'n1', 'New');
  await db.prepare('UPDATE people SET contract_at = ? WHERE id = ?').run('2026-09-20T10:00:00.000Z', 'k1');
  const first = await foldContractStage(db, { now: '2026-10-07T08:00:00.000Z' });
  assert.equal(first.moved, 2);
  const st = Object.fromEntries((await db.prepare('SELECT id, status FROM people').all()).map((r) => [r.id, r.status]));
  assert.deepEqual(st, { k1: 'Application', k2: 'Application', a1: 'Application', n1: 'New' });
  const ev = await db.prepare("SELECT person_id, subject, body, old_value, new_value, origin FROM events WHERE kind = 'status' ORDER BY person_id").all();
  assert.deepEqual(ev.map((e) => [e.person_id, e.subject, e.body, e.old_value, e.new_value, e.origin]), [
    ['k1', 'Status: Contract -> Submitted application', WHY, 'Contract', 'Application', 'automatic'],
    ['k2', 'Status: Contract -> Submitted application', WHY, 'Contract', 'Application', 'automatic']]);
  assert.equal(WHY, 'moved: Contract stage removed (07.10)');
  assert.equal((await db.prepare('SELECT contract_at FROM people WHERE id = ?').get('k1')).contract_at, '2026-09-20T10:00:00.000Z', 'the contract date stays history');
  assert.equal((await foldContractStage(db)).moved, 0, 'idempotent');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM events WHERE kind = 'status'").get()).n, 2, 'no second line');
});

test('the figures still add up: "reached Application" and the stage list count the moved people once', async () => {
  const db = await openDb(':memory:');
  const y = new Date().getFullYear();
  const at = `${y}-01-15T10:00:00.000Z`;
  await person(db, 'k1', 'Contract', at); await person(db, 'a1', 'Application', at); await person(db, 'm1', 'Admitted', at); await person(db, 'n1', 'New', at);
  await db.prepare('UPDATE people SET admitted_at = ? WHERE id = ?').run(`${y}-02-01T10:00:00.000Z`, 'm1');
  const before = await report(db, { years: [String(y)] });
  await foldContractStage(db);
  const after = await report(db, { years: [String(y)] });
  assert.equal(after.summary.newLeads, 4);
  assert.equal(after.summary.applications, 3, 'k1 a1 m1 reached Submitted application or beyond');
  assert.equal(before.summary.applications, 2, 'before the move k1 was not counted at all: the move fixes the count, it does not inflate it');
  assert.equal(after.summary.admitted, 1);
  const stages = Object.fromEntries((after.breakdowns.stage || []).map((r) => [r.value, r.count]));
  assert.equal(stages.Contract, undefined, 'nobody stands at Contract');
  assert.equal(stages.Application, 2);
  assert.equal(Object.values(stages).reduce((a, n) => a + n, 0), 4, 'the stage list still sums to everybody');
  assert.equal(after.steps.contractToAdmitted, undefined);
  assert.deepEqual([after.steps.applicationToAdmitted.from, after.steps.applicationToAdmitted.to], ['Application', 'Admitted']);
});

test('boot: the server folds Contract on start and says how many', async (t) => {
  const file = path.join(ROOT, 'test', '.q75-' + process.pid + '.db');
  t.after(() => { try { fs.unlinkSync(file); } catch {} });
  const db = await openDb(file);
  await person(db, 'k1', 'Contract'); await person(db, 'k2', 'Contract');
  if (db.close) await db.close();
  const out = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '' },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    const look = (d) => { o += d; if (/http:\/\/localhost:\d+/.test(o)) { child.kill(); resolve(o); } };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => resolve(o));
    setTimeout(() => { child.kill(); reject(new Error(o)); }, 20000);
  });
  assert.match(out, /Contract stage removed: 2 moved to Submitted application/);
  const again = await openDb(file);
  assert.equal((await again.prepare("SELECT COUNT(*) n FROM people WHERE status = 'Contract'").get()).n, 0);
  if (again.close) await again.close();
});

test('SIS: only a real submission moves the stage (Ritvars 07.10); registered and started leave it, rejected and withdrawn go on the timeline', async () => {
  const { SIS_STAGE, SIS_CLOSING } = await import('../src/sync.js');
  assert.deepEqual({ ...SIS_STAGE }, { submitted: 'Application', admitted: 'Admitted', matriculated: 'Admitted' });
  assert.deepEqual(SIS_CLOSING, ['rejected', 'withdrawn']);
});

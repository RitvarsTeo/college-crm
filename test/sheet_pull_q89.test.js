// Q89, the owner 12.10.2026: "connect the drive link with the app. check if any new info comes in and update the
// app accordingly. Until you see that 100% leads are made in the app." A fake sheet throughout; nothing real.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { rowsOf, sheetDay, SCOPES, saveSheetToken, exchangeCode } from '../lib/sheetpull.js';
import { applyRows, pullSheet, sheetCounts, SHEET_TASK, OLD_IMPORT, stageOf } from '../src/sheetsync.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const HEAD = ['No.', 'Lead Name Surname', 'Study Program', 'Education', 'First contact (dd/mm/yyyy)', 'Lead Phone', 'Lead Email',
  'Source', 'Status (HOT/WARM/COLD)', 'Notes', 'Next action date', 'Docs', 'Onboarding'];
const row = (o) => [o.no || '1', o.name, o.programme || '', o.education || '', o.first || '', o.phone || '', o.email || '',
  o.source || '', o.status || '', o.notes || '', o.next || '', o.docs || '', ''];
const tab = (rows, name = 'NAV/ENG ADMISSIONS') => ({ tab: name, rows: rowsOf([['ADMISSIONS'], HEAD, ...rows.map(row)]).rows });
const NOW = new Date('2026-10-12T10:00:00Z');
const opts = { now: NOW, cfg: CFG };
const person = (db, id) => db.prepare('SELECT * FROM people WHERE id = ?').get(id);
const add = (db, id, o = {}) => db.prepare(`INSERT INTO people (id, name, email, phone, programme, status, owner, created_at)
  VALUES (?,?,?,?,?,?,?,?)`).run(id, o.name || 'P ' + id, o.email || null, o.phone || null, o.programme || null, o.status || 'New', 'Admissions', '2026-09-01T09:00:00.000Z');

test('reading: columns by header name wherever they sit, a blank name is not a row, dd/mm/yyyy is a Riga day', () => {
  const moved = ['Lead Email', 'Lead Name Surname', 'First contact (dd/mm/yyyy)'];
  const r = rowsOf([['title'], moved, ['a@x.lv', 'Anna Ozola', '03/10/2026'], ['', '', ''], ['b@x.lv', '', '04/10/2026']]);
  assert.equal(r.rows.length, 1);
  assert.deepEqual([r.rows[0].name, r.rows[0].email, r.rows[0].firstContact, r.rows[0].line], ['Anna Ozola', 'a@x.lv', '03/10/2026', 3]);
  assert.equal(sheetDay('03/10/2026'), '2026-10-03');
  assert.equal(sheetDay('3.10.26'), '2026-10-03');
  assert.equal(sheetDay('31/02/2026'), null, 'not a day');
  assert.equal(sheetDay('next week'), null);
  assert.equal(rowsOf([['nothing here']]).ok, false);
});

test('access: read-only scope only, nothing in the code writes to a sheet', () => {
  assert.deepEqual(SCOPES, ['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets.readonly']);
  const lib = fs.readFileSync(path.join(ROOT, 'lib', 'sheetpull.js'), 'utf8');
  assert.ok(!/:batchUpdate|values:append|values:update|method: 'PUT'/.test(lib), 'no write call to Sheets');
  assert.ok(!/\/auth\/spreadsheets['" ]/.test(lib) && !/auth\/drive['" ]/.test(lib), 'no writable scope');
});

test('the account check: the account Google names comes back for the caller to check (Q89b: an Intake admin or edu@)', async () => {
  const fetchImpl = async (u) => (String(u).includes('token') ? new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }))
    : new Response(JSON.stringify({ email: 'Someone.Else@novikontas.org' })));
  const got = await exchangeCode({ env: { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }, code: 'c', redirectUri: 'https://x/cb', fetchImpl });
  assert.equal(got.account, 'someone.else@novikontas.org');
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(srv, /if \(!\(await sheetAccountAllowed\(got\.account, flow\)\)\)/, 'the callback keeps only an admin or edu@ (13.10, "B: my own account")');
  assert.ok(srv.indexOf('sheetB.tabTitles(') < srv.indexOf('sheetB.saveSheetToken(db, got.refreshToken'), 'the read check comes before anything is kept');
});

test('a new lead in the sheet becomes a person: the sheet date, first channel sheet, the next action as a step', async () => {
  const db = await openDb(':memory:');
  const s = await applyRows(db, [tab([{ name: 'Anna Ozola', email: 'Anna@X.lv', phone: '+371 29 990 001', programme: 'NAV',
    first: '03/10/2026', source: 'Instagram', status: 'WARM', next: '14/10/2026', notes: 'calls back Tuesday' }])], opts);
  assert.equal(s.created, 1);
  const p = await db.prepare("SELECT * FROM people WHERE first_channel = 'sheet'").get();
  assert.deepEqual([p.name, p.email, p.programme, p.status, p.source_channel], ['Anna Ozola', 'anna@x.lv', 'NAV', 'Follow-up', 'instagram']);
  assert.equal(p.created_at, '2026-10-03T06:00:00.000Z', '09:00 Riga on the sheet day, never the pull day');
  const t = await db.prepare('SELECT label, due_at FROM tasks WHERE person_id = ?').all(p.id);
  assert.deepEqual(t.map((x) => [x.label, x.due_at]), [[SHEET_TASK, '2026-10-14T06:00:00.000Z']]);
  const ev = await db.prepare('SELECT kind, actor, body FROM events WHERE person_id = ?').all(p.id);
  assert.deepEqual(ev.map((e) => [e.kind, e.actor]), [['create', 'Admissions sheet']]);
  assert.match(ev[0].body, /WARM \| calls back Tuesday/);
  const again = await applyRows(db, [tab([{ name: 'Anna Ozola', email: 'anna@x.lv', phone: '+371 29 990 001', programme: 'NAV',
    first: '03/10/2026', source: 'Instagram', status: 'WARM', next: '14/10/2026', notes: 'calls back Tuesday' }])], opts);
  assert.deepEqual([again.created, again.unchanged], [0, 1], 'the same row again changes nothing');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM events').get()).n, 1);
});

test('matching: email, then the phone tail, then a name only when exactly one person has it; two = no guess', async () => {
  const db = await openDb(':memory:');
  await add(db, 'e1', { email: 'liene@x.lv' }); await add(db, 'p1', { phone: '29990002' }); await add(db, 'n1', { name: 'Jānis Bērziņš' });
  await add(db, 'd1', { name: 'Anna Liepa' }); await add(db, 'd2', { name: 'Anna Liepa' });
  const s = await applyRows(db, [tab([{ name: 'L', email: 'LIENE@x.lv' }, { name: 'Q', phone: '+371 2999 0002' },
    { name: 'janis berzins' }, { name: 'Anna Liepa', programme: 'ENG' }])], opts);
  assert.deepEqual([s.linked, s.created, s.needsPerson], [3, 0, 1]);
  const links = await db.prepare('SELECT person_id FROM sheet_rows ORDER BY person_id').all();
  assert.deepEqual(links.map((r) => r.person_id), ['e1', 'n1', 'p1']);
  assert.equal((await person(db, 'd1')).programme, null, 'an ambiguous name writes nothing');
});

test('INTAKE WINS: a field changed by hand in Intake is never overwritten; a sheet change otherwise comes in', async () => {
  const db = await openDb(':memory:');
  await add(db, 'a', { email: 'a@x.lv', programme: 'NAV' });
  await applyRows(db, [tab([{ name: 'A', email: 'a@x.lv', programme: 'NAV' }])], opts);
  // the sheet changes the programme: it comes in, with a line on the history
  await applyRows(db, [tab([{ name: 'A', email: 'a@x.lv', programme: 'ENG' }])], { ...opts, now: new Date('2026-10-12T11:00:00Z') });
  assert.equal((await person(db, 'a')).programme, 'ENG');
  // somebody changes it in Intake, then the sheet changes it again: Intake wins
  await db.prepare('UPDATE people SET programme = ? WHERE id = ?').run('MT OS', 'a');
  await db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, actor, origin, field, old_value, new_value)
    VALUES ('a','edit','note','2026-10-12T11:30:00.000Z','Ieva','manual','programme','ENG','MT OS')`).run();
  const s = await applyRows(db, [tab([{ name: 'A', email: 'a@x.lv', programme: 'NAV' }])], { ...opts, now: new Date('2026-10-12T12:00:00Z') });
  assert.equal((await person(db, 'a')).programme, 'MT OS');
  assert.equal(s.keptIntake, 1);
});

test('the stage: forwards only, REJECT never closes anybody, a hand move in Intake wins', async () => {
  const db = await openDb(':memory:');
  await add(db, 'f', { email: 'f@x.lv', status: 'Application' }); await add(db, 'r', { email: 'r@x.lv', status: 'Contacted' });
  await add(db, 'h', { email: 'h@x.lv', status: 'New' });
  await db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, actor, origin, field, old_value, new_value)
    VALUES ('h','status','note','2026-10-01T10:00:00.000Z','Ieva','manual','status','Contacted','New')`).run();
  await applyRows(db, [tab([{ name: 'F', email: 'f@x.lv', status: 'COLD' }, { name: 'R', email: 'r@x.lv', status: 'REJECTED' },
    { name: 'H', email: 'h@x.lv', status: 'HOT' }])], opts);
  assert.equal((await person(db, 'f')).status, 'Application', 'never backwards');
  assert.equal((await person(db, 'r')).status, 'Contacted', 'REJECT is a person\'s decision with a reason');
  assert.equal((await person(db, 'h')).status, 'New', 'moved by hand in Intake: it stays');
  const note = await db.prepare("SELECT body FROM events WHERE person_id = 'r' AND kind = 'note' AND subject = 'From the sheet'").get();
  assert.match(note.body, /Status: REJECTED/, 'but the sheet\'s word is on the timeline');
  assert.equal(stageOf('HOT', 'in process'), 'Application');
  assert.equal(stageOf('whatever'), null);
});

test('notes are appended to the timeline, never written over what Intake holds', async () => {
  const db = await openDb(':memory:');
  await add(db, 'n', { email: 'n@x.lv' });
  await db.prepare("UPDATE people SET notes = 'typed in Intake' WHERE id = 'n'").run();
  await applyRows(db, [tab([{ name: 'N', email: 'n@x.lv', notes: 'first' }])], opts);
  await applyRows(db, [tab([{ name: 'N', email: 'n@x.lv', notes: 'second' }])], { ...opts, now: new Date('2026-10-12T11:00:00Z') });
  assert.equal((await person(db, 'n')).notes, 'typed in Intake');
  const notes = await db.prepare("SELECT body FROM events WHERE person_id = 'n' AND kind = 'note' AND subject = 'From the sheet' ORDER BY id").all();
  assert.deepEqual(notes.map((x) => x.body), ['first', 'second']);
});

test('the next action date moves only the sheet\'s own step; a step made in Intake is never touched', async () => {
  const db = await openDb(':memory:');
  await add(db, 's', { email: 's@x.lv' }); await add(db, 'i', { email: 'i@x.lv' });
  await db.prepare(`INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES ('i','Call back','2026-10-20T06:00:00.000Z','Admissions','2026-10-10')`).run();
  await applyRows(db, [tab([{ name: 'S', email: 's@x.lv', next: '13/10/2026' }, { name: 'I', email: 'i@x.lv', next: '13/10/2026' }])], opts);
  await applyRows(db, [tab([{ name: 'S', email: 's@x.lv', next: '15/10/2026' }, { name: 'I', email: 'i@x.lv', next: '15/10/2026' }])], { ...opts, now: new Date('2026-10-12T11:00:00Z') });
  const t = (id) => db.prepare('SELECT label, due_at FROM tasks WHERE person_id = ? AND done_at IS NULL').all(id);
  assert.deepEqual((await t('s')).map((x) => [x.label, x.due_at]), [[SHEET_TASK, '2026-10-15T06:00:00.000Z']], 'one step, moved');
  assert.deepEqual((await t('i')).map((x) => [x.label, x.due_at]), [['Call back', '2026-10-20T06:00:00.000Z']]);
});

test('the count, by first-contact week: made in Intake vs sheet only (the pull or the 24.09 import made them)', async () => {
  const db = await openDb(':memory:');
  await add(db, 'intake', { email: 'in@x.lv' });
  await add(db, 'old', { email: 'old@x.lv' });
  await db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, actor, origin) VALUES ('old','channel','in','2026-03-01','${OLD_IMPORT}','automatic')`).run();
  await applyRows(db, [tab([{ name: 'In', email: 'in@x.lv', first: '06/10/2026' }, { name: 'Old', email: 'old@x.lv', first: '07/10/2026' },
    { name: 'New one', email: 'new@x.lv', first: '08/10/2026' }, { name: 'Earlier', email: 'e@x.lv', first: '29/09/2026' }, { name: 'No date', email: 'nd@x.lv' }])], opts);
  const c = await sheetCounts(db);
  assert.deepEqual(c.weeks.map((w) => [w.week, w.madeInIntake, w.sheetOnly]), [['2026-W41', 1, 2], ['2026-W40', 0, 1]]);
  assert.deepEqual(c.undated, { madeInIntake: 0, sheetOnly: 1 });
  assert.ok(!JSON.stringify(c).match(/@x\.lv|New one|Earlier|No date/), 'counts only, nobody named');
});

test('the pull: two tabs found by name, a refreshed token, GETs only to Sheets; off or not connected = it says so', async () => {
  const db = await openDb(':memory:');
  const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', CRM_SESSION_SECRET: 'test-secret-not-real-0000000000000000' };
  assert.equal((await pullSheet(db, { env, cfg: CFG })).why, 'the sheet is not connected');
  assert.equal((await pullSheet(db, { env, cfg: { ...CFG, sheetPull: { ...CFG.sheetPull, on: false } } })).ran, false);
  await saveSheetToken(db, 'refresh-not-real', env);
  const seen = [];
  const fetchImpl = async (u, o = {}) => {
    seen.push([o.method || 'GET', String(u).replace(/\?.*/, '')]);
    if (String(u).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'acc' }));
    if (String(u).includes('fields=sheets')) return new Response(JSON.stringify({ sheets: [{ properties: { title: 'NAV/ENG Admissions' } },
      { properties: { title: 'OS/MTM ADMISSIONS' } }, { properties: { title: 'NAV/ENG ADMISSIONS old' } }] }));
    const values = String(u).includes(encodeURIComponent("'NAV/ENG Admissions'")) ? [HEAD, row({ name: 'Anna Ozola', email: 'a@x.lv', first: '03/10/2026' })] : [HEAD];
    return new Response(JSON.stringify({ values }));
  };
  const r = await pullSheet(db, { env, cfg: CFG, fetchImpl, now: NOW });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.created, 1);
  assert.ok(seen.filter(([, u]) => u.includes('sheets.googleapis.com')).every(([m]) => m === 'GET'), 'reads only');
  assert.ok(!seen.some(([, u]) => u.includes('old')), 'the "... old" tab is never read');
  assert.equal((await sheetCounts(db)).lastPull.created, 1);
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('admins only, behind sign-in; the scheduled route needs CRON_SECRET; no new open route', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const [m, p] of [['GET', '/api/admin/sheet-pull'], ['POST', '/api/admin/sheet-pull/run'], ['GET', '/api/admin/sheet-pull/connect']]) {
    assert.equal((await fetch(s.base + p, { method: m, headers: { 'x-acting-as': 'Ieva' }, redirect: 'manual' })).status, 403, p);
  }
  const cron = (await import('../api/cron/sheet-pull.js')).default;
  const out = {};
  const res = { statusCode: 0, setHeader() {}, end(b) { out.body = b; }, writeHead(c) { this.statusCode = c; } };
  const prev = process.env.CRON_SECRET; process.env.CRON_SECRET = 'cron-secret-not-real-000000';
  try { await cron({ method: 'GET', headers: {} }, res); } finally { if (prev == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev; }
  assert.notEqual(res.statusCode, 200, 'no bearer, no run');
  const vc = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(vc.crons.some((c) => c.path === '/api/cron/sheet-pull'), 'scheduled');
});

test('Help center: the admin group links the sheet page, behind the admin check', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const i = APP.indexOf('async function cHelpAdmin()');
  const admin = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(admin.indexOf('href="/api/admin/sheet-pull"') > admin.indexOf('isAdmin()'));
});

test('Q86 alignment: the next action is a Follow-up step; an Intake-made Follow-up (same label) is never moved', async () => {
  const db = await openDb(':memory:');
  assert.equal(CFG.sheetPull.stepLabel, 'Follow up');
  await add(db, 'mine', { email: 'mine@x.lv' }); await add(db, 'theirs', { email: 'theirs@x.lv' });
  await db.prepare(`INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES ('theirs','Follow up','2026-10-20T06:00:00.000Z','Admissions','2026-10-10')`).run();
  await applyRows(db, [tab([{ name: 'M', email: 'mine@x.lv', next: '13/10/2026' }, { name: 'T', email: 'theirs@x.lv', next: '13/10/2026' }])], opts);
  await applyRows(db, [tab([{ name: 'M', email: 'mine@x.lv', next: '16/10/2026' }, { name: 'T', email: 'theirs@x.lv', next: '16/10/2026' }])], { ...opts, now: new Date('2026-10-12T11:00:00Z') });
  const t = (id) => db.prepare('SELECT label, due_at FROM tasks WHERE person_id = ? AND done_at IS NULL').all(id);
  assert.deepEqual((await t('mine')).map((x) => [x.label, x.due_at]), [['Follow up', '2026-10-16T06:00:00.000Z']], 'its own Follow-up, moved');
  assert.deepEqual((await t('theirs')).map((x) => [x.label, x.due_at]), [['Follow up', '2026-10-20T06:00:00.000Z']], 'the Intake one, untouched');
});

test('the old import\'s step is the sheet\'s: taken over as a Follow-up with the sheet\'s date', async () => {
  const db = await openDb(':memory:');
  await add(db, 'o', { email: 'o@x.lv' });
  await db.prepare(`INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES ('o','Get in touch (from the sheet)','2026-03-01T06:00:00.000Z','Admissions','2026-09-24')`).run();
  await applyRows(db, [tab([{ name: 'O', email: 'o@x.lv', next: '14/10/2026' }])], opts);
  const t = await db.prepare("SELECT label, due_at FROM tasks WHERE person_id = 'o' AND done_at IS NULL").all();
  assert.deepEqual(t.map((x) => [x.label, x.due_at]), [['Follow up', '2026-10-14T06:00:00.000Z']]);
});

test('the timeline says the row came from the sheet: once, with the tab and the row', async () => {
  const db = await openDb(':memory:');
  await add(db, 'l', { email: 'l@x.lv' });
  await applyRows(db, [tab([{ name: 'L', email: 'l@x.lv' }])], opts);
  await applyRows(db, [tab([{ name: 'L', email: 'l@x.lv', notes: 'later' }])], { ...opts, now: new Date('2026-10-12T11:00:00Z') });
  const ev = await db.prepare("SELECT subject, body, actor FROM events WHERE person_id = 'l' AND subject = 'Linked to the admissions sheet'").all();
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].body, ev[0].actor], ['NAV/ENG ADMISSIONS, row 3', 'Admissions sheet']);
});

test('the label is the one MAIN\'s Q86 picker writes: config.nextActions follow_up', () => {
  const step = CFG.nextActions.flatMap((g) => g.items).find((i) => i.id === 'follow_up');
  assert.equal(CFG.sheetPull.stepLabel, step.label);
  assert.equal(step.label, 'Follow up');
});

// THE STAGE 2 LISTS PER MANAGER (26.10.2026): the owner's pick A, a tab per manager, answers on the rows, no answered
// totals; "Who answered" removed. Every name, company, address and id here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-26T08:00:00.000Z';
const r = (id, sender, name, company = 'Example Shipping') => ({ ch_contact_id: id, sender, name, company, position: '', country: 'Germany', email: `${id}@example.com` });

test('the loader: a preview counts and writes nothing; apply adds, moves and marks gone, never deletes', async () => {
  const db = await openDb();
  const first = [r('C1', 'Marcis', 'Anna Example'), r('C2', 'Marcis', 'Peter Example'), r('C3', 'Alma', 'Olga Sample'), r('C4', 'JS', 'Ivan Demo')];
  const pre = await go.stage2Load(db, first, 'Ritvars');
  assert.deepEqual([pre.counts.rows, pre.counts.added, pre.counts.perSender.Marcis, pre.counts.perSender.Alma], [4, 4, 2, 1]);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_stage2').get()).n), 0, 'the preview wrote nothing');
  await go.stage2Load(db, first, 'Ritvars', { apply: true });
  const second = [r('C1', 'Marcis', 'Anna Example'), r('C2', 'Marcis', 'Peter Example'), r('C3', 'JS', 'Olga Sample')];
  const p2 = await go.stage2Load(db, second, 'Ritvars');
  assert.deepEqual([p2.counts.added, p2.counts.moved, p2.counts.gone], [0, 1, 1], 'C3 moves from Alma to JS; C4 is no longer in the split');
  await go.stage2Load(db, second, 'Ritvars', { apply: true });
  const rows = await db.prepare('SELECT ch_contact_id, sender, gone FROM tc_go_stage2 ORDER BY ch_contact_id').all();
  assert.deepEqual(rows.map((x) => [x.ch_contact_id, x.sender, Number(x.gone)]), [['C1', 'Marcis', 0], ['C2', 'Marcis', 0], ['C3', 'JS', 0], ['C4', 'JS', 1]]);
  await assert.rejects(go.stage2Load(db, [r('C9', 'Nobody', 'X')], 'Ritvars'), /unknown sender/);
  await assert.rejects(go.stage2Load(db, [r('C1', 'JS', 'A'), r('C1', 'DS', 'B')], 'Ritvars'), /twice/);
});

test('the tabs and one list: own list first, answered people first, no totals of who answered', async () => {
  const db = await openDb();
  await go.stage2Load(db, [r('C1', 'Marcis', 'Anna Example'), r('C2', 'Marcis', 'Bruno Example'), r('C3', 'Marcis', 'Carla Example'), r('C4', 'DS', 'Dina Demo')], 'Ritvars', { apply: true });
  const co = Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`).run('Example Shipping', 'example shipping', 'contacted', AT)).lastInsertRowid);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, ch_contact_id, created_at) VALUES (?,?,?,?)`).run(co, 'Carla Example', 'C3', AT);
  const tabs = await go.stage2Senders(db, { email: 'marcis.zabovs@novikontas.org', name: 'Mārcis Žabovs' });
  assert.deepEqual(tabs.senders.map((t) => [t.code, t.label, t.n]), [['Marcis', 'Mārcis', 3], ['DS', 'DS', 1]], 'only managers with a list, in the set order');
  assert.equal(tabs.mine, 'Marcis');
  assert.equal((await go.stage2Senders(db, { email: 'ritvars.vilcins@novikontas.org' })).mine, null);
  const list = await go.stage2List(db, 'Marcis', [{ chContactId: 'C3', answer: 'yes', people: 2, at: '2026-10-26T09:00:00Z' }, { chContactId: 'C4', answer: 'no', people: 0, at: '2026-10-26T10:00:00Z' }]);
  assert.deepEqual(list.map((x) => [x.name, x.answer, x.people, x.companyId]), [['Carla Example', 'yes', 2, co], ['Anna Example', null, null, null], ['Bruno Example', null, null, null]],
    'the answered person first; an answer from another manager\'s list never shows here');
  assert.deepEqual((await go.stage2List(db, 'Marcis', null)).map((x) => x.answer), [null, null, null], 'not connected: the list still shows');
  await assert.rejects(go.stage2List(db, 'Nobody'), /no such list/);
});

test('the page: tabs, search, Download; no Who answered and no answered totals; the routes are behind the gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  // the owner's pick A (26.10.2026): Stage 1 the Save the Date, then Stage 2 the RSVP, on one page
  const draw = app.slice(app.indexOf('function tcGoDraw('), app.indexOf('function tcGoStrip('));
  // the owner's pick B (29.10.2026): two tabs, Stage 2 · RSVP opens first; each tab holds only its own part
  assert.match(draw, /let T_GO_TAB = 's2';|const tab = T_GO_TAB === 's1' \? 's1' : 's2';/);
  assert.ok(draw.indexOf("tb('s1', 1, 'Stage 1 · Save the Date')") < draw.indexOf("tb('s2', 2, 'Stage 2 · RSVP')"), 'the tabs in order, 1 then 2 (the owner 29.10.2026)');
  const i1 = draw.indexOf('<!-- stage1 -->'), iBack = draw.indexOf('What came back'), i2 = draw.indexOf('<!-- stage2 -->'), iList = draw.indexOf('${tcGoStage2()}'), iShots = draw.indexOf('tcgo-shots');
  assert.ok(i1 > 0 && i1 < iBack && iBack < i2 && i2 < iList && iList < iShots, 'the Stage 1 part, then the Stage 2 part (packs + lists, then the pictures)');
  assert.match(app, /html\.ui-c \.tcfix-list, html\.ui-c #tcS2rows, html\.ui-c \.tcgo-flist\{max-height:min\(520px,60vh\);overflow:auto/);
  assert.match(draw, /<img src="\/assets\/go-stage2-email\.jpg" alt="The Stage 2 email/);
  assert.match(draw, /<a href="https:\/\/novikontas\.org\/grand-opening" target="_blank" rel="noopener"><img src="\/assets\/go-stage2-landing\.jpg"/);
  assert.match(app, /<div class="tcgo-pack"><b>\$\{esc\(x\.label\)\}<\/b><span>\$\{Number\(x\.n\)\}<\/span>\$\{state\(x\.code\) \? `<small>✓ \$\{esc\(state\(x\.code\)\)\}<\/small>` : ''\}<\/div>/);
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc.json'), 'utf8'));
  assert.equal(cfg.grandOpening.stage2.packStatus.default, 'Ready to send');
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  for (const f of ['go-stage2-email.jpg', 'go-stage2-landing.jpg', 'go-stage1-email.jpg', 'go-stage2-invite.jpg']) {
    assert.match(srv, new RegExp(`'${f.replace('.', '\.')}': 'image/jpeg'`), f + ' is on the assets allow-list');
    assert.ok(fs.statSync(path.join(ROOT, 'src', 'assets', f)).size < 150000, f + ' stays small');
  }
  const fn = app.slice(app.indexOf('function tcGoStage2('), app.indexOf('const tcGoCrumb = '));
  assert.match(fn, /<h2>Stage 2 lists<\/h2>/);
  assert.match(fn, /placeholder="Search name or company"/);
  assert.match(fn, /href="\/api\/tc\/go\/stage2\.xlsx\?sender=\$\{encodeURIComponent\(S\.code\)\}" download>Download<\/a>/);
  assert.doesNotMatch(app, /Who answered|Answered<|Coming</, 'no answered totals anywhere on the page');
  assert.match(app, /T_S2\.code = code \|\| T_S2\.code \|\| \(T_S2\.senders\.find\(\(x\) => x\.code === T_S2\.mine\) \|\| T_S2\.senders\[0\]\)\.code;/, 'opens on my own list');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  for (const route of ["p === '/api/tc/go/stage2' && req.method === 'GET'", "p === '/api/tc/go/stage2.xlsx' && req.method === 'GET'"]) assert.ok(server.indexOf(route) > gate && gate > 0, route);
  assert.match(server, /console\.log\(`tc download: \$\{me \? me\.email \|\| me\.name : 'unknown'\} stage2/);
});

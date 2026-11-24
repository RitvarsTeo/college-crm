// WAIVER + MOST LIKELY (patch 160, 20.11.2026). Waiver: Aleksejs's idea, the owner's pick "Abus": a person goes onto one shared
// list every list owner sees, a colleague who knows him takes him. Most likely: the owner who most likely knows a person comes
// first in the Pass on window. Invented companies and people.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import * as po from '../src/tcgopass.js';
import * as ml from '../src/tcmylist.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const at = '2026-11-20T10:00:00.000Z';

async function person(db, sender, name, company, email) {
  return Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, email, gone, loaded_at) VALUES (?,?,?,?,?,?,0,?)`)
    .run('W-' + name, sender, name, company, 'Manager', email, at)).lastInsertRowid);
}
const senderOf = async (db, id) => (await db.prepare('SELECT sender FROM tc_go_stage2 WHERE id = ?').get(id)).sender;

test('waiver: off the list at once, on the shared list for everyone; a colleague takes him onto his own list', async () => {
  const db = await openDb();
  const id = await person(db, 'AB', 'Pieter Voorbeeld', 'Example Dredging B.V.', 'pieter@dredge-example.nl');
  await assert.rejects(po.waive(db, 'JS', id, 'x', at), /Only the list this person is on/);
  await po.waive(db, 'AB', id, 'Aleksejs Bogdaņecs', at);
  await assert.rejects(po.waive(db, 'AB', id, 'x', at), /already on the shared list/);
  await assert.rejects(po.passOn(db, 'AB', id, 'JS', 'x', at), /on the shared list/);
  assert.equal((await ml.myList(db, 'AB')).groups.length, 0, 'gone from his list');
  const JS = await ml.myList(db, 'JS');
  assert.deepEqual(JS.shared.map((x) => [x.label, x.fromName, x.mine]), [['Pieter Voorbeeld', 'Aleksejs Bogdaņecs', false]]);
  assert.equal((await ml.myList(db, 'AB')).shared[0].mine, true, 'he sees it too, as his own');
  await po.take(db, 'JS', id, 'Jānis Sticenko', at);
  assert.equal(await senderOf(db, id), 'JS');
  assert.equal((await ml.myList(db, 'MC')).shared.length, 0, 'off the shared list');
  assert.equal((await ml.myList(db, 'JS')).groups[0].people[0].label, 'Pieter Voorbeeld');
  await assert.rejects(po.take(db, 'MC', id, 'x', at), /not on the shared list/);
});

test('most likely: the owner with people at the same company (or the same mail domain) comes first; free mail domains say nothing', async () => {
  const db = await openDb();
  const id = await person(db, 'AB', 'Karin Exempel', 'Nordic Example Shipping AS', 'karin@nordic-example.no');
  await person(db, 'MC', 'Ola Exempel', 'Nordic Example Shipping', 'ola@nordic-example.no');
  await person(db, 'JS', 'Other Person', 'Another Example Ltd', 'karin.private@gmail.com');
  await person(db, 'Alma', 'Third Person', 'Somewhere Else Ltd', 'x@nordic-example.no');
  const AB = await ml.myList(db, 'AB');
  const p = AB.groups.flatMap((g) => g.people).find((x) => x.id === id);
  assert.deepEqual(p.likely, ['MC', 'Alma'], 'same company counts double, the same domain once; never himself');
  // passed to JS: under Passed to you the ranking comes too; AB (who had him) is skipped by the page, so MC is shown first
  await po.passOn(db, 'AB', id, 'JS', 'a', at);
  const JS = await ml.myList(db, 'JS');
  assert.deepEqual(JS.passedToYou[0].likely, ['AB', 'MC', 'Alma']);
  const pick = APP.slice(APP.indexOf('function tcPoPick('), APP.indexOf('\n}\n', APP.indexOf('function tcPoPick(')));
  assert.ok(pick.includes("const best = (p.likely || []).find((c) => left0.some((o) => o.code === c)) || '';"), 'the first one still open');
});

test('wired: the page has Waiver, the shared list with Take, Most likely in Pass on; the routes check the list', () => {
  assert.ok(SERVER.includes("if (p.endsWith('/waiver')) return json(res, 200, await tcgopass.waive(db, code, Number(b.id), actor));"));
  assert.ok(SERVER.includes("if (p.endsWith('/take')) return json(res, 200, await tcgopass.take(db, code, Number(b.id), actor));"));
  assert.ok(APP.includes('onclick="tcWvAsk(${Number(p.id)})">Waiver</button>'));
  assert.ok(APP.includes('<h2>Shared list · ${tcN(L.length)}</h2>') && APP.includes('>Take onto my list</button>'));
  assert.ok(APP.includes("<em class=\"tcpo-likely\">Most likely</em>"));
  assert.ok(APP.includes("await post('/api/tc/go/mylist/waiver', { sender: T_ML.code, id });") && APP.includes("await post('/api/tc/go/mylist/take', { sender: T_ML.code, id });"));
});

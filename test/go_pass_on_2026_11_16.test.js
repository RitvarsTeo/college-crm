// PASS ON (patch 152, 16.11.2026). The owner: "the function to transfer to nominate to somebody and they have to accept of nominate
// further to some different manager, you cant nominate a person who was already nominated before by anyone else for this contact.
// if no one wants the person, it goes to Dmitrijs!" + "This weeks Thursday 17.00. Have them max two reminders. One before the min
// needed time to complete the task. and one 24h earlier". Every person and company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const ml = await import('../src/tcmylist.js');
const po = await import('../src/tcgopass.js');
const { nameKey } = await import('../src/tc.js');

const at = '2026-11-16T12:00:00.000Z';
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

async function seed(db) {
  const co = Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`)
    .run('Acta Example Offshore B.V.', nameKey('Acta Example Offshore B.V.'), 'Netherlands', 'not_contacted', at)).lastInsertRowid);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, position, email, ch_contact_id, created_at) VALUES (?,?,?,?,?,?)`).run(co, 'Ruurd Exempel', 'Vessel Superintendent', 'ruurd@acta-example.com', 'PO1', at);
  const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, email, gone, loaded_at) VALUES (?,?,?,?,?,?,0,?)`)
    .run('PO1', 'AB', 'Ruurd Exempel', 'Acta Example Offshore B.V.', 'Vessel Superintendent', 'ruurd@acta-example.com', at)).lastInsertRowid);
  return { co, id };
}
const senderOf = async (db, id) => (await db.prepare('SELECT sender FROM tc_go_stage2 WHERE id = ?').get(id)).sender;

test('pass on: he stays on the list, waiting; the other owner sees him under Passed to you; accept puts him on that list', async () => {
  const db = await openDb();
  const { co, id } = await seed(db);
  const r = await po.passOn(db, 'AB', id, 'JS', 'Aleksejs Bogdaņecs', at);
  assert.equal(r.state, 'pending');
  assert.deepEqual([r.mail.to, r.mail.subject], ['js@novikontas.org', 'Intake: Aleksejs Bogdaņecs nodeva tev Ruurd Exempel']);
  assert.equal(r.mail.text, 'Aleksejs Bogdaņecs nodeva tev Ruurd Exempel (Vessel Superintendent, Acta Example Offshore B.V.) Grand Opening ielūgumu sarakstam.\n\n'
    + 'Pieņem savā sarakstā vai nodod tālāk:\nhttps://intake.novikontas.org/#/tc/mylist/JS\n\nŠī ir automātiska Intake ziņa.\n', 'Latvian, and it says it is automated (the owner, 16.11.2026)');
  assert.equal(await senderOf(db, id), 'AB', 'still on AB\'s list while waiting');
  const AB = await ml.myList(db, 'AB');
  assert.equal(AB.groups[0].people[0].passedTo, 'Jānis Sticenko');
  const JS = await ml.myList(db, 'JS');
  assert.deepEqual(JS.passedToYou.map((x) => [x.label, x.chain, x.when]), [['Ruurd Exempel', ['Aleksejs Bogdaņecs'], 'Monday 16 November']]);
  await assert.rejects(po.accept(db, 'MC', id, 'Māris Cīrulis', at), /not passed to this list/);
  await po.accept(db, 'JS', id, 'Jānis Sticenko', at);
  assert.equal(await senderOf(db, id), 'JS');
  assert.equal((await ml.myList(db, 'JS')).passedToYou.length, 0);
  const lines = (await db.prepare('SELECT body FROM tc_activities WHERE company_id = ? ORDER BY id').all(co)).map((x) => x.body);
  assert.deepEqual(lines, ['Grand Opening: Aleksejs Bogdaņecs passed Ruurd Exempel to Jānis Sticenko',
    'Grand Opening: Jānis Sticenko accepted Ruurd Exempel onto the list (passed on by Aleksejs Bogdaņecs)']);
});

test('nobody who had him or was passed him can be picked again; when nobody is left he goes to Dmitrijs, final', async () => {
  const db = await openDb();
  const { id } = await seed(db);
  await assert.rejects(po.passOn(db, 'JS', id, 'MC', 'x', at), /Only the list this person is on/);
  await po.passOn(db, 'AB', id, 'JS', 'a', at);
  await assert.rejects(po.passOn(db, 'AB', id, 'MC', 'a', at), /Only the list this person is on/, 'AB already passed him: only JS can act now');
  await assert.rejects(po.passOn(db, 'JS', id, 'AB', 'j', at), /already with that list owner/);
  await po.passOn(db, 'JS', id, 'MC', 'j', at);
  assert.deepEqual(await po.stillOpen(db, id), ['Marcis', 'DS', 'Alma']);
  await po.passOn(db, 'MC', id, 'Marcis', 'm', at);
  await po.passOn(db, 'Marcis', id, 'Alma', 'm', at);
  await po.passOn(db, 'Alma', id, 'DS', 'a', at);
  // DS was passed him too: nobody is left, so Pass on by DS makes it final with DS
  await assert.rejects(po.passOn(db, 'DS', id, 'JS', 'd', at), /already with that list owner/);
  const fin = await po.passOn(db, 'DS', id, '', 'd', at);
  assert.equal(fin.state, 'final');
  assert.equal(fin.mail.subject, 'Intake: Ruurd Exempel tagad ir tavā Grand Opening sarakstā');
  assert.match(fin.mail.text, /neviens cits vairs nav palicis[\s\S]*Šī ir automātiska Intake ziņa\.\n$/);
  assert.equal(await senderOf(db, id), 'DS');
  await assert.rejects(po.passOn(db, 'DS', id, '', 'd', at), /Nobody else is left/);
  // a pick is needed while somebody is still left
  const db2 = await openDb(); const s2 = await seed(db2);
  await assert.rejects(po.passOn(db2, 'AB', s2.id, '', 'a', at), /Pick who/);
});

test('accepted into a company already decided on that list: the person is New there (patch 145)', async () => {
  const db = await openDb();
  const { co, id } = await seed(db);
  await db.prepare(`INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at, set_by) VALUES ('JS', ?, 'invite', 'digital', ?, 'j')`).run('id:' + co, at);
  await po.passOn(db, 'AB', id, 'JS', 'a', at);
  await po.accept(db, 'JS', id, 'j', at);
  const p = (await ml.myList(db, 'JS')).groups[0].people[0];
  assert.equal(p.fresh, true);
  assert.equal(p.decision, null);
});

test('reminders: at most two per owner, 24 h before and the time his list still needs (1 min per company, at least 30)', async () => {
  const db = await openDb();
  const end = po.deadline();
  assert.equal(end.toISOString(), '2026-11-19T15:00:00.000Z', 'Thursday 19 November 17:00 Riga');
  assert.equal(po.dueTimes(end, 10).last_call.toISOString(), '2026-11-19T14:30:00.000Z', 'at least 30 minutes');
  assert.equal(po.dueTimes(end, 200).last_call.toISOString(), '2026-11-19T11:40:00.000Z', '200 companies: 13:40 Riga');
  const open = async (code) => (code === 'JS' ? { companies: 200, passed: 1 } : code === 'MC' ? { companies: 0, passed: 0 } : { companies: 5, passed: 0 });
  const sent = [];
  const send = async (m) => { sent.push(m); return { ok: true }; };
  assert.equal((await po.sendReminders(db, open, send, new Date('2026-11-18T14:50:00Z'))).sent, 0, 'not yet');
  const a = await po.sendReminders(db, open, send, new Date('2026-11-18T15:00:00Z'));
  assert.equal(a.sent, 5, 'everyone with something open; not MC');
  assert.ok(sent.every((m) => m.subject === 'Intake: tavs Grand Opening saraksts tiek slēgts rīt plkst. 17:00'));
  assert.equal(sent.find((m) => m.to === 'js@novikontas.org').text, 'Tavs Grand Opening saraksts tiek slēgts ceturtdien, 19. novembrī, plkst. 17:00.\n\n'
    + 'Vēl jāizlemj: 200 uzņēmumi\nNodoti tev: 1 cilvēks\n\nhttps://intake.novikontas.org/#/tc/mylist/JS\n\nŠī ir automātiska Intake ziņa.\n');
  assert.match(sent.find((m) => m.to !== 'js@novikontas.org').text, /Vēl jāizlemj: 5 uzņēmumi\n\nhttps/, 'nobody passed to him: no such line');
  assert.equal((await po.sendReminders(db, open, send, new Date('2026-11-18T15:10:00Z'))).sent, 0, 'never twice');
  const b = await po.sendReminders(db, open, send, new Date('2026-11-19T11:40:00Z'));
  assert.deepEqual(b.out.map((x) => x.code), ['JS'], 'the long list gets its last call first');
  const c = await po.sendReminders(db, open, send, new Date('2026-11-19T14:30:00Z'));
  assert.equal(c.sent, 4);
  assert.ok(sent.slice(-4).every((m) => m.subject === 'Intake: tavs Grand Opening saraksts tiek slēgts šodien plkst. 17:00'));
  assert.equal(sent.filter((m) => m.to === 'js@novikontas.org').length, 2, 'two at most');
  assert.equal((await po.sendReminders(db, open, send, new Date('2026-11-19T15:00:00Z'))).sent, 0, 'after the deadline: nothing');
});

test('wired: the routes check the list, the cron runs every 10 minutes 08:00-17:50 Riga, the page has Passed to you and Pass on', () => {
  assert.match(SERVER, /\/api\/tc\/go\/mylist\/pass' \|\| p === '\/api\/tc\/go\/mylist\/accept'\) && req\.method === 'POST'\) \{\n\s+const me = await currentUser\(req\), admin = Boolean\(await adminOf\(req\)\);\n\s+const b = await body\(req\), code = String\(b\.sender \|\| ''\);\n\s+if \(!tcmylist\.mayOpen\(me, admin, code\)\) return json\(res, 403/);
  assert.equal(VERCEL.crons.find((x) => x.path === '/api/cron/go-reminders').schedule, '*/10 6-15 * * *');
  assert.ok(fs.existsSync(path.join(ROOT, 'api', 'cron', 'go-reminders.js')));
  assert.match(APP, /<h2>Passed to you · \$\{tcN\(L\.length\)\}<\/h2>/);
  assert.match(APP, /Passed to \$\{esc\(p\.passedTo\)\}, waiting/);
  assert.match(APP, /Nobody else is left: \$\{name\} goes to Dmitrijs Semjonovs/);
});

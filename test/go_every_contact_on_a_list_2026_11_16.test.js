// EVERY CONTACT ON A LIST (patch 149, 16.11.2026). His words: "ALL CONTACTS have companies. all have the same mechanism. who
// cares how they got into the contact list?"; "no email people also need to be included, but they should be mentioned physical only
// or add an email!!!!"; AB's "Do not invite" stays off; "dead are dead, withdraw them!". One rule (src/tcmylist.js placeEveryone):
// a contact not on a list goes onto the list of the owner who has its company, or back onto the list it was dropped from; a Do not
// invite / hold mark, a flagged contact and a company nobody has stay off, each counted under its reason. Every person and company
// here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const ml = await import('../src/tcmylist.js');
const { nameKey } = await import('../src/tc.js');

const at = new Date().toISOString();
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

async function seed(db) {
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`)
    .run(name, nameKey(name), 'Norway', 'not_contacted', at)).lastInsertRowid);
  const held = await co('Heldfast Example AS');     // on JS's list
  const decided = await co('Decided Example SIA');  // on DS's list, already Invite / digital
  const none = await co('Nobodys Example Ltd');     // on no list
  const kontakt = async (companyId, name, email, ch = null, extra = {}) => Number((await db.prepare(`INSERT INTO tc_company_contacts
    (company_id, name, email, ch_contact_id, source, created_at, hidden_at) VALUES (?,?,?,?,?,?,?)`)
    .run(companyId, name, email, ch, extra.source || 'excel_2026_10', at, extra.hidden || null)).lastInsertRowid);
  const row = async (sender, ch, name, company, email, gone = 0) => Number((await db.prepare(`INSERT INTO tc_go_stage2
    (ch_contact_id, sender, name, company, email, gone, loaded_at, loaded_by) VALUES (?,?,?,?,?,?,?,?)`).run(ch, sender, name, company, email, gone, at, 'test')).lastInsertRowid);
  // already on lists
  await kontakt(held, 'Olga Example', 'olga@heldfast-example.com', 'EC1'); await row('JS', 'EC1', 'Olga Example', 'Heldfast Example AS', 'olga@heldfast-example.com');
  await kontakt(decided, 'Sven Example', 'sven@decided-example.com', 'EC2'); await row('DS', 'EC2', 'Sven Example', 'Decided Example SIA', 'sven@decided-example.com');
  await db.prepare(`INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at, set_by) VALUES ('DS', ?, 'invite', 'digital', ?, 'test')`).run('id:' + decided, at);
  const ids = {
    excel: await kontakt(held, 'Pēteris Example', 'peteris@heldfast-example.com'),                  // the October Excel, company on JS's list
    noEmail: await kontakt(held, 'Nora Noemail', null),                                              // no email: Postcard only
    late: await kontakt(decided, 'Lars Late', 'lars@decided-example.com'),                          // decided company: still to decide
    nobody: await kontakt(none, 'Nils Nobody', 'nils@nobodys-example.com'),                          // nobody has the company
    dnI: await kontakt(held, 'Dina Donot', 'dina@heldfast-example.com', 'EC3'),                     // AB's Do not invite
    dead: await kontakt(held, 'Dag Dead', 'dag@heldfast-example.com', 'EC4'),                       // dead mailbox
    flagged: await kontakt(held, 'Fred Flagged', 'fred@heldfast-example.com', null, { hidden: at }), // flagged by an approver
    dropped: await kontakt(decided, 'Greta Gone', 'greta@decided-example.com', 'EC5'),              // dropped in the 28.10 reload
    same: await kontakt(decided, 'Pēteris Twin', 'peteris@heldfast-example.com'),                    // the same email as Pēteris, at another company
  };
  await row('MC', 'EC5', 'Greta Gone', 'Decided Example SIA', 'greta@decided-example.com', 1);
  const mark = (contactId, kind, why) => db.prepare(`INSERT INTO tc_invite_marks (event, send, why, kind, company_id, contact_id, marked_at, marked_by)
    VALUES ('go','all',?,?,?,?,?,'test')`).run(why, kind, held, contactId, at);
  await mark(ids.dnI, 'no', 'manager');
  await mark(ids.dead, 'no', 'dead');
  return { held, decided, none, ids };
}
const onList = (db, contactId) => db.prepare(`SELECT s.sender, s.gone, s.email, n.stage2_id AS fresh FROM tc_company_contacts k
  JOIN tc_go_stage2 s ON s.ch_contact_id = k.ch_contact_id LEFT JOIN tc_go_people_new n ON n.stage2_id = s.id AND n.settled_at IS NULL WHERE k.id = ?`).get(contactId);

test('the plan: who goes where, who stays off and why; nothing written', async () => {
  const db = await openDb();
  const { held, decided, ids } = await seed(db);
  assert.deepEqual(await ml.holders(db), { [held]: 'JS', [decided]: 'DS' });
  const P = await ml.placement(db);
  assert.deepEqual(P.place.filter((r) => r.contactId !== ids.nobody).map((r) => [r.contactId, r.code]).sort(), [[ids.excel, 'JS'], [ids.noEmail, 'JS'], [ids.late, 'DS']].sort());
  // no list has Nobodys Example and it has no course on record: not old, so divided like the rest (to the lighter list)
  // no list has Nobodys Example and it has no trainees since 2023: off (the owner, 16.11.2026 evening: business in the last 3 years only)
  assert.equal(P.left.find((r) => r.contactId === ids.nobody).label, 'No business since 2023');
  assert.deepEqual(P.revive.map((r) => [r.contactId, r.code]), [[ids.dropped, 'MC']], 'back onto the list it was dropped from');
  const left = Object.fromEntries(P.left.map((r) => [r.contactId, r.label]));
  assert.match(left[ids.dnI], /^Do not invite: A manager's decision$/);
  assert.match(left[ids.dead], /^Do not invite: /);
  assert.equal(left[ids.flagged], 'Waiting for approval');
  assert.equal(left[ids.same], 'Same email as a person already on a list');
  assert.equal(P.on, 2);
  assert.equal(await onList(db, ids.excel), undefined, 'the plan writes nothing');
});

test('placeEveryone: onto the owner\'s list; a decided company keeps its decision and the person follows it (patch 152f); the dropped come back', async () => {
  const db = await openDb();
  const { ids } = await seed(db);
  const r = await ml.placeEveryone(db, 'Test Person');
  assert.deepEqual({ placed: r.placed, revived: r.revived, left: r.left }, { placed: 3, revived: 1, left: 5 });
  assert.deepEqual(r.byList, { JS: 2, DS: 1, MC: 1 });
  assert.equal((await onList(db, ids.excel)).sender, 'JS');
  assert.equal((await onList(db, ids.late)).sender, 'DS');
  assert.ok(!(await onList(db, ids.late)).fresh, 'Decided Example was decided: the new person follows it (patch 152f), nothing to decide');
  const g = await onList(db, ids.dropped);
  assert.deepEqual([g.sender, g.gone], ['MC', 0]);
  for (const id of [ids.dnI, ids.dead, ids.flagged]) assert.equal(await onList(db, id), undefined, 'stays off');
  const L = await ml.myList(db, 'DS');
  const lars = L.groups.flatMap((x) => x.people).find((p) => p.email === 'lars@decided-example.com');
  assert.equal(lars.decision, 'invite', 'follows the company (his pick: People follow company, 16.11.2026)');
  const again = await ml.placeEveryone(db, 'Test Person');
  assert.deepEqual({ placed: again.placed, revived: again.revived }, { placed: 0, revived: 0 }, 'a second run changes nothing');
});

test('no email: on the list as Postcard only; Add email puts it on the list and on the Intake contact', async () => {
  const db = await openDb();
  const { ids } = await seed(db);
  await ml.placeEveryone(db, 'Test Person');
  const L = await ml.myList(db, 'JS');
  const nora = L.groups.flatMap((x) => x.people).find((p) => p.label === 'Nora Noemail');
  assert.equal(nora.postcard, true);
  assert.equal(L.groups.flatMap((x) => x.people).find((p) => p.email === 'peteris@heldfast-example.com').postcard, false);
  await assert.rejects(ml.addEmail(db, 'JS', nora.id, 'not an email', 'Test Person'), /does not look right/);
  await assert.rejects(ml.addEmail(db, 'DS', nora.id, 'nora@heldfast-example.com', 'Test Person'), /not on this list/);
  await assert.rejects(ml.addEmail(db, 'JS', nora.id, 'olga@heldfast-example.com', 'Test Person'), /already on the list of/);
  assert.deepEqual(await ml.addEmail(db, 'JS', nora.id, ' Nora@Heldfast-Example.com ', 'Test Person'), { ok: true, email: 'nora@heldfast-example.com' });
  assert.equal((await db.prepare('SELECT email FROM tc_company_contacts WHERE id = ?').get(ids.noEmail)).email, 'nora@heldfast-example.com');
  const after = (await ml.myList(db, 'JS')).groups.flatMap((x) => x.people).find((p) => p.label === 'Nora Noemail');
  assert.equal(after.postcard, false);
  await assert.rejects(ml.addEmail(db, 'JS', nora.id, 'other@heldfast-example.com', 'Test Person'), /already has an email/);
});

test('the postcard list: an invited Postcard only person of a digital company goes by mail', async () => {
  const db = await openDb();
  const { decided } = await seed(db);
  const ch = 'intake:x1';
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(decided, 'Pia Post', null, ch, at);
  await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, gone, loaded_at) VALUES (?,?,?,?,?,0,?)`).run(ch, 'DS', 'Pia Post', 'Decided Example SIA', null, at);
  const rows = await ml.postcardRows(db, ['DS']);
  assert.deepEqual(rows.map((r) => [r.person, r.way]), [['Pia Post', 'post']], 'Sven has an email: the digital send; Pia: by mail');
});

test('the people off every list: grouped by reason, each with name and company', async () => {
  const db = await openDb();
  await seed(db);
  await ml.placeEveryone(db, 'Test Person');
  const G = await ml.leftOff(db);
  const by = Object.fromEntries(G.map((g) => [g.label, g.n]));
  assert.equal(by['Waiting for approval'], 1);
  // 3: once Pēteris is on JS's list, his twin's address is on a list too (one address, one invitation); Nobodys Example went on
  assert.equal(G.reduce((a, g) => a + g.n, 0), 4, 'and Nobodys Example: no business since 2023');
  assert.ok(G.every((g) => g.people.every((p) => p.company && p.companyId)));
});

test('patch 151, back to the original lists: no import or approval puts anyone on a list; the page shows the tag, the box and the left-off', () => {
  assert.equal((SERVER.match(/placeEveryone/g) || []).length, 0, 'the owner 16.11.2026: "we need to get back to the original list"');
  assert.match(SERVER, /\/api\/tc\/go\/mylist\/email/);
  assert.match(SERVER, /if \(p === '\/api\/tc\/go\/leftoff' && req\.method === 'GET'\) \{\n\s+if \(!\(await adminOf\(req\)\)\) return json\(res, 403/, 'admins only');
  assert.match(APP, /<em class="tcml-pc">Postcard only<\/em>/);
  assert.match(APP, /class="tcml-addmail" onsubmit="tcMlAddEmail\(event/);
  assert.match(APP, /Not on a Grand Opening list · \$\{tcGoN\(total\)\}/);
});

test('company mailboxes stay off; one that is the only contact of its company goes on only with a course since 2023; the same person twice is one; a daughter goes with its mother', async () => {
  const db = await openDb();
  const { held, none } = await seed(db);
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`)
    .run(name, nameKey(name), 'Latvia', 'not_contacted', at)).lastInsertRowid);
  const kontakt = async (companyId, name, email) => Number((await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, source, created_at)
    VALUES (?,?,?,?,?)`).run(companyId, name, email, 'excel_2026_10', at)).lastInsertRowid);
  const lonely = await co('Lonely Example SIA'), daughter = await co('Heldfast Example Riga SIA');
  const fam = Number((await db.prepare(`INSERT INTO tc_families (parent_id, created_at) VALUES (?,?)`).run(held, at)).lastInsertRowid);
  await db.prepare(`INSERT INTO tc_family_members (family_id, company_id, added_at) VALUES (?,?,?)`).run(fam, daughter, at);
  const ids = {
    info: await kontakt(held, null, 'info@heldfast-example.com'),            // a person of Heldfast is on JS's list
    crewing2: await kontakt(held, null, 'crewing2@heldfast-example.com'),    // a department mailbox, a trailing number
    lonely: await kontakt(lonely, null, 'office@lonely-example.com'),         // the only contact of its company
    twin: await kontakt(held, 'Olga Example', null),                          // Olga is on JS's list already: the same person
    riga: await kontakt(daughter, 'Rita Riga', 'rita@heldfast-example.lv'),   // the daughter company: its mother is on JS's list
  };
  assert.equal(ml.isCompanyMailbox('Info@x.com'), true);
  assert.equal(ml.isCompanyMailbox('crewing2@x.com'), true);
  assert.equal(ml.isCompanyMailbox('ingrid.info@x.com'), false, 'a person whose address has the word in it');
  const P = await ml.placement(db);
  const left = Object.fromEntries(P.left.map((r) => [r.contactId, r.label]));
  assert.equal(left[ids.info], 'Do not invite: Company mailbox, not a person');
  assert.equal(left[ids.crewing2], 'Do not invite: Company mailbox, not a person');
  assert.equal(left[ids.lonely], 'Only a company mailbox', 'no course since 2023: off (his pick: only the ones with a course since 2023 go on)');
  await db.prepare(`INSERT INTO tc_company_courses (company_id, year, attendees, source, recorded_at) VALUES (?,?,?,?,?)`).run(lonely, 2024, 3, 'excel_2026_10', at);
  const P2 = await ml.placement(db);
  assert.equal(P2.place.filter((r) => r.contactId === ids.lonely).length, 1, 'a course in 2024: the mailbox goes on as the contact of its company');
  assert.equal(left[ids.twin], 'Same person as one already on a list');
  assert.deepEqual(P.place.filter((r) => r.contactId === ids.riga).map((r) => r.code), ['JS'], 'with its mother, on JS\'s list');
  assert.equal((await ml.holders(db))[daughter], 'JS');
  assert.equal((await ml.holders(db))[none], undefined);
});

test('the companies no list has (16.11.2026 evening): business in the last 3 years only; C level to Dmitrijs, offshore / renewables to Alma, anyone else to Mārcis', async () => {
  const db = await openDb();
  await seed(db);
  const co = async (name, extra = {}) => {
    const id = Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, pic_email, status, created_at) VALUES (?,?,?,?,?,?)`)
      .run(name, nameKey(name), extra.country || 'Norway', extra.pic || null, 'not_contacted', at)).lastInsertRowid);
    if (extra.area) await db.prepare('INSERT INTO tc_company_areas (company_id, area) VALUES (?,?)').run(id, extra.area);
    if (extra.year) await db.prepare(`INSERT INTO tc_company_courses (company_id, year, attendees, source, recorded_at) VALUES (?,?,?,?,?)`).run(id, extra.year, extra.n ?? 2, 'excel_2026_10', at);
    return id;
  };
  const kontakt = async (companyId, name, email, position = null) => Number((await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, position, email, source, created_at)
    VALUES (?,?,?,?,?,?)`).run(companyId, name, position, email, 'excel_2026_10', at)).lastInsertRowid);
  const wind = await co('Northwind Example AS', { year: 2025 });
  const opito = await co('Plainname Example AS', { year: 2024, area: 'OPITO' });
  const old = await co('Oldtimer Example AS', { year: 2021 });
  const zero = await co('Zero Example AS', { year: 2025, n: 0 });
  const pic = await co('Picked Example SIA', { year: 2024, pic: 'mc@novikontas.org', country: 'Latvia' });
  const dom = await co('Heldfast Example Bergen AS', { year: 2023 });   // the same email domain as Heldfast, on JS's list - but JS takes no new
  const ids = {
    wind: await kontakt(wind, 'Wenche Wind', 'wenche@northwind-example.no'),
    ceo: await kontakt(wind, 'Carl Chief', 'carl@northwind-example.no', 'CEO'),
    opito: await kontakt(opito, 'Odd Opito', 'odd@plainname-example.no'),
    old: await kontakt(old, 'Olav Old', 'olav@oldtimer-example.no'),
    zero: await kontakt(zero, 'Zara Zero', 'zara@zero-example.no'),
    pic: await kontakt(pic, 'Pauls Pic', 'pauls@picked-example.lv'),
    dom: await kontakt(dom, 'Dag Domain', 'dag@heldfast-example.com'),
  };
  const P = await ml.placement(db);
  const to = Object.fromEntries(P.place.map((r) => [r.contactId, [r.code, r.why]]));
  const left = Object.fromEntries(P.left.map((r) => [r.contactId, r.label]));
  // the owner, 16.11.2026 evening: Training Centre only -> offshore / renewables to Alma, C level to Dmitrijs, anyone else to Mārcis
  assert.deepEqual(to[ids.wind], ['Alma', 'Training Centre client, offshore / renewables']);
  assert.deepEqual(to[ids.ceo], ['DS', 'Training Centre client, C level: our CEO']);
  assert.equal(to[ids.opito][0], 'Alma', 'an OPITO area is offshore');
  assert.equal(left[ids.old], 'Last course 2021', 'proven old business: off');
  assert.equal(left[ids.zero], 'No business since 2023', 'a year with 0 trainees is no business');
  assert.deepEqual(to[ids.pic], ['Marcis', 'Training Centre client: the Director of the Training Centre'], 'the person in charge no longer decides');
  assert.deepEqual(to[ids.dom], ['Marcis', 'Training Centre client: the Director of the Training Centre']);
  const r = await ml.placeEveryone(db, 'Test Person');
  assert.ok(r.byList.Alma >= 2);
  const line = await db.prepare(`SELECT body FROM tc_activities WHERE body LIKE '%offshore / renewables%'`).get();
  assert.equal(line.body, "Added to the Grand Opening list of Aleksejs Maļinovskis (Training Centre client, offshore / renewables)", "the reason is on the History line");
});

test('patch 151: whoever the rule would place shows on the Grand Opening page as Not on a list yet, with a company to click', async () => {
  const db = await openDb();
  const { ids } = await seed(db);
  const G = await ml.leftOff(db);
  const yet = G.find((g) => g.label === ml.NOT_YET);
  assert.ok(yet, 'Not on a list yet');
  // the October Excel person, the no-email one, the late one, Nobodys Example and the dropped one: nobody placed them
  assert.equal(yet.n, 4, 'Nobodys Example has no business since 2023: off for that reason, not Not on a list yet');
  assert.ok(yet.people.every((p) => p.companyId && p.company));
  assert.equal(G.reduce((a, g) => a + g.n, 0), 4 + 5, 'plus the five kept off for their own reasons (Do not invite, dead, flagged, the same email twice, no business)');
  assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM tc_go_stage2 WHERE loaded_by = 'Test Person'`).get()).n, 0, 'leftOff writes nothing');
  assert.ok(ids.excel);
});

test('an owner\'s unsaved draft survives the re-placing: it still opens, and nobody is marked to decide (patch 152f)', async () => {
  const db = await openDb();
  const { held, ids } = await seed(db);
  // JS marked Heldfast Example as Invite / digital in his draft and never pressed Save (as AB and Alma did, 16.11.2026)
  const state = { picks: { ['id:' + held]: { decision: 'invite', way: 'digital' } }, out: [], moves: {}, settled: [] };
  await ml.saveDraft(db, 'JS', state, 'Jānis Sticenko', 0, 'js@novikontas.org');
  assert.ok((await ml.myList(db, 'JS', 'js@novikontas.org')).draft, 'the draft opens before');
  await ml.placeEveryone(db, 'Test Person');
  const L = await ml.myList(db, 'JS', 'js@novikontas.org');
  assert.ok(L.draft, 'the draft still opens after: no Save happened, so its base is still the saved version');
  assert.deepEqual(L.draft.state.picks, state.picks, 'his marks unchanged');
  const p = L.groups.flatMap((g) => g.people).find((x) => x.email === 'peteris@heldfast-example.com');
  assert.equal(p.fresh, false, 'nobody is marked to decide (patch 152f): he follows the company once the draft is saved');
  assert.equal(L.groups.flatMap((g) => g.people).find((x) => x.label === 'Nora Noemail').fresh, false);
  assert.ok(ids.excel);
});

// AFTER THE ANSWER (05.11.2026): Reminder 1 (You're in / See you soon gone with the place codes, 12.11.2026). Every person and company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
const { openDb } = await import('../src/db.js');
const gm = await import('../src/tcgomail.js');
const { mime } = await import('../src/tcs2send.js');

const add = async (db, id, company, email) => {
  const r = await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(id, 'JS', 'Anna ' + id, 'Anna', company, '', 'Norway', email, 'lc' + id, new Date().toISOString(), 'test');
  return Number(r.lastInsertRowid);
};

test('Reminder 1 as drafted (his "OK, build them"); You are in and See you soon are gone with the place codes (12.11.2026, his pick "Yes, build it": Stage 3 is the ticket)', async () => {
  assert.deepEqual(gm.KINDS, ['r1']);
  const r1 = gm.mailFor('r1', { first: 'Anna', linkCode: 'ab12cd' });
  assert.match(r1.html, /A quick reminder from me: I would still be glad to welcome you there\.<br><br>Will you be there\?/);
  assert.match(r1.plain, /A quick reminder from me: I would still be glad to welcome you there\.\n\nWill you be there\?/);
  assert.doesNotMatch(r1.html, /we open the new/);
  assert.match(r1.html, /c=ab12cd&rsvp=yes/);
  const db = await openDb();
  const b = await add(db, 'M2', 'Other Example AS', 'm2@example.com');
  const c = await add(db, 'M3', 'Third Example AS', 'm3@example.com');
  await db.prepare(`INSERT INTO tc_go_s2_sent (stage2_id, sender, mail_kind, result, sent_at, sent_by) VALUES (?,?,?,?,?,?)`).run(c, 'JS', 'invite', 'sent', '2026-10-01T10:00:00Z', 't');
  await db.prepare(`INSERT INTO tc_go_s2_sent (stage2_id, sender, mail_kind, result, sent_at, sent_by) VALUES (?,?,?,?,?,?)`).run(b, 'JS', 'invite', 'sent', new Date().toISOString(), 't');
  assert.deepEqual((await gm.due(db, 'r1', [])).map((p) => p.id), [c]);
  assert.deepEqual(await gm.due(db, 'in', []), []);
  const o = await gm.overview(db, []);
  assert.deepEqual(Object.keys(o), ['r1']); assert.equal(o.r1.blocked, '');
  assert.equal((await gm.sendNext(db, 'in', 'JS', [], { name: 'Ritvars' })).ok, false);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_places').get()).n), 0, 'nothing gives a place any more');
});

test('06.11 his decision "all stage 2 emails will be like from a personal manager": the owner signs every one, the picture keeps both dates', async () => {
  const { s2Mail } = await import('../src/tcs2mail.js');
  // his answers 06.11.2026: signature "Name only"; "i wanted to write to you personally is not ok"
  const from = { name: 'Jānis Sticenko', title: 'Director of Communications' };
  for (const k of ['confirm', 'invite', 'new']) {
    const m = s2Mail(k, 'Anna', 'ab12cd', { from });
    assert.match(m.html, /Jānis Sticenko<br>Novikontas Academy/);
    assert.doesNotMatch(m.html, /Director of Communications/);
    assert.doesNotMatch(m.html, /personally/);
    assert.match(m.html, /5791191e-9348-b914-d4e1-8f7027aa609e\.jpg/);
    assert.match(m.plain, /Jānis Sticenko\nNovikontas Academy/);
    assert.match(m.html, /c=ab12cd&rsvp=yes/);
  }
  assert.match(s2Mail('invite', 'Anna', 'x', { from }).html, /Dear Anna,<br><br>Our first invitation may not have reached you, so here it is again\. It would mean a lot to me to welcome you there\./);
  assert.match(s2Mail('new', 'Anna', 'x', { from }).html, /Dear Anna,<br><br>It would mean a lot to me to welcome you there\./);
  assert.match(gm.mailFor('r1', { first: 'Anna', linkCode: 'zz' }, from).html, /Jānis Sticenko<br>Novikontas Academy/);
  assert.match(gm.mailFor('r1', { first: 'Anna', linkCode: 'zz' }, from).html, /A quick reminder from me/);
});

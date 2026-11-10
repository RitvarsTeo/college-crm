// AFTER THE ANSWER (05.11.2026): You're in / Reminder 1 / See you soon. Every person and company here is invented.
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

test('the texts as drafted (his "OK, build them"): place, QR, the door line; the reminder line on Reminder 1', () => {
  const m = gm.mailFor('in', { first: 'Anna', company: 'Example AS', code: '13H' });
  assert.equal(m.subject, "You're in: Novikontas Academy Grand Opening, 27 May 2027");
  assert.match(m.html, /Dear Anna,<br><br>Thank you for your Yes, I am glad you will be with us\. Example AS's place in the Grand Opening puzzle is <b>13H<\/b>\./);
  assert.match(m.html, /src="cid:qr"/);
  assert.match(m.html, /Show this QR at the door on 27 May 2027, Novikontas Academy Campus, Duntes iela 17d, Riga\./);
  const r2 = gm.mailFor('r2', { first: 'Anna', company: 'Example AS', code: '13H' });
  assert.match(r2.html, /See you soon. Example AS's place in the Grand Opening puzzle is <b>13H<\/b>\./);
  const r1 = gm.mailFor('r1', { first: 'Anna', linkCode: 'ab12cd' });
  assert.match(r1.html, /A quick reminder from me\./);
  assert.match(r1.html, /c=ab12cd&rsvp=yes/);
  const raw = mime({ fromName: 'X', fromEmail: 'x@example.com', to: 'a@example.com', mail: m });
  assert.match(raw, /Content-ID: <qr>/);
  // 06.11.2026, his words "THE qr's we will allow the AMento to create": no QR image of ours anywhere
  assert.equal(gm.qrPng('32AF'), null);
  assert.doesNotMatch(gm.preview('in').html, /<img src="" /);
});

test('who is due: You are in = Yes with a place, once; See you soon only after You are in; Reminder 1 = sent 21+ days, no answer', async () => {
  const db = await openDb();
  const a = await add(db, 'M1', 'Mail Example AS', 'm1@example.com');
  const b = await add(db, 'M2', 'Other Example AS', 'm2@example.com');
  const c = await add(db, 'M3', 'Third Example AS', 'm3@example.com');
  await db.prepare(`INSERT INTO tc_go_s2_sent (stage2_id, sender, mail_kind, result, sent_at, sent_by) VALUES (?,?,?,?,?,?)`).run(c, 'JS', 'invite', 'sent', '2026-10-01T10:00:00Z', 't');
  await db.prepare(`INSERT INTO tc_go_s2_sent (stage2_id, sender, mail_kind, result, sent_at, sent_by) VALUES (?,?,?,?,?,?)`).run(b, 'JS', 'invite', 'sent', new Date().toISOString(), 't');
  const answers = [{ chContactId: 'M1', answer: 'yes', people: 1, at: '2026-11-01T10:00:00Z' }];
  const din = await gm.due(db, 'in', answers);
  assert.deepEqual(din.map((p) => p.id), [a]);
  assert.match(din[0].code, /^\d+[A-Z]+$/);
  assert.deepEqual((await gm.due(db, 'r2', answers)).map((p) => p.id), []);
  assert.deepEqual((await gm.due(db, 'r1', answers)).map((p) => p.id), [c]);
  await db.prepare(`INSERT INTO tc_go_mails (stage2_id, kind, sender, result, sent_at) VALUES (?,?,?,?,?)`).run(a, 'in', 'JS', 'sent', new Date().toISOString());
  assert.deepEqual((await gm.due(db, 'in', answers)).map((p) => p.id), []);
  assert.deepEqual((await gm.due(db, 'r2', answers)).map((p) => p.id), [a]);
  const o = await gm.overview(db, answers);
  assert.match(o.in.blocked, /^On hold: the QR codes come from Amento/);
  assert.match(o.r2.blocked, /^On hold/);
  assert.equal(o.r1.blocked, '');
  for (const k of ['in', 'r2']) {
    const s = await gm.sendNext(db, k, 'JS', answers, { name: 'Ritvars' });
    assert.equal(s.ok, false); assert.match(s.why, /On hold.*Nothing was sent/);
  }
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
  for (const k of ['in', 'r2']) assert.match(gm.mailFor(k, { first: 'Anna', company: 'X', code: '1A' }, 'cid:qr', from).html, /Jānis Sticenko<br>Novikontas Academy/);
  assert.match(gm.mailFor('r1', { first: 'Anna', linkCode: 'zz' }, 'cid:qr', from).html, /A quick reminder from me/);
});

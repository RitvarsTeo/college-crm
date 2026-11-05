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
  assert.match(m.html, /Dear Anna,<br>thank you for your Yes\. Example AS's place in the Grand Opening puzzle is <b>13H<\/b>\./);
  assert.match(m.html, /src="cid:qr"/);
  assert.match(m.html, /Show this QR at the door on 27 May 2027, Novikontas Academy Campus, Duntes iela 17d, Riga\./);
  assert.ok(m.inline[0].bytes.length > 100);
  const r2 = gm.mailFor('r2', { first: 'Anna', company: 'Example AS', code: '13H' });
  assert.match(r2.html, /See you on 27 May 2027\. Example AS's place in the puzzle is <b>13H<\/b>\./);
  const r1 = gm.mailFor('r1', { first: 'Anna', linkCode: 'ab12cd' });
  assert.match(r1.html, /A quick reminder: will you be there\?/);
  assert.match(r1.html, /c=ab12cd&rsvp=yes/);
  const raw = mime({ fromName: 'X', fromEmail: 'x@example.com', to: 'a@example.com', mail: m });
  assert.match(raw, /Content-ID: <qr>/);
  assert.equal(gm.qrPng('99Z'), null);
  assert.equal(gm.qrPng('32AF').subarray(1, 4).toString(), 'PNG');
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
  assert.equal(o.in.blocked, 'The digital piece design is not picked yet.');
  assert.equal(o.r1.blocked, '');
  const s = await gm.sendNext(db, 'in', 'JS', answers, { name: 'Ritvars' });
  assert.equal(s.ok, false); assert.match(s.why, /not picked yet/);
});

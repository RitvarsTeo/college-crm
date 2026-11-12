// STAGE 2 SENDING FROM INTAKE (30.10.2026): the owner's pick. Gmail is faked; nothing is sent; every person is invented.
import test from 'node:test';
import assert from 'node:assert/strict';

const { openDb } = await import('../src/db.js');
const notify = await import('../lib/notify.js');
const s2 = await import('../src/tcs2send.js');
const { s2Mail } = await import('../src/tcs2mail.js');
const ml = await import('../src/tcmylist.js');
const ENV = { CRM_SESSION_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
const ME = { email: 'ritvars.vilcins@novikontas.org', name: 'Ritvars' };

function fakeGmail({ scope = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic', aliases = ['marcis.zabovs@novikontas.org'] } = {}) {
  const sent = [];
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (url, opt = {}) => {
    if (String(url).includes('/token')) return reply({ access_token: 'acc', scope });
    if (String(url).endsWith('/settings/sendAs')) return reply({ sendAs: [{ sendAsEmail: ME.email, isPrimary: true }, ...aliases.map((a) => ({ sendAsEmail: a, verificationStatus: 'accepted' }))] });
    if (String(url).endsWith('/messages/send')) { sent.push(Buffer.from(JSON.parse(opt.body).raw, 'base64url').toString('utf8')); return reply({ id: 'm' + sent.length }); }
    return reply({}, 404);
  };
  return { fetchImpl, sent };
}
async function seeded(digital = true) {
  const db = await openDb();
  await notify.saveToken(db, '1//refresh', ENV);
  for (let i = 1; i <= 15; i++) {
    await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, email, first_name, link_code, mail_kind, loaded_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('C' + i, 'Marcis', 'Person ' + i, `p${i}@example.com`, 'Person', 'code' + String(i).padStart(2, '0'), i % 2 ? 'confirm' : 'invite', '2026-10-30T08:00:00Z');
  }
  await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, email, loaded_at) VALUES (?,?,?,?,?)`).run('C99', 'JS', 'No Code', 'nc@example.com', '2026-10-30T08:00:00Z');
  // the full flow (12.11.2026): the send goes only to the people the owner saved as Invite + Digital on My Grand Opening list
  if (digital) await ml.saveState(db, 'Marcis', { picks: { 'n:': { decision: 'invite', way: 'digital' } }, out: [], moves: {} }, 'Mārcis Žabovs');
  if (digital) await ml.saveState(db, 'JS', { picks: { 'n:': { decision: 'invite', way: 'digital' } }, out: [], moves: {} }, 'Jānis Sticenko');
  return db;
}

test('the three emails, personal from the list owner, in the landing page design (10.11): subject, personal link, no inline picture', () => {
  const c = s2Mail('confirm', 'Anna', 'abc123'), i = s2Mail('invite', 'Anna', 'abc123'), n = s2Mail('new', '', 'abc123');
  assert.equal(c.subject, '27 May 2027: will you join me at the Novikontas Academy Grand Opening?');
  assert.equal(i.subject, 'You are invited: Novikontas Academy Grand Opening, 27 May 2027');
  assert.match(c.html, /https:\/\/novikontas\.org\/grand-opening\?c=abc123&rsvp=yes/);
  assert.match(i.html, /may not have reached you/); assert.doesNotMatch(n.html, /may not have reached you/); assert.match(n.html, /Hello,/);
  assert.equal(c.inline, null); assert.equal(i.inline, null);
  const raw = s2.mime({ fromName: 'Mārcis Žabovs', fromEmail: 'marcis.zabovs@novikontas.org', to: 'a@example.com', mail: c });
  assert.doesNotMatch(raw, /Content-ID:/); assert.match(raw, /Reply-To: marcis\.zabovs@novikontas\.org/);
});

test('an address that is not a confirmed "Send mail as" sends nothing; without the settings permission nothing either', async () => {
  const db = await seeded();
  const G = fakeGmail({ aliases: [] });
  const r = await s2.sendNext(db, 'Marcis', 'b-test-0001', ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.equal(r.ok, false); assert.match(r.why, /not a confirmed "Send mail as"/); assert.equal(G.sent.length, 0);
  const G2 = fakeGmail({ scope: 'https://www.googleapis.com/auth/gmail.send' });
  assert.match((await s2.sendNext(db, 'Marcis', 'b-test-0002', ME, { env: ENV, fetchImpl: G2.fetchImpl })).why, /Connect sending again/);
  assert.equal(G2.sent.length, 0);
});

test('send next: 10 a call from the alias, each marked, never twice; the log counts them; a test goes only to me', async () => {
  const db = await seeded();
  const G = fakeGmail();
  const a = await s2.sendNext(db, 'Marcis', 'b-test-0003', ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.deepEqual([a.ok, a.sent, a.refused, a.left], [true, 10, 0, 5]);
  assert.match(G.sent[0], /^From: =\?UTF-8\?B\?[^?]+\?= <marcis\.zabovs@novikontas\.org>/m);
  assert.match(G.sent[0], /To: p1@example\.com/);
  const b = await s2.sendNext(db, 'Marcis', 'b-test-0003', ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.deepEqual([b.sent, b.left, b.done], [5, 0, true]);
  const c = await s2.sendNext(db, 'Marcis', 'b-test-0004', ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.equal(c.sent, 0, 'nobody twice');
  assert.equal(new Set(G.sent.map((m) => m.match(/^To: (.+)$/m)[1])).size, 15);
  const O = await s2.overview(db, { env: ENV, fetchImpl: G.fetchImpl });
  const m = O.senders.find((x) => x.code === 'Marcis');
  assert.deepEqual([m.n, m.sent, m.left, m.confirmed], [15, 15, 0, true]);
  assert.equal(O.log.filter((l) => l.what === 'batch').reduce((n, l) => n + l.sent, 0), 15);
  const before = G.sent.length;
  const t = await s2.sendTest(db, 'Marcis', ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.deepEqual([t.ok, t.sent], [true, 2]);
  assert.ok(G.sent.slice(before).every((x) => /To: ritvars\.vilcins@novikontas\.org/.test(x)));
  assert.equal(O.senders.find((x) => x.code === 'JS').noCode, 1, 'a person without a personal link is never sent');
});

test('10.11 his pick L1: the landing page card on top (photo, band, Grand Opening, date block, black Yes), no calendar line, no repeat in the note', () => {
  const c = s2Mail('confirm', 'Anna', 'abc123', { from: { name: 'Mārcis Žabovs' } }), i = s2Mail('invite', 'Anna', 'abc123', { from: { name: 'Mārcis Žabovs' } });
  for (const m of [c, i]) {
    assert.match(m.html, /5791191e-9348-b914-d4e1-8f7027aa609e\.jpg/);
    assert.match(m.html, />You are invited<\/td>/);
    assert.match(m.html, />Grand Opening<\/div>/);
    assert.match(m.html, />27 May 2027<\/div>/);
    assert.match(m.html, /Novikontas Academy Campus, Duntes iela 17d, Riga/);
    assert.match(m.html, /background:#011111"><a href="https:\/\/novikontas\.org\/grand-opening\?c=abc123&rsvp=yes"[^>]*>Yes, I&#39;ll attend<\/a>/);
    assert.doesNotMatch(m.html, /calendar/i); assert.doesNotMatch(m.plain, /calendar/i);
    assert.doesNotMatch(m.html, /we open the new/);
    assert.match(m.plain, /^You are invited to the Grand Opening of Novikontas Academy\n27 May 2027, Novikontas Academy Campus, Duntes iela 17d, Riga/);
  }
  assert.match(c.html, /Dear Anna,<br><br>You saved the date for our Grand Opening, and I would be glad to welcome you there myself\.<br><br>Will you join us\? It takes one minute to confirm\./);
  assert.match(i.html, /Dear Anna,<br><br>Our first invitation may not have reached you, so here it is again\. It would mean a lot to me to welcome you there\.<br><br>Will you join us\?/);
});

test('12.11 the full flow: without a saved Invite + Digital from the owner nobody is sent the Stage 2 email; a person tapped out is not sent', async () => {
  const none = await seeded(false);
  const G = fakeGmail();
  const r = await s2.sendNext(none, 'Marcis', 'b-test-0101', ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.equal(r.sent, 0); assert.equal(G.sent.length, 0);
  assert.equal((await s2.overview(none, { env: ENV, fetchImpl: G.fetchImpl })).senders.find((x) => x.code === 'Marcis').n, 0);
  const db = await seeded(false);
  const one = Number((await db.prepare("SELECT id FROM tc_go_stage2 WHERE ch_contact_id = 'C1'").get()).id);
  await ml.saveState(db, 'Marcis', { picks: { 'n:': { decision: 'invite', way: 'digital' } }, out: [one], moves: {} }, 'M');
  const G2 = fakeGmail();
  await s2.sendNext(db, 'Marcis', 'b-test-0102', ME, { env: ENV, fetchImpl: G2.fetchImpl });
  await s2.sendNext(db, 'Marcis', 'b-test-0102', ME, { env: ENV, fetchImpl: G2.fetchImpl });
  assert.equal(G2.sent.length, 14); assert.ok(!G2.sent.some((m) => /To: p1@example\.com/.test(m)));
  await ml.saveState(db, 'Marcis', { picks: { 'n:': { decision: 'invite', way: 'post' } }, out: [], moves: {} }, 'M');   // postcards, not email
  assert.equal((await s2.overview(db, { env: ENV, fetchImpl: G2.fetchImpl })).senders.find((x) => x.code === 'Marcis').n, 0);
});

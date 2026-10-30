// STAGE 2 SENDING FROM INTAKE (30.10.2026): the owner's pick. Gmail is faked; nothing is sent; every person is invented.
import test from 'node:test';
import assert from 'node:assert/strict';

const { openDb } = await import('../src/db.js');
const notify = await import('../lib/notify.js');
const s2 = await import('../src/tcs2send.js');
const { s2Mail } = await import('../src/tcs2mail.js');
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
async function seeded() {
  const db = await openDb();
  await notify.saveToken(db, '1//refresh', ENV);
  for (let i = 1; i <= 15; i++) {
    await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, email, first_name, link_code, mail_kind, loaded_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('C' + i, 'Marcis', 'Person ' + i, `p${i}@example.com`, 'Person', 'code' + String(i).padStart(2, '0'), i % 2 ? 'confirm' : 'invite', '2026-10-30T08:00:00Z');
  }
  await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, email, loaded_at) VALUES (?,?,?,?,?)`).run('C99', 'JS', 'No Code', 'nc@example.com', '2026-10-30T08:00:00Z');
  return db;
}

test('the three emails are the Apps Script ones: subject, personal link, the building inline only for confirm', () => {
  const c = s2Mail('confirm', 'Anna', 'abc123'), i = s2Mail('invite', 'Anna', 'abc123'), n = s2Mail('new', '', 'abc123');
  assert.equal(c.subject, 'Novikontas Academy Grand Opening, 27 May 2027 - will you be there?');
  assert.equal(i.subject, 'You are invited: Novikontas Academy Grand Opening, 27 May 2027');
  assert.match(c.html, /https:\/\/novikontas\.org\/grand-opening\?c=abc123&rsvp=yes/);
  assert.match(i.html, /may not have reached you/); assert.doesNotMatch(n.html, /may not have reached you/); assert.match(n.html, /Hello,/);
  assert.equal(c.inline, 'building'); assert.equal(i.inline, null);
  const raw = s2.mime({ fromName: 'Mārcis Žabovs', fromEmail: 'marcis.zabovs@novikontas.org', to: 'a@example.com', mail: c });
  assert.match(raw, /Content-ID: <building>/); assert.match(raw, /Reply-To: marcis\.zabovs@novikontas\.org/);
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

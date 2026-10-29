// MY WEEK + GMAIL (29.10.2026): the owner's picks B (a Gmail card on the right) and both emails and meetings. Google is
// faked here; every person, company, address and token is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const g = await import('../src/tcgoogle.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENV = { CRM_SESSION_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
const ME = 'anna.example@novikontas.org';

function fakeGoogle() {
  const calls = [];
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const at = (iso) => String(Date.parse(iso));
  const msgs = {
    m1: { threadId: 't1', internalDate: at('2026-10-27T09:00:00+02:00'), payload: { headers: [{ name: 'From', value: 'Olga Sample <olga@sample-offshore.com>' }, { name: 'To', value: ME }, { name: 'Subject', value: 'Course dates' }] } },
    m2: { threadId: 't1', internalDate: at('2026-10-27T10:00:00+02:00'), payload: { headers: [{ name: 'From', value: ME }, { name: 'To', value: 'olga@sample-offshore.com' }, { name: 'Subject', value: 'Re: Course dates' }] } },
    m3: { threadId: 't2', internalDate: at('2026-10-28T10:00:00+02:00'), payload: { headers: [{ name: 'From', value: 'news@shop.example' }, { name: 'To', value: ME }, { name: 'Subject', value: 'Sale' }] } },
  };
  const fetchImpl = async (url, opt = {}) => {
    calls.push(String(url));
    if (String(url).includes('/token')) return reply({ access_token: 'acc' });
    if (String(url).includes('/messages?')) return reply({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] });
    const m = String(url).match(/messages\/(m\d)\?/); if (m) return reply(msgs[m[1]]);
    if (String(url).includes('/calendars/primary/events')) return reply({ items: [
      { summary: 'Training plan 2027', start: { dateTime: '2026-10-29T11:00:00+02:00' }, attendees: [{ email: ME }, { email: 'OLGA@sample-offshore.com' }] },
      { summary: 'Internal', start: { dateTime: '2026-10-29T12:00:00+02:00' }, attendees: [{ email: ME }, { email: 'boss@novikontas.org' }] }] });
    if (String(url).includes('/revoke')) return reply({});
    return reply({}, 404);
  };
  return { fetchImpl, calls };
}

test('the token is sealed (never stored as it came) and opens only with the same secret', () => {
  const v = g._test.seal('1//refresh-token', ENV);
  assert.ok(v.startsWith('g1.') && !v.includes('refresh-token'));
  assert.equal(g._test.open(v, ENV), '1//refresh-token');
  assert.equal(g._test.open(v, { CRM_SESSION_SECRET: 'y'.repeat(40) }), null);
});

test('a week: emails with a client contact (one line a thread a day) and meetings with one; nothing else', async () => {
  const db = await openDb();
  const co = await tc.addCompany(db, { name: 'Sample Offshore', country: 'Norway' }, 'Ritvars');
  await tc.addContact(db, co.id, { name: 'Olga Sample', email: 'olga@sample-offshore.com' }, 'Ritvars');
  assert.deepEqual(await g.weekItems(db, ME, '2026-10-26', '2026-10-30', { env: ENV }), { connected: false, items: [] }, 'not connected: nothing is asked');
  await g.saveLink(db, ME, '1//refresh-token', ENV);
  const row = await db.prepare('SELECT token FROM tc_google_links WHERE user_email = ?').get(ME);
  assert.ok(!String(row.token).includes('refresh-token'), 'stored encrypted');
  const G = fakeGoogle();
  const W = await g.weekItems(db, ME, '2026-10-26', '2026-10-30', { env: ENV, fetchImpl: G.fetchImpl, now: 1 });
  assert.equal(W.connected, true);
  assert.deepEqual(W.items.map((x) => [x.day, x.kind, x.company, x.contact, x.title, x.dir || x.time]), [
    ['2026-10-27', 'email', 'Sample Offshore', 'Olga Sample', 'Course dates', 'in'],
    ['2026-10-29', 'meeting', 'Sample Offshore', 'Olga Sample', 'Training plan 2027', '11:00']]);
  assert.ok(G.calls.every((u) => !/\/send|modify|trash|delete|insert/i.test(u)), 'reads only');
  await g.disconnect(db, ME, { env: ENV, fetchImpl: G.fetchImpl });
  assert.equal((await g.status(db, ME)).connected, false);
  assert.ok(G.calls.some((u) => u.includes('/revoke')), 'Disconnect revokes at Google');
});

test('read-only scopes; the routes sit behind sign-in and the Training Centre gate; the card is on the right', () => {
  assert.deepEqual(g.SCOPES.slice(0, 2), ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly']);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  for (const r of ["'/api/tc/google'", "'/api/tc/google/connect'", "'/api/tc/google/disconnect'", "'/api/tc/week/google'"]) assert.ok(srv.includes(r), r);
  assert.match(srv, /if \(gf && gf\.purpose === 'tcgoogle' && gs && gs === gf\.state\) return finishTcGoogle/);
  assert.match(srv, /if \(got\.email !== String\(flow\.email\)\.toLowerCase\(\)\) return back\('other_account'\);/, 'only the person\'s own account');
  const areas = fs.readFileSync(path.join(ROOT, 'src', 'areas.js'), 'utf8');
  assert.match(areas, /pathname\.startsWith\('\/api\/tc\/'\)\) return 'tc'/);
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /<div class="tw-side"><div id="twGG">\$\{twGoogleCard\(\)\}<\/div>\$\{ready\}<\/div>/);
  assert.match(app, /<a class="btn tw-ggbtn" href="\/api\/tc\/google\/connect">Connect Gmail<\/a>/);
});

test('the owner\'s pick A: one card per company a day; one subject to 5+ companies is one card with the list', async () => {
  const vm = await import('node:vm');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const code = app.slice(app.indexOf('const twSubj = '), app.indexOf("const TW_G = '<svg"));
  const ctx = { esc: (s) => String(s) }; vm.createContext(ctx); vm.runInContext(code.replace('const twSubj', 'var twSubj') + '\nthis.day = twGoogleDay;', ctx);
  const e = (companyId, company, contact, title, dir = 'out') => ({ day: '2026-10-21', kind: 'email', companyId, company, contact, title, dir });
  const list = [1, 2, 3, 4, 5].map((i) => e(i, 'Co ' + i, 'P' + i, 'Save the date: Grand Opening'));
  list.push(e(1, 'Co 1', 'Another', 'Re: Save the date: Grand Opening', 'in'));
  list.push(e(9, 'Astor', 'A', 'Course dates'), e(9, 'Astor', 'B', 'Course dates'), e(9, 'Astor', 'C', 'Course dates'));
  const html = ctx.day(list);
  assert.equal((html.match(/class="tw-card/g) || []).length, 2, 'the bulk send is one card, Astor one card');
  assert.match(html, /✉ Sent to 5 companies/);
  assert.match(html, /<b[^>]*>Astor<\/b><span class="tw-who">3 people<\/span>/);
});

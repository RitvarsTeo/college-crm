// NEWSLETTER OR MASS MAIL (Admissions, 20.10.2026). A ShipSpeak newsletter, "PLEASE PASS THIS MESSAGE TO YOUR ENGLISH
// DEPARTMENT Dear Maritime Colleagues, www.shipspeak.nl is an educational platform...", reached the Inbox. Read-only on
// production 20.10.2026 (card 1388, 19.10): the study reading kept it ("study"), it had no unsubscribe line for the Q74
// newsletter rule, and Ieva set it aside as Spam. Now the edu@ email rule asks first whether it is a mass mailing: the
// message's list headers (List-Unsubscribe, List-Id, Precedence bulk/list/junk; not a copy through our own group) or a
// phrase only a mass mailing uses; set aside "Newsletter or mass mail" unless it has the Admissions label or comes from
// somebody in Intake. Everything runs against a fake Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { listHeadersOf, toAdapterShape } from '../lib/gmail.js';
import { receive, qualify, bringBack, massMailWhy, CONFIG } from '../src/intake.js';

const LABEL = { id: 'Label_77', name: 'Admissions' };
const SHIPSPEAK = `PLEASE PASS THIS MESSAGE TO YOUR ENGLISH DEPARTMENT
Dear Maritime Colleagues,
*www.shipspeak.nl* is an educational platform for maritime English. Students study at their own pace, and teachers
follow their progress. Ask us for a free trial for your school.`;

const message = (id, from, subject, body, { labelIds = ['INBOX'], headers = [] } = {}) => ({
  id, threadId: 't-' + id, labelIds,
  payload: { mimeType: 'text/plain', headers: [
    { name: 'Date', value: 'Mon, 19 Oct 2026 10:29:40 +0300' },
    { name: 'From', value: from },
    { name: 'Subject', value: subject },
    ...headers,
  ], body: { data: Buffer.from(body, 'utf8').toString('base64url') } },
});
function fakeGmail(box) {
  const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  return async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return reply({ access_token: 'x', expires_in: 3600 });
    if (/\/labels$/.test(url)) return reply({ labels: [LABEL] });
    if (url.includes('/messages?')) {
      const label = new URL(url).searchParams.get('labelIds');
      const ids = label ? (label === LABEL.id ? box.labelled || [] : []) : box.inbox || [];
      return reply({ messages: ids.map((id) => ({ id })) });
    }
    if (url.includes('/threads/')) return reply({ messages: [] });
    return reply(box.messages[decodeURIComponent(url.split('/messages/')[1].split('?')[0])]);
  };
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const pull = (db, box) => syncGmail(db, { env: ENV, fetchImpl: fakeGmail(box), now: new Date('2026-10-19T08:00:00Z') });
const byExt = async (db) => Object.fromEntries((await db.prepare(`SELECT id, external_id, state, archive_reason, archive_note,
  person_id, body FROM inbound WHERE channel = 'gmail' ORDER BY id`).all()).map((r) => [r.external_id, r]));

test('the reading: phrases and a greeting to colleagues, list headers, our own group never counts', () => {
  assert.equal(massMailWhy({ text: SHIPSPEAK }), 'Newsletter or mass mail ("pass this message")');
  assert.equal(massMailWhy({ text: 'Hello\nDear Maritime Colleagues,\nour new books are out' }), 'Newsletter or mass mail ("dear maritime colleagues")');
  assert.equal(massMailWhy({ text: 'Cienījamie kolēģi!\nAicinām uz semināru' }), 'Newsletter or mass mail ("cienījamie kolēģ")');
  assert.equal(massMailWhy({ text: 'Уважаемые коллеги,\nприглашаем' }), 'Newsletter or mass mail ("уважаемые коллег")');
  assert.equal(massMailWhy({ text: 'Our autumn newsletter' }), 'Newsletter or mass mail ("newsletter")');
  assert.equal(massMailWhy({ text: 'I want to study', headers: { unsubscribe: true, id: null, precedence: null } }), 'Newsletter or mass mail (List-Unsubscribe header)');
  assert.equal(massMailWhy({ text: 'x', headers: { unsubscribe: false, id: '<news.shipspeak.nl>', precedence: null } }), 'Newsletter or mass mail (List-Id header)');
  assert.equal(massMailWhy({ text: 'x', headers: { unsubscribe: false, id: null, precedence: 'bulk' } }), 'Newsletter or mass mail (Precedence: bulk)');
  assert.equal(massMailWhy({ text: 'x', headers: { unsubscribe: false, id: null, precedence: 'first-class' } }), null);
  // a copy through one of our own Google Groups carries list headers too: it is somebody writing to us, not a mailing
  assert.equal(massMailWhy({ text: 'I want to study navigation', headers: { unsubscribe: true, id: '<info.novikontas.org>', precedence: 'list' } }), null);
  // what a person asking about studies writes is never mass mail
  for (const t of ['Dear Sir or Madam, I would like to study navigation.', 'Labdien! Vai varu pieteikties uz mehāniķa programmu?',
    'Hello, my colleague told me about your college', 'Здравствуйте, хочу поступить']) assert.equal(massMailWhy({ text: t }), null, t);
  // only what the sender newly wrote counts: a partner school's reply quoting "Dear colleagues" further down the thread
  // was made a lead on production (read-only check 20.10.2026), and a signature's newsletter line is not a mailing
  const reply = 'Re: MC 7.9 Able Seafarer\nThank you, we will send the documents for our student on Monday.\n\n'
    + 'On Tue, 14 Oct 2026 at 10:00, Novikontas Academy <edu@novikontas.org> wrote:\n> Dear colleagues from Novikontas Academy,\n> please see the list.';
  assert.equal(massMailWhy({ text: reply }), null);
  const fwd = 'Re: places\nYes, two students for January.\n\n________________________________\nFrom: Partner <p@school.nl>\nSent: Monday\nTo: edu@novikontas.org\nSubject: places\n\nDear colleagues,\nhow many places are left?';
  assert.equal(massMailWhy({ text: fwd }), null);
  assert.equal(CONFIG.emailFilter.massMail.why, 'Newsletter or mass mail');
});

test('the headers are read off the Gmail message, and nothing when it has none', () => {
  const plain = message('a', 'A <a@x.lv>', 'Hi', 'Hello');
  assert.equal(listHeadersOf(plain), null);
  assert.equal(toAdapterShape(plain).listHeaders, null);
  const bulk = message('b', 'News <news@x.com>', 'News', 'x', { headers: [{ name: 'List-Unsubscribe', value: '<mailto:u@x.com>' },
    { name: 'List-ID', value: 'News <news.x.com>' }, { name: 'Precedence', value: ' Bulk ' }] });
  assert.deepEqual(listHeadersOf(bulk), { unsubscribe: true, id: 'News <news.x.com>', precedence: 'bulk' });
});

test('the pull: ShipSpeak and a mailing are set aside as Newsletter or mass mail, kept; a real enquiry still reaches the Inbox', async () => {
  const db = await openDb(':memory:');
  const r = await pull(db, { inbox: ['ss', 'list', 'own', 'real'], messages: {
    ss: message('ss', 'ShipSpeak <kluijven@example.com>', 'PLEASE PASS THIS MESSAGE TO YOUR ENGLISH DEPARTMENT', SHIPSPEAK.split('\n').slice(1).join('\n')),
    list: message('list', 'Courses <info@courses.example>', 'Apply now for the autumn course', 'Study with us, apply today.',
      { headers: [{ name: 'List-Unsubscribe', value: '<https://courses.example/u>' }] }),
    own: message('own', 'Anna <anna@x.lv>', 'Question', 'I want to study navigation next year',
      { headers: [{ name: 'List-Id', value: '<info.novikontas.org>' }, { name: 'List-Unsubscribe', value: '<mailto:x@googlegroups.com>' }] }),
    real: message('real', 'Jānis <janis@x.lv>', 'Jautājums', 'Vai ir dienesta viesnīca?'),
  } });
  assert.equal(r.ok, true, r.why);
  const by = await byExt(db);
  assert.equal(by.ss.state, 'filtered');
  assert.equal(by.ss.archive_reason, 'Filtered automatically');
  assert.equal(by.ss.archive_note, 'Newsletter or mass mail ("pass this message")', 'before the study reading, which would have kept it');
  assert.ok(by.ss.body, 'kept with its text');
  assert.equal(by.list.archive_note, 'Newsletter or mass mail (List-Unsubscribe header)');
  assert.equal(by.own.state, 'new', 'through our own group: a person, read as before');
  assert.equal(by.real.state, 'new');
  // Bring back works on it like any other set-aside
  assert.equal((await bringBack(db, Number(by.ss.id), { by: 'Ieva' })).ok, true);
  assert.equal((await byExt(db)).ss.state, 'new');
  await db.close();
});

test('the Admissions label and somebody in Intake still win over it', async () => {
  const db = await openDb(':memory:');
  const first = await receive(db, { channel: 'phone', externalId: 'call-1', receivedAt: '2026-10-15T08:00:00Z', phone: '+37129990001', body: 'Incoming call' });
  const q = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call', stated: { email: 'anna@example.com' } });
  await pull(db, { inbox: ['known'], labelled: ['lab'], messages: {
    lab: message('lab', 'ShipSpeak <kluijven@example.com>', 'PLEASE PASS THIS MESSAGE', SHIPSPEAK, { labelIds: [LABEL.id] }),
    known: message('known', 'Anna <anna@example.com>', 'Fwd: newsletter', 'Dear colleagues, please pass this message on - Anna',
      { headers: [{ name: 'List-Unsubscribe', value: '<mailto:u@x.com>' }] }),
  } });
  const by = await byExt(db);
  assert.equal(by.lab.state, 'new', 'labelled: the Inbox');
  assert.deepEqual([by.known.state, by.known.person_id], ['qualified', q.personId], 'somebody in Intake: their History');
  await db.close();
});

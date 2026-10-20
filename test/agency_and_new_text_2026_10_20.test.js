// THE OWNER'S YES, 20.10.2026, after Ieva's PMLP cards. Read-only on production: card 1395 (and 1162 before it), a
// PMLP forward from pasts@pmlp.gov.lv, reached the Inbox because the study reading found "course" in OUR OWN signature's
// link (novikontas.org/course-cancel), quoted under the forward; PMLP wrote from 11 addresses in 18 days.
//   (1) agency / authority domains (config.emailFilter.agencyDomains, pmlp.gov.lv first): set aside as Agency /
//       authority, kept, Bring back works; the Admissions label and somebody in Intake still win;
//   (2) the study reading reads only the sender's own new text (the subject included), never the quoted thread or our
//       own quoted signature, the way the newsletter rule does.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { receive, qualify, bringBack, agencyWhy, emailRuleWhy, emailStudyWhy, emailNewText, emailRuleOnWaiting, CONFIG } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LABEL = { id: 'Label_77', name: 'Admissions' };
// what a PMLP forward of our own TUA request looks like: their two lines, then our email and our signature, quoted
const PMLP = `IZPILDEI!FW: Jauns izsaukums TUA pieprasīšanai
Lūdzam izpildīt.

From: Novikontas Academy <edu@novikontas.org>
Sent: Monday, October 19, 2026 10:00
To: pasts@pmlp.gov.lv
Subject: Jauns izsaukums TUA pieprasīšanai

Labdien, nosūtām izsaukuma pieprasījumu studentam.
Novikontas cancellation policy<https://novikontas.org/course-cancel>`;

const message = (id, from, subject, body, { labelIds = ['INBOX'] } = {}) => ({
  id, threadId: 't-' + id, labelIds,
  payload: { mimeType: 'text/plain', headers: [{ name: 'Date', value: 'Mon, 19 Oct 2026 11:41:32 +0300' }, { name: 'From', value: from },
    { name: 'Subject', value: subject }], body: { data: Buffer.from(body, 'utf8').toString('base64url') } },
});
function fakeGmail(box) {
  const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  return async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return reply({ access_token: 'x', expires_in: 3600 });
    if (/\/labels$/.test(url)) return reply({ labels: [LABEL] });
    if (url.includes('/messages?')) {
      const label = new URL(url).searchParams.get('labelIds');
      return reply({ messages: (label ? (label === LABEL.id ? box.labelled || [] : []) : box.inbox || []).map((id) => ({ id })) });
    }
    if (url.includes('/threads/')) return reply({ messages: [] });
    return reply(box.messages[decodeURIComponent(url.split('/messages/')[1].split('?')[0])]);
  };
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const pull = (db, box) => syncGmail(db, { env: ENV, fetchImpl: fakeGmail(box), now: new Date('2026-10-19T09:00:00Z') });
const byExt = async (db) => Object.fromEntries((await db.prepare(`SELECT id, external_id, state, archive_reason, archive_note, person_id, body
  FROM inbound WHERE channel = 'gmail' ORDER BY id`).all()).map((r) => [r.external_id, r]));

test('(1) the agency list: the domain and its subdomains, nothing that only looks like it', () => {
  assert.deepEqual(CONFIG.emailFilter.agencyDomains, ['pmlp.gov.lv']);
  assert.equal(agencyWhy('pasts@pmlp.gov.lv'), 'Agency / authority (pmlp.gov.lv)');
  assert.equal(agencyWhy('Inese.Veseta@PMLP.gov.lv'), 'Agency / authority (pmlp.gov.lv)', 'an officer\'s own address too');
  assert.equal(agencyWhy('x@riga.pmlp.gov.lv'), 'Agency / authority (pmlp.gov.lv)');
  for (const a of ['x@notpmlp.gov.lv', 'x@pmlp.gov.lv.example.com', 'x@gov.lv', 'pmlp.gov.lv', '', null]) assert.equal(agencyWhy(a), null, String(a));
  // whatever it says: a TUA request is about a student, so it names studies for real
  assert.equal(emailRuleWhy({ email: 'ielugumi.riga4@pmlp.gov.lv', text: 'Lūgums norādīt, kurā studiju programmā students studēs' }),
    'Agency / authority (pmlp.gov.lv)');
});

test('(2) the study reading reads the sender\'s own new text: our quoted signature never keeps a card', () => {
  assert.equal(emailNewText(PMLP), 'IZPILDEI!FW: Jauns izsaukums TUA pieprasīšanai\nLūdzam izpildīt.');
  assert.equal(emailStudyWhy(PMLP), CONFIG.emailFilter.studyRule.notStudyingWhy, 'the "course" in our quoted link is not read');
  // the sender's own words still keep it, the subject included
  assert.equal(emailStudyWhy('Question about the course\nWhen does it start?\n\nOn Mon, 19 Oct 2026 at 10:00, Novikontas <edu@novikontas.org> wrote:\n> Hello'), null);
  assert.equal(emailStudyWhy('Re: hello\nI want to study navigation next year.\n\n> Novikontas cancellation policy<https://novikontas.org/course-cancel>'), null);
  // a reply whose only study word is in what it quotes is not about studying
  assert.equal(emailStudyWhy('Re: hello\nThank you, received.\n\nOn Mon, 19 Oct 2026 at 10:00, Novikontas <edu@novikontas.org> wrote:\n> our study programmes'),
    CONFIG.emailFilter.studyRule.notStudyingWhy);
});

test('the pull: PMLP set aside as Agency / authority, kept, Bring back works; a quoted-signature-only email set aside; a real enquiry stays', async () => {
  const db = await openDb(':memory:');
  const r = await pull(db, { inbox: ['pmlp', 'sig', 'real'], messages: {
    pmlp: message('pmlp', 'Pilsonības un migrācijas lietu pārvalde <pasts@pmlp.gov.lv>', 'IZPILDEI!FW: Jauns izsaukums TUA pieprasīšanai', PMLP.split('\n').slice(1).join('\n')),
    sig: message('sig', 'Shop <sales@shop.lv>', 'Re: delivery', 'Delivered on Monday.\n\nOn Mon, 19 Oct 2026 at 10:00, Novikontas <edu@novikontas.org> wrote:\n> Novikontas cancellation policy<https://novikontas.org/course-cancel>'),
    real: message('real', 'Anna <anna@x.lv>', 'Jautājums', 'Vai varu pieteikties uz navigācijas programmu?'),
  } });
  assert.equal(r.ok, true, r.why);
  const by = await byExt(db);
  assert.deepEqual([by.pmlp.state, by.pmlp.archive_reason, by.pmlp.archive_note], ['filtered', 'Filtered automatically', 'Agency / authority (pmlp.gov.lv)']);
  assert.ok(by.pmlp.body, 'kept with its text');
  assert.deepEqual([by.sig.state, by.sig.archive_note], ['filtered', 'Not about studying']);
  assert.equal(by.real.state, 'new');
  assert.equal((await bringBack(db, Number(by.pmlp.id), { by: 'Ieva' })).ok, true);
  assert.equal((await byExt(db)).pmlp.state, 'new');
  await db.close();
});

test('the Admissions label and somebody in Intake still win over the agency list', async () => {
  const db = await openDb(':memory:');
  const first = await receive(db, { channel: 'phone', externalId: 'call-1', receivedAt: '2026-10-15T08:00:00Z', phone: '+37129990001', body: 'Incoming call' });
  const q = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call', stated: { email: 'inese@pmlp.gov.lv' } });
  await pull(db, { inbox: ['known'], labelled: ['lab'], messages: {
    lab: message('lab', 'PMLP <pasts@pmlp.gov.lv>', 'Izsaukums', 'Lūdzam izpildīt.', { labelIds: [LABEL.id] }),
    known: message('known', 'Inese <inese@pmlp.gov.lv>', 'Paldies', 'Paldies!'),
  } });
  const by = await byExt(db);
  assert.equal(by.lab.state, 'new', 'labelled: the Inbox');
  assert.deepEqual([by.known.state, by.known.person_id], ['qualified', q.personId], 'somebody in Intake: their History');
  await db.close();
});

test('the one-off over waiting cards reads the same new text', async () => {
  const db = await openDb(':memory:');
  const c = await receive(db, { channel: 'gmail', externalId: 'w1', email: 'sales@shop.lv', body: 'Re: delivery\nDelivered.\n\n> our study programmes' });
  const preview = await emailRuleOnWaiting(db, { labelled: new Set() });
  assert.deepEqual(preview.cards.find((x) => x.id === c.id), { id: c.id, received: preview.cards[0].received, outcome: 'set aside', why: 'Not about studying' });
  await db.close();
});

test('the Help center says it', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const a = help.faq.find((x) => x.id === 'email-to-inbox').a;
  assert.match(a, /Agency \/ authority/);
  assert.match(a, /newly wrote/);
  assert.equal(a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'still one sentence');
});

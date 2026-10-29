// Q91 (13.10.2026, picked by Ritvars): edu@ mail with the Admissions label comes into Intake with no filter, because
// "they are manually accepted by human. Rest goes through a filter." The label name is looked up ("its either
// admission or admissions"), never guessed; archived mail with the label counts; a message a rule filtered and a
// person labelled later comes back to the Inbox on the next pull, the same row. Everything runs against a fake Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { admissionsLabels } from '../lib/gmail.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LABEL = { id: 'Label_77', name: 'Admissions' };
const NEWSLETTER = 'Our autumn open day news.\nTo stop receiving these emails, unsubscribe here.';

const message = (id, from, body, labelIds = ['INBOX']) => ({
  id, threadId: 't-' + id, labelIds,
  payload: { mimeType: 'text/plain', headers: [
    { name: 'Date', value: 'Tue, 13 Oct 2026 09:00:00 +0300' },
    { name: 'From', value: from },
    { name: 'Subject', value: 'Studies' },
  ], body: { data: Buffer.from(body, 'utf8').toString('base64url') } },
});

// The mailbox: `inbox` is what in:inbox lists, `labelled` what labelIds=<the label> lists; `labels` the label list.
function fakeGmail(box) {
  const calls = { get: [], lists: [] };
  const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return reply({ access_token: 'x', expires_in: 3600 });
    if (/\/labels$/.test(url)) return box.labelsFail ? reply({ error: { status: 'UNAVAILABLE' } }, false, 503) : reply({ labels: box.labels });
    if (url.includes('/messages?')) {
      const u = new URL(url);
      const label = u.searchParams.get('labelIds');
      calls.lists.push({ q: u.searchParams.get('q'), label });
      const ids = label ? (label === LABEL.id ? box.labelled : []) : box.inbox;
      return reply({ messages: ids.map((id) => ({ id })) });
    }
    if (url.includes('/threads/')) return reply({ messages: [] });
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    calls.get.push(id);
    return reply(box.messages[id]);
  };
  return { fetchImpl, calls };
}

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const rows = (db) => db.prepare("SELECT id, external_id, state, archive_note FROM inbound WHERE channel = 'gmail' ORDER BY id").all();
const gmailRun = async (db) => JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'gmail'").get()).detail);

test('the label is looked up by name: admission or admissions, any case, nested or not; nothing else', () => {
  const found = admissionsLabels([{ id: 'INBOX', name: 'INBOX' }, { id: 'L1', name: 'Admissions' }, { id: 'L2', name: 'Leads/admission' },
    { id: 'L3', name: 'Admissions 2025' }, { id: 'L4', name: 'Pre-admissions' }, { id: 'L5', name: 'ADMISSION' }, { id: 'L6', name: 'Admissions/Old' }]);
  assert.deepEqual(found.map((l) => l.id), ['L1', 'L2', 'L5']);
  assert.deepEqual(admissionsLabels([]), []);
});

test('labelled mail skips every filter, archived or not; unlabelled mail goes through the filter as before', async () => {
  const db = await openDb(':memory:');
  const box = { labels: [{ id: 'INBOX', name: 'INBOX' }, LABEL], inbox: ['in-plain', 'in-news'], labelled: ['arch-news', 'arch-noreply'],
    messages: {
      'in-plain': message('in-plain', 'Anna <anna@x.lv>', 'When does navigation start?'),
      'in-news': message('in-news', 'News <news@school.lv>', NEWSLETTER),
      'arch-news': message('arch-news', 'Ilze <ilze@x.lv>', NEWSLETTER, [LABEL.id]),
      'arch-noreply': message('arch-noreply', 'Portal <noreply@portal.lv>', 'A new application arrived for Marine Engineering', [LABEL.id]),
    } };
  const { fetchImpl, calls } = fakeGmail(box);
  const r = await syncGmail(db, { env: ENV, fetchImpl });
  assert.equal(r.ok, true, r.why);
  const by = Object.fromEntries((await rows(db)).map((x) => [x.external_id, x]));
  assert.equal(by['in-plain'].state, 'new');
  assert.equal(by['in-news'].state, 'filtered', 'no label: the filter as before');
  assert.equal(by['arch-news'].state, 'new', 'labelled: never filtered, even with an unsubscribe link');
  assert.equal(by['arch-noreply'].state, 'new', 'labelled: a noreply sender too');
  assert.ok(calls.lists.some((l) => l.label === LABEL.id && !/in:inbox/.test(l.q)), 'the labelled list is not limited to the Inbox');
  assert.equal(r.labelled, 2);
  assert.deepEqual((await gmailRun(db)).labels.names, ['Admissions'], 'the label found is kept for the Channels screen');
  await db.close();
});

test('filtered first, labelled later: back in the Inbox on the next pull, the same row, logged; once', async () => {
  const db = await openDb(':memory:');
  const box = { labels: [LABEL], inbox: ['m1', 'm2'], labelled: [],
    messages: { m1: message('m1', 'News <news@school.lv>', NEWSLETTER), m2: message('m2', 'Promo <promo@shop.lv>', NEWSLETTER) } };
  const { fetchImpl, calls } = fakeGmail(box);
  await syncGmail(db, { env: ENV, fetchImpl });
  assert.deepEqual((await rows(db)).map((x) => x.state), ['filtered', 'filtered']);
  // a person sets m2 aside by hand after a bring-back would be theirs; here m2 is set aside by a PERSON first
  const m2 = (await rows(db))[1];
  await db.prepare("UPDATE inbound SET state = 'archived', archive_reason = 'Not relevant', processed_by = 'Ieva' WHERE id = ?").run(m2.id);
  // a person labels both and archives them out of the Inbox
  box.inbox = [];
  box.labelled = ['m1', 'm2'];
  box.messages.m1.labelIds = [LABEL.id];
  box.messages.m2.labelIds = [LABEL.id];
  const before = calls.get.length;
  const r = await syncGmail(db, { env: ENV, fetchImpl });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.broughtBack, 1);
  assert.equal(calls.get.length, before, 'a labelled message we already hold is not fetched again');
  const after = await rows(db);
  assert.equal(after.length, 2, 'never a second row');
  assert.equal(after[0].state, 'new', 'the rule had filtered it: back in the Inbox');
  assert.equal(after[1].state, 'archived', 'a person set it aside: it stays where the person put it');
  const hist = await db.prepare("SELECT action, actor, from_state FROM inbound_history WHERE inbound_id = ?").all(after[0].id);
  assert.deepEqual(hist.map((h) => [h.action, h.actor, h.from_state]), [['brought_back', 'Admissions label', 'filtered']]);
  const again = await syncGmail(db, { env: ENV, fetchImpl });
  assert.equal(again.broughtBack, undefined, 'the next pull changes nothing');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound_history').get()).n, 1);
  await db.close();
});

test('filtered first, labelled later while still in the Inbox: back too', async () => {
  const db = await openDb(':memory:');
  const box = { labels: [LABEL], inbox: ['m1'], labelled: [], messages: { m1: message('m1', 'News <news@school.lv>', NEWSLETTER) } };
  const { fetchImpl } = fakeGmail(box);
  await syncGmail(db, { env: ENV, fetchImpl });
  box.labelled = ['m1'];
  box.messages.m1.labelIds = ['INBOX', LABEL.id];
  const r = await syncGmail(db, { env: ENV, fetchImpl });
  assert.equal(r.broughtBack, 1);
  assert.deepEqual((await rows(db)).map((x) => x.state), ['new']);
  await db.close();
});

test('no label found: said, never guessed; the Inbox is read and filtered as before', async () => {
  const db = await openDb(':memory:');
  const box = { labels: [{ id: 'L9', name: 'Admissions 2025' }, { id: 'INBOX', name: 'INBOX' }], inbox: ['m1'], labelled: ['m1'],
    messages: { m1: message('m1', 'News <news@school.lv>', NEWSLETTER, ['INBOX', 'L9']) } };
  const { fetchImpl, calls } = fakeGmail(box);
  const r = await syncGmail(db, { env: ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual((await rows(db)).map((x) => x.state), ['filtered']);
  assert.ok(!calls.lists.some((l) => l.label), 'no labelled list without a label');
  const labels = (await gmailRun(db)).labels;
  assert.deepEqual(labels.names, []);
  assert.match(labels.why, /no label named admission or admissions/);
  await db.close();
});

test('a label list Gmail refuses: the Inbox pull still runs and the bookmark moves; the screen says why', async () => {
  const db = await openDb(':memory:');
  const box = { labelsFail: true, labels: [], inbox: ['m1'], labelled: [], messages: { m1: message('m1', 'Anna <anna@x.lv>', 'Hello') } };
  const r = await syncGmail(db, { env: ENV, fetchImpl: fakeGmail(box).fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.inbox, 1);
  assert.match((await gmailRun(db)).labels.why, /refused the label list.*UNAVAILABLE/);
  await db.close();
});

test('the Channels screen: one line with the label found, or that none was', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const fn = app.slice(app.indexOf('function chLabelLine('), app.indexOf('// SIS is not a channel (02.10)'));
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') };
  vm.runInNewContext(fn + '; this.line = chLabelLine;', ctx);
  assert.match(ctx.line({ detail: { labels: { ok: true, names: ['Admissions'] } } }), /Admissions label: Admissions/);
  const none = ctx.line({ detail: { labels: { ok: true, names: [], why: 'no label named admission or admissions in edu@' } } });
  assert.match(none, /no label named admission or admissions/);
  assert.match(none, /is-fail/);
  assert.equal(ctx.line(null), '', 'nothing before the first pull');
  assert.match(app, /c\.channel === 'gmail' \? chLabelLine\(/, 'shown on the Email channel');
});

test('the pull runs every 10 minutes in the working day, still behind CRON_SECRET', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.crons.find((c) => c.path === '/api/cron/gmail-poll').schedule, '*/10 5-15 * * *');
  const src = fs.readFileSync(path.join(ROOT, 'api', 'cron', 'gmail-poll.js'), 'utf8');
  assert.match(src, /authoriseCron\(/);
});

test('Help says it, in the same change', () => {
  const help = fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8');
  assert.match(help, /Admissions label in edu@ is never filtered/);
  assert.match(help, /every 10 minutes from 08:00 to 17:00 Latvian time/);
});

// The website form is Tilda (checked 30.09.2026), and Tilda posts its own way (C8, built 01.10.2026,
// from help.tilda.cc/formswebhook): form-encoded, its own id `tranid`, the field names the form
// author chose, the advert tags inside COOKIES, a test=test request when the webhook is added,
// and it wants the word "ok" back within five seconds or it tries twice more.
// The secret: the x-crm-secret header, or Tilda's API key sent as the form field crm_secret.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'test-website-secret-not-real-0000';

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', CHANNEL_MODE_WEBSITE: 'test', WEBSITE_FORM_SECRET: SECRET, ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const form = (o) => new URLSearchParams(o).toString();
const post = (s, body, headers = {}) => fetch(s.base + '/api/inbound/website', { method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body });
const newLeads = (s) => fetch(s.base + '/api/intake?state=new').then((r) => r.json()).then((j) => j.rows);

const TILDA = {
  Name: 'Anna Ozola', Email: 'anna@example.com', Phone: '+371 20000000',
  Comments: 'Gribu macities navigaciju', tranid: '9876543:1234567', formid: 'form123456',
  COOKIES: 'TILDAUTM=utm_source%3Dfacebook%7C%7C%7Cutm_medium%3Dcpc%7C%7C%7Cutm_campaign%3Dopen_day; _ga=GA1.1.1',
};

test('Tilda: the test request on adding the webhook gets "ok" and stores nothing', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await post(s, form({ test: 'test' }), { 'x-crm-secret': SECRET });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  assert.equal((await newLeads(s)).length, 0);
});

test('Tilda: a real submission answers "ok" and lands in New Leads with the person and the advert tags', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await post(s, form(TILDA), { 'x-crm-secret': SECRET });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  const [item] = await newLeads(s);
  assert.equal(item.channel, 'website');
  assert.equal(item.external_id, 'tilda-9876543:1234567');
  assert.equal(item.contact_name, 'Anna Ozola');
  assert.equal(item.contact_email, 'anna@example.com');
  assert.equal(item.contact_phone, '+371 20000000');
  assert.match(item.body, /navigaciju/);
  assert.equal(item.source, 'provider');
  const utm = JSON.parse(item.attribution);
  assert.equal(utm.utm_source, 'facebook');
  assert.equal(utm.utm_medium, 'cpc');
  assert.equal(utm.utm_campaign, 'open_day');
});

test('Tilda: a retry of the same tranid is stored once', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (let i = 0; i < 3; i++) assert.equal(await (await post(s, form(TILDA), { 'x-crm-secret': SECRET })).text(), 'ok');
  assert.equal((await newLeads(s)).length, 1);
});

test('Tilda: the secret may come as the form field crm_secret, and it is never stored', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await post(s, form({ ...TILDA, crm_secret: SECRET }));
  assert.equal(r.status, 200, await r.clone().text());
  const rows = await newLeads(s);
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(SECRET), 'the secret is nowhere in what was stored');
});

test('Tilda: no secret, or the wrong one, is refused and nothing reaches New Leads', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  assert.equal((await post(s, form(TILDA))).status, 401);
  assert.equal((await post(s, form({ ...TILDA, crm_secret: 'wrong' }))).status, 401);
  assert.equal((await post(s, form(TILDA), { 'x-crm-secret': 'wrong' })).status, 401);
  assert.equal((await newLeads(s)).length, 0);
});

test('Tilda: with the channel off, even a correct post is refused (409), so nothing arrives unannounced', async (t) => {
  const s = await start({ CHANNEL_MODE_WEBSITE: '' });
  t.after(() => s.child.kill());
  assert.equal((await post(s, form(TILDA), { 'x-crm-secret': SECRET })).status, 409);
});

// ------------------------------------------- the live college forms, 04.10.2026 (Q3) --
// Read off the live site on 04.10: the only college enquiry form is EN-only (college/en and
// college/en/contacts). Its fields are named by the form author and are NOT renamed in Tilda,
// because two Make webhooks read the same forms. The adapter learns the names instead.
import { ADAPTERS } from '../src/adapters.js';

const ENQUIRY = {
  'Name Surname': 'Janis Berzins', Email: 'janis@example.com', Phone: '+371 20000001',
  'Study Program': 'Navigation', Source: 'Instagram', 'Additional Comments': 'When does it start?',
  tranid: '1111111:2222222', formid: 'form-enquiry',
};
const CONTACT = {
  Name: 'Liga', Name_2: 'Kalnina', Phone: '+371 20000002', Email: 'liga@example.com',
  Textarea: 'Please call me', tranid: '3333333:4444444', formid: 'form-contacts',
};

test('Q3: the college enquiry form keeps the name, programme, message and the "Source" answer', () => {
  const e = ADAPTERS.website(ENQUIRY);
  assert.equal(e.senderName, 'Janis Berzins');
  assert.equal(e.senderEmail, 'janis@example.com');
  assert.equal(e.senderPhone, '+371 20000001');
  assert.equal(e.messageBody, 'When does it start?');
  assert.equal(e.extracted.programme, 'Navigation');
  assert.equal(e.extracted.heard_from, 'Instagram', 'the person\'s own answer, kept');
  assert.equal(e.attribution.utm_source, null, '"Source" is an answer, never advert tracking');
  assert.equal(e.source, 'website');
});

test('Q3: the same form with underscores instead of spaces reads the same', () => {
  const under = Object.fromEntries(Object.entries(ENQUIRY).map(([k, v]) => [k.replace(/ /g, '_'), v]));
  const e = ADAPTERS.website(under);
  assert.equal(e.senderName, 'Janis Berzins');
  assert.equal(e.extracted.programme, 'Navigation');
  assert.equal(e.messageBody, 'When does it start?');
});

test('Q3: the contacts form joins Name and Name_2, and Textarea is the message', () => {
  const e = ADAPTERS.website(CONTACT);
  assert.equal(e.senderName, 'Liga Kalnina');
  assert.equal(e.messageBody, 'Please call me');
  assert.equal(ADAPTERS.website({ ...CONTACT, Name_2: '' }).senderName, 'Liga', 'an empty surname adds nothing');
});

test('Q3: utm tags from COOKIES still win the source, alongside the "Source" answer', () => {
  const e = ADAPTERS.website({ ...ENQUIRY, COOKIES: TILDA.COOKIES });
  assert.equal(e.source, 'facebook');
  assert.equal(e.extracted.heard_from, 'Instagram');
});

test('Q3: the real enquiry form, posted the way Tilda posts it, lands whole', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await post(s, form(ENQUIRY), { 'x-crm-secret': SECRET });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  const [item] = await newLeads(s);
  assert.equal(item.contact_name, 'Janis Berzins');
  assert.equal(item.contact_email, 'janis@example.com');
  assert.match(item.body, /When does it start\?/);
  const field = (n) => (item.fields || []).find((x) => x.field === n);
  assert.equal(field('form_programme').value, 'Navigation', 'the programme they picked reaches the stored row');
  assert.equal(field('form_programme').provenance, 'provider', 'as their own answer');
  assert.equal(field('heard_from').value, 'Instagram', 'and the "Source" answer');
  assert.ok(!field('interest') || field('interest').provenance !== 'provider', 'never as a confirmed interest');
  assert.equal(JSON.parse(item.attribution).utm_source, null, 'and never as advert tracking');
});

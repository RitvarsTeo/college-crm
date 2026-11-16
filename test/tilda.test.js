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
  Name: 'Liga Kalnina', Name_2: 'Novikontas Test SIA', Phone: '+371 20000002', Email: 'liga@example.com',
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

test('Q3: the contacts form - Name is the name, Name_2 is COMPANY and never joined onto it', () => {
  // seen on the live page 04.10: Name has the placeholder "Name, Surname", Name_2 has "Company"
  const e = ADAPTERS.website(CONTACT);
  assert.equal(e.senderName, 'Liga Kalnina');
  assert.equal(e.extracted.company, 'Novikontas Test SIA');
  assert.equal(e.messageBody, 'Please call me');
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

// ------------------------------- the new website's three forms, 16.11.2026 --
// Talk to Admissions, Book a visit and Career support all post to /api/inbound/website. Field names
// read off the published test pages (how-to-apply-test, facilities-test, sea-practice-test) on 16.11.
const TALK = {
  'Student type': 'International student', name: 'Amir Khan', Phone: '+92 300 0000000', email: 'amir@example.com',
  Citizenship: 'Pakistan', 'Contact method': 'WhatsApp', Topics: 'Visa / residence permit; English requirements',
  Question: 'Can I start in February?', tranid: '5555555:6666666', formid: 'form5723427903',
};
const VISIT = {
  name: 'Ilze Liepa', Phone: '+371 20000003', email: 'ilze@example.com', Programme: 'Not sure yet',
  'Preferred time': 'Weekdays 14:00–18:00', 'Tour language': 'Latviešu', 'With parents or friend': 'yes',
  tranid: '7777777:8888888', formid: 'form5723428203',
};
const CAREER = { Form: 'Career support', name: 'Toms Ozols', Phone: '+371 20000004', email: 'toms@example.com',
  tranid: '9999999:1010101', formid: 'form5544289803' };

test('16.11: Talk to Admissions is named and keeps every answer in the Inbox text', () => {
  const e = ADAPTERS.website(TALK);
  assert.equal(e.senderName, 'Amir Khan');
  assert.equal(e.senderPhone, '+92 300 0000000');
  assert.equal(e.messageSubject, 'Talk to Admissions');
  assert.equal(e.extracted.form, 'admissions');
  assert.match(e.messageBody, /Student: International student/);
  assert.match(e.messageBody, /Citizenship: Pakistan/);
  assert.match(e.messageBody, /Contact by: WhatsApp/);
  assert.match(e.messageBody, /Wants to talk about: Visa \/ residence permit, English requirements/);
  assert.match(e.messageBody, /Can I start in February\?/);
});

test('16.11: Book a visit is named, "Not sure yet" is no programme, and the visit choices are kept', () => {
  const e = ADAPTERS.website(VISIT);
  assert.equal(e.messageSubject, 'Book a visit');
  assert.equal(e.extracted.programme, null);
  assert.match(e.messageBody, /Preferred time: Weekdays 14:00–18:00/);
  assert.match(e.messageBody, /Tour language: Latviešu/);
  assert.match(e.messageBody, /Comes with parents or a friend/);
  assert.equal(ADAPTERS.website({ ...VISIT, Programme: 'Ship Navigation' }).extracted.programme, 'Ship Navigation');
});

test('16.11: Career support is known by its hidden Form field (it asks only name, phone, email)', () => {
  const e = ADAPTERS.website(CAREER);
  assert.equal(e.messageSubject, 'Career support');
  assert.equal(e.extracted.form, 'career');
  assert.equal(e.senderEmail, 'toms@example.com');
  assert.equal(e.messageBody, null);
  assert.equal(ADAPTERS.website({ ...TALK, Form: 'Talk to Admissions' }).extracted.form, 'admissions');
  assert.equal(ADAPTERS.website({ ...VISIT, Form: 'Book a visit' }).extracted.form, 'visit');
});

test('16.11: the old college forms are untouched - no form name, same text', () => {
  const e = ADAPTERS.website(ENQUIRY);
  assert.equal(e.messageSubject, null);
  assert.equal(e.messageBody, 'When does it start?');
  assert.equal(e.extracted.form, null);
});

test('16.11: all three forms through the one endpoint land in New Leads, each once, with its form name', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const body of [TALK, VISIT, CAREER, TALK]) {
    const r = await post(s, form(body), { 'x-crm-secret': SECRET });
    assert.equal(await r.text(), 'ok');
  }
  const rows = await newLeads(s);
  assert.equal(rows.length, 3);
  const by = Object.fromEntries(rows.map((x) => [x.contact_email, x]));
  assert.match(by['amir@example.com'].body, /^Talk to Admissions\n/);
  assert.match(by['ilze@example.com'].body, /^Book a visit\n/);
  assert.equal(by['toms@example.com'].body, 'Career support');
});

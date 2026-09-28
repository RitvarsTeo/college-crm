// The agent (partner) channel, fixed 28.09.2026 after the channel audit proved two faults:
//  - the token check indexed the raw AGENT_TOKENS string, so a real token was refused
//    while "0" or "length" (a character, a string property) was accepted;
//  - the partner a lead came from was taken from the payload and then dropped by
//    toIntake(), so it never reached the database.
// Now only a real token names a partner, the payload may not name another one, and the
// verified partner travels to the New Leads row and on to the person's source.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERIFY } from '../src/inbound.js';
import { adapt, toIntake } from '../src/adapters.js';
import { fixtureFor } from '../src/fixtures.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKENS = JSON.stringify({ 'tok-real-partner': 'india-partner-1', 'tok-named': { id: 'latvia-2', name: 'Latvia Agency' } });
const check = (token, secrets = TOKENS) => VERIFY.per_partner_token({ headers: { 'x-partner-token': token } }, secrets);

test('only a real partner token is accepted, read from the JSON the environment holds', () => {
  assert.deepEqual(check('tok-real-partner').partner, { id: 'india-partner-1', name: null });
  assert.deepEqual(check('tok-named').partner, { id: 'latvia-2', name: 'Latvia Agency' });
  for (const bad of ['0', '1', 'length', '__proto__', 'constructor', 'toString', '', 'tok-real-partnerX', 'tok-real-partne']) {
    assert.equal(check(bad).ok, false, `"${bad}" must not pass`);
  }
  assert.equal(check('tok-real-partner', '').missingSecret, true, 'no tokens configured refuses everything');
  assert.equal(check('tok-real-partner', 'not json').ok, false);
  assert.equal(check('tok-real-partner', JSON.stringify({ 'tok-real-partner': { name: 'no id' } })).ok, false);
});

test('toIntake() carries the attribution on instead of dropping it', () => {
  const intake = toIntake(adapt('agent', fixtureFor('agent')));
  assert.equal(intake.attribution.agent, 'india-partner-1');
  // the website form's campaign tags were dropped the same way, and now arrive too
  assert.equal(toIntake(adapt('website', fixtureFor('website'))).attribution.utm_campaign, 'nav-2026-09');
  assert.equal(toIntake(adapt('facebook', fixtureFor('facebook'))).attribution, null, 'no attribution, nothing invented');
});

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const post = (base, p, body, headers = {}) => fetch(base + p, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva', ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

test('a partner delivery is attributed to the VERIFIED partner, all the way to the person', async (t) => {
  const s = await start({ AGENT_TOKENS: TOKENS, CHANNEL_MODE_AGENT: 'test' });
  t.after(() => s.child.kill());
  const lead = fixtureFor('agent');

  for (const token of ['0', 'length', 'wrong']) {
    const r = await post(s.base, '/api/inbound/agent', { ...lead, partner_ref: 'r-' + token }, { 'x-partner-token': token });
    assert.equal(r.status, 401, `token "${token}" is refused`);
  }
  const other = await post(s.base, '/api/inbound/agent', { ...lead, partner_id: 'somebody-else' }, { 'x-partner-token': 'tok-real-partner' });
  assert.equal(other.status, 401, 'a payload may not name a different partner than its token');

  const ok = await post(s.base, '/api/inbound/agent', lead, { 'x-partner-token': 'tok-real-partner' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const q = await post(s.base, `/api/intake/${ok.json.inboundId}/qualify`, { qualification: 'lead', createPerson: true,
    stated: { interest: 'NAV' }, nextAction: 'Call and establish interest', by: 'Ieva' });
  assert.equal(q.status, 200, JSON.stringify(q.json));
  const person = await fetch(`${s.base}/api/people/${q.json.personId}`, { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
  assert.equal(person.source_channel, 'agent');
  assert.equal(person.source_detail, 'from agent intake, partner india-partner-1 (India Partner)');
});

// 28.09.2026 verification brief: consent must survive toIntake() -> receive() -> qualify(),
// and a later agent lead must not rewrite where a person FIRST came from.
test('a ticked consent box reaches the person; an unticked one is not turned into anything', async (t) => {
  const s = await start({ CHANNEL_MODE_WEBSITE: 'test', WEBSITE_FORM_SECRET: 'fixture-only-form-secret' });
  t.after(() => s.child.kill());
  const lead = { ...fixtureFor('website'), email: 'consent.check@example.invalid' };
  assert.equal(toIntake(adapt('website', lead)).consent.admissions, true, 'toIntake carries it');
  const r = await post(s.base, '/api/inbound/website', lead, { 'x-crm-secret': 'fixture-only-form-secret' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const q = await post(s.base, `/api/intake/${r.json.inboundId}/qualify`, { qualification: 'lead', createPerson: true,
    stated: { interest: 'NAV' }, nextAction: 'Call and establish interest', by: 'Ieva' });
  assert.equal(q.status, 200, JSON.stringify(q.json));
  const person = await fetch(`${s.base}/api/people/${q.json.personId}`, { headers: { 'x-acting-as': 'Ieva' } }).then((x) => x.json());
  const given = person.consents.filter((c) => c.state === 'given').map((c) => c.purpose);
  assert.deepEqual(given, ['admissions'], 'admissions ticked -> given; marketing unticked -> nothing');
  assert.equal(person.consents.length, 1, 'no "withdrawn" was invented from an unticked box');
  assert.match(person.consents[0].source, /^inbound #\d+$/);
});

test('an agent lead about somebody we already have keeps their first source', async (t) => {
  const s = await start({ AGENT_TOKENS: TOKENS, CHANNEL_MODE_AGENT: 'test', CHANNEL_MODE_WEBSITE: 'test', WEBSITE_FORM_SECRET: 'fixture-only-form-secret' });
  t.after(() => s.child.kill());
  const email = 'first.touch@example.invalid';
  const w = await post(s.base, '/api/inbound/website', { ...fixtureFor('website'), email }, { 'x-crm-secret': 'fixture-only-form-secret' });
  const q1 = await post(s.base, `/api/intake/${w.json.inboundId}/qualify`, { qualification: 'lead', createPerson: true,
    stated: { interest: 'NAV' }, nextAction: 'Call and establish interest', by: 'Ieva' });
  const pid = q1.json.personId;
  const before = await fetch(`${s.base}/api/people/${pid}`, { headers: { 'x-acting-as': 'Ieva' } }).then((x) => x.json());
  assert.equal(before.source_channel, 'website');

  const a = await post(s.base, '/api/inbound/agent', { ...fixtureFor('agent'), email }, { 'x-partner-token': 'tok-real-partner' });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  const q2 = await post(s.base, `/api/intake/${a.json.inboundId}/qualify`, { qualification: 'lead', personId: pid,
    stated: { interest: 'NAV' }, by: 'Ieva' });
  assert.equal(q2.status, 200, JSON.stringify(q2.json));
  const after = await fetch(`${s.base}/api/people/${pid}`, { headers: { 'x-acting-as': 'Ieva' } }).then((x) => x.json());
  for (const k of ['source_channel', 'source_detail', 'first_channel', 'created_at']) {
    assert.ok(before[k] != null && before[k] !== '', `${k} is recorded`);
    assert.equal(after[k], before[k], `${k} is the first touch, not the agent`);
  }
});

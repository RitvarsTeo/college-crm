// Two follow-ups to the security review of 07.10.2026 (KB 08 P11), on top of fix/security-2026-10-07:
//   - rule 1, every door is listed: a channel that is not ACTIVE in config/channels.json (Google Form is
//     dropped, Open Day parked) has no inbound address at all, even with the right secret;
//   - rule 8, secrets: Mailchimp's ?s= is compared in constant time, in the delivery check and in the
//     address check alike.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, start } from './security_helpers.js';
import * as inbound from '../src/inbound.js';

const { channelIds, channelDef, acceptsWebhook } = inbound;

test('a channel that is not active takes no deliveries: by config', () => {
  assert.equal(typeof inbound.isActiveChannel, 'function', 'src/inbound.js exports isActiveChannel');
  const inactive = channelIds().filter((id) => !inbound.isActiveChannel(id));
  assert.ok(inactive.includes('google_form') && inactive.includes('open_day'));
  for (const id of inactive) assert.equal(acceptsWebhook(id), false, `${id} is ${channelDef(id).lifecycle} but still accepts deliveries`);
  for (const id of channelIds().filter(inbound.isActiveChannel)) {
    assert.ok(channelDef(id).lifecycle == null || channelDef(id).lifecycle === 'active', id);
  }
});

test('a channel that is not active has no door on a running copy, even with the right secret', async (t) => {
  const s = await start({ DATASET: 'empty', CHANNEL_MODE_GOOGLE_FORM: 'live', CHANNEL_MODE_OPEN_DAY: 'live',
    GOOGLE_FORM_SECRET: 'configured-secret-1', OPEN_DAY_SECRET: 'configured-secret-2' });
  t.after(() => s.child.kill());
  for (const [id, secret] of [['google_form', 'configured-secret-1'], ['open_day', 'configured-secret-2']]) {
    for (const headers of [{}, { 'x-crm-secret': secret }]) {
      const r = await fetch(`${s.base}/api/inbound/${id}`, { method: 'POST',
        headers: { 'content-type': 'application/json', ...headers }, body: '{"name":"x"}' });
      assert.ok([401, 404].includes(r.status), `${id} answered ${r.status}`);
      assert.notEqual(r.status, 200);
    }
  }
});

test("Mailchimp's ?s= is compared in constant time, in both places", () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'inbound.js'), 'utf8');
  assert.doesNotMatch(src, /===\s*String\(secret\)|String\(secret\)\s*===/, 'compare secrets with sameSecret() or timingSafeEqual');
  assert.equal(typeof inbound.sameSecret, 'function');
  assert.equal(inbound.sameSecret('abc', 'abc'), true);
  assert.equal(inbound.sameSecret('abd', 'abc'), false);
  assert.equal(inbound.sameSecret('ab', 'abc'), false, 'a different length is refused before the comparison');
  assert.equal(inbound.sameSecret('', ''), false, 'no secret configured never matches');
  const env = { MAILCHIMP_WEBHOOK_SECRET: 'the-configured-secret' };
  assert.equal(inbound.handshake('mailchimp', new URL('http://x/api/inbound/mailchimp?s=the-configured-secret'), env).record, true);
  assert.equal(inbound.handshake('mailchimp', new URL('http://x/api/inbound/mailchimp?s=wrong'), env).record, false);
});

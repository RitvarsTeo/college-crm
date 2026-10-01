// C9 and C10 from the 30.09 channel handover, built 01.10.2026.
//   C10: Ritvars 30.09, "Meta Business Suite owner = Oksana" - the four Meta channels name her.
//   C9:  a Mailchimp "email changed" event carries data[new_email], not data[email], and was refused.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTERS } from '../src/adapters.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const channels = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8')).channels;

test('C10: Facebook, Messenger, Instagram and WhatsApp name Oksana as owner and administrator', () => {
  for (const c of ['facebook', 'messenger', 'instagram', 'whatsapp']) {
    assert.equal(channels[c].ownerPerson, 'Oksana', c);
    assert.equal(channels[c].administeredBy, 'Oksana', c);
  }
});

test('C9: a Mailchimp email change is read from data[new_email], keyed on the new address', () => {
  const ev = ADAPTERS.mailchimp({ type: 'upemail', fired_at: '2026-10-01 08:00:00',
    'data[list_id]': 'c6ab4facba', 'data[new_id]': 'n1', 'data[new_email]': 'new@example.com',
    'data[old_email]': 'old@example.com' });
  assert.equal(ev.senderEmail, 'new@example.com');
  assert.match(ev.externalEventId, /^upemail:new@example\.com:/);
});

test('C9: an ordinary subscribe is unchanged', () => {
  const ev = ADAPTERS.mailchimp({ type: 'subscribe', fired_at: '2026-10-01 08:00:00', 'data[email]': 'a@example.com' });
  assert.equal(ev.senderEmail, 'a@example.com');
});

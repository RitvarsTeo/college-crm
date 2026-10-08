// Q78 (the owner, 08.10.2026, picked through MASTER CONTROL: "All but without the count for now."). The Inbox Source
// dropdown lists every channel, always: the channels in config/channels.json that are not dropped or parked, in that
// order, plus the SIS. It used to list only the channels that had a message on the board (Email, Phone, SIS).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CH = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));
const PROTO = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('Q78: the config sends every active channel in channels.json order, plus the SIS; never Google Form or Open Day', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const cfg = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
  const want = [...Object.entries(CH.channels).filter(([, c]) => !['dropped', 'parked'].includes(c.lifecycle)).map(([id]) => id), 'sis'];
  assert.deepEqual(cfg.inboxSources, want);
  assert.ok(!cfg.inboxSources.includes('google_form') && !cfg.inboxSources.includes('open_day'));
  for (const id of ['website', 'gmail', 'facebook', 'messenger', 'instagram', 'whatsapp', 'mailchimp', 'phone', 'agent', 'in_person', 'linkedin', 'tiktok', 'sis']) {
    assert.ok(cfg.inboxSources.includes(id), id);
  }
});

// run the real line of cInboxPool that builds the list, with only Email and Phone messages on the board
const chansLines = (() => { const i = APP.indexOf('  const fixed = CFG.inboxSources || [];'); return APP.slice(i, APP.indexOf('\n', APP.indexOf('const chans = ', i)) + 1); })();
const labelOf = (id) => (PROTO.channels && PROTO.channels[id]) || (PROTO.channelAliases && PROTO.channelAliases[id]) || id;
const run = (inboxSources, rows) => {
  const ctx = { CFG: { inboxSources }, D: { rows }, channelLabel: labelOf };
  vm.runInNewContext(chansLines + '\nthis.chans = JSON.stringify(chans);', ctx);
  return JSON.parse(ctx.chans);   // out of the vm's realm, so deepEqual compares plain arrays
};

test('Q78: the Source list shows every channel even when only Email and Phone have messages; no counts', () => {
  const fixed = [...Object.keys(CH.channels).filter((id) => !['dropped', 'parked'].includes(CH.channels[id].lifecycle)), 'sis'];
  const chans = run(fixed, [{ channel: 'gmail' }, { channel: 'phone' }, { channel: 'phone' }]);
  assert.deepEqual(chans.map((c) => c[0]), fixed, 'every channel, in order, once');
  assert.deepEqual(chans.find((c) => c[0] === 'gmail'), ['gmail', 'Email']);
  assert.deepEqual(chans.find((c) => c[0] === 'sis'), ['sis', 'SIS']);
  assert.ok(chans.every(([, label]) => !/\d/.test(label)), 'no counts in the words');
});

test('Q78: a message from a channel outside the list can still be filtered to', () => {
  const chans = run(['gmail', 'phone', 'sis'], [{ channel: 'gmail' }, { channel: 'email' }]);
  assert.deepEqual(chans.map((c) => c[0]), ['gmail', 'phone', 'sis', 'email']);
});

test('Q78: the Due page Source list is untouched', () => {
  assert.equal(APP.split('CFG.inboxSources').length - 1, 1, 'only the Inbox reads it');
});

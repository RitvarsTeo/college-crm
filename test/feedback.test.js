// The in-app feedback widget.
//
// The browser shrinks and re-encodes a screenshot before it sends it, but none of
// that is trusted here. These tests are written from the position that the string
// arriving on the wire was written by somebody hostile, so what matters is that
// the declared type is ignored and the bytes are read instead.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import {
  readScreenshot, readKind, readBody, readPath, saveFeedback,
  listFeedback, getScreenshot, setHandled, MAX_CHARS, BadScreenshot,
} from '../src/feedback.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// A real 1x1 PNG, a real minimal JPEG and a real WebP container.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'ascii'),
  Buffer.alloc(20), Buffer.from([0xff, 0xd9]),
]);
const WEBP = (() => {
  const payload = Buffer.alloc(20, 7);
  const b = Buffer.alloc(12 + payload.length);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(4 + payload.length, 4);
  b.write('WEBP', 8, 'ascii');
  payload.copy(b, 12);
  return b;
})();
const HTML = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

const url = (buf, type) => `data:${type};base64,${buf.toString('base64')}`;

// ------------------------------------------------------------- the validator -

test('a real PNG, JPEG and WebP are accepted, and the SNIFFED type is what is stored', async () => {
  for (const [buf, declared, expected] of [
    [PNG, 'image/png', 'image/png'],
    [JPEG, 'image/jpeg', 'image/jpeg'],
    [WEBP, 'image/webp', 'image/webp'],
  ]) {
    const r = readScreenshot(url(buf, declared));
    assert.equal(r.mimeType, expected);
    assert.equal(r.sizeBytes, buf.length);
    assert.deepEqual(r.bytes, buf);
  }
});

test('the declared type is ignored: a JPEG sent as image/png is stored as a JPEG', async () => {
  // Not an attack, just a client that guessed wrong. The bytes decide.
  assert.equal(readScreenshot(url(JPEG, 'image/png')).mimeType, 'image/jpeg');
});

test('HTML labelled image/png is refused, so it can never be served back to an admin', async () => {
  // This is the stored-XSS stopper. If this test ever goes green by accident,
  // an admin opening the screenshot would be running somebody else's script.
  assert.throws(() => readScreenshot(url(HTML, 'image/png')), BadScreenshot);
});

test('invalid base64 is refused, because Node decodes it silently instead of failing', async () => {
  const broken = 'data:image/png;base64,' + PNG.toString('base64').slice(0, 20) + '!!!!';
  assert.throws(() => readScreenshot(broken), BadScreenshot);
});

test('base64 that decodes to different bytes than it claims is refused', async () => {
  // Node drops characters it cannot read. Re-encoding is the only way to notice.
  const good = PNG.toString('base64');
  const smuggled = 'data:image/png;base64,' + good.slice(0, 10) + '\u0000' + good.slice(10);
  assert.throws(() => readScreenshot(smuggled), BadScreenshot);
});

test('an oversized string is refused on its LENGTH, before anything is decoded', async () => {
  const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_CHARS + 1);
  assert.throws(() => readScreenshot(huge), BadScreenshot);
  // and the cap really is about 1.5 MB decoded, not something accidentally tiny
  assert.ok(MAX_CHARS > 2_000_000 && MAX_CHARS < 2_100_000, `MAX_CHARS looks wrong: ${MAX_CHARS}`);
});

test('missing, null and empty all mean no screenshot, and that is allowed', async () => {
  assert.equal(readScreenshot(undefined), null);
  assert.equal(readScreenshot(null), null);
  assert.equal(readScreenshot(''), null);
});

test('an empty image is refused rather than stored as a zero-byte row', async () => {
  assert.throws(() => readScreenshot('data:image/png;base64,'), BadScreenshot);
});

test('the kind and the body are checked', async () => {
  assert.equal(readKind('bug'), 'BUG');
  assert.equal(readKind('IDEA'), 'IDEA');
  assert.throws(() => readKind('rant'), BadScreenshot);
  assert.throws(() => readBody('no'), BadScreenshot);          // under 4 characters
  assert.throws(() => readBody('x'.repeat(2001)), BadScreenshot);
  assert.equal(readBody('  it broke  '), 'it broke');
});

test('the query string is cut off the page path, because it can carry a token', async () => {
  assert.equal(readPath('/people?token=secret'), '/people');
  // the hash survives, because on a hash-routed app it IS the page
  assert.equal(readPath('#/person/p1?a=b'), '#/person/p1');
  assert.equal(readPath('/' + 'x'.repeat(400)).length, 200);
  assert.equal(readPath(''), null);
});

// ---------------------------------------------------------------- the store -

test('the feedback and its screenshot are written together, and read back whole', async () => {
  const db = await openDb();
  const shot = readScreenshot(url(PNG, 'image/png'));
  const { id } = await saveFeedback(db, { kind: 'BUG', body: 'the open link fails', path: '/car',
    screenshot: shot, by: 'Aigars', at: '2026-09-24T09:00:00.000Z' });
  const rows = await listFeedback(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].screenshot.mimeType, 'image/png');
  assert.equal(rows[0].screenshot.sizeBytes, PNG.length);
  // the list must not carry the bytes
  assert.equal(rows[0].screenshot.data, undefined);
  assert.deepEqual(Buffer.from((await getScreenshot(db, id)).data), PNG);
});

test('deleting a feedback row deletes its screenshot with it', async () => {
  const db = await openDb();
  const { id } = await saveFeedback(db, { kind: 'IDEA', body: 'a table would be easier', path: '/today',
    screenshot: readScreenshot(url(PNG, 'image/png')), by: 'Aigars', at: '2026-09-24T09:00:00.000Z' });
  assert.ok(await getScreenshot(db, id));
  await db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
  assert.equal(await getScreenshot(db, id), null);
});

test('handled is a time, not a flag, and marking it twice is idempotent', async () => {
  const db = await openDb();
  const { id } = await saveFeedback(db, { kind: 'BUG', body: 'something broke', path: null,
    screenshot: null, by: 'Ieva', at: '2026-09-24T09:00:00.000Z' });
  assert.equal((await listFeedback(db))[0].handledAt, null);
  const first = await setHandled(db, id, true, 'Ritvars', '2026-09-24T10:00:00.000Z');
  assert.equal(first.changed, true);
  const again = await setHandled(db, id, true, 'Ritvars', '2026-09-24T11:00:00.000Z');
  assert.equal(again.changed, false);                       // open -> handled happened once
  assert.equal((await listFeedback(db))[0].handledAt, '2026-09-24T11:00:00.000Z');
  await setHandled(db, id, false, 'Ritvars', '2026-09-24T12:00:00.000Z');
  assert.equal((await listFeedback(db))[0].handledAt, null);
  assert.equal((await setHandled(db, 999, true, 'Ritvars', 'x')).error, 'not found');
});

test('open items come before handled ones', async () => {
  const db = await openDb();
  const a = await saveFeedback(db, { kind: 'BUG', body: 'older, and handled', path: null, screenshot: null,
    by: 'Ieva', at: '2026-09-24T09:00:00.000Z' });
  await saveFeedback(db, { kind: 'IDEA', body: 'newer, still open', path: null, screenshot: null,
    by: 'Ieva', at: '2026-09-23T09:00:00.000Z' });
  await setHandled(db, a.id, true, 'Ritvars', '2026-09-24T10:00:00.000Z');
  assert.deepEqual((await listFeedback(db)).map((r) => r.body), ['newer, still open', 'older, and handled']);
});

// --------------------------------------------------------------- the routes -

function startServer() {
  return new Promise((resolve, reject) => {
    const port = 8900 + Math.floor(Math.random() * 90);
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: String(port), CRM_DB: ':memory:' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    // stderr is read, not ignored: a port already in use must fail the test
    // rather than let it run green against somebody else's server.
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve({ child, port }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('the routes: anybody may send, only an admin may read', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const sent = await fetch(`${base}/api/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva' },
    body: JSON.stringify({ kind: 'BUG', body: 'open throws an error', path: '/car?token=leak',
      screenshot: url(PNG, 'image/png') }),
  });
  assert.equal(sent.status, 200);
  const { id } = await sent.json();

  // a screenshot that is present but wrong is refused loudly, never dropped
  const bad = await fetch(`${base}/api/feedback`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'BUG', body: 'with a fake image', screenshot: url(HTML, 'image/png') }),
  });
  assert.equal(bad.status, 400);

  const ROUTES = [
    ['/api/admin/feedback', 'GET'],
    [`/api/admin/feedback/${id}/screenshot`, 'GET'],
    [`/api/admin/feedback/${id}`, 'PATCH'],
  ];
  const hit = (who, path_, method) => fetch(base + path_, {
    method, headers: { 'content-type': 'application/json', 'x-acting-as': who },
    body: method === 'PATCH' ? '{"handled":true}' : undefined,
  });

  // Nobody from the admissions roles.
  for (const [path_, method] of ROUTES) {
    assert.equal((await hit('Ieva', path_, method)).status, 403,
      `${method} ${path_} must refuse somebody who is not a reader`);
  }

  // And MARINA, who IS an admin, must still be refused. This is the whole point
  // of feedbackReaders being a separate list: if it ever gets derived from
  // admins again, these three assertions go red.
  for (const [path_, method] of ROUTES) {
    const res = await hit('Marina', path_, method);
    assert.equal(res.status, 403, `${method} ${path_} must refuse Marina, admin or not`);
    if (method !== 'PATCH') assert.match((await res.json()).error, /Aigars and Ritvars/);
  }

  // Both readers can, not just one of them.
  for (const reader of ['Aigars', 'Ritvars']) {
    assert.equal((await hit(reader, '/api/admin/feedback', 'GET')).status, 200,
      reader + ' reads the inbox');
  }

  const admin = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
  const list = await fetch(`${base}/api/admin/feedback`, { headers: admin }).then((r) => r.json());
  assert.equal(list.rows.length, 1, 'the refused screenshot must not have created a row');
  assert.equal(list.rows.find((r) => r.id === id).path, '/car');   // the token was cut off

  const shot = await fetch(`${base}/api/admin/feedback/${id}/screenshot`, { headers: admin });
  assert.equal(shot.headers.get('content-type'), 'image/png');
  assert.equal(shot.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(shot.headers.get('content-disposition'), 'inline');
  assert.deepEqual(Buffer.from(await shot.arrayBuffer()), PNG);

  // The notification a reader actually sees. There is no email mechanism in this
  // app, so being told happens in the app.
  const before = await fetch(`${base}/api/feedback/waiting`, { headers: admin }).then((r) => r.json());
  assert.equal(before.mayRead, true);
  assert.equal(before.open, 1, 'one piece of feedback is waiting to be handled');
  // and it tells a non-reader nothing at all, not even the count
  const hidden = await fetch(`${base}/api/feedback/waiting`,
    { headers: { 'x-acting-as': 'Marina' } }).then((r) => r.json());
  assert.deepEqual(hidden, { open: 0, mayRead: false });

  const patched = await fetch(`${base}/api/admin/feedback/${id}`, {
    method: 'PATCH', headers: admin, body: '{"handled":true}' }).then((r) => r.json());
  assert.equal(patched.ok, true);

  const after = await fetch(`${base}/api/feedback/waiting`, { headers: admin }).then((r) => r.json());
  assert.equal(after.open, 0, 'handling it clears the notification');
});

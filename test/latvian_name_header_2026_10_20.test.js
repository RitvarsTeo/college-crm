// A NAME WITH LATVIAN LETTERS NEVER STOPS A REQUEST (round 2, 20.10.2026). fetch() refuses a header that is not ISO-8859-1,
// and every request carried x-acting-as with the signed-in name: an account named "Mārcis Žabovs" got "Failed to read the
// 'headers' property" on the first request and the page stayed on Loading... Found on a synthetic copy at real size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const at = APP.indexOf(name); assert.ok(at >= 0, name); return APP.slice(at, APP.indexOf('\n}\n', at) + 3); };

function run(authOn) {
  const ctx = { AUTH: { on: authOn } };
  vm.runInNewContext(fn('function cSafeHeaders(') + '\nthis.f = cSafeHeaders;', ctx);
  return ctx.f;
}
const latin1 = (h) => Object.values(h || {}).every((v) => [...String(v)].every((ch) => ch.charCodeAt(0) < 256));

test('signed in: a name fetch() cannot carry is left out (the session says who is asking); a plain name goes as it was', () => {
  const f = run(true);
  const out = f({ method: 'POST', headers: { 'content-type': 'application/json', 'x-acting-as': 'Mārcis Žabovs' }, body: '{}' });
  assert.equal(out.headers['x-acting-as'], undefined);
  assert.equal(out.headers['content-type'], 'application/json');
  assert.equal(out.body, '{}');
  assert.ok(latin1(out.headers));
  const plain = { headers: { 'x-acting-as': 'Ritvars' } };
  assert.equal(f(plain), plain, 'nothing changes for a plain name');
  assert.equal(f(undefined), undefined);
  assert.deepEqual(f({ headers: { a: 'b' } }), { headers: { a: 'b' } });
});

test('sign-in off: sent percent-encoded, never refused', () => {
  const out = run(false)({ headers: { 'x-acting-as': 'Līva Mihailova' } });
  assert.equal(out.headers['x-acting-as'], encodeURIComponent('Līva Mihailova'));
  assert.ok(latin1(out.headers));
});

test('every request of the app goes through it: apiFetch is the one fetch of the API', () => {
  assert.match(fn('async function apiFetch('), /const r = await fetch\(path, cSafeHeaders\(opts\)\);/);
  const raw = [...APP.matchAll(/[^.\w]fetch\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(raw.sort(), ['/api/auth/logout', '/api/auth/me'], 'the only direct fetches send no name');
});

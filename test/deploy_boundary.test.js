// What the hosted copy may serve as a plain file. Found 28.09.2026 by a read-only
// audit: /src/server.js, /src/db.js, /src/auth.js and /config/*.json answered 200 to
// anyone, and so did /lib, /sql and /.gitattributes. Every uploaded file is also a
// static file on Vercel, and static files are served BEFORE the catch-all rewrite
// to the function - so a rewrite can never close this (Talent Acquisition learned
// that on 16.09 and reverted a rewrite for exactly this reason). A redirect runs
// before the file lookup, so each uploaded folder the page does not load is
// redirected to /not-public, which the function answers with 404.
//
// The rule these tests keep: every top-level folder that is uploaded (not in
// .vercelignore) is either the functions folder or redirected away.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const IGNORED = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
  .map((l) => l.replace(/\/$/, ''));
const redirected = (p) => (VERCEL.redirects || []).some((r) =>
  r.destination === '/not-public' && (r.source === p || r.source === `${p}/:path*`));

test('every uploaded folder is either the functions or redirected away', () => {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const folders = [...new Set(tracked.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
  const uploaded = folders.filter((d) => !IGNORED.includes(d));
  assert.ok(uploaded.includes('src') && uploaded.includes('config'), 'the check sees the real folders');
  const open = uploaded.filter((d) => d !== 'api' && !redirected('/' + d));
  assert.deepEqual(open, [], 'uploaded and served as plain files: ' + open.join(', '));
});

test('an uploaded dotfile that Vercel serves is redirected too', () => {
  // package.json, package-lock.json, vercel.json, .env.example and .vercelignore
  // answered 404 on 28.09 without a rule; .gitattributes answered 200.
  assert.ok(redirected('/.gitattributes'));
});

test('the redirects are not permanent, and none of them catches a real route', () => {
  for (const r of VERCEL.redirects || []) assert.equal(r.permanent, false, r.source);
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const CONSOLE = fs.readFileSync(path.join(ROOT, 'src', 'console.html'), 'utf8');
  for (const [name, text] of [['app.html', APP], ['console.html', CONSOLE]]) {
    for (const dir of ['src', 'config', 'lib', 'sql']) {
      assert.ok(!new RegExp(`["'(]/${dir}/`).test(text), `${name} loads something from /${dir}/, which is redirected`);
    }
  }
  assert.ok(APP.includes('/assets/NoAca_logo_blackhor.svg'), 'the logo comes from /assets/, which the server serves');
});

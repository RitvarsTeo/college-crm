// What the hosted copy may serve as a plain file. Found 28.09.2026 by a read-only
// audit: /src/server.js, /src/db.js, /src/auth.js and /config/*.json answered 200 to
// anyone, and so did /lib, /sql, /src/app.html, /src/console.html and /.gitattributes.
//
// Why: with no output directory, Vercel serves EVERY uploaded file as a static file,
// and static files are served before the catch-all rewrite to the function. A rewrite
// can never close that (Talent Acquisition reverted one on 16.09 for this reason). A
// redirect per folder closed the plain paths (af44737) but not "/%73rc/server.js" or
// "/src%2Fserver.js": the redirect matched the literal path, the file lookup decoded
// it and served the source.
//
// The fix at the root: static files come ONLY from public/, which holds nothing but
// robots.txt. The function still carries src/ and config/ (functions.includeFiles),
// and the logos are served by the server under /assets/. Every other address reaches
// the function, which answers 404 for anything it does not know.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const PUBLIC_ALLOWED = ['robots.txt'];

test('static files come only from public/, and public/ holds nothing but the allowed files', () => {
  assert.equal(VERCEL.outputDirectory, 'public');
  const inPublic = [];
  const walk = (d, pre = '') => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const rel = pre ? `${pre}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(d, e.name), rel); else inPublic.push(rel);
  } };
  walk(path.join(ROOT, 'public'));
  assert.deepEqual(inPublic.sort(), PUBLIC_ALLOWED, 'public/ is served to anyone; add a file here only on purpose');
  assert.equal(fs.readFileSync(path.join(ROOT, 'public', 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
});

test('the function still carries everything it reads at run time', () => {
  const inc = VERCEL.functions['api/index.js'].includeFiles;
  assert.equal(inc, '{src,config}/**', 'src/ (app.html, assets, modules) and config/ travel with the function');
  assert.deepEqual(VERCEL.rewrites, [{ source: '/(.*)', destination: '/api/index' }]);
});

test('the page loads nothing from the folders that are no longer public', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const CONSOLE = fs.readFileSync(path.join(ROOT, 'src', 'console.html'), 'utf8');
  for (const [name, text] of [['app.html', APP], ['console.html', CONSOLE]]) {
    for (const dir of ['src', 'config', 'lib', 'sql', 'public']) {
      assert.ok(!new RegExp(`["'(]/${dir}/`).test(text), `${name} loads something from /${dir}/`);
    }
  }
  assert.ok(APP.includes('/assets/NoAca_logo_blackhor.svg'), 'the logo comes from /assets/, which the server serves');
});

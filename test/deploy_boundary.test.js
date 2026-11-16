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
// THE BRAND LOGOS (16.11.2026, his ask: public novikontas.org-domain links to the new logos for HTML use, plain image links):
// exactly these files under public/brand/, copied unchanged (five from the Talent Acquisition release's assets, one from Marketings un Dizains/Logo public); png, svg and jpg images only.
const BRAND = {
  'NoAca_logo_drkbluehor.png': '44d9eefae9e581d0aa424eca1ad58b6bdf2dc5985e17e29470d76cc4ca6c2fe3',
  'NoAca_logo_twotone_horizontal.svg': 'ad4cea5c33c71a839fd46d4fec7718cb95b547c10a109483294c9e362d23e521',
  'NoAca_logo_white_horizontal.svg': '93fb986ba7894dc4ae2030048a77b383c43cbe0af8b4513ff417628acdba320d',
  'NoAca_logo_whitehor.svg': '93fb986ba7894dc4ae2030048a77b383c43cbe0af8b4513ff417628acdba320d',
  'NoAca_logo_symbol_white.svg': '49551504bd98ec5c01061c902a6701905e8138b43be3d7b6e867d32d7b147122',
  // 16.11.2026, his words "Ieliekam uz Intake virsū visus.": from Marketings un Dizains/Logo public, 1000x380
  'NoAca_logo_twotone_horizontal_whitebg.jpg': '1a0e54ff60242f5f9a494a660eaba280063ba036ae99ccce2a5f6b7fdc7cfff4',
  // 16.11.2026 (patch 142): the same logos cropped tight to the artwork, from Marketings un Dizains/Logo public/tight
  'NoAca_logo_drkbluehor_tight.png': '523a1912de7b2710981ebd15aad4a29986dbe52e7507f937367f0a82403ac5de',
  'NoAca_logo_twotone_horizontal_tight.svg': '369e98d7df19488aac510c0e54db420760304ee3ff11002f1b418abe5170c289',
  'NoAca_logo_white_horizontal_tight.svg': '06915534059190d5ac18760912f5395ec5563331e67a4c8830ab295b8f120972',
  'NoAca_logo_symbol_white_tight.svg': 'e970fc43df4168d7f20bba30d8d1e7643abf740aa6ab302ad3693c1bf15ff970',
  'NoAca_logo_twotone_horizontal_whitebg_tight.jpg': '6dfba25768d334cc0d91ef8348f1a07becad74a4a2523209361541f1348594f0',
};
const PUBLIC_ALLOWED = ['robots.txt', ...Object.keys(BRAND).map((f) => 'brand/' + f)].sort();

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
  assert.ok(APP.includes('/assets/NoAca_logo_twotonehor.svg'), 'the logo comes from /assets/, which the server serves');
});

test('public/brand/ holds only the logo images listed, unchanged, with nothing in them that runs', async () => {
  const { createHash } = await import('node:crypto');
  const dir = path.join(ROOT, 'public', 'brand');
  assert.deepEqual(fs.readdirSync(dir).sort(), Object.keys(BRAND).sort());
  for (const [f, sha] of Object.entries(BRAND)) {
    assert.match(f, /^[A-Za-z0-9_]+\.(png|svg|jpg)$/, 'an image file name');
    const buf = fs.readFileSync(path.join(dir, f));
    assert.equal(createHash('sha256').update(buf).digest('hex'), sha, f + ' is the file as given');
    if (f.endsWith('.svg')) assert.ok(!/<script|\son\w+\s*=|javascript:|foreignObject|<iframe|<embed|<object|href\s*=\s*["']https?:/i.test(buf.toString('utf8')), f + ' has nothing that runs or loads');
  }
  // an SVG opened on its own runs in this site's origin: the folder gets a policy that lets nothing run
  const h = (VERCEL.headers || []).find((x) => x.source === '/brand/(.*)');
  const csp = h && h.headers.find((x) => x.key === 'Content-Security-Policy');
  assert.ok(csp && /default-src 'none'/.test(csp.value) && /sandbox/.test(csp.value), '/brand/ is served with a policy that runs nothing');
});

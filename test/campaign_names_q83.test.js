// Q83, picked by Ritvars 08.10.2026 for patch 34: Reports > Academy Application form > Campaign links shows
// a plain name instead of the raw SIS tag. "We now had Piemeri Profesiju, if utms are from there, then use that
// name." One mapping in config, every other row exactly as today, no count changed, the raw tag kept in the hover.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fnSrc = (head) => { const i = APP.indexOf(head); assert.ok(i >= 0, head); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const ctx = { CFG };
vm.runInNewContext(fnSrc('function cCampaignName(') + 'this.name = cCampaignName;', ctx);
const name = (x) => JSON.parse(JSON.stringify(ctx.name(x)));

test('config: one small mapping table, the two rules he asked for and nothing else', () => {
  const rows = CFG.webCampaignNames.rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.label), ['Piemēri Profesiju', 'Instagram (no campaign name)']);
  assert.ok(!/Piem/.test(APP.slice(APP.indexOf('function cCampaignName('), APP.indexOf('function cCampaignName(') + 1200)), 'no name hard-coded in the page');
});

test('piemeri2026 is "Piemēri Profesiju" from any source and medium; the count and the source stay', () => {
  for (const detail of ['poster / print', 'apliecinajums / qr', 'facebook / cpc', '']) {
    const r = name({ name: 'piemeri2026', detail, visitors: 7, hits: 9 });
    assert.equal(r.name, 'Piemēri Profesiju', detail);
    assert.equal(r.detail, detail, 'where it came from is still said');
    assert.deepEqual([r.visitors, r.hits], [7, 9], 'no count changed');
    assert.equal(r.raw, 'piemeri2026', 'the raw tag is kept for the hover');
  }
  assert.equal(name({ name: 'PIEMERI2026', detail: 'x / y', visitors: 1 }).name, 'Piemēri Profesiju', 'case does not matter');
});

test('ig / social with no campaign is "Instagram (no campaign name)"; the raw row stays in the hover', () => {
  const r = name({ name: '(utm_campaign not set)', detail: 'ig / social', visitors: 28 });
  assert.equal(r.name, 'Instagram (no campaign name)');
  assert.equal(r.detail, null, 'the name already says it');
  assert.equal(r.visitors, 28);
  assert.deepEqual([r.raw, r.rawDetail], ['(utm_campaign not set)', 'ig / social']);
  assert.equal(name({ name: '', detail: 'ig / social', visitors: 2 }).name, 'Instagram (no campaign name)', 'an empty campaign too');
});

test('every other row stays exactly as today: nothing is relabelled Piemeri without its tag', () => {
  const same = [
    { name: 'release-test', detail: 'test / check', visitors: 2 },
    { name: '(utm_campaign not set)', detail: 'facebook / social', visitors: 3 },
    { name: '(utm_campaign not set)', detail: 'ig / cpc', visitors: 1 },
    { name: 'autumn-intake', detail: 'ig / social', visitors: 5 },
    { name: 'piemeri', detail: 'poster / print', visitors: 4 },
  ];
  for (const x of same) assert.deepEqual(name(x), x, JSON.stringify(x));
});

test('the page uses it on Campaign links only; the hover names the raw tag', () => {
  assert.match(APP, /list\('Campaign links', d\.campaigns, 'visitors', 'visitors', cCampaignName\)/);
  assert.match(APP, /list\('Came from', d\.referrers, 'visitors', 'visitors'\)/, 'the other lists are untouched');
  assert.match(APP, /title="\$\{esc\(x\.raw \|\| x\.name\)\}/);
  assert.match(APP, /\.slice\(0, 6\)\.map\(\(x\) => named\(x\)\)/, 'the same six rows, named after they are chosen');
  // the way the page calls it: through Array.map, which passes the index as a second argument
  const viaMap = JSON.parse(JSON.stringify([{ name: 'piemeri2026', detail: 'a / b', visitors: 1 }, { name: 'x', detail: 'y / z', visitors: 2 }]
    .map((x) => ctx.name(x))));
  assert.deepEqual(viaMap.map((r) => r.name), ['Piemēri Profesiju', 'x']);
  assert.throws(() => [{ name: 'piemeri2026' }, { name: 'x' }].map(ctx.name), 'passing the function straight to map breaks it, which is why the page wraps it');
});

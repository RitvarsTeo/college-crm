// A PHONE NUMBER SHOWS ITS DIALLING CODE AND ITS COUNTRY (the owner, 01.10.2026).
//
// Not a flag emoji. Checked on his own screen first: Windows draws a regional-indicator
// pair as two small letters rather than a flag, so the emoji buys nothing and makes the
// screen depend on how each machine renders it. A two-letter code reads the same
// everywhere and needs no assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const span = (from, to) => { const i = APP.indexOf(from); assert.ok(i >= 0, from); return APP.slice(i, APP.indexOf(to, i)); };

const ctx = { esc: (s) => String(s ?? '') };
// phoneParts returns arrays built inside the vm, so they are a DIFFERENT realm's Array and
// deepStrictEqual rejects them however identical the contents are. Compare the contents.
const country = (v) => { const c = ctx.parts(v).country; return c ? c.join(' ') : null; };
vm.runInNewContext(
  span('const DIAL_CODES = {', 'const cTelLink =')
  + '\nthis.parts = phoneParts; this.pretty = phonePretty; this.html = cPhoneHtml; this.codes = DIAL_CODES;',
  ctx);

test('the dialling code stands apart and the rest is grouped to be read aloud', () => {
  assert.equal(ctx.pretty('+37126551234'), '+371 26 551 234');
  assert.equal(ctx.pretty('+919812345678'), '+91 98 1234 5678');
  assert.equal(ctx.pretty('+380671234567'), '+380 671 234 567');
  // typed with spaces, brackets or dashes reads exactly the same as stored bare
  assert.equal(ctx.pretty('+371 26 551 234'), '+371 26 551 234');
  assert.equal(ctx.pretty('(+371) 26-551-234'), '+371 26 551 234');
});

test('the country comes from the LONGEST matching code, because codes are nested', () => {
  assert.equal(country('+37126551234'), 'LV Latvia');
  assert.equal(country('+919812345678'), 'IN India');
  // +7 is Russia and +77 is Kazakhstan; a shortest-first match would call every
  // Kazakh number Russian, which is the kind of mistake nobody reports and everybody sees
  assert.equal(country('+77011234567'), 'KZ Kazakhstan');
  assert.equal(country('+79161234567'), 'RU Russia');
});

test('an unknown or local number keeps its number and claims no country', () => {
  for (const v of ['26551234', '+99912345678', '', null, 'not a number']) {
    const p = ctx.parts(v);
    assert.equal(p.country, null, JSON.stringify(v) + ' gets no country');
    assert.equal(ctx.pretty(v), String(v || ''), 'and is printed exactly as it is stored');
  }
});

test('the chip sits inside the link, so a tap anywhere on the number dials', () => {
  const h = ctx.html('+37126551234');
  assert.match(h, /^<a href="tel:\+37126551234"/, 'the tel: is the raw number, not the pretty one');
  assert.match(h, /onclick="event\.stopPropagation\(\)"/, 'and it never opens the profile instead');
  const chip = h.indexOf('c-cc'), close = h.indexOf('</a>');
  assert.ok(chip > 0 && chip < close, 'the chip is inside the link, not beside it');
  assert.match(h, /<i class="c-cc" title="Latvia">LV<\/i>/, 'two letters, with the full name on hover');
  assert.match(h, />LV<\/i>\+371 26 551 234<\/a>$/);
});

test('a number with no country shows no chip at all, rather than a guess', () => {
  const h = ctx.html('26551234');
  assert.ok(!h.includes('c-cc'), 'no chip');
  assert.match(h, /^<a href="tel:26551234"/, 'but it still dials');
});

test('the codes list has no duplicates and every entry is a two-letter code plus a name', () => {
  const seen = new Set();
  for (const [code, v] of Object.entries(ctx.codes)) {
    assert.match(code, /^[0-9]{1,4}$/, code + ' is digits only');
    assert.equal(v.length, 2, code + ' has a code and a name');
    assert.match(v[0], /^[A-Z]{2}$/, v[0] + ' is a two-letter country code');
    assert.ok(v[1] && v[1].length > 2, v[0] + ' has a readable name for the hover');
    assert.ok(!seen.has(v[0]), v[0] + ' is listed once');
    seen.add(v[0]);
  }
  assert.ok(seen.has('LV') && seen.has('IN'), 'the two in the real data today');
});

// The chip has to be legible in both themes and must not wrap away from its number.
test('the chip is styled for both themes and never wraps off the number', () => {
  assert.match(APP, /html\.ui-c \.c-cc\{[^}]*background:var\(--c-sunk\);color:var\(--t3\)/,
    'tokens, so dark mode is not a second definition to keep in step');
  assert.match(APP, /html\.ui-c \.c-reach a,html\.ui-c \.c-pt a\{white-space:nowrap\}/);
});

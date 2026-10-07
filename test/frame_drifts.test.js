// Unified audit 29.09.2026, items 3 + 4 (dev kit part 2, the app frame): the installed app's
// splash is white like the icon tile, the logo link names itself "Novikontas Academy - Home", the
// logo on light is the official two-tone, the icon comment says what the icon is, and C is Inter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

test('manifest: a white splash behind the white icon tile; the window bar stays black', () => {
  assert.match(SERVER, /background_color: '#ffffff',/);
  assert.match(SERVER, /theme_color: '#000000',/);
});

test('the logo is a link to Home that says so, two-tone on light and white on dark', () => {
  assert.match(APP, /<a class="brand" href="#\/due" title="Home" aria-label="Novikontas Academy - Home">\s*<img class="logo light" src="\/assets\/NoAca_logo_twotonehor\.svg" alt=""[^>]*>\s*<img class="logo dark" src="\/assets\/NoAca_logo_whitehor\.svg" alt=""/);
  assert.match(SERVER, /'NoAca_logo_twotonehor\.svg': 'image\/svg\+xml; charset=utf-8'/, 'the server serves it');
  const svg = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'NoAca_logo_twotonehor.svg'), 'utf8');
  assert.match(svg, /#29a8df/i, 'the A stroke is the logo blue');
  assert.match(svg, /#022367/i, 'the rest is the official navy');
});

test('no comment still calls the icon a navy tile', () => {
  assert.doesNotMatch(APP, /navy tile/);
  assert.doesNotMatch(SERVER, /navy tile/);
});

test('C is Inter: no C rule asks for the serif, and headings in the work area inherit', () => {
  const cRules = [...APP.matchAll(/html\.ui-c[^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.deepEqual(cRules.filter((r) => /font-family:var\(--serif\)/.test(r)), []);
  assert.match(APP, /html\.ui-c #view h1, html\.ui-c #view h2, html\.ui-c #view h3, html\.ui-c \.card h3\{font-family:inherit\}/);
});

test('Home and Reports are as wide as every other screen: no page cap of their own', () => {
  // 29.09.2026, Ritvars, from a screenshot: "a lot of space here". Home was held at 1080px by
  // .kpage inside a main that allows 1320, and main is left-aligned, so on a 1920 screen 576px
  // sat empty down the right while Journey and People used the full width. Measured, not guessed.
  assert.match(APP, /html\.ui-c \.kpage\{position:relative\}/,
    '.kpage carries no max-width of its own');
  assert.doesNotMatch(APP, /\.kpage\{[^}]*max-width/,
    'and no rule anywhere gives it one back');
  // 30.09.2026, from a screenshot again: "still so much more space you can use". main itself
  // carried max-width:1320px, which left 332px of a 1890px window empty, 18% of the screen, on
  // EVERY screen and not only Home. There is no page cap at all now.
  assert.doesNotMatch(APP, /\nmain\{[^}]*max-width/,
    'main carries no cap either: the window is the width');
});

test('the month chart is drawn wider on a wide screen, and TALLER where Home has room (Q46)', () => {
  // 30.09: drawn 1100 wide on a wide screen, so the type kept its size. 05.10.2026 the owner, on Home's empty
  // space under it: "can be taller" - his newer word replaces the 30.09 "wider, not bigger" lock. The width stays
  // the drawing's (so the type keeps its size) and the HEIGHT is measured for the screen, 260 to 460 px.
  assert.match(APP, /matchMedia\('\(min-width:1500px\)'\)/, 'there is a wide branch');
  assert.match(APP, /const W = narrow \? 360 : wide \? 1100 : 640, H = narrow \? 230 : fitH \|\| 210/,
    'wider drawing; the height is the fitted one, a phone keeps 230');
  assert.match(APP, /const want = Math\.max\(260, Math\.min\(460, box\.height \+ spare\)\)/, 'filled to the bottom, 260 to 460 px');
  assert.match(APP, /svg\.classList\.contains\('narrow'\)\) return false/, 'a phone keeps its height');
  assert.match(APP, /C_HOME_D = D;\n  cFitMonthChart\(D\);\n  cFitDonut\(\);\n  cWireCharts\(\);/, 'fitted (chart, then donut) before the hover is wired');

  // the CSS cap must step at the SAME width, or the two disagree and the chart jumps
  assert.match(APP, /@media \(min-width:1500px\)\{ html\.ui-c \.kchart\{max-width:1500px\} \}/,
    'the cap steps where the drawing does');
});

// A function's source, from its first line to the closing brace at column 0.
const fnSrc = (head) => { const i = APP.indexOf(head); assert.ok(i >= 0, head); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

test('the donut is balanced with the month chart: its row IS the plot, the ring 78% of it, both centred (Q46)', () => {
  // 05.10.2026 the owner, on Home at ~1900 px: "The pie needs to be balanced with admission graph" - the donut sat high
  // in its column with an empty band under it and the legend pushed to the far edge.
  // 1. The chart says where its plot runs (top gridline to the baseline), in drawing units.
  assert.match(APP, /class="kchart\$\{narrow \? ' narrow' : ''\}" data-plot="\$\{T\} \$\{H - B\}"/, 'the chart carries its plot');
  // 2. cFitDonut gives the donut's row the plot's top and height - run here on a stand-in page.
  const fit = new Function('document', fnSrc('function cFitDonut() {') + '\nreturn cFitDonut;');
  const page = (donutLeft, narrow = false) => {
    const props = {}, cls = new Set(), leg = { style: {}, getBoundingClientRect: () => ({ width: 169.4 }) };
    const svg = { dataset: { plot: '14 210' }, viewBox: { baseVal: { height: 236 } },
      classList: { contains: (c) => c === 'narrow' && narrow },
      getBoundingClientRect: () => ({ top: 588, right: 969, height: 260 }) };
    const dn = { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
      style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } },
      getBoundingClientRect: () => ({ top: 594, left: donutLeft }), clientWidth: 415, querySelector: () => leg };
    const doc = { querySelector: (q) => (q.endsWith('.kchart') ? svg : dn) };
    return { run: () => fit(doc)(), props, cls };
  };
  const side = page(999);   // 1440 x 900 as measured: the chart 705 x 260 px, drawn 640 x 236
  assert.equal(side.run(), true);
  assert.ok(side.cls.has('kfit'));
  assert.equal(side.props['--kplot-h'], '215.9px', "the row is the plot's height: (210 - 14) x 260 / 236");
  assert.equal(side.props['--kplot-dy'], '9.4px', "and starts at the plot's top: 588 + 14 x 260 / 236 - 594");
  assert.equal(side.props['--kroom'], '216px', "the ring's room: 415 less the 28 gap less the legend's 169.4, so the words never wrap");
  const stacked = page(264);   // one column (a narrow window): the donut under the chart keeps its own layout
  assert.equal(stacked.run(), false); assert.ok(!stacked.cls.has('kfit')); assert.deepEqual(stacked.props, {});
  const phone = page(999, true);
  assert.equal(phone.run(), false); assert.ok(!phone.cls.has('kfit'), 'a phone is unchanged');
  // measured again when the window is resized, after the chart
  assert.match(APP, /if \(cFitMonthChart\(C_HOME_D\)\) cWireCharts\(document\.querySelector\('#view \.kpage\.kb \.kchart'\)\);\n    cFitDonut\(\);/);
  // 3. The CSS: the row's top and height; the ring's DRAWN diameter (108 of the 140 drawing) 78% of the plot inside
  // the 150-250 px clamp; a fixed gap to the legend; the legend as wide as its words, not pushed to the far edge.
  assert.match(APP, /html\.ui-c \.kb-top \.kdonut\.kfit\{--kring:clamp\(150px,min\(calc\(var\(--kplot-h\) \* \.78 \* 140 \/ 108\),var\(--kroom\)\),250px\);height:var\(--kplot-h\);margin-top:var\(--kplot-dy\);padding:0;gap:28px;/);
  assert.match(APP, /html\.ui-c \.kb-top \.kdonut\.kfit svg\{width:var\(--kring\);flex:0 0 var\(--kring\);transform:translateY\(calc\(100% \* 2\.5 \/ 140\)\)\}/,
    'the ring nudged by half its plinth');
  assert.match(APP, /html\.ui-c \.kb-top \.kdonut\.kfit \.klegend\{flex:0 1 auto\}/);
  assert.match(APP, /html\.ui-c \.kdonut\{display:flex;align-items:center;/, 'ring and legend centred on the row');
  assert.match(APP, /html\.ui-c \.kb-top > \.ksec:has\(> \.kdonut\.kfit\)\{display:flex;flex-direction:column\}/, 'its top margin never collapses');
  // the 108 and the 2.5 are the drawing's own numbers: ring R 54 in a 140 box; ring and plinth together run from
  // cy - R to cy + R + DEPTH, so their middle is 2.5 above the box's middle
  const donut = fnSrc('function cDonut(rows) {');
  const m = donut.match(/const R = (\d+), r0 = \d+, c = 70, cy = (\d+), gap = [\d.]+, DEPTH = (\d+);/);
  assert.ok(m, 'the donut drawing constants');
  const [R, cy, DEPTH] = m.slice(1).map(Number);
  assert.equal(2 * R, 108);
  assert.equal(70 - (cy - R + cy + R + DEPTH) / 2, 2.5);
  assert.match(donut, /<svg viewBox="0 0 140 140"/);
});

test('the open / overdue / no next step strip is not on Reports: Today owns it (Q35)', () => {
  // 30.09.2026 it lit up one figure at a time; 05.10.2026 the owner: "Nothing should be duplicated", so it left Reports
  assert.doesNotMatch(APP, /c-nowbar/);
});
